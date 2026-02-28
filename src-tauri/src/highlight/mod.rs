//! Tree-sitter based syntax highlighting module.
//!
//! Provides accurate and performant syntax highlighting using tree-sitter parsers.

mod registry;
pub mod themes;

pub use registry::LanguageRegistry;
pub use themes::Theme;

use std::collections::HashMap;
use tree_sitter_highlight::{
    HighlightConfiguration, Highlighter, HighlightEvent,
};

/// Error type for highlighting operations.
#[derive(Debug)]
pub enum HighlightError {
    /// Language not supported
    UnsupportedLanguage(String),
    /// Failed to parse the source code
    ParseError(String),
    /// Failed to load highlight queries
    QueryError(String),
    /// IO error
    IoError(String),
}

impl std::fmt::Display for HighlightError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnsupportedLanguage(lang) => write!(f, "Language '{}' is not supported", lang),
            Self::ParseError(msg) => write!(f, "Parse error: {}", msg),
            Self::QueryError(msg) => write!(f, "Query error: {}", msg),
            Self::IoError(msg) => write!(f, "IO error: {}", msg),
        }
    }
}

impl std::error::Error for HighlightError {}

/// Result type for highlighting operations.
pub type HighlightResult<T> = Result<T, HighlightError>;

/// Highlight configuration for a specific language.
pub struct LanguageHighlightConfig {
    /// The language name
    pub name: String,
    /// The highlight configuration
    pub config: HighlightConfiguration,
}

/// Main highlighter that manages languages and performs highlighting.
pub struct TreeSitterHighlighter {
    registry: LanguageRegistry,
    configs: HashMap<String, HighlightConfiguration>,
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
        let mut highlighter = Self {
            registry,
            configs: HashMap::new(),
            theme,
        };
        
