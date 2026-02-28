//! Language registry for tree-sitter grammars.
//!
//! Manages available languages and provides language lookup by name or alias.

use std::collections::HashMap;
use tree_sitter::Language;

/// Registry containing all supported languages.
pub struct LanguageRegistry {
    /// Map from language name to tree-sitter Language
    languages: HashMap<String, Language>,
    /// Map from alias to canonical language name
    aliases: HashMap<String, String>,
}

impl LanguageRegistry {
    /// Create a new language registry with all supported languages.
    pub fn new() -> Self {
        let mut registry = Self {
            languages: HashMap::new(),
            aliases: HashMap::new(),
        };
        
        // Register languages from crates.io packages
        // Note: tree-sitter grammar functions use LANGUAGE constant
        registry.register("rust", tree_sitter_rust::LANGUAGE.into());
        registry.register("javascript", tree_sitter_javascript::LANGUAGE.into());
        registry.register("python", tree_sitter_python::LANGUAGE.into());
        registry.register("typescript", tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into());
        registry.register("tsx", tree_sitter_typescript::LANGUAGE_TSX.into());
        registry.register("go", tree_sitter_go::LANGUAGE.into());
        registry.register("c", tree_sitter_c::LANGUAGE.into());
        registry.register("cpp", tree_sitter_cpp::LANGUAGE.into());
        registry.register("java", tree_sitter_java::LANGUAGE.into());
        registry.register("json", tree_sitter_json::LANGUAGE.into());
        registry.register("html", tree_sitter_html::LANGUAGE.into());
        registry.register("css", tree_sitter_css::LANGUAGE.into());
        registry.register("bash", tree_sitter_bash::LANGUAGE.into());
        
        // Register common aliases
        registry.register_aliases("javascript", &["js", "ecmascript"]);
        registry.register_aliases("python", &["py"]);
        registry.register_aliases("rust", &["rs"]);
        registry.register_aliases("typescript", &["ts"]);
        registry.register_aliases("cpp", &["c++", "cc", "cxx"]);
        registry.register_aliases("bash", &["sh", "shell", "zsh"]);
        
        registry
    }
    
    /// Register a language with its tree-sitter Language.
    pub fn register(&mut self, name: &str, language: Language) {
        self.languages.insert(name.to_lowercase(), language);
    }
    
    /// Register aliases for a language.
    pub fn register_aliases(&mut self, canonical: &str, aliases: &[&str]) {
        for alias in aliases {
            self.aliases.insert(alias.to_lowercase(), canonical.to_lowercase());
        }
    }
    
    /// Get a language by name or alias.
    ///
    /// Returns `Some(Language)` if found, `None` otherwise.
    pub fn get_language(&self, name: &str) -> Option<Language> {
        let name_lower = name.to_lowercase();
        
        // Try direct lookup first
        if let Some(lang) = self.languages.get(&name_lower) {
            return Some(lang.clone());
        }
        
        // Try alias lookup
        if let Some(canonical) = self.aliases.get(&name_lower) {
            return self.languages.get(canonical).map(|l| l.clone());
        }
        
        None
    }
    
    /// Check if a language is supported.
    pub fn is_supported(&self, name: &str) -> bool {
        self.get_language(name).is_some()
    }
    
    /// Get list of all supported language names.
    pub fn supported_languages(&self) -> Vec<&str> {
        self.languages.keys().map(|s| s.as_str()).collect()
    }
    
    /// Get count of supported languages.
    pub fn language_count(&self) -> usize {
        self.languages.len()
    }
}

impl Default for LanguageRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_registry_creation() {
        let registry = LanguageRegistry::new();
        // Should have 13 languages registered (rust, javascript, python, typescript, tsx, go, c, cpp, java, json, html, css, bash)
        assert_eq!(registry.language_count(), 13);
    }
    
    #[test]
    fn test_supported_languages() {
        let registry = LanguageRegistry::new();
        let languages = registry.supported_languages();
        
        assert!(languages.contains(&"rust"));
        assert!(languages.contains(&"javascript"));
        assert!(languages.contains(&"python"));
    }
    
    #[test]
    fn test_get_language() {
        let registry = LanguageRegistry::new();
        
        // Test direct name lookup
        assert!(registry.get_language("rust").is_some());
        assert!(registry.get_language("javascript").is_some());
        assert!(registry.get_language("python").is_some());
        
        // Test case insensitivity
        assert!(registry.get_language("RUST").is_some());
        assert!(registry.get_language("JavaScript").is_some());
        assert!(registry.get_language("PYTHON").is_some());
    }
    
    #[test]
    fn test_aliases() {
        let registry = LanguageRegistry::new();
        
        // Test alias lookup
        assert!(registry.get_language("js").is_some());
        assert!(registry.get_language("py").is_some());
        assert!(registry.get_language("rs").is_some());
        
        // Aliases should resolve to the correct language
        let js_lang = registry.get_language("js");
        let javascript_lang = registry.get_language("javascript");
        assert_eq!(js_lang, javascript_lang);
    }
    
    #[test]
    fn test_unsupported_language() {
        let registry = LanguageRegistry::new();
        
        assert!(registry.get_language("unsupported").is_none());
        assert!(registry.get_language("unknown").is_none());
    }
    
    #[test]
    fn test_is_supported() {
        let registry = LanguageRegistry::new();
        
        assert!(registry.is_supported("rust"));
        assert!(registry.is_supported("js"));
        assert!(!registry.is_supported("unknown"));
    }
}