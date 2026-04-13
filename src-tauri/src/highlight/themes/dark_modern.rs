//! VSCode Dark Modern theme colors.
//!
//! Color values based on VSCode's Dark Modern theme.

use super::ThemeColors;
use std::collections::HashMap;

/// Create the color map for Dark Modern theme.
fn create_color_map() -> HashMap<String, String> {
    let mut m = HashMap::new();
    
    // Comments
    m.insert("comment".to_string(), "#6A9955".to_string());
    m.insert("comment.line".to_string(), "#6A9955".to_string());
    m.insert("comment.block".to_string(), "#6A9955".to_string());
    m.insert("comment.block.documentation".to_string(), "#6A9955".to_string());

    // Keywords
    m.insert("keyword".to_string(), "#569CD6".to_string());
    m.insert("keyword.control".to_string(), "#C586C0".to_string());
    m.insert("keyword.control.conditional".to_string(), "#C586C0".to_string());
    m.insert("keyword.control.repeat".to_string(), "#C586C0".to_string());
    m.insert("keyword.control.import".to_string(), "#C586C0".to_string());
    m.insert("keyword.control.return".to_string(), "#C586C0".to_string());
    m.insert("keyword.control.exception".to_string(), "#C586C0".to_string());
    m.insert("keyword.operator".to_string(), "#569CD6".to_string());
    m.insert("keyword.directive".to_string(), "#C586C0".to_string());
    m.insert("keyword.function".to_string(), "#569CD6".to_string());
    m.insert("keyword.storage".to_string(), "#569CD6".to_string());

    // Strings
    m.insert("string".to_string(), "#CE9178".to_string());
    m.insert("string.regexp".to_string(), "#D16969".to_string());
    m.insert("string.special".to_string(), "#CE9178".to_string());
    m.insert("string.special.path".to_string(), "#CE9178".to_string());
    m.insert("string.special.url".to_string(), "#CE9178".to_string());
    m.insert("string.special.symbol".to_string(), "#CE9178".to_string());

    // Constants
    m.insert("constant".to_string(), "#4FC1FF".to_string());
    m.insert("constant.builtin".to_string(), "#569CD6".to_string());
    m.insert("constant.builtin.boolean".to_string(), "#569CD6".to_string());
    m.insert("constant.character".to_string(), "#CE9178".to_string());
    m.insert("constant.character.escape".to_string(), "#D7A635".to_string());
    m.insert("constant.numeric".to_string(), "#B5CEA8".to_string());
    m.insert("constant.numeric.integer".to_string(), "#B5CEA8".to_string());
    m.insert("constant.numeric.float".to_string(), "#B5CEA8".to_string());

    // Types
    m.insert("type".to_string(), "#4EC9B0".to_string());
    m.insert("type.builtin".to_string(), "#4EC9B0".to_string());
    m.insert("type.enum.variant".to_string(), "#4EC9B0".to_string());

    // Functions
    m.insert("function".to_string(), "#DCDCAA".to_string());
    m.insert("function.builtin".to_string(), "#DCDCAA".to_string());
    m.insert("function.method".to_string(), "#DCDCAA".to_string());
    m.insert("function.macro".to_string(), "#DCDCAA".to_string());
    m.insert("function.special".to_string(), "#DCDCAA".to_string());

    // Variables
    m.insert("variable".to_string(), "#9CDCFE".to_string());
    m.insert("variable.builtin".to_string(), "#569CD6".to_string());
    m.insert("variable.parameter".to_string(), "#9CDCFE".to_string());
    m.insert("variable.other.member".to_string(), "#9CDCFE".to_string());

    // Punctuation
    m.insert("punctuation".to_string(), "#D4D4D4".to_string());
    m.insert("punctuation.delimiter".to_string(), "#D4D4D4".to_string());
    m.insert("punctuation.bracket".to_string(), "#FFD700".to_string());
    m.insert("punctuation.special".to_string(), "#D4D4D4".to_string());

    // Operators
    m.insert("operator".to_string(), "#D4D4D4".to_string());

    // Other
    m.insert("property".to_string(), "#9CDCFE".to_string());
    m.insert("constructor".to_string(), "#4EC9B0".to_string());
    m.insert("label".to_string(), "#C8C8C8".to_string());
    m.insert("namespace".to_string(), "#4EC9B0".to_string());
    m.insert("special".to_string(), "#C586C0".to_string());
    m.insert("attribute".to_string(), "#9CDCFE".to_string());
    m.insert("tag".to_string(), "#569CD6".to_string());
    m.insert("tag.error".to_string(), "#F44747".to_string());

    // Markup
    m.insert("markup.heading".to_string(), "#569CD6".to_string());
    m.insert("markup.heading.1".to_string(), "#569CD6".to_string());
    m.insert("markup.heading.2".to_string(), "#6A9955".to_string());
    m.insert("markup.heading.3".to_string(), "#CE9178".to_string());
    m.insert("markup.heading.4".to_string(), "#4EC9B0".to_string());
    m.insert("markup.heading.5".to_string(), "#DCDCAA".to_string());
    m.insert("markup.heading.6".to_string(), "#C586C0".to_string());
    m.insert("markup.list".to_string(), "#6A9955".to_string());
    m.insert("markup.bold".to_string(), "#569CD6".to_string());
    m.insert("markup.italic".to_string(), "#C586C0".to_string());
    m.insert("markup.link".to_string(), "#9CDCFE".to_string());
    m.insert("markup.link.url".to_string(), "#CE9178".to_string());
    m.insert("markup.quote".to_string(), "#6A9955".to_string());
    m.insert("markup.raw".to_string(), "#CE9178".to_string());
    m.insert("markup.raw.block".to_string(), "#CE9178".to_string());

    // Diff
    m.insert("diff.plus".to_string(), "#89D185".to_string());
    m.insert("diff.minus".to_string(), "#F14C4C".to_string());
    m.insert("diff.delta".to_string(), "#E2C08D".to_string());
    
    m
}

/// VSCode Dark Modern theme colors.
pub fn dark_modern_colors() -> ThemeColors {
    ThemeColors {
        background: "#1E1E1E".to_string(),
        foreground: "#D4D4D4".to_string(),
        color_map: create_color_map(),
    }
}

// Lazy-static Dark Modern theme.
lazy_static::lazy_static! {
    pub static ref DARK_MODERN: ThemeColors = dark_modern_colors();
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_dark_modern_background() {
        assert_eq!(DARK_MODERN.background, "#1E1E1E");
    }

    #[test]
    fn test_dark_modern_foreground() {
        assert_eq!(DARK_MODERN.foreground, "#D4D4D4");
    }

    #[test]
    fn test_dark_modern_keyword_color() {
        let color = DARK_MODERN.color_map.get("keyword").unwrap();
        assert_eq!(color, "#569CD6");
    }

    #[test]
    fn test_dark_modern_string_color() {
        let color = DARK_MODERN.color_map.get("string").unwrap();
        assert_eq!(color, "#CE9178");
    }

    #[test]
    fn test_dark_modern_comment_color() {
        let color = DARK_MODERN.color_map.get("comment").unwrap();
        assert_eq!(color, "#6A9955");
    }

    #[test]
    fn test_dark_modern_function_color() {
        let color = DARK_MODERN.color_map.get("function").unwrap();
        assert_eq!(color, "#DCDCAA");
    }

    #[test]
    fn test_dark_modern_type_color() {
        let color = DARK_MODERN.color_map.get("type").unwrap();
        assert_eq!(color, "#4EC9B0");
    }
}
