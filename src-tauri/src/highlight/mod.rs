//! Tree-sitter based syntax highlighting module.
//!
//! Provides accurate and performant syntax highlighting using tree-sitter parsers.

mod registry;
pub mod themes;

pub use registry::LanguageRegistry;
pub use themes::Theme;

use std::collections::HashMap;
use std::sync::RwLock;
use tree_sitter_highlight::{
    HighlightConfiguration, Highlighter, HighlightEvent,
};

// Embed queries directory into binary for single-exe distribution
use include_dir::{include_dir, Dir};

// Include queries directory relative to Cargo.toml (src-tauri/queries)
// Note: $CARGO_MANIFEST_DIR is the directory containing Cargo.toml
static QUERIES_DIR: Dir = include_dir!("$CARGO_MANIFEST_DIR/queries");

/// Print debug info about embedded queries
pub fn debug_queries_dir() {
    eprintln!("[highlight] === QUERIES_DIR Debug Info ===");
    eprintln!("[highlight] Path: {:?}", QUERIES_DIR.path());
    eprintln!("[highlight] Dirs: {}", QUERIES_DIR.dirs().count());
    eprintln!("[highlight] Files: {}", QUERIES_DIR.files().count());
    
    // List all directories
    for dir in QUERIES_DIR.dirs() {
        eprintln!("[highlight]   Dir: {} ({} files)", dir.path().display(), dir.files().count());
    }
    
    // Check specific directories
    for lang in ["rust", "python", "c-sharp", "javascript"] {
        match QUERIES_DIR.get_dir(lang) {
            Some(d) => {
                eprintln!("[highlight]   Found '{}': {} files", lang, d.files().count());
                for f in d.files() {
                    eprintln!("[highlight]     - {} ({} bytes)", f.path().display(), f.contents().len());
                }
            }
            None => {
                eprintln!("[highlight]   NOT FOUND: '{}'", lang);
            }
        }
    }
}

/// Error type for highlighting operations.
#[derive(Debug)]
pub enum HighlightError {
    /// Language not supported
    UnsupportedLanguage(String),
    /// Failed to parse the source code
    ParseError(String),
    /// Failed to load highlight queries
    QueryError(String),
}

impl std::fmt::Display for HighlightError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedLanguage(lang) => write!(f, "Language '{}' is not supported", lang),
            Self::ParseError(msg) => write!(f, "Parse error: {}", msg),
            Self::QueryError(msg) => write!(f, "Query error: {}", msg),
        }
    }
}

impl std::error::Error for HighlightError {}

/// Result type for highlighting operations.
pub type HighlightResult<T> = Result<T, HighlightError>;

/// Main highlighter that manages languages and performs highlighting.
/// Uses lazy loading for highlight configurations to improve startup time.
/// Query files are embedded in the binary for single-exe distribution.
pub struct TreeSitterHighlighter {
    registry: LanguageRegistry,
    /// Lazy-loaded highlight configurations (loaded on first use)
    configs: RwLock<HashMap<String, HighlightConfiguration>>,
    theme: Theme,
}

impl TreeSitterHighlighter {
    /// Create a new highlighter with the default theme.
    pub fn new() -> Self {
        Self::with_theme(Theme::DarkModern)
    }
    
    /// Create a new highlighter with a specific theme.
    pub fn with_theme(theme: Theme) -> Self {
        let registry = LanguageRegistry::new();
        
        // Debug: print embedded queries directory info
        eprintln!("[highlight] QUERIES_DIR path: {:?}", QUERIES_DIR.path());
        eprintln!("[highlight] QUERIES_DIR entries: {} dirs, {} files", 
            QUERIES_DIR.dirs().count(), 
            QUERIES_DIR.files().count());
        
        // Show first few directories
        for (i, dir) in QUERIES_DIR.dirs().enumerate() {
            if i < 5 {
                eprintln!("[highlight]   [{}] {} - {} files", i, dir.path().display(), dir.files().count());
            }
        }
        
        // Check if rust directory exists
        if let Some(rust_dir) = QUERIES_DIR.get_dir("rust") {
            eprintln!("[highlight] Found rust directory with {} files", rust_dir.files().count());
            for file in rust_dir.files() {
                eprintln!("[highlight]     - {} ({} bytes)", file.path().display(), file.contents().len());
            }
        } else {
            eprintln!("[highlight] ERROR: rust directory NOT found in QUERIES_DIR!");
        }
        
        // Lazy loading: don't pre-initialize configs, load on demand
        // Query files are embedded in binary via include_dir
        Self {
            registry,
            configs: RwLock::new(HashMap::new()),
            theme,
        }
    }
    
