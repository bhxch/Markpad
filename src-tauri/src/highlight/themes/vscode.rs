//! VSCode theme support.
//!
//! Parses VSCode theme JSON and maps TextMate scopes to tree-sitter captures.

use super::ThemeColors;
use std::collections::HashMap;

/// Reverse mapping from TextMate scope prefixes to tree-sitter capture names.
/// VSCode themes use TextMate scopes; we need to convert them to our capture system.
pub static TEXTMATE_TO_CAPTURE: phf::Map<&'static str, &'static str> = phf::phf_map! {
    // Keywords
    "keyword" => "keyword",
    "keyword.control" => "keyword.control",
    "keyword.control.conditional" => "keyword.control.conditional",
    "keyword.control.repeat" => "keyword.control.repeat",
    "keyword.control.import" => "keyword.control.import",
    "keyword.control.return" => "keyword.control.return",
    "keyword.control.exception" => "keyword.control.exception",
    "keyword.operator" => "keyword.operator",
    "keyword.other" => "keyword",
    "keyword.directive" => "keyword.directive",

    // Strings
    "string" => "string",
    "string.quoted" => "string",
    "string.quoted.single" => "string",
    "string.quoted.double" => "string",
    "string.quoted.triple" => "string",
    "string.unquoted" => "string",
    "string.regexp" => "string.regexp",
    "string.interpolated" => "string.special",
    "string.other" => "string.special",

    // Comments
    "comment" => "comment",
    "comment.line" => "comment.line",
    "comment.line.double-slash" => "comment.line",
    "comment.line.double-dash" => "comment.line",
    "comment.line.number-sign" => "comment.line",
    "comment.block" => "comment.block",
    "comment.block.documentation" => "comment.block.documentation",

    // Functions
    "entity.name.function" => "function",
    "entity.name.function.method" => "function.method",
    "entity.name.function.constructor" => "constructor",
    "entity.name.function.macro" => "function.macro",
    "support.function" => "function.builtin",
    "meta.function-call" => "function",
    "meta.function" => "function",

    // Types
    "entity.name.type" => "type",
    "entity.name.class" => "type",
    "entity.name.struct" => "type",
    "entity.name.enum" => "type",
    "entity.name.interface" => "type",
    "support.type" => "type.builtin",
    "support.class" => "type.builtin",
    "entity.name.type.alias" => "type",
    "entity.name.type.enum.variant" => "type.enum.variant",

    // Variables
    "variable" => "variable",
    "variable.other" => "variable",
    "variable.other.readwrite" => "variable",
    "variable.other.member" => "variable.other.member",
    "variable.parameter" => "variable.parameter",
    "variable.function" => "function",
    "variable.language" => "variable.builtin",
    "support.variable" => "variable.builtin",

    // Constants
    "constant" => "constant",
    "constant.numeric" => "constant.numeric",
    "constant.numeric.integer" => "constant.numeric.integer",
    "constant.numeric.float" => "constant.numeric.float",
    "constant.language" => "constant.builtin",
    "constant.language.boolean" => "constant.builtin.boolean",
    "constant.character" => "constant.character",
    "constant.character.escape" => "constant.character.escape",
    "constant.other" => "constant",

    // Operators
    "keyword.operator.arithmetic" => "operator",
    "keyword.operator.assignment" => "operator",
    "keyword.operator.comparison" => "operator",
    "keyword.operator.logical" => "operator",
    "keyword.operator.bitwise" => "operator",
    "keyword.operator.type" => "operator",
    "keyword.operator.word" => "operator",

    // Punctuation
    "punctuation" => "punctuation",
    "punctuation.separator" => "punctuation.delimiter",
    "punctuation.terminator" => "punctuation.delimiter",
    "punctuation.section" => "punctuation.bracket",
    "punctuation.section.brackets" => "punctuation.bracket",
    "punctuation.section.parens" => "punctuation.bracket",
    "punctuation.section.braces" => "punctuation.bracket",
    "punctuation.definition" => "punctuation",

    // Properties
    "variable.other.property" => "property",
    "entity.name.label" => "label",
    "entity.name.namespace" => "namespace",
    "meta.attribute" => "attribute",

    // Markup
    "markup.heading" => "markup.heading",
    "markup.list" => "markup.list",
    "markup.bold" => "markup.bold",
    "markup.italic" => "markup.italic",
    "markup.link" => "markup.link",
    "markup.quote" => "markup.quote",
    "markup.raw" => "markup.raw",

    // Tags
    "entity.name.tag" => "tag",
    "meta.tag" => "tag",

    // Diff
    "markup.inserted" => "diff.plus",
    "markup.deleted" => "diff.minus",
    "markup.changed" => "diff.delta",
};

