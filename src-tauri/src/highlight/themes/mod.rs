//! Syntax highlighting themes.
//!
//! Provides theme definitions that map tree-sitter capture names to colors.

mod dark_modern;
mod light_modern;
pub mod vscode;

pub use dark_modern::DARK_MODERN;
pub use light_modern::LIGHT_MODERN;
pub use vscode::*;

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::Path;

/// Get the VSCode themes directory using the same path as Tauri's app_config_dir.
fn vscode_themes_dir() -> Option<std::path::PathBuf> {
    directories::ProjectDirs::from("com", "alecdotdev", "Markpad")
        .map(|dirs| dirs.config_dir().join("themes"))
}

/// Supported themes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Theme {
    DarkModern,
    LightModern,
    /// VSCode dynamic theme, identified by name.
    VSCode(String),
}

impl Theme {
    /// Get the theme colors.
    ///
    /// For built-in themes, returns a static reference.
    /// For VSCode themes, returns an owned `ThemeColors` loaded from disk.
    /// If the VSCode theme file cannot be found, falls back to DarkModern.
    pub fn colors(&self) -> Cow<'static, ThemeColors> {
        match self {
            Theme::DarkModern => Cow::Borrowed(&DARK_MODERN),
            Theme::LightModern => Cow::Borrowed(&LIGHT_MODERN),
            Theme::VSCode(name) => {
                // Try loading from the same themes directory used by Tauri commands
                if let Some(themes_dir) = vscode_themes_dir() {
                    match load_vscode_theme_colors(&themes_dir, name) {
                        Ok(colors) => Cow::Owned(colors),
                        Err(_) => Cow::Borrowed(&DARK_MODERN),
                    }
                } else {
                    Cow::Borrowed(&DARK_MODERN)
                }
            }
        }
    }

    /// Load VSCode theme colors from a specific themes directory.
    /// Returns an error if the theme file is not found or cannot be parsed.
    #[allow(dead_code)]
    pub fn colors_from_dir(&self, themes_dir: &Path) -> Cow<'static, ThemeColors> {
        match self {
            Theme::DarkModern => Cow::Borrowed(&DARK_MODERN),
            Theme::LightModern => Cow::Borrowed(&LIGHT_MODERN),
            Theme::VSCode(name) => {
                match load_vscode_theme_colors(themes_dir, name) {
                    Ok(colors) => Cow::Owned(colors),
                    Err(_) => Cow::Borrowed(&DARK_MODERN),
                }
            }
        }
    }
    
    /// Get the list of captured names that this theme supports.
    pub fn captured_names(&self) -> Vec<String> {
        self.colors().color_map.keys().cloned().collect()
    }
    
    /// Get the CSS class name for a capture.
    #[allow(dead_code)]
    pub fn css_class(&self, capture: &str) -> Option<&'static str> {
        CAPTURE_TO_CSS.get(capture).copied()
    }
    
    /// Get the CSS class for a highlight index.
    /// The index corresponds to the position in captured_names().
    pub fn css_class_for_index(&self, index: usize) -> &'static str {
        let names = self.captured_names();
        if index < names.len() {
            CAPTURE_TO_CSS
                .get(&names[index] as &str)
                .copied()
                .unwrap_or("ts-default")
        } else {
            "ts-default"
        }
    }
    
    /// Get the CSS variable definitions for this theme.
    #[allow(dead_code)]
    pub fn css_variables(&self) -> String {
        let colors = self.colors();
        let mut vars = String::new();
        
        for (capture, color) in &colors.color_map {
            if let Some(css_class) = CAPTURE_TO_CSS.get(capture as &str) {
                let var_name = css_class.strip_prefix("ts-").unwrap_or(css_class);
                vars.push_str(&format!("  --ts-{}: {};\n", var_name, color));
            }
        }
        
        vars
    }
}

impl Default for Theme {
    fn default() -> Self {
        Theme::DarkModern
    }
}

impl std::fmt::Display for Theme {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Theme::DarkModern => write!(f, "dark-modern"),
            Theme::LightModern => write!(f, "light-modern"),
            Theme::VSCode(name) => write!(f, "vscode:{}", name),
        }
    }
}

impl std::str::FromStr for Theme {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "dark-modern" | "dark" => Ok(Theme::DarkModern),
            "light-modern" | "light" => Ok(Theme::LightModern),
            _ if s.starts_with("vscode:") => {
                let name = &s["vscode:".len()..];
                if name.is_empty() {
                    Err("VSCode theme name cannot be empty".to_string())
                } else {
                    Ok(Theme::VSCode(name.to_string()))
                }
            }
            _ => Err(format!("Unknown theme: {}", s)),
        }
    }
}

/// Theme color definitions.
#[derive(Debug, Clone)]
pub struct ThemeColors {
    /// Map from capture name to hex color
    pub color_map: HashMap<String, String>,
    /// Background color
    #[allow(dead_code)]
    pub background: String,
    /// Foreground (default text) color
    #[allow(dead_code)]
    pub foreground: String,
}