    /// Get query file content from embedded queries directory.
    /// Supports Helix-style inheritance: "; inherits: lang1,lang2"
    fn get_query_content(lang_name: &str, file_name: &str) -> String {
        // include_dir stores files with their full path (e.g., "rust/highlights.scm")
        // So we need to use the full path when looking up files
        let full_path = format!("{}/{}", lang_name, file_name);
        
        // Try to get the file directly from QUERIES_DIR using full path
        let file = match QUERIES_DIR.get_file(&full_path) {
            Some(f) => f,
            None => {
                // File not found, but this is expected for some languages (injections, locals)
                return String::new();
            }
        };
        
        // Get the content
        let content = match file.contents_utf8() {
            Some(c) => c.to_string(),
            None => {
                eprintln!("[highlight] Failed to read file as UTF-8: {}", full_path);
                return String::new();
            }
        };
        
        // Check for inheritance: "; inherits: lang1,lang2"
        let inherits = Self::parse_inherits(&content);
        if inherits.is_empty() {
            eprintln!("[highlight] Loaded query file: {} ({} bytes)", full_path, content.len());
            return content;
        }
        
        // Merge parent queries first, then current language's queries
        let mut merged = String::new();
        for parent in inherits {
            let parent_content = Self::get_query_content(&parent, file_name);
            if !parent_content.is_empty() {
                merged.push_str(&parent_content);
                merged.push('\n');
            }
        }
        
        // Remove the inherits line from current content and append
        let content_without_inherits = Self::remove_inherits_line(&content);
        merged.push_str(&content_without_inherits);
        
        eprintln!("[highlight] Loaded query file: {} ({} bytes, with inheritance)", full_path, merged.len());
        merged
    }
    
