//! 本地（非上游）Tauri 命令与预处理资产。
//!
//! P2 阶段自 lib.rs 原样撤出（纯搬移，不改行为），合并时整块迁入上游命令模块
//! （spec §6.7/§8.2，由后续任务在上游 app.rs 注册）。
//!
//! - 高亮命令：仅依赖 highlight 模块的公开 API（`TreeSitterHighlighter`/`Theme`），
//!   不依赖其内部私有项，故按 brief 默认归属本模块而非 `highlight/commands.rs`。
//! - 图表渲染：graphviz/svgbob 纯 Rust 渲染命令。
//! - `markdown_ext`：本地 Markdown 预处理资产（LaTeX 分隔符转换），保留待合并后按 D8 决定去留。

use std::sync::{Mutex, OnceLock};

// layout-rs for GraphViz DOT rendering
use layout::backends::svg::SVGWriter;
use layout::gv::{DotParser, GraphBuilder};

use crate::highlight::{Theme, TreeSitterHighlighter};

/// Global highlighter instance
static HIGHLIGHTER: OnceLock<Mutex<TreeSitterHighlighter>> = OnceLock::new();

fn get_highlighter() -> &'static Mutex<TreeSitterHighlighter> {
    HIGHLIGHTER.get_or_init(|| Mutex::new(TreeSitterHighlighter::new()))
}

/// Highlight code using tree-sitter.
///
/// Returns HTML with CSS classes for syntax highlighting.
/// If the language is not supported, returns an error and the frontend should fall back to hljs.
#[tauri::command]
pub fn highlight_code(code: String, language: String, theme: String) -> Result<String, String> {
    let parsed_theme: Theme = theme.parse()
        .unwrap_or(Theme::DarkModern);

    let highlighter = get_highlighter();
    let mut highlighter = highlighter.lock().map_err(|e| e.to_string())?;

    // Update theme if needed
    if *highlighter.theme() != parsed_theme {
        highlighter.set_theme(parsed_theme);
    }

    highlighter.highlight(&code, &language)
        .map_err(|e| e.to_string())
}

/// Check if a language is supported by tree-sitter.
#[tauri::command]
pub fn is_language_supported(language: String) -> bool {
    let highlighter = get_highlighter();
    if let Ok(h) = highlighter.lock() {
        h.is_language_supported(&language)
    } else {
        false
    }
}

/// Get list of supported languages.
#[tauri::command]
pub fn get_supported_languages() -> Vec<String> {
    let highlighter = get_highlighter();
    if let Ok(h) = highlighter.lock() {
        h.supported_languages().iter().map(|s| s.to_string()).collect()
    } else {
        Vec::new()
    }
}

/// Render GraphViz DOT diagram using pure Rust (layout-rs).
///
/// Returns SVG string on success, error message on failure.
#[tauri::command]
pub fn render_graphviz_rust(code: String) -> Result<String, String> {
	// Parse DOT code into AST
	let mut parser = DotParser::new(&code);
	let graph = parser.process().map_err(|e| format!("DOT parse error: {}", e))?;

	// Build VisualGraph from AST
	let mut builder = GraphBuilder::new();
	builder.visit_graph(&graph);
	let mut visual_graph = builder.get();

	// Render to SVG
	let mut svg_writer = SVGWriter::new();
	visual_graph.do_it(false, false, false, &mut svg_writer);

	Ok(svg_writer.finalize())
}

/// Render Svgbob ASCII diagram using pure Rust (svgbob).
///
/// Returns SVG string on success, error message on failure.
#[tauri::command]
pub fn render_svgbob_rust(code: String) -> Result<String, String> {
	let svg = svgbob::to_svg(&code);
	Ok(svg)
}