/// Parse VSCode theme JSON and extract colors mapped to tree-sitter captures.
pub fn parse_vscode_theme_colors(theme_json: &str) -> HashMap<String, String> {
    let mut color_map: HashMap<String, String> = HashMap::new();

    // Parse the JSON
    let theme: serde_json::Value = match serde_json::from_str(theme_json) {
        Ok(v) => v,
        Err(_) => return color_map,
    };

    // Extract tokenColors array
    let token_colors = match theme.get("tokenColors") {
        Some(serde_json::Value::Array(arr)) => arr,
        _ => return color_map,
    };

    // Process each token color rule
    for token_color in token_colors {
        // Get the foreground color from settings
        let foreground = token_color
            .get("settings")
            .and_then(|s| s.get("foreground"))
            .and_then(|f| f.as_str())
            .unwrap_or("");

        if foreground.is_empty() {
            continue;
        }

        let foreground = foreground.to_string();

        // Get scopes (can be string or array)
        let scopes: Vec<String> = if let Some(scope) = token_color.get("scope") {
            match scope {
                serde_json::Value::String(s) => vec![s.clone()],
                serde_json::Value::Array(arr) => arr
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect(),
                _ => continue,
            }
        } else {
            continue;
        };

        // Map each scope to a capture name
        for scope in scopes {
            if let Some(&capture) = TEXTMATE_TO_CAPTURE.get(scope.as_str()) {
                color_map.insert(capture.to_string(), foreground.clone());
            } else {
                // Try matching by prefix - find the longest matching prefix
                let mut best_match: Option<(&str, &str)> = None;
                let mut best_len = 0;
                for (tm_scope, capture) in TEXTMATE_TO_CAPTURE.entries() {
                    if scope.starts_with(tm_scope) && tm_scope.len() > best_len {
                        best_match = Some((*tm_scope, *capture));
                        best_len = tm_scope.len();
                    }
                }
                if let Some((_matched_scope, capture)) = best_match {
                    // Only use prefix match if not already set by a more specific rule
                    if !color_map.contains_key(capture) {
                        color_map.insert(capture.to_string(), foreground.clone());
                    }
                }
            }
        }
    }

    color_map
}

/// Build a ThemeColors from a parsed VSCode theme JSON string.
pub fn build_vscode_theme_colors(theme_json: &str) -> ThemeColors {
    let dynamic_map = parse_vscode_theme_colors(theme_json);

    // Try to extract background/foreground from theme
    let theme: serde_json::Value = serde_json::from_str(theme_json).unwrap_or_default();
    let bg = theme
        .get("colors")
        .and_then(|c| c.get("editor.background"))
        .and_then(|v| v.as_str())
        .unwrap_or("#1e1e1e");
    let fg = theme
        .get("colors")
        .and_then(|c| c.get("editor.foreground"))
        .and_then(|v| v.as_str())
        .unwrap_or("#d4d4d4");

    ThemeColors {
        color_map: dynamic_map,
        background: bg.to_string(),
        foreground: fg.to_string(),
    }
}

/// Look up the TextMate scope for a given capture name.
/// Returns the first matching TextMate scope.
pub fn capture_to_textmate(capture: &str) -> Option<&'static str> {
    for (tm_scope, cap) in TEXTMATE_TO_CAPTURE.entries() {
        if *cap == capture {
            return Some(*tm_scope);
        }
    }
    None
}

/// Look up the capture name for a given TextMate scope.
pub fn textmate_to_capture(scope: &str) -> Option<&'static str> {
    TEXTMATE_TO_CAPTURE.get(scope).copied()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_capture_to_textmate_coverage() {
        let required_captures = [
            "keyword",
            "keyword.control",
            "keyword.control.import",
            "string",
            "string.regexp",
            "comment",
            "comment.line",
            "comment.block",
            "function",
            "function.method",
            "function.macro",
            "type",
            "type.builtin",
            "variable",
            "variable.parameter",
            "variable.builtin",
            "constant.numeric",
            "constant.builtin",
            "operator",
            "punctuation.bracket",
            "punctuation.delimiter",
            "label",
        ];

        for capture in &required_captures {
            let scope = capture_to_textmate(capture);
            assert!(
                scope.is_some(),
                "Missing TextMate scope mapping for capture: {}",
                capture
            );
        }
    }

    #[test]
    fn test_parse_minimal_vscode_theme() {
        let theme_json = r##"{
            "name": "Test Theme",
            "colors": {},
            "tokenColors": [
                {
                    "scope": ["keyword", "keyword.control"],
                    "settings": { "foreground": "#569CD6" }
                },
                {
                    "scope": "string",
                    "settings": { "foreground": "#CE9178" }
                }
            ]
        }"##;

        let colors = parse_vscode_theme_colors(theme_json);
        assert!(
            colors.contains_key("keyword"),
            "should map keyword scope to capture"
        );
        assert!(
            colors.contains_key("string"),
            "should map string scope to capture"
        );
        assert_eq!(colors.get("keyword").unwrap(), "#569CD6");
        assert_eq!(colors.get("string").unwrap(), "#CE9178");
    }

    #[test]
    fn test_reverse_mapping_textmate_to_capture() {
        let result = textmate_to_capture("entity.name.function");
        assert!(
            result.is_some(),
            "entity.name.function should map to a capture"
        );
        let capture = result.unwrap();
        assert!(
            capture == "function" || capture == "function.method",
            "entity.name.function should map to function or function.method, got: {}",
            capture
        );
    }
}