        // Pre-initialize configurations for all supported languages
        highlighter.initialize_configs();
        highlighter
    }
    
    /// Initialize highlight configurations for supported languages.
    fn initialize_configs(&mut self) {
        // Rust
        if let Some(lang) = self.registry.get_language("rust") {
            if let Ok(config) = self.create_config(
                "rust",
                lang,
                include_str!("../../queries/rust/highlights.scm"),
                "", // injections
                "", // locals
            ) {
                self.configs.insert("rust".to_string(), config);
            }
        }
        
        // JavaScript
        if let Some(lang) = self.registry.get_language("javascript") {
            if let Ok(config) = self.create_config(
                "javascript",
                lang,
                include_str!("../../queries/javascript/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("javascript".to_string(), config);
            }
        }
        
        // Python
        if let Some(lang) = self.registry.get_language("python") {
            if let Ok(config) = self.create_config(
                "python",
                lang,
                include_str!("../../queries/python/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("python".to_string(), config);
            }
        }
        
        // TypeScript
        if let Some(lang) = self.registry.get_language("typescript") {
            if let Ok(config) = self.create_config(
                "typescript",
                lang,
                include_str!("../../queries/typescript/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("typescript".to_string(), config);
            }
        }
        
        // TSX
        if let Some(lang) = self.registry.get_language("tsx") {
            if let Ok(config) = self.create_config(
                "tsx",
                lang,
                include_str!("../../queries/typescript/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("tsx".to_string(), config);
            }
        }
        
        // Go
        if let Some(lang) = self.registry.get_language("go") {
            if let Ok(config) = self.create_config(
                "go",
                lang,
                include_str!("../../queries/go/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("go".to_string(), config);
            }
        }
        
        // C
        if let Some(lang) = self.registry.get_language("c") {
            if let Ok(config) = self.create_config(
                "c",
                lang,
                include_str!("../../queries/c/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("c".to_string(), config);
            }
        }
        
        // C++
        if let Some(lang) = self.registry.get_language("cpp") {
            if let Ok(config) = self.create_config(
                "cpp",
                lang,
                include_str!("../../queries/cpp/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("cpp".to_string(), config);
            }
        }
        
        // Java
        if let Some(lang) = self.registry.get_language("java") {
            if let Ok(config) = self.create_config(
                "java",
                lang,
                include_str!("../../queries/java/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("java".to_string(), config);
            }
        }
        
        // JSON
        if let Some(lang) = self.registry.get_language("json") {
            if let Ok(config) = self.create_config(
                "json",
                lang,
                include_str!("../../queries/json/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("json".to_string(), config);
            }
        }
        
        // HTML
        if let Some(lang) = self.registry.get_language("html") {
            if let Ok(config) = self.create_config(
                "html",
                lang,
                include_str!("../../queries/html/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("html".to_string(), config);
            }
        }
        
        // CSS
        if let Some(lang) = self.registry.get_language("css") {
            if let Ok(config) = self.create_config(
                "css",
                lang,
                include_str!("../../queries/css/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("css".to_string(), config);
            }
        }
        
        // Bash
        if let Some(lang) = self.registry.get_language("bash") {
            if let Ok(config) = self.create_config(
                "bash",
                lang,
                include_str!("../../queries/bash/highlights.scm"),
                "",
                "",
            ) {
                self.configs.insert("bash".to_string(), config);
            }
        }
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
        // Reconfigure all configs with new theme
        let captured_names = self.theme.captured_names();
        for config in self.configs.values_mut() {
            config.configure(&captured_names);
        }
    }
    
    /// Get the current theme.
    pub fn theme(&self) -> &Theme {
        &self.theme
    }
    
    /// Highlight source code and return HTML with CSS classes.
    pub fn highlight(&self, source: &str, language: &str) -> HighlightResult<String> {
        let lang_lower = language.to_lowercase();
        
        // Try to get the canonical language name through the registry
        // This resolves aliases (e.g., "js" -> "javascript")
        let canonical_name = if self.configs.contains_key(&lang_lower) {
            &lang_lower
        } else {
            // Try to resolve via registry alias
            self.registry.supported_languages()
                .iter()
                .find(|&name| {
                    self.registry.is_supported(&lang_lower) && 
                    self.registry.get_language(&lang_lower) == self.registry.get_language(*name)
                })
                .map(|s| *s)
                .unwrap_or(&lang_lower)
        };
        
        // Get the configuration for this language
        let config = self.configs.get(canonical_name)
            .ok_or_else(|| HighlightError::UnsupportedLanguage(language.to_string()))?;
        
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
    output: String,
    highlight_stack: Vec<usize>,
    current_pos: usize,
}

impl<'a> HtmlRenderer<'a> {
    fn new(source: &'a str, theme: &'a Theme) -> Self {
        Self {
            source,
            theme,
            output: String::new(),
            highlight_stack: Vec::new(),
            current_pos: 0,
        }
    }
    
    fn push_source(&mut self, start: usize, end: usize) {
        // Flush any pending source up to start
        if start > self.current_pos {
            let text = &self.source[self.current_pos..start];
            self.output.push_str(&html_escape(text));
        }
        
        // Add the current source text with any active highlights
        let text = &self.source[start..end];
        if text.is_empty() {
            return;
        }
        
        if self.highlight_stack.is_empty() {
            self.output.push_str(&html_escape(text));
        } else {
            // Apply the innermost highlight
            let highlight_idx = *self.highlight_stack.last().unwrap();
            let class = self.theme.css_class_for_index(highlight_idx);
            self.output.push_str(&format!(
                "<span class=\"{}\">{}</span>",
                class,
                html_escape(text)
            ));
        }
        
        self.current_pos = end;
    }
    
    fn push_highlight_start(&mut self, highlight_idx: usize) {
        self.highlight_stack.push(highlight_idx);
    }
    
    fn push_highlight_end(&mut self) {
        self.highlight_stack.pop();
    }
    
    fn finish(mut self) -> String {
        // Flush any remaining source
        if self.current_pos < self.source.len() {
            let text = &self.source[self.current_pos..];
            self.output.push_str(&html_escape(text));
        }
        
        self.output
    }
}

/// Escape special HTML characters.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_highlighter_creation() {
        let highlighter = TreeSitterHighlighter::new();
        assert_eq!(highlighter.theme(), &Theme::DarkModern);
    }
    
    #[test]
    fn test_highlighter_with_theme() {
        let highlighter = TreeSitterHighlighter::with_theme(Theme::LightModern);
        assert_eq!(highlighter.theme(), &Theme::LightModern);
    }
    
    #[test]
    fn test_supported_languages() {
        let highlighter = TreeSitterHighlighter::new();
        let languages = highlighter.supported_languages();
        
        assert!(languages.contains(&"rust"));
        assert!(languages.contains(&"javascript"));
        assert!(languages.contains(&"python"));
    }
    
    #[test]
    fn test_is_language_supported() {
        let highlighter = TreeSitterHighlighter::new();
        
        assert!(highlighter.is_language_supported("rust"));
        assert!(highlighter.is_language_supported("javascript"));
        assert!(highlighter.is_language_supported("python"));
        assert!(highlighter.is_language_supported("js")); // alias
        assert!(!highlighter.is_language_supported("unknown"));
    }
    
    #[test]
    fn test_set_theme() {
        let mut highlighter = TreeSitterHighlighter::new();
        highlighter.set_theme(Theme::LightModern);
        assert_eq!(highlighter.theme(), &Theme::LightModern);
    }
    
    #[test]
    fn test_highlight_unsupported_language() {
        let highlighter = TreeSitterHighlighter::new();
        let result = highlighter.highlight("code", "unknown");
        
        assert!(result.is_err());
        if let Err(HighlightError::UnsupportedLanguage(lang)) = result {
            assert_eq!(lang, "unknown");
        } else {
            panic!("Expected UnsupportedLanguage error");
        }
    }
    
    #[test]
    fn test_highlight_rust_code() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "fn main() {}";
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        // Should contain spans with CSS classes
        assert!(html.contains("ts-"));
    }
    
    #[test]
    fn test_highlight_javascript_code() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "function test() { return 42; }";
        let result = highlighter.highlight(code, "javascript");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        assert!(html.contains("ts-"));
    }
    
    #[test]
    fn test_highlight_python_code() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "def hello():\n    print('world')";
        let result = highlighter.highlight(code, "python");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        assert!(html.contains("ts-"));
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
        
        assert!(highlighter.is_language_supported("RUST"));
        assert!(highlighter.is_language_supported("JavaScript"));
        assert!(highlighter.is_language_supported("PYTHON"));
    }
    
    #[test]
    fn test_highlight_empty_code() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "";
        let result = highlighter.highlight(code, "rust");
        
        // Empty code should still work
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_highlight_whitespace_code() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "   \n\t  ";
        let result = highlighter.highlight(code, "rust");
        
        // Whitespace-only code should still work
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_highlight_complex_rust() {
        let highlighter = TreeSitterHighlighter::new();
        let code = r#"
//! A sample Rust module
use std::collections::HashMap;

/// A documentation comment
pub fn main() {
    let mut map: HashMap<String, i32> = HashMap::new();
    map.insert("key".to_string(), 42);
    
    // Line comment
    for (k, v) in &map {
        println!("{}: {}", k, v);
    }
}
"#;
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        // Should contain CSS classes
        assert!(html.contains("ts-"));
    }
    
    #[test]
    fn test_highlight_complex_javascript() {
        let highlighter = TreeSitterHighlighter::new();
        let code = r#"
// A sample JavaScript file
class MyClass {
    constructor(value) {
        this.value = value;
    }
    
    async fetchData(url) {
        const response = await fetch(url);
        return response.json();
    }
}

const instance = new MyClass(42);
export default instance;
"#;
        let result = highlighter.highlight(code, "javascript");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        assert!(html.contains("ts-"));
    }
    
    #[test]
    fn test_highlight_complex_python() {
        let highlighter = TreeSitterHighlighter::new();
        let code = r#"
"""A sample Python module"""
from typing import List, Dict

class DataProcessor:
    def __init__(self, name: str):
        self.name = name
        self._data: List[Dict] = []
    
    def process(self, items: List[str]) -> int:
        count = 0
        for item in items:
            self._data.append({"name": item})
            count += 1
        return count

if __name__ == "__main__":
    processor = DataProcessor("test")
    print(processor.process(["a", "b", "c"]))
"#;
        let result = highlighter.highlight(code, "python");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        assert!(html.contains("ts-"));
    }
    
    #[test]
    fn test_highlight_with_light_theme() {
        let highlighter = TreeSitterHighlighter::with_theme(Theme::LightModern);
        let code = "fn main() {}";
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        assert_eq!(highlighter.theme(), &Theme::LightModern);
    }
    
    #[test]
    fn test_theme_switching() {
        let mut highlighter = TreeSitterHighlighter::new();
        assert_eq!(highlighter.theme(), &Theme::DarkModern);
        
        // Switch to light theme
        highlighter.set_theme(Theme::LightModern);
        assert_eq!(highlighter.theme(), &Theme::LightModern);
        
        // Switch back to dark theme
        highlighter.set_theme(Theme::DarkModern);
        assert_eq!(highlighter.theme(), &Theme::DarkModern);
    }
    
    #[test]
    fn test_html_escape_complete() {
        // Test all special characters
        assert_eq!(html_escape("&"), "&amp;");
        assert_eq!(html_escape("<"), "&lt;");
        assert_eq!(html_escape(">"), "&gt;");
        assert_eq!(html_escape("\""), "&quot;");
        assert_eq!(html_escape("'"), "&#39;");
        
        // Test combined
        assert_eq!(
            html_escape("<div class=\"test\">Hello & 'World'</div>"),
            "&lt;div class=&quot;test&quot;&gt;Hello &amp; &#39;World&#39;&lt;/div&gt;"
        );
    }
    
    #[test]
    fn test_highlight_alias_js() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "const x = 42;";
        let result = highlighter.highlight(code, "js");
        
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_highlight_alias_py() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "x = 42";
        let result = highlighter.highlight(code, "py");
        
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_highlight_alias_rs() {
        let highlighter = TreeSitterHighlighter::new();
        let code = "fn main() {}";
        let result = highlighter.highlight(code, "rs");
        
        assert!(result.is_ok());
    }
    
    #[test]
    fn test_error_display() {
        let err = HighlightError::UnsupportedLanguage("unknown".to_string());
        assert!(err.to_string().contains("unknown"));
        
        let err = HighlightError::ParseError("test error".to_string());
        assert!(err.to_string().contains("test error"));
        
        let err = HighlightError::QueryError("query error".to_string());
        assert!(err.to_string().contains("query error"));
        
        let err = HighlightError::IoError("io error".to_string());
        assert!(err.to_string().contains("io error"));
    }
    
    #[test]
    fn test_default_highlighter() {
        let highlighter = TreeSitterHighlighter::default();
        assert_eq!(highlighter.theme(), &Theme::DarkModern);
        assert!(highlighter.is_language_supported("rust"));
    }
    
    #[test]
    fn test_highlight_plain_text() {
        // Test highlighting code that produces no highlights (plain text)
        let highlighter = TreeSitterHighlighter::new();
        let code = "    "; // Just whitespace
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        // Should contain escaped whitespace, no spans
        assert!(!html.contains("<span"));
    }
    
    #[test]
    fn test_highlight_code_with_special_chars() {
        let highlighter = TreeSitterHighlighter::new();
        let code = r#"let s = "<div>&nbsp;</div>";"#;
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        // Should escape HTML entities
        assert!(html.contains("&lt;") || html.contains("&amp;"));
    }
    
    #[test]
    fn test_supported_languages_list() {
        let highlighter = TreeSitterHighlighter::new();
        let languages = highlighter.supported_languages();
        
        assert!(languages.contains(&"rust"));
        assert!(languages.contains(&"javascript"));
        assert!(languages.contains(&"python"));
    }
    
    #[test]
    fn test_unsupported_language_error() {
        let highlighter = TreeSitterHighlighter::new();
        let result = highlighter.highlight("code", "unknown_lang");
        
        assert!(result.is_err());
        match result {
            Err(HighlightError::UnsupportedLanguage(lang)) => assert_eq!(lang, "unknown_lang"),
            _ => panic!("Expected UnsupportedLanguage error"),
        }
    }
    
    #[test]
    fn test_error_is_std_error() {
        let err = HighlightError::UnsupportedLanguage("test".to_string());
        // Test that it implements std::error::Error
        let _: &dyn std::error::Error = &err;
    }
    
    #[test]
    fn test_highlight_multiline_code() {
        // Test multiline code to ensure all parts are processed correctly
        let highlighter = TreeSitterHighlighter::new();
        let code = r#"// Comment
fn main() {
    let x = 42;
    println!("{}", x);
}"#;
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        // Should have spans for various parts
        assert!(html.contains("ts-"));
    }
    
    #[test]
    fn test_highlight_with_comments() {
        // Test code with comments to trigger different highlight paths
        let highlighter = TreeSitterHighlighter::new();
        let code = r#"// This is a line comment
/* Block comment */
fn test() {}"#;
        let result = highlighter.highlight(code, "rust");
        
        assert!(result.is_ok());
        let html = result.unwrap();
        assert!(html.contains("ts-"));
    }
}