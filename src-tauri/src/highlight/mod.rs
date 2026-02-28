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
static QUERIES_DIR: Dir = include_dir!("queries");

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
        log::info!("Embedded queries directory: {} languages", QUERIES_DIR.dirs().count());
        for dir in QUERIES_DIR.dirs().take(5) {
            log::info!("  - {} ({} files)", dir.path().display(), dir.files().count());
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
    fn get_query_content(lang_name: &str, file_name: &str) -> String {
        // Try to get the directory
        let dir = match QUERIES_DIR.get_dir(lang_name) {
            Some(d) => d,
            None => {
                log::error!("Directory not found for language: {}", lang_name);
                return String::new();
            }
        };
        
        // Try to get the file
        let file = match dir.get_file(file_name) {
            Some(f) => f,
            None => {
                // File not found, but this is expected for some languages (injections, locals)
                return String::new();
            }
        };
        
        // Get the content
        match file.contents_utf8() {
            Some(content) => {
                log::debug!("Loaded query file: {}/{} ({} bytes)", lang_name, file_name, content.len());
                content.to_string()
            }
            None => {
                log::error!("Failed to read file as UTF-8: {}/{}", lang_name, file_name);
                String::new()
            }
        }
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
                log::warn!("Language not found in registry: {}", name);
                return false;
            }
        };
        
        let config = match self.create_config_from_files(name, lang) {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to create config for {}: {:?}", name, e);
                return false;
            }
        };
        
        // Store in cache with write lock
        {
            let mut configs = self.configs.write().unwrap();
            configs.insert(name.to_string(), config);
        }
        
        log::debug!("Created highlight config for: {}", name);
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
}