    /// Parse the "; inherits:" directive from query content
    fn parse_inherits(content: &str) -> Vec<String> {
        let mut inherits = Vec::new();
        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("; inherits:") {
                let parts: &str = line.strip_prefix("; inherits:").unwrap_or("");
                for lang in parts.split(',') {
                    let lang = lang.trim();
                    if !lang.is_empty() {
                        inherits.push(lang.to_string());
                    }
                }
                break;
            }
            // Stop at first non-comment line
            if !line.starts_with(';') && !line.is_empty() {
                break;
            }
        }
        inherits
    }
    
    /// Remove the "; inherits:" line from content
    fn remove_inherits_line(content: &str) -> String {
        let mut result = String::new();
        let mut found_inherits = false;
        
        for line in content.lines() {
            if !found_inherits && line.trim().starts_with("; inherits:") {
                found_inherits = true;
                continue;
            }
            result.push_str(line);
            result.push('\n');
        }
        result
    }
    
    /// Ensure a highlight configuration exists for a language (lazy loading).
    /// Returns true if the config was created, false if it already existed or failed.
    fn ensure_config(&self, name: &str) -> bool {
        // First, check if already cached with read lock
        {
            let configs = self.configs.read().unwrap();
            if configs.contains_key(name) {
                return true;
            }
        }
        
        // Not in cache, try to create it
        let lang = match self.registry.get_language(name) {
            Some(l) => l,
            None => {
                eprintln!("[highlight] Language not found in registry: {}", name);
                return false;
            }
        };
        
        let config = match self.create_config_from_files(name, lang) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[highlight] Failed to create config for {}: {:?}", name, e);
                return false;
            }
        };
        
        // Store in cache with write lock
        {
            let mut configs = self.configs.write().unwrap();
            configs.insert(name.to_string(), config);
        }
        
        eprintln!("[highlight] Created highlight config for: {}", name);
        true
    }
    
    /// Create a highlight configuration by loading query files from embedded directory.
    fn create_config_from_files(
        &self,
        name: &str,
        language: tree_sitter::Language,
    ) -> HighlightResult<HighlightConfiguration> {
        // Load query files from embedded directory
        let highlights = Self::get_query_content(name, "highlights.scm");
        let injections = Self::get_query_content(name, "injections.scm");
        let locals = Self::get_query_content(name, "locals.scm");
        
        self.create_config(name, language, &highlights, &injections, &locals)
    }
    
    /// Create a highlight configuration for a language.
    fn create_config(
        &self,
        name: &str,
        language: tree_sitter::Language,
        highlights: &str,
        injections: &str,
        locals: &str,
    ) -> HighlightResult<HighlightConfiguration> {
        let mut config = HighlightConfiguration::new(
            language,
            name,
            highlights,
            injections,
            locals,
        ).map_err(|e| HighlightError::QueryError(format!("Failed to create config: {:?}", e)))?;
        
        // Configure recognized capture names based on our theme
        config.configure(&self.theme.captured_names());
        
        Ok(config)
    }
    
    /// Check if a language is supported.
    pub fn is_language_supported(&self, name: &str) -> bool {
        self.registry.is_supported(name)
    }
    
    /// Get list of supported languages.
    pub fn supported_languages(&self) -> Vec<&str> {
        self.registry.supported_languages()
    }
    
    /// Set the theme for highlighting.
    pub fn set_theme(&mut self, theme: Theme) {
        self.theme = theme;
        // Reconfigure all cached configs with new theme
        let captured_names = self.theme.captured_names();
        let mut configs = self.configs.write().unwrap();
        for config in configs.values_mut() {
            config.configure(&captured_names);
        }
    }
    
    /// Get the current theme.
    pub fn theme(&self) -> &Theme {
        &self.theme
    }
    
    /// Highlight source code and return HTML with CSS classes.
    pub fn highlight(&self, source: &str, language: &str) -> HighlightResult<String> {
        // Get the canonical language name (resolves aliases like "csharp" -> "c-sharp")
        let canonical_name = self.registry.get_canonical_name(language);
        
        // Ensure the configuration exists (lazy loading)
        if !self.ensure_config(&canonical_name) {
            return Err(HighlightError::UnsupportedLanguage(language.to_string()));
        }
        
        // Get the configuration (now guaranteed to exist)
        let configs = self.configs.read().unwrap();
        let config = configs.get(&canonical_name).unwrap();
        
        // Create a new highlighter for this operation
        let mut highlighter = Highlighter::new();
        
        // Highlight the source code
        let highlights = highlighter.highlight(
            config,
            source.as_bytes(),
            None,
            |_| None,
        ).map_err(|e| HighlightError::ParseError(format!("Highlight error: {:?}", e)))?;
        
        // Convert highlights to HTML
        self.render_html(source, highlights)
    }
    
    /// Render highlights to HTML with CSS classes.
    fn render_html(
        &self,
        source: &str,
        highlights: impl Iterator<Item = Result<HighlightEvent, tree_sitter_highlight::Error>>,
    ) -> HighlightResult<String> {
        let mut renderer = HtmlRenderer::new(source, &self.theme);
        
        for event in highlights {
            match event {
                Ok(HighlightEvent::Source { start, end }) => {
                    renderer.push_source(start, end);
                }
                Ok(HighlightEvent::HighlightStart(highlight)) => {
                    renderer.push_highlight_start(highlight.0);
                }
                Ok(HighlightEvent::HighlightEnd) => {
                    renderer.push_highlight_end();
                }
                Err(e) => {
                    return Err(HighlightError::ParseError(format!("Highlight event error: {:?}", e)));
                }
            }
        }
        
        Ok(renderer.finish())
    }
}

impl Default for TreeSitterHighlighter {
    fn default() -> Self {
        Self::new()
    }
}