/// Load a saved VSCode theme by name from the given themes directory.
///
/// The theme file is expected at `<themes_dir>/<name>.json`.
pub fn load_vscode_theme_colors(themes_dir: &Path, name: &str) -> Result<ThemeColors, String> {
    let theme_file = themes_dir.join(format!("{}.json", name));
    let json = std::fs::read_to_string(&theme_file)
        .map_err(|e| format!("Failed to read theme file {:?}: {}", theme_file, e))?;
    Ok(build_vscode_theme_colors(&json))
}

/// Mapping from capture names to CSS class names.
/// This mapping is used consistently across all themes.
pub static CAPTURE_TO_CSS: phf::Map<&'static str, &'static str> = phf::phf_map! {
    // Comments
    "comment" => "ts-comment",
    "comment.line" => "ts-comment-line",
    "comment.block" => "ts-comment-block",
    "comment.block.documentation" => "ts-comment-doc",
    
    // Keywords
    "keyword" => "ts-keyword",
    "keyword.control" => "ts-keyword-control",
    "keyword.control.conditional" => "ts-keyword-conditional",
    "keyword.control.repeat" => "ts-keyword-repeat",
    "keyword.control.import" => "ts-keyword-import",
    "keyword.control.return" => "ts-keyword-return",
    "keyword.control.exception" => "ts-keyword-exception",
    "keyword.operator" => "ts-keyword-operator",
    "keyword.directive" => "ts-keyword-directive",
    "keyword.function" => "ts-keyword-function",
    "keyword.storage" => "ts-keyword-storage",
    
    // Strings
    "string" => "ts-string",
    "string.regexp" => "ts-string-regexp",
    "string.special" => "ts-string-special",
    "string.special.path" => "ts-string-path",
    "string.special.url" => "ts-string-url",
    "string.special.symbol" => "ts-string-symbol",
    
    // Constants
    "constant" => "ts-constant",
    "constant.builtin" => "ts-constant-builtin",
    "constant.builtin.boolean" => "ts-boolean",
    "constant.character" => "ts-char",
    "constant.character.escape" => "ts-escape",
    "constant.numeric" => "ts-number",
    "constant.numeric.integer" => "ts-integer",
    "constant.numeric.float" => "ts-float",
    
    // Types
    "type" => "ts-type",
    "type.builtin" => "ts-type-builtin",
    "type.enum.variant" => "ts-enum-variant",
    
    // Functions
    "function" => "ts-function",
    "function.builtin" => "ts-function-builtin",
    "function.method" => "ts-method",
    "function.macro" => "ts-macro",
    "function.special" => "ts-function-special",
    
    // Variables
    "variable" => "ts-variable",
    "variable.builtin" => "ts-variable-builtin",
    "variable.parameter" => "ts-parameter",
    "variable.other.member" => "ts-member",
    
    // Punctuation
    "punctuation" => "ts-punctuation",
    "punctuation.delimiter" => "ts-delimiter",
    "punctuation.bracket" => "ts-bracket",
    "punctuation.special" => "ts-punctuation-special",
    
    // Operators
    "operator" => "ts-operator",
    
    // Other
    "property" => "ts-property",
    "constructor" => "ts-constructor",
    "label" => "ts-label",
    "namespace" => "ts-namespace",
    "special" => "ts-special",
    "attribute" => "ts-attribute",
    "tag" => "ts-tag",
    "tag.error" => "ts-tag-error",
    
    // Markup
    "markup.heading" => "ts-heading",
    "markup.heading.1" => "ts-heading-1",
    "markup.heading.2" => "ts-heading-2",
    "markup.heading.3" => "ts-heading-3",
    "markup.heading.4" => "ts-heading-4",
    "markup.heading.5" => "ts-heading-5",
    "markup.heading.6" => "ts-heading-6",
    "markup.list" => "ts-list",
    "markup.bold" => "ts-bold",
    "markup.italic" => "ts-italic",
    "markup.link" => "ts-link",
    "markup.link.url" => "ts-link-url",
    "markup.quote" => "ts-quote",
    "markup.raw" => "ts-raw",
    "markup.raw.block" => "ts-raw-block",
    
    // Diff
    "diff.plus" => "ts-diff-plus",
    "diff.minus" => "ts-diff-minus",
    "diff.delta" => "ts-diff-delta",
};

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_theme_default() {
        let theme = Theme::default();
        assert_eq!(theme, Theme::DarkModern);
    }
    
    #[test]
    fn test_theme_display() {
        assert_eq!(format!("{}", Theme::DarkModern), "dark-modern");
        assert_eq!(format!("{}", Theme::LightModern), "light-modern");
    }
    
    #[test]
    fn test_theme_from_str() {
        assert_eq!("dark-modern".parse::<Theme>(), Ok(Theme::DarkModern));
        assert_eq!("dark".parse::<Theme>(), Ok(Theme::DarkModern));
        assert_eq!("light-modern".parse::<Theme>(), Ok(Theme::LightModern));
        assert_eq!("light".parse::<Theme>(), Ok(Theme::LightModern));
        assert!("unknown".parse::<Theme>().is_err());
    }
    
    #[test]
    fn test_theme_colors() {
        let dark = Theme::DarkModern.colors();
        assert!(dark.color_map.contains_key("keyword"));
        assert!(dark.color_map.contains_key("string"));
        assert!(dark.color_map.contains_key("comment"));
    }
    
    #[test]
    fn test_css_class_mapping() {
        assert_eq!(Theme::DarkModern.css_class("keyword"), Some("ts-keyword"));
        assert_eq!(Theme::DarkModern.css_class("string"), Some("ts-string"));
        assert_eq!(Theme::DarkModern.css_class("comment"), Some("ts-comment"));
        assert_eq!(Theme::DarkModern.css_class("unknown"), None);
    }
    
    #[test]
    fn test_captured_names() {
        let names = Theme::DarkModern.captured_names();
        assert!(!names.is_empty());
        assert!(names.contains(&"keyword".to_string()));
        assert!(names.contains(&"string".to_string()));
    }
    
    #[test]
    fn test_css_variables() {
        let vars = Theme::DarkModern.css_variables();
        assert!(vars.contains("--ts-keyword"));
        assert!(vars.contains("--ts-string"));
        assert!(vars.contains("--ts-comment"));
    }
    
    #[test]
    fn test_css_class_for_index() {
        let theme = Theme::DarkModern;
        // First capture name should map to its CSS class
        let names = theme.captured_names();
        if !names.is_empty() {
            let class = theme.css_class_for_index(0);
            assert!(class.starts_with("ts-"));
        }
    }
    
    #[test]
    fn test_dark_modern_colors() {
        let colors = DARK_MODERN.color_map.get("keyword").unwrap();
        assert!(colors.starts_with('#'));
    }
    
    #[test]
    fn test_light_modern_colors() {
        let colors = LIGHT_MODERN.color_map.get("keyword").unwrap();
        assert!(colors.starts_with('#'));
    }
    
    #[test]
    fn test_css_class_for_out_of_bounds() {
        let theme = Theme::DarkModern;
        // Out of bounds should return default class
        let class = theme.css_class_for_index(1000);
        assert_eq!(class, "ts-default");
    }
    
    #[test]
    fn test_light_theme_css_variables() {
        let vars = Theme::LightModern.css_variables();
        assert!(vars.contains("--ts-keyword"));
        // Light theme keyword should be blue
        assert!(vars.contains("#0000FF"));
    }
    
    #[test]
    fn test_capture_to_css_mapping() {
        // Test common captures
        assert_eq!(CAPTURE_TO_CSS.get("keyword").copied(), Some("ts-keyword"));
        assert_eq!(CAPTURE_TO_CSS.get("string").copied(), Some("ts-string"));
        assert_eq!(CAPTURE_TO_CSS.get("comment").copied(), Some("ts-comment"));
        assert_eq!(CAPTURE_TO_CSS.get("function").copied(), Some("ts-function"));
        assert_eq!(CAPTURE_TO_CSS.get("type").copied(), Some("ts-type"));
        assert_eq!(CAPTURE_TO_CSS.get("variable").copied(), Some("ts-variable"));
        // Number is mapped as constant.numeric
        assert_eq!(CAPTURE_TO_CSS.get("constant.numeric").copied(), Some("ts-number"));
        assert_eq!(CAPTURE_TO_CSS.get("operator").copied(), Some("ts-operator"));
    }

    #[test]
    fn test_theme_from_str_vscode() {
        let theme: Theme = "vscode:One Dark Pro".parse().unwrap();
        assert_eq!(theme, Theme::VSCode("One Dark Pro".to_string()));

        // Empty name should fail
        assert!("vscode:".parse::<Theme>().is_err());

        // Case sensitive name preserved
        let theme: Theme = "vscode:My Theme".parse().unwrap();
        assert_eq!(theme, Theme::VSCode("My Theme".to_string()));
    }

    #[test]
    fn test_theme_display_roundtrip() {
        // Built-in themes
        let dark: Theme = "dark-modern".parse().unwrap();
        assert_eq!(dark.to_string(), "dark-modern");
        let light: Theme = "light-modern".parse().unwrap();
        assert_eq!(light.to_string(), "light-modern");

        // VSCode theme roundtrip
        let original = Theme::VSCode("One Dark Pro".to_string());
        let display = original.to_string();
        assert_eq!(display, "vscode:One Dark Pro");
        let parsed: Theme = display.parse().unwrap();
        assert_eq!(parsed, original);
    }

    #[test]
    fn test_vscode_theme_fallback() {
        // VSCode theme with non-existent name should fall back to DarkModern colors
        let theme = Theme::VSCode("non_existent_theme_xyz".to_string());
        let colors = theme.colors();
        // Should still have valid colors (fallback to DarkModern)
        assert!(colors.color_map.contains_key("keyword"));
    }
}