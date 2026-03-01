//! VSCode Light Modern theme colors.
//!
//! Color values based on VSCode's Light Modern theme.

use super::ThemeColors;
use std::collections::HashMap;

/// Create the color map for Light Modern theme.
fn create_color_map() -> HashMap<String, &'static str> {
    let mut m = HashMap::new();
    
    // Comments
    m.insert("comment".to_string(), "#008000");
    m.insert("comment.line".to_string(), "#008000");
    m.insert("comment.block".to_string(), "#008000");
    m.insert("comment.block.documentation".to_string(), "#008000");
    
    // Keywords
    m.insert("keyword".to_string(), "#0000FF");
    m.insert("keyword.control".to_string(), "#AF00DB");
    m.insert("keyword.control.conditional".to_string(), "#AF00DB");
    m.insert("keyword.control.repeat".to_string(), "#AF00DB");
    m.insert("keyword.control.import".to_string(), "#AF00DB");
    m.insert("keyword.control.return".to_string(), "#AF00DB");
    m.insert("keyword.control.exception".to_string(), "#AF00DB");
    m.insert("keyword.operator".to_string(), "#0000FF");
    m.insert("keyword.directive".to_string(), "#AF00DB");
    m.insert("keyword.function".to_string(), "#0000FF");
    m.insert("keyword.storage".to_string(), "#0000FF");
    
    // Strings
    m.insert("string".to_string(), "#A31515");
    m.insert("string.regexp".to_string(), "#811F3F");
    m.insert("string.special".to_string(), "#A31515");
    m.insert("string.special.path".to_string(), "#A31515");
    m.insert("string.special.url".to_string(), "#A31515");
    m.insert("string.special.symbol".to_string(), "#A31515");
    
    // Constants
    m.insert("constant".to_string(), "#0070C1");
    m.insert("constant.builtin".to_string(), "#0000FF");
    m.insert("constant.builtin.boolean".to_string(), "#0000FF");
    m.insert("constant.character".to_string(), "#A31515");
    m.insert("constant.character.escape".to_string(), "#EE0000");
    m.insert("constant.numeric".to_string(), "#098658");
    m.insert("constant.numeric.integer".to_string(), "#098658");
    m.insert("constant.numeric.float".to_string(), "#098658");
    
    // Types
    m.insert("type".to_string(), "#267F99");
    m.insert("type.builtin".to_string(), "#267F99");
    m.insert("type.enum.variant".to_string(), "#267F99");
    
    // Functions
    m.insert("function".to_string(), "#795E26");
    m.insert("function.builtin".to_string(), "#795E26");
    m.insert("function.method".to_string(), "#795E26");
    m.insert("function.macro".to_string(), "#795E26");
    m.insert("function.special".to_string(), "#795E26");
    
    // Variables
    m.insert("variable".to_string(), "#001080");
    m.insert("variable.builtin".to_string(), "#0000FF");
    m.insert("variable.parameter".to_string(), "#001080");
    m.insert("variable.other.member".to_string(), "#001080");
    
    // Punctuation
    m.insert("punctuation".to_string(), "#000000");
    m.insert("punctuation.delimiter".to_string(), "#000000");
    m.insert("punctuation.bracket".to_string(), "#000000");
    m.insert("punctuation.special".to_string(), "#000000");
    
    // Operators
    m.insert("operator".to_string(), "#000000");
    
    // Other
    m.insert("property".to_string(), "#001080");
    m.insert("constructor".to_string(), "#267F99");
    m.insert("label".to_string(), "#000000");
    m.insert("namespace".to_string(), "#267F99");
    m.insert("special".to_string(), "#AF00DB");
    m.insert("attribute".to_string(), "#FF0000");
    m.insert("tag".to_string(), "#800000");
    m.insert("tag.error".to_string(), "#F44747");
    
    // Markup
    m.insert("markup.heading".to_string(), "#0000FF");
    m.insert("markup.heading.1".to_string(), "#0000FF");
    m.insert("markup.heading.2".to_string(), "#008000");
    m.insert("markup.heading.3".to_string(), "#A31515");
    m.insert("markup.heading.4".to_string(), "#267F99");
    m.insert("markup.heading.5".to_string(), "#795E26");
    m.insert("markup.heading.6".to_string(), "#AF00DB");
    m.insert("markup.list".to_string(), "#008000");
    m.insert("markup.bold".to_string(), "#0000FF");
    m.insert("markup.italic".to_string(), "#AF00DB");
    m.insert("markup.link".to_string(), "#001080");
    m.insert("markup.link.url".to_string(), "#A31515");
    m.insert("markup.quote".to_string(), "#008000");
    m.insert("markup.raw".to_string(), "#A31515");
    m.insert("markup.raw.block".to_string(), "#A31515");
    
    // Diff
    m.insert("diff.plus".to_string(), "#098658");
    m.insert("diff.minus".to_string(), "#A31515");
    m.insert("diff.delta".to_string(), "#795E26");
    
    m
}

/// VSCode Light Modern theme colors.
pub fn light_modern_colors() -> ThemeColors {
    ThemeColors {
        background: "#FFFFFF",
        foreground: "#000000",
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
        let color = LIGHT_MODERN.color_map.get("keyword");
        assert_eq!(color, Some(&"#0000FF"));
    }
    
    #[test]
    fn test_light_modern_string_color() {
        let color = LIGHT_MODERN.color_map.get("string");
        assert_eq!(color, Some(&"#A31515"));
    }
    
    #[test]
    fn test_light_modern_comment_color() {
        let color = LIGHT_MODERN.color_map.get("comment");
        assert_eq!(color, Some(&"#008000"));
    }
    
    #[test]
    fn test_light_modern_function_color() {
        let color = LIGHT_MODERN.color_map.get("function");
        assert_eq!(color, Some(&"#795E26"));
    }
    
    #[test]
    fn test_light_modern_type_color() {
        let color = LIGHT_MODERN.color_map.get("type");
        assert_eq!(color, Some(&"#267F99"));
    }
}