/// HTML renderer for highlighted code.
struct HtmlRenderer<'a> {
    source: &'a str,
    theme: &'a Theme,
    html: String,
    highlight_stack: Vec<usize>,
    current_source_start: usize,
}

impl<'a> HtmlRenderer<'a> {
    fn new(source: &'a str, theme: &'a Theme) -> Self {
        Self {
            source,
            theme,
            html: String::with_capacity(source.len() * 2),
            highlight_stack: Vec::new(),
            current_source_start: 0,
        }
    }
    
    fn push_source(&mut self, start: usize, end: usize) {
        // Flush any pending source
        if start > self.current_source_start {
            let text = &self.source[self.current_source_start..start];
            self.html.push_str(&html_escape(text));
        }
        self.current_source_start = end;
        
        // Add the source text with current highlights
        if start < end {
            let text = &self.source[start..end];
            let escaped = html_escape(text);
            
            if !self.highlight_stack.is_empty() {
                let classes: Vec<&str> = self.highlight_stack.iter()
                    .map(|&idx| self.theme.css_class_for_index(idx))
                    .filter(|&s| s != "ts-default")
                    .collect();
                
                if !classes.is_empty() {
                    self.html.push_str("<span class=\"");
                    self.html.push_str(&classes.join(" "));
                    self.html.push_str("\">");
                    self.html.push_str(&escaped);
                    self.html.push_str("</span>");
                } else {
                    self.html.push_str(&escaped);
                }
            } else {
                self.html.push_str(&escaped);
            }
        }
    }
    
    fn push_highlight_start(&mut self, highlight_idx: usize) {
        self.highlight_stack.push(highlight_idx);
    }
    
    fn push_highlight_end(&mut self) {
        self.highlight_stack.pop();
    }
    
    fn finish(mut self) -> String {
        // Flush any remaining source
        if self.current_source_start < self.source.len() {
            let text = &self.source[self.current_source_start..];
            self.html.push_str(&html_escape(text));
        }
        self.html
    }
}