/// 本地 Markdown 预处理资产（保留资产；合并后按 D8 决定去留，本模块不改行为）。
pub mod markdown_ext {
    /// Convert LaTeX delimiters \[...\] to $$...$$ and \(...\) to $...$
    /// This is needed because comrak only supports $...$$ and $...$ natively
    /// Skips content inside code blocks (`...` and ```...```)
	// 接线点（Task 14，D8 落地）：上游注册入口 render_markdown（commands.rs）在进入
	// convert_markdown 前调用本函数，把用户输入的 \[…\]/\(…\) 统一成上游 math 词汇 $/$$。
    pub fn process_latex_delimiters(content: &str) -> String {
        let mut result = String::new();
        let chars: Vec<char> = content.chars().collect();
        let mut i = 0;

        // State tracking
        let mut in_inline_code = false;      // `...`
        let mut in_code_block = false;       // ```...```
        let mut in_display_math = false;     // \[...\]
        let mut in_inline_math = false;      // \(...\)
        let mut math_content = String::new();

        while i < chars.len() {
            let c = chars[i];

            // Check for backtick-related patterns first
            if c == '`' {
                // Always check for ``` first (higher priority than single `)
                if i + 2 < chars.len() && chars[i + 1] == '`' && chars[i + 2] == '`' {
                    // Found ```
                    if !in_inline_code {
                        // Only toggle code block if not inside inline code
                        in_code_block = !in_code_block;
                    }
                    result.push_str("```");
                    i += 3;
                    continue;
                }

                // Single backtick - only process if not in code block
                if !in_code_block && !in_display_math && !in_inline_math {
                    in_inline_code = !in_inline_code;
                }
                result.push(c);
                i += 1;
                continue;
            }

            // If inside code (inline or block), just pass through
            if in_inline_code || in_code_block {
                result.push(c);
                i += 1;
                continue;
            }

            // Now process LaTeX delimiters
            if !in_display_math && !in_inline_math {
                // Check for \[ (display math start)
                if c == '\\' && i + 1 < chars.len() && chars[i + 1] == '[' {
                    in_display_math = true;
                    math_content.clear();
                    result.push_str("$$");
                    i += 2;
                    continue;
                }
                // Check for \( (inline math start)
                if c == '\\' && i + 1 < chars.len() && chars[i + 1] == '(' {
                    in_inline_math = true;
                    math_content.clear();
                    result.push('$');
                    i += 2;
                    continue;
                }
                result.push(c);
                i += 1;
            } else if in_display_math {
                // Inside display math, look for \]
                if c == '\\' && i + 1 < chars.len() && chars[i + 1] == ']' {
                    in_display_math = false;
                    result.push_str(&math_content);
                    result.push_str("$$");
                    math_content.clear();
                    i += 2;
                } else {
                    math_content.push(c);
                    i += 1;
                }
            } else if in_inline_math {
                // Inside inline math, look for \)
                if c == '\\' && i + 1 < chars.len() && chars[i + 1] == ')' {
                    in_inline_math = false;
                    result.push_str(&math_content);
                    result.push('$');
                    math_content.clear();
                    i += 2;
                } else {
                    math_content.push(c);
                    i += 1;
                }
            }
        }

        // Handle unclosed math
        if in_display_math {
            result.push_str(&math_content);
        }
        if in_inline_math {
            result.push_str(&math_content);
        }

        result
    }
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_graphviz_rust_render() {
		let dot_code = r#"
digraph G {
	rankdir=LR;
	node [shape=box, style=filled, color=lightblue];
	A -> B;
	B -> C;
}
"#;
		let result = render_graphviz_rust(dot_code.to_string());
		assert!(result.is_ok(), "GraphViz Rust rendering failed: {:?}", result.err());
		let svg = result.unwrap();
		assert!(svg.contains("<svg"), "Result should contain SVG element");
		println!("Generated SVG length: {} bytes", svg.len());
	}

	#[test]
	fn test_svgbob_rust_render() {
		let code = r#"
  +---+
  | A |
  +---+
    |
    v
  +---+
  | B |
  +---+
"#;
		let result = render_svgbob_rust(code.to_string());
		assert!(result.is_ok(), "Svgbob Rust rendering failed: {:?}", result.err());
		let svg = result.unwrap();
		assert!(svg.contains("<svg"), "Result should contain SVG element");
		println!("Generated SVG length: {} bytes", svg.len());
	}

	// Task 14 接线回归：process_latex_delimiters 现挂在 render_markdown 入口，
	// 这里按函数实际行为钉住定界符转换契约。
	#[test]
	fn latex_delimiters_convert_to_dollar_vocabulary() {
		use markdown_ext::process_latex_delimiters;

		// display：\[x\] → $$x$$
		assert_eq!(process_latex_delimiters(r"\[x\]"), "$$x$$");
		// inline：\(x\) → $x$
		assert_eq!(process_latex_delimiters(r"\(x\)"), "$x$");
		// 多行 display 内容逐字保留（换行在 math_content 中透传）
		assert_eq!(process_latex_delimiters("\\[\nfoo\n\\]"), "$$\nfoo\n$$");
		// 行内代码 / 围栏代码块内不转换
		assert_eq!(process_latex_delimiters("`\\(x\\)`"), "`\\(x\\)`");
		assert_eq!(process_latex_delimiters("```\n\\(x\\)\n```"), "```\n\\(x\\)\n```");
		// 未闭合的 display 只补开定界符（原实现语义）
		assert_eq!(process_latex_delimiters("\\[x"), "$$x");
		// 未闭合的 inline 同样保留内容
		assert_eq!(process_latex_delimiters("\\(x"), "$x");
	}

	// convert_markdown 的 sourcepos 行号契约要求：预处理不得增删换行。
	#[test]
	fn latex_delimiters_preserve_line_count() {
		use markdown_ext::process_latex_delimiters;

		let doc = "para one\n\n\\[\ne^x\n\\]\n\ninline \\(y\\) here\n\n- [ ] task\n\n```\n\\(z\\)\n```\n";
		let out = process_latex_delimiters(doc);
		assert_eq!(out.lines().count(), doc.lines().count());
		assert_eq!(out.matches('\n').count(), doc.matches('\n').count());
	}
}
