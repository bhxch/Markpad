//! VSCode Light Modern theme colors.
//!
//! Color values based on VSCode's Light Modern theme.

use super::ThemeColors;
use std::collections::HashMap;

/// Create the color map for Light Modern theme.
fn create_color_map() -> HashMap<String, String> {
    let mut m = HashMap::new();
    
    // Comments
    m.insert("comment".to_string(), "#008000".to_string());
    m.insert("comment.line".to_string(), "#008000".to_string());
    m.insert("comment.block".to_string(), "#008000".to_string());
    m.insert("comment.block.documentation".to_string(), "#008000".to_string());

    // Keywords
    m.insert("keyword".to_string(), "#0000FF".to_string());
    m.insert("keyword.control".to_string(), "#AF00DB".to_string());
    m.insert("keyword.control.conditional".to_string(), "#AF00DB".to_string());
    m.insert("keyword.control.repeat".to_string(), "#AF00DB".to_string());
    m.insert("keyword.control.import".to_string(), "#AF00DB".to_string());
    m.insert("keyword.control.return".to_string(), "#AF00DB".to_string());
    m.insert("keyword.control.exception".to_string(), "#AF00DB".to_string());
    m.insert("keyword.operator".to_string(), "#0000FF".to_string());
    m.insert("keyword.directive".to_string(), "#AF00DB".to_string());
    m.insert("keyword.function".to_string(), "#0000FF".to_string());
    m.insert("keyword.storage".to_string(), "#0000FF".to_string());

    // Strings
    m.insert("string".to_string(), "#A31515".to_string());
    m.insert("string.regexp".to_string(), "#811F3F".to_string());
    m.insert("string.special".to_string(), "#A31515".to_string());
    m.insert("string.special.path".to_string(), "#A31515".to_string());
    m.insert("string.special.url".to_string(), "#A31515".to_string());
    m.insert("string.special.symbol".to_string(), "#A31515".to_string());

    // Constants
    m.insert("constant".to_string(), "#0070C1".to_string());
    m.insert("constant.builtin".to_string(), "#0000FF".to_string());
    m.insert("constant.builtin.boolean".to_string(), "#0000FF".to_string());
    m.insert("constant.character".to_string(), "#A31515".to_string());
    m.insert("constant.character.escape".to_string(), "#EE0000".to_string());
    m.insert("constant.numeric".to_string(), "#098658".to_string());
    m.insert("constant.numeric.integer".to_string(), "#098658".to_string());
    m.insert("constant.numeric.float".to_string(), "#098658".to_string());

    // Types
    m.insert("type".to_string(), "#267F99".to_string());
    m.insert("type.builtin".to_string(), "#267F99".to_string());
    m.insert("type.enum.variant".to_string(), "#267F99".to_string());

    // Functions
    m.insert("function".to_string(), "#795E26".to_string());
    m.insert("function.builtin".to_string(), "#795E26".to_string());
    m.insert("function.method".to_string(), "#795E26".to_string());
    m.insert("function.macro".to_string(), "#795E26".to_string());
    m.insert("function.special".to_string(), "#795E26".to_string());

    // Variables
    m.insert("variable".to_string(), "#001080".to_string());
    m.insert("variable.builtin".to_string(), "#0000FF".to_string());
    m.insert("variable.parameter".to_string(), "#001080".to_string());
    m.insert("variable.other.member".to_string(), "#001080".to_string());

    // Punctuation
    m.insert("punctuation".to_string(), "#000000".to_string());
    m.insert("punctuation.delimiter".to_string(), "#000000".to_string());
    m.insert("punctuation.bracket".to_string(), "#000000".to_string());
    m.insert("punctuation.special".to_string(), "#000000".to_string());

    // Operators
    m.insert("operator".to_string(), "#000000".to_string());

    // Other
    m.insert("property".to_string(), "#001080".to_string());
    m.insert("constructor".to_string(), "#267F99".to_string());
    m.insert("label".to_string(), "#000000".to_string());
    m.insert("namespace".to_string(), "#267F99".to_string());
    m.insert("special".to_string(), "#AF00DB".to_string());
    m.insert("attribute".to_string(), "#FF0000".to_string());
    m.insert("tag".to_string(), "#800000".to_string());
    m.insert("tag.error".to_string(), "#F44747".to_string());

    // Markup
    m.insert("markup.heading".to_string(), "#0000FF".to_string());
    m.insert("markup.heading.1".to_string(), "#0000FF".to_string());
    m.insert("markup.heading.2".to_string(), "#008000".to_string());
    m.insert("markup.heading.3".to_string(), "#A31515".to_string());
    m.insert("markup.heading.4".to_string(), "#267F99".to_string());
    m.insert("markup.heading.5".to_string(), "#795E26".to_string());
    m.insert("markup.heading.6".to_string(), "#AF00DB".to_string());
    m.insert("markup.list".to_string(), "#008000".to_string());
    m.insert("markup.bold".to_string(), "#0000FF".to_string());
    m.insert("markup.italic".to_string(), "#AF00DB".to_string());
    m.insert("markup.link".to_string(), "#001080".to_string());
    m.insert("markup.link.url".to_string(), "#A31515".to_string());
    m.insert("markup.quote".to_string(), "#008000".to_string());
    m.insert("markup.raw".to_string(), "#A31515".to_string());
    m.insert("markup.raw.block".to_string(), "#A31515".to_string());

    // Diff
    m.insert("diff.plus".to_string(), "#098658".to_string());
    m.insert("diff.minus".to_string(), "#A31515".to_string());
    m.insert("diff.delta".to_string(), "#795E26".to_string());
    
    m
}

/// VSCode Light Modern theme colors.
pub fn light_modern_colors() -> ThemeColors {
    ThemeColors {
        background: "#FFFFFF".to_string(),
        foreground: "#000000".to_string(),
        color_map: create_color_map(),
    }
}

// Lazy-static Light Modern theme.
lazy_static::lazy_static! {
    pub static ref LIGHT_MODERN: ThemeColors = light_modern_colors();
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_light_modern_background() {
        assert_eq!(LIGHT_MODERN.background, "#FFFFFF");
    }

    #[test]
    fn test_light_modern_foreground() {
        assert_eq!(LIGHT_MODERN.foreground, "#000000");
    }

    #[test]
    fn test_light_modern_keyword_color() {
        let color = LIGHT_MODERN.color_map.get("keyword").unwrap();
        assert_eq!(color, "#0000FF");
    }

    #[test]
    fn test_light_modern_string_color() {
        let color = LIGHT_MODERN.color_map.get("string").unwrap();
        assert_eq!(color, "#A31515");
    }

    #[test]
    fn test_light_modern_comment_color() {
        let color = LIGHT_MODERN.color_map.get("comment").unwrap();
        assert_eq!(color, "#008000");
    }

    #[test]
    fn test_light_modern_function_color() {
        let color = LIGHT_MODERN.color_map.get("function").unwrap();
        assert_eq!(color, "#795E26");
    }

    #[test]
    fn test_light_modern_type_color() {
        let color = LIGHT_MODERN.color_map.get("type").unwrap();
        assert_eq!(color, "#267F99");
    }
}