/// Escape HTML special characters.
fn html_escape(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '&' => result.push_str("&amp;"),
            '"' => result.push_str("&quot;"),
            '\'' => result.push_str("&#39;"),
            _ => result.push(c),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_queries_dir_embedded() {
        // Verify queries directory is embedded
        println!("[test] QUERIES_DIR path: {:?}", QUERIES_DIR.path());
        println!("[test] QUERIES_DIR dirs: {}", QUERIES_DIR.dirs().count());
        println!("[test] QUERIES_DIR files: {}", QUERIES_DIR.files().count());
        
        // Should have at least 200 language directories
        assert!(QUERIES_DIR.dirs().count() > 200, "QUERIES_DIR should have many language directories");
        
        // List first 10 directories
        for (i, dir) in QUERIES_DIR.dirs().enumerate() {
            if i < 10 {
                println!("[test]   Dir[{}]: {:?} ({} files)", i, dir.path(), dir.files().count());
            }
        }
        
        // Check rust directory exists
        let rust_dir = QUERIES_DIR.get_dir("rust");
        println!("[test] get_dir('rust'): {:?}", rust_dir.as_ref().map(|d| d.path()));
        
        if rust_dir.is_none() {
            // Try to find rust directory by iterating
            for dir in QUERIES_DIR.dirs() {
                let path = dir.path().to_str().unwrap_or("");
                if path.contains("rust") {
                    println!("[test] Found rust-like dir: {}", path);
                    // Check files in this dir
                    for file in dir.files() {
                        println!("[test]   File: {}", file.path().display());
                    }
                }
            }
        }
        
        // Try alternative get method
        for dir in QUERIES_DIR.dirs() {
            if dir.path().to_str().map(|s| s == "rust").unwrap_or(false) {
                println!("[test] Found rust by iteration!");
                for file in dir.files() {
                    println!("[test]   File: {}", file.path().display());
                }
            }
        }
        
        assert!(rust_dir.is_some(), "rust directory should exist");
        
        // Check rust/highlights.scm exists
        if let Some(_dir) = rust_dir {
            // include_dir stores files with full path, so we need to use the full path
            let highlights = QUERIES_DIR.get_file("rust/highlights.scm");
            println!("[test] get_file('rust/highlights.scm'): {:?}", highlights.as_ref().map(|f| f.path()));
            
            assert!(highlights.is_some(), "rust/highlights.scm should exist");
            
            if let Some(file) = highlights {
                let content = file.contents_utf8().unwrap_or("");
                println!("[test] rust/highlights.scm length: {} bytes", content.len());
                assert!(content.len() > 100, "highlights.scm should have content");
            }
        }
    }
    
    #[test]
    fn test_highlighter_creation() {
        let highlighter = TreeSitterHighlighter::new();
        // Should have some languages registered
        assert!(highlighter.supported_languages().len() > 0);
    }
    
    #[test]
    fn test_supported_languages() {
        let highlighter = TreeSitterHighlighter::new();
        let languages = highlighter.supported_languages();
        
        // Should contain some common languages
        // (may not all be present depending on build)
        assert!(languages.len() > 0);
    }
    
    #[test]
    fn test_html_escape() {
        assert_eq!(html_escape("<script>"), "&lt;script&gt;");
        assert_eq!(html_escape("a & b"), "a &amp; b");
        assert_eq!(html_escape("'quote'"), "&#39;quote&#39;");
    }
    
    #[test]
    fn test_case_insensitive_language_lookup() {
        let highlighter = TreeSitterHighlighter::new();
        
        // Test case insensitivity if languages are supported
        if highlighter.is_language_supported("rust") {
            assert!(highlighter.is_language_supported("RUST"));
            assert!(highlighter.is_language_supported("Rust"));
        }
    }
    
    #[test]
    fn test_unsupported_language() {
        let highlighter = TreeSitterHighlighter::new();
        let result = highlighter.highlight("code", "nonexistent_language_xyz");
        assert!(result.is_err());
    }
    
    #[test]
    fn test_theme_switching() {
        let mut highlighter = TreeSitterHighlighter::new();
        assert_eq!(highlighter.theme(), &Theme::DarkModern);
        
        highlighter.set_theme(Theme::LightModern);
        assert_eq!(highlighter.theme(), &Theme::LightModern);
    }
    
    #[test]
    fn test_highlight_empty_code() {
        let highlighter = TreeSitterHighlighter::new();
        
        // Find a supported language
        if let Some(lang) = highlighter.supported_languages().first() {
            let result = highlighter.highlight("", lang);
            // Empty code should still work
            let configs = highlighter.configs.read().unwrap();
            assert!(result.is_ok() || !configs.contains_key(*lang));
        }
    }
    
    #[test]
    fn test_error_is_std_error() {
        let err = HighlightError::UnsupportedLanguage("test".to_string());
        let _: &dyn std::error::Error = &err;
    }
    
    #[test]
    fn test_error_display() {
        let err = HighlightError::UnsupportedLanguage("rust".to_string());
        assert!(err.to_string().contains("rust"));
        
        let err = HighlightError::ParseError("test error".to_string());
        assert!(err.to_string().contains("test error"));
    }
    
    #[test]
    fn test_typescript_support() {
        let highlighter = TreeSitterHighlighter::new();
        
        // Check if typescript is supported
        println!("[test] Checking TypeScript support...");
        println!("[test] is_language_supported('typescript'): {}", highlighter.is_language_supported("typescript"));
        println!("[test] is_language_supported('ts'): {}", highlighter.is_language_supported("ts"));
        println!("[test] is_language_supported('tsx'): {}", highlighter.is_language_supported("tsx"));
        
        // Check registry directly
        let canonical = highlighter.registry.get_canonical_name("typescript");
        println!("[test] Canonical name for 'typescript': {}", canonical);
        let canonical_ts = highlighter.registry.get_canonical_name("ts");
        println!("[test] Canonical name for 'ts': {}", canonical_ts);
        
        // Check if language is in registry
        let langs = highlighter.supported_languages();
        let has_typescript = langs.iter().any(|l| *l == "typescript");
        let has_tsx = langs.iter().any(|l| *l == "tsx");
        println!("[test] has_typescript in supported_languages: {}", has_typescript);
        println!("[test] has_tsx in supported_languages: {}", has_tsx);
        
        // Try to highlight TypeScript code
        if highlighter.is_language_supported("typescript") {
            let code = "const x: number = 42;";
            let result = highlighter.highlight(code, "typescript");
            println!("[test] TypeScript highlight result: {:?}", result.is_ok());
            if let Ok(html) = result {
                println!("[test] TypeScript HTML length: {}", html.len());
                assert!(!html.is_empty(), "TypeScript highlight should produce output");
            } else {
                println!("[test] TypeScript highlight error: {:?}", result.err());
            }
        }
    }
    
    #[test]
    fn test_all_languages() {
        let highlighter = TreeSitterHighlighter::new();
        let languages = highlighter.supported_languages();
        
        println!("[test] Total supported languages: {}", languages.len());
        
        // Test each language with a simple code snippet
        let mut failed: Vec<String> = Vec::new();
        let mut success_count = 0;
        
        for lang in &languages {
            // Use a simple test code for all languages
            let code = "test";
            
            match highlighter.highlight(code, lang) {
                Ok(html) => {
                    if html.is_empty() {
                        failed.push(format!("{} (empty output)", lang));
                    } else {
                        success_count += 1;
                    }
                }
                Err(e) => {
                    failed.push(format!("{} ({:?})", lang, e));
                }
            }
        }
        
        println!("[test] Success: {} languages", success_count);
        println!("[test] Failed: {} languages", failed.len());
        for f in &failed {
            println!("[test]   FAILED: {}", f);
        }
        
        // Check if t32, mojo, slisp are in supported languages
        let has_t32 = languages.iter().any(|l| *l == "t32");
        let has_mojo = languages.iter().any(|l| *l == "mojo");
        let has_slisp = languages.iter().any(|l| *l == "slisp");
        println!("[test] t32 in supported_languages: {}", has_t32);
        println!("[test] mojo in supported_languages: {}", has_mojo);
        println!("[test] slisp in supported_languages: {}", has_slisp);
        
        // Assert that most languages work (allow some failures for edge cases)
        assert!(success_count > 200, "Most languages should work, got {} successes", success_count);
    }
    
    #[test]
    fn test_all_languages_detailed() {
        let highlighter = TreeSitterHighlighter::new();
        let languages = highlighter.supported_languages();
        
        // Language-specific test code for better highlighting coverage
        let test_codes: std::collections::HashMap<&str, &str> = [
            ("python", "def hello():\n    pass"),
            ("javascript", "function hello() { return 1; }"),
            ("typescript", "const x: number = 1;"),
            ("tsx", "const App = () => <div/>"),
            ("rust", "fn main() {}"),
            ("c", "int main() { return 0; }"),
            ("cpp", "int main() { return 0; }"),
            ("go", "func main() {}"),
            ("java", "public class Main {}"),
            ("ruby", "def hello; end"),
            ("lua", "function hello() end"),
            ("sql", "SELECT * FROM table;"),
            ("html", "<html></html>"),
            ("css", ".class { color: red; }"),
            ("json", "{ \"key\": \"value\" }"),
            ("yaml", "key: value"),
            ("toml", "key = \"value\""),
            ("bash", "#!/bin/bash\necho hello"),
            ("c-sharp", "public class Program {}"),
        ].iter().cloned().collect();
        
        println!("[test] === Detailed Language Test ===");
        
        for lang in &languages {
            let code = test_codes.get(*lang).unwrap_or(&"test");
            match highlighter.highlight(code, lang) {
                Ok(html) => {
                    let has_highlight = html.contains("class=\"");
                    println!("[test] {:20} -> {} bytes, highlighted: {}", lang, html.len(), has_highlight);
                }
                Err(e) => {
                    println!("[test] {:20} -> ERROR: {:?}", lang, e);
                }
            }
        }
    }
}
