use comrak::{markdown_to_html, ComrakOptions};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use regex::{Captures, Regex};
use std::borrow::Cow;
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use serde::Serialize;
use std::sync::OnceLock;

// layout-rs for GraphViz DOT rendering
use layout::backends::svg::SVGWriter;
use layout::gv::{DotParser, GraphBuilder};

mod highlight;
mod setup;
mod pdf;

use highlight::{TreeSitterHighlighter, Theme};

// Debug function to print queries directory info
use highlight::debug_queries_dir;

#[derive(Serialize)]
struct MarkdownResponse {
    html: String,
    metadata: String,
}

struct WatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

/// Global highlighter instance
static HIGHLIGHTER: OnceLock<Mutex<TreeSitterHighlighter>> = OnceLock::new();

fn get_highlighter() -> &'static Mutex<TreeSitterHighlighter> {
    HIGHLIGHTER.get_or_init(|| Mutex::new(TreeSitterHighlighter::new()))
}

fn split_frontmatter(text: &str) -> (&str, String) {
    if text.starts_with("---") {
        // Find the end delimiter (---) starting from index 3
        // We look for "\n---" to ensure it's on a new line
        if let Some(end) = text[3..].find("\n---") {
            // The end index is relative to text[3..], so we add 3
            // The actual content ends at end + 3
            let metadata_end = end + 3;
            // The YAML content is between the first --- and the second ---
            let metadata = text[3..metadata_end].trim().to_string();
            
            // The rest of the content starts after "\n---"
            // \n--- is 4 chars.
            // We need to check if there is a newline after the closing ---
            let content_start = if text[metadata_end..].starts_with("\n---\r\n") {
                 metadata_end + 5 // \n---\r\n
            } else if text[metadata_end..].starts_with("\n---\n") {
                 metadata_end + 5 // \n---\n
            } else {
                 metadata_end + 4 // Just \n--- (EOF or immediate text)
            };

            if content_start < text.len() {
                return (&text[content_start..], metadata);
            } else {
                return ("", metadata);
            }
        }
    }
    (text, String::new())
}

fn process_obsidian_embeds(content: &str) -> Cow<'_, str> {
    let re = Regex::new(r"!\[\[(.*?)\]\]").unwrap();

    re.replace_all(content, |caps: &Captures| {
        let inner = &caps[1];
        let mut parts = inner.split('|');
        let path = parts.next().unwrap_or("");
        let size = parts.next();

        let path_escaped = path.replace(" ", "%20");

        if let Some(size_str) = size {
            if size_str.contains('x') {
                let mut dims = size_str.split('x');
                let width = dims.next().unwrap_or("");
                let height = dims.next().unwrap_or("");
                format!(
                    "<img src=\"{}\" width=\"{}\" height=\"{}\" alt=\"{}\" />",
                    path_escaped, width, height, path
                )
            } else {
                format!(
                    "<img src=\"{}\" width=\"{}\" alt=\"{}\" />",
                    path_escaped, size_str, path
                )
            }
        } else {
            format!("<img src=\"{}\" alt=\"{}\" />", path_escaped, path)
        }
    })
}

/// Process internal embeds - handles ![[file]] syntax, skipping code blocks.
/// This is the upstream version with code-block-awareness.
fn process_internal_embeds(content: &str) -> Cow<'_, str> {
    let re = Regex::new(r"(?s)```.*?```|`.*?`|!\[\[(.*?)\]\]").unwrap();

    re.replace_all(content, |caps: &Captures| {
        let full_match = caps.get(0).unwrap().as_str();
        if full_match.starts_with('`') {
            return full_match.to_string();
        }

        let inner = caps.get(1).map(|m| m.as_str()).unwrap_or("");
        let mut parts = inner.split('|');
        let path = parts.next().unwrap_or("");
        let size = parts.next();

        let path_escaped = path.replace(" ", "%20");

        if let Some(size_str) = size {
            if size_str.contains('x') {
                let mut dims = size_str.split('x');
                let width = dims.next().unwrap_or("");
                let height = dims.next().unwrap_or("");
                format!(
                    "<img src=\"{}\" width=\"{}\" height=\"{}\" alt=\"{}\" />",
                    path_escaped, width, height, path
                )
            } else {
                format!(
                    "<img src=\"{}\" width=\"{}\" alt=\"{}\" />",
                    path_escaped, size_str, path
                )
            }
        } else {
            format!("<img src=\"{}\" alt=\"{}\" />", path_escaped, path)
        }
    })
}

fn process_wikilinks<'a>(content: &'a str) -> Cow<'a, str> {
    let mut processed = Cow::Borrowed(content);

    // 1. Process [[#target]] or [[#target|alias]]
    let re_links = Regex::new(r"(?s)```.*?```|`.*?`|\[\[#([^\|\]]+)(?:\|([^\]]+))?\]\]").unwrap();
    if re_links.is_match(&processed) {
        let replaced = re_links.replace_all(&processed, |caps: &Captures| {
            let full_match = caps.get(0).unwrap().as_str();
            if full_match.starts_with('`') {
                return full_match.to_string();
            }
            let target = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            let alias = caps.get(2).map(|m| m.as_str()).unwrap_or(target);
            let target_id = target.to_lowercase().replace(' ', "-");
            format!("[{}](#{})", alias, target_id)
        });
        processed = Cow::Owned(replaced.into_owned());
    }

    // 2. Process ^block-id at the end of lines
    let re_ids = Regex::new(r"(?s)```.*?```|`.*?`|(?m)\s+\^([a-zA-Z0-9_-]+)$").unwrap();
    if re_ids.is_match(&processed) {
        let replaced = re_ids.replace_all(&processed, |caps: &Captures| {
            let full_match = caps.get(0).unwrap().as_str();
            if full_match.starts_with('`') {
                return full_match.to_string();
            }
            let id = caps.get(1).map(|m| m.as_str()).unwrap_or("");
            format!(
                " <a id=\"{}\" class=\"block-id-anchor\" data-label=\"{}\"></a>",
                id, id
            )
        });
        processed = Cow::Owned(replaced.into_owned());
    }

    // 3. Convert ==highlight== to <mark>highlight</mark>
    let re_highlight = Regex::new(r"(?s)```.*?```|`.*?`|==([^=\n]+)==").unwrap();
    if re_highlight.is_match(&processed) {
        let replaced = re_highlight.replace_all(&processed, |caps: &Captures| {
            let full_match = caps.get(0).unwrap().as_str();
            if full_match.starts_with('`') {
                return full_match.to_string();
            }
            format!("<mark>{}</mark>", caps.get(1).unwrap().as_str())
        });
        processed = Cow::Owned(replaced.into_owned());
    }

    // 4. Convert ^[inline footnote] to a footnote reference
    let re_inline_fn = Regex::new(r"(?s)```.*?```|`.*?`|\^\[([^\]]+)\]").unwrap();
    if re_inline_fn.is_match(&processed) {
        let mut footnote_defs = String::new();
        let mut fn_count = 0usize;
        let replaced = re_inline_fn.replace_all(&processed, |caps: &Captures| {
            let full_match = caps.get(0).unwrap().as_str();
            if full_match.starts_with('`') {
                return full_match.to_string();
            }
            fn_count += 1;
            let label = format!("ifn-{}", fn_count);
            footnote_defs.push_str(&format!(
                "\n[^{}]: {}\n",
                label,
                caps.get(1).unwrap().as_str()
            ));
            format!("[^{}]", label)
        });
        let mut out = replaced.into_owned();
        out.push_str(&footnote_defs);
        processed = Cow::Owned(out);
    }

    processed
}

/// Convert LaTeX delimiters \[...\] to $$...$$ and \(...\) to $...$
/// This is needed because comrak only supports $...$$ and $...$ natively
/// Skips content inside code blocks (`...` and ```...```)
fn process_latex_delimiters(content: &str) -> String {
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

#[tauri::command]
fn convert_markdown(content: &str) -> String {
    let after_embeds = process_internal_embeds(content);
    let after_wikilinks = process_wikilinks(&after_embeds);
    let processed = process_latex_delimiters(&after_wikilinks);

    // Debug: log if LaTeX delimiters are found
    if content.contains(r#"\["#) || content.contains(r#"\("#) {
        eprintln!("[latex] Input contains \\[ or \\(");
        eprintln!("[latex] After processing: {}", if processed.contains("$$") { "contains $$" } else { "NO $$" });
    }

    let mut options = ComrakOptions::default();
    options.extension.strikethrough = true;
    options.extension.table = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.superscript = false;
    options.extension.footnotes = true;
    options.extension.description_lists = true;
    options.extension.header_ids = Some("".to_string());
    options.extension.math_dollars = true;
    options.extension.math_code = true;
    options.render.unsafe_ = true;
    options.render.hardbreaks = true;
    options.render.sourcepos = true;

    markdown_to_html(&processed, &options)
}

#[tauri::command]
fn open_markdown(path: String) -> Result<MarkdownResponse, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let (body, metadata) = split_frontmatter(&content);
    Ok(MarkdownResponse {
        html: convert_markdown(body),
        metadata,
    })
}

#[tauri::command]
async fn open_markdown_preview(path: String, max_bytes: usize) -> Result<(String, String, bool), String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Read;
        let mut f = fs::File::open(&path).map_err(|e| e.to_string())?;

        let file_metadata = f.metadata().map_err(|e| e.to_string())?;
        if file_metadata.len() <= max_bytes as u64 {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            let (body, _metadata) = split_frontmatter(&content);
            let html = convert_markdown(body);
            return Ok((html, content, true));
        }

        let mut vec_buf = vec![0; max_bytes];
        let n = f.read(&mut vec_buf).map_err(|e| e.to_string())?;
        vec_buf.truncate(n);

        let preview_content = String::from_utf8_lossy(&vec_buf).into_owned();
        let (body, _metadata) = split_frontmatter(&preview_content);
        let html = convert_markdown(body);
        Ok((html, preview_content, false))
    })
    .await
    .unwrap_or_else(|e| Err(e.to_string()))
}

#[tauri::command]
fn render_markdown(content: String) -> MarkdownResponse {
    let (body, metadata) = split_frontmatter(&content);
    MarkdownResponse {
        html: convert_markdown(body),
        metadata,
    }
}

#[tauri::command]
async fn show_window(window: tauri::Window) {
    window.show().unwrap();
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file_binary(path: String, data: Vec<u8>) -> Result<(), String> {
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_file_folder(path: String) -> Result<(), String> {
    opener::reveal(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(old_path, new_path).map_err(|e| e.to_string())
}

/// Highlight code using tree-sitter.
/// 
/// Returns HTML with CSS classes for syntax highlighting.
/// If the language is not supported, returns an error and the frontend should fall back to hljs.
#[tauri::command]
fn highlight_code(code: String, language: String, theme: String) -> Result<String, String> {
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
fn is_language_supported(language: String) -> bool {
    let highlighter = get_highlighter();
    if let Ok(h) = highlighter.lock() {
        h.is_language_supported(&language)
    } else {
        false
    }
}

/// Get list of supported languages.
#[tauri::command]
fn get_supported_languages() -> Vec<String> {
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
fn render_graphviz_rust(code: String) -> Result<String, String> {
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
fn render_svgbob_rust(code: String) -> Result<String, String> {
	let svg = svgbob::to_svg(&code);
	Ok(svg)
}
#[tauri::command]
fn watch_file(
    handle: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let mut watcher_lock = state.watcher.lock().unwrap();

    *watcher_lock = None;

    let path_to_watch = path.clone();
    let app_handle = handle.clone();

    let mut watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(_) = res {
                let _ = app_handle.emit("file-changed", ());
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path_to_watch), RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    *watcher_lock = Some(watcher);

    Ok(())
}

#[tauri::command]
fn unwatch_file(state: State<'_, WatcherState>) -> Result<(), String> {
    let mut watcher_lock = state.watcher.lock().unwrap();
    *watcher_lock = None;
    Ok(())
}

struct AppState {
    startup_file: Mutex<Option<String>>,
}

#[tauri::command]
fn send_markdown_path(state: State<'_, AppState>) -> Vec<String> {
    let mut files: Vec<String> = std::env::args()
        .skip(1)
        .filter(|arg| !arg.starts_with("-"))
        .collect();

    if let Some(startup_path) = state.startup_file.lock().unwrap().as_ref() {
        if !files.contains(startup_path) {
            files.insert(0, startup_path.clone());
        }
    }

    files
}

#[tauri::command]
fn save_theme(app: AppHandle, theme: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let theme_path = config_dir.join("theme.txt");
    fs::write(theme_path, theme).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    use font_kit::source::SystemSource;
    let source = SystemSource::new();
    let mut families = source.all_families().unwrap_or_default();
    families.sort();
    families.dedup();
    families
}

#[tauri::command]
async fn get_app_mode() -> String {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|arg| arg == "--uninstall") {
        return "uninstall".to_string();
    }

    let current_exe = std::env::current_exe().unwrap_or_default();
    let exe_name = current_exe
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    let is_installer_mode =
        args.iter().any(|arg| arg == "--install") || exe_name.contains("installer");

    if setup::is_installed() {
        "app".to_string()
    } else {
        if is_installer_mode {
            "installer".to_string()
        } else {
            "app".to_string()
        }
    }
}

#[tauri::command]
fn is_win11() -> bool {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hklim = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(current_version) =
            hklim.open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
        {
            if let Ok(current_build) = current_version.get_value::<String, _>("CurrentBuild") {
                if let Ok(build_num) = current_build.parse::<u32>() {
                    return build_num >= 22000;
                }
            }
        }
    }
    false
}

#[tauri::command]
fn get_os_type() -> String {
    #[cfg(target_os = "macos")]
    {
        "macos".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        "windows".to_string()
    }
    #[cfg(target_os = "linux")]
    {
        "linux".to_string()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}

#[tauri::command]
fn clipboard_write_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

#[tauri::command]
fn clipboard_read_text() -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.get_text().map_err(|e| e.to_string())
}

#[tauri::command]
fn clipboard_read_image(macos_image_scaling: bool) -> Result<String, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    let image = clipboard.get_image().map_err(|e| e.to_string())?;

    // encode as png
    let mut png_data = Vec::new();
    {
        let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
        use image::ImageEncoder;

        // Check if running on macOS and scale image if needed
        #[cfg(target_os = "macos")]
        {
            if macos_image_scaling {
                // Use image crate for high-quality scaling
                use image::{DynamicImage, ImageBuffer, Rgba};

                // Convert arboard Image to ImageBuffer
                let mut img_buffer = ImageBuffer::new(image.width as u32, image.height as u32);
                for (x, y, pixel) in img_buffer.enumerate_pixels_mut() {
                    let idx = (y * image.width as u32 + x) as usize * 4;
                    if idx + 3 < image.bytes.len() {
                        *pixel = Rgba([
                            image.bytes[idx],
                            image.bytes[idx + 1],
                            image.bytes[idx + 2],
                            image.bytes[idx + 3]
                        ]);
                    }
                }

                // Create DynamicImage
                let dynamic_image = DynamicImage::ImageRgba8(img_buffer);

                // Resize with high-quality Lanczos3 filter
                let resized = dynamic_image.resize(
                    (image.width / 2) as u32,
                    (image.height / 2) as u32,
                    image::imageops::FilterType::Lanczos3
                );

                // Write the resized image
                let resized_rgba = resized.to_rgba8();
                encoder
                    .write_image(
                        resized_rgba.as_raw(),
                        (image.width / 2) as u32,
                        (image.height / 2) as u32,
                        image::ExtendedColorType::Rgba8,
                    )
                    .map_err(|e| e.to_string())?;
            } else {
                // Use original image if scaling is disabled
                encoder
                    .write_image(
                        image.bytes.as_ref(),
                        image.width as u32,
                        image.height as u32,
                        image::ExtendedColorType::Rgba8,
                    )
                    .map_err(|e| e.to_string())?;
            }
        }

        #[cfg(not(target_os = "macos"))]
        {
            // For other platforms, use the original image
            encoder
                .write_image(
                    image.bytes.as_ref(),
                    image.width as u32,
                    image.height as u32,
                    image::ExtendedColorType::Rgba8,
                )
                .map_err(|e| e.to_string())?;
        }
    }

    use base64::{engine::general_purpose, Engine as _};
    Ok(general_purpose::STANDARD.encode(&png_data))
}

#[tauri::command]
fn save_image(parent_dir: String, filename: String, base64_data: String, image_directory: String) -> Result<String, String> {
    let img_dir = Path::new(&parent_dir).join(&image_directory);
    if !img_dir.exists() {
        fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;
    }

    let file_path = img_dir.join(&filename);

    // remove potential data:image/png;base64, prefix
    let b64 = if let Some(pos) = base64_data.find("base64,") {
        &base64_data[pos + 7..]
    } else {
        &base64_data
    };

    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(b64)
        .map_err(|e: base64::DecodeError| e.to_string())?;

    fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    Ok(format!("{}/{}", image_directory, filename))
}

#[tauri::command]
fn copy_file_to_img(src_path: String, parent_dir: String, image_directory: String) -> Result<String, String> {
    let img_dir = Path::new(&parent_dir).join(&image_directory);
    if !img_dir.exists() {
        fs::create_dir_all(&img_dir).map_err(|e| e.to_string())?;
    }

    let src = Path::new(&src_path);
    if !src.exists() {
        return Err("Source file does not exist".to_string());
    }

    let file_name = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid source filename".to_string())?;

    // Handle name conflicts by appending timestamp if exists
    let mut dest_name = file_name.to_string();
    let dest_path = img_dir.join(&dest_name);
    if dest_path.exists() {
        let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("image");
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("");
        dest_name = format!("{}_{}.{}", stem, chrono::Local::now().timestamp(), ext);
    }

    let final_dest = img_dir.join(&dest_name);
    fs::copy(src, &final_dest).map_err(|e| e.to_string())?;

    Ok(format!("{}/{}", image_directory, dest_name))
}

#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        fs::remove_file(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn copy_file(src: String, dest: String) -> Result<(), String> {
    fs::copy(src, dest).map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn cleanup_empty_img_dir(parent_dir: String, image_directory: String) -> Result<(), String> {
    let img_dir = Path::new(&parent_dir).join(&image_directory);
    if img_dir.exists() && img_dir.is_dir() {
        if fs::read_dir(&img_dir)
            .map_err(|e| e.to_string())?
            .next()
            .is_none()
        {
            fs::remove_dir(img_dir).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn list_directory_contents(path: String) -> Result<Vec<String>, String> {
    let dir = Path::new(&path);
    if !dir.exists() || !dir.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut entries = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if is_dir {
            entries.push(format!("{}/", name));
        } else {
            entries.push(name);
        }
    }
    Ok(entries)
}

#[tauri::command]
async fn fetch_vscode_theme(app: AppHandle, url: String) -> Result<String, String> {
    use std::io::{Cursor, Read};
    // Parse URL: e.g. https://vscodethemes.com/e/teabyii.ayu/ayu-dark-bordered
    let parts: Vec<&str> = url.split('/').collect();
    if parts.len() < 5 || parts[3] != "e" {
        return Err("Invalid vscodethemes.com URL".to_string());
    }
    let pub_ext = parts[4];
    let theme_name = parts
        .get(5)
        .unwrap_or(&"")
        .split('?')
        .next()
        .unwrap_or("")
        .to_string();
    let pe_parts: Vec<&str> = pub_ext.split('.').collect();
    if pe_parts.len() != 2 {
        return Err("Invalid extension format in URL".to_string());
    }
    let publisher = pe_parts[0];
    let extension = pe_parts[1];

    let vsix_url = format!("https://{publisher}.gallery.vsassets.io/_apis/public/gallery/publisher/{publisher}/extension/{extension}/latest/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage");

    let response = reqwest::get(&vsix_url).await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    let reader = Cursor::new(bytes.as_ref());
    let mut archive = zip::ZipArchive::new(reader).map_err(|e| e.to_string())?;

    let mut package_json_data = String::new();
    if let Ok(mut file) = archive.by_name("extension/package.json") {
        file.read_to_string(&mut package_json_data)
            .map_err(|e| e.to_string())?;
    } else {
        return Err("No package.json found in VSIX".to_string());
    }

    let package_json: serde_json::Value =
        serde_json::from_str(&package_json_data).map_err(|e| e.to_string())?;
    let themes = package_json
        .get("contributes")
        .and_then(|c| c.get("themes"))
        .and_then(|t| t.as_array())
        .ok_or("No themes found in extension")?;

    let mut theme_path = None;
    let mut matched_name_str = theme_name.clone();

    for t in themes {
        let label = t
            .get("label")
            .or(t.get("id"))
            .and_then(|l| l.as_str())
            .unwrap_or("");
        let path = t.get("path").and_then(|p| p.as_str()).unwrap_or("");

        let label_slug = label
            .to_lowercase()
            .replace(|c: char| !c.is_alphanumeric(), "-");

        // If theme_name is empty, just take the first one
        if theme_name.is_empty()
            || label_slug == theme_name.to_lowercase()
            || path.to_lowercase().contains(&theme_name.to_lowercase())
        {
            theme_path = Some(path.to_string());
            if theme_name.is_empty() {
                matched_name_str = label_slug;
            }
            break;
        }
    }

    if let Some(mut path) = theme_path {
        if path.starts_with("./") {
            path = path[2..].to_string();
        }
        let full_path = format!("extension/{}", path).replace("\\", "/");
        let mut theme_file = archive.by_name(&full_path).map_err(|e| e.to_string())?;
        let mut theme_json = String::new();
        theme_file
            .read_to_string(&mut theme_json)
            .map_err(|e| e.to_string())?;

        let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
        let themes_dir = config_dir.join("themes");
        fs::create_dir_all(&themes_dir).map_err(|e| e.to_string())?;

        let dest_name = if matched_name_str.is_empty() {
            "downloaded_theme".to_string()
        } else {
            matched_name_str.clone()
        };
        let theme_file_path = themes_dir.join(format!("{}.json", dest_name));
        fs::write(&theme_file_path, &theme_json).map_err(|e| e.to_string())?;

        return Ok(dest_name);
    }

    Err("Theme name not found in extension".to_string())
}

#[tauri::command]
fn get_saved_vscode_themes(app: AppHandle) -> Result<Vec<String>, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let themes_dir = config_dir.join("themes");
    let mut themes = Vec::new();
    if let Ok(entries) = fs::read_dir(themes_dir) {
        for entry in entries.flatten() {
            if let Some(ext) = entry.path().extension() {
                if ext == "json" {
                    if let Some(name) = entry.path().file_stem().and_then(|n| n.to_str()) {
                        themes.push(name.to_string());
                    }
                }
            }
        }
    }
    Ok(themes)
}

#[tauri::command]
fn read_vscode_theme(app: AppHandle, name: String) -> Result<String, String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let theme_file_path = config_dir.join("themes").join(format!("{}.json", name));
    fs::read_to_string(theme_file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_vscode_theme(app: AppHandle, name: String) -> Result<(), String> {
    let config_dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let theme_file_path = config_dir.join("themes").join(format!("{}.json", name));
    fs::remove_file(theme_file_path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Debug: print queries directory info
    debug_queries_dir();
    
    // Linux webkit workarounds from upstream
    #[cfg(target_os = "linux")]
    {
        std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    #[cfg(target_os = "windows")]
    {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            "--enable-features=SmoothScrolling",
        );
    }

    tauri::Builder::default()
        .manage(AppState {
            startup_file: Mutex::new(None),
        })
        .manage(WatcherState {
            watcher: Mutex::new(None),
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            println!("Single Instance Args: {:?}", args);

            let path_str = args
                .iter()
                .skip(1)
                .find(|a| !a.starts_with("-"))
                .map(|a| a.as_str())
                .unwrap_or("");

            if !path_str.is_empty() {
                let path = std::path::Path::new(path_str);
                let resolved_path = if path.is_absolute() {
                    path_str.to_string()
                } else {
                    let cwd_path = std::path::Path::new(&cwd);
                    cwd_path.join(path).display().to_string()
                };

                let _ = app
                    .get_webview_window("main")
                    .expect("no main window")
                    .emit("file-path", resolved_path);
            }
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        .plugin(tauri_plugin_prevent_default::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::VISIBLE
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            println!("Setup Args: {:?}", args);

            let current_exe = std::env::current_exe().unwrap_or_default();
            let exe_name = current_exe
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            let is_installer_mode =
                args.iter().any(|arg| arg == "--install") || exe_name.contains("installer");

            let label = if is_installer_mode {
                "installer"
            } else {
                "main"
            };

            let mut window_builder = tauri::WebviewWindowBuilder::new(
                app,
                label,
                tauri::WebviewUrl::App("index.html".into()),
            )
            .title("Markpad")
            .inner_size(900.0, 650.0)
            .min_inner_size(400.0, 300.0)
            .visible(false)
            .resizable(true)
            .shadow(false)
            .center();

            #[cfg(target_os = "macos")]
            {
                window_builder = window_builder
                    .decorations(true)
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }

            #[cfg(not(target_os = "macos"))]
            {
                window_builder = window_builder.decorations(false);
            }

            let _window = window_builder.build()?;

            let config_dir = app.path().app_config_dir()?;
            let theme_path = config_dir.join("theme.txt");
            let theme_pref =
                fs::read_to_string(theme_path).unwrap_or_else(|_| "system".to_string());

            let window = app.get_webview_window(label).unwrap();

            let bg_color = match theme_pref.as_str() {
                "dark" => Some(tauri::window::Color(24, 24, 24, 255)),
                "light" => Some(tauri::window::Color(253, 253, 253, 255)),
                _ => {
                    if let Ok(t) = window.theme() {
                        match t {
                            tauri::Theme::Dark => Some(tauri::window::Color(24, 24, 24, 255)),
                            _ => Some(tauri::window::Color(253, 253, 253, 255)),
                        }
                    } else {
                        Some(tauri::window::Color(253, 253, 253, 255))
                    }
                }
            };

            let _ = window.set_background_color(bg_color);

            let _ = _window.set_shadow(true);

            let window = app.get_webview_window(label).unwrap();
            
            let file_path = args.iter().skip(1).find(|arg| !arg.starts_with("-"));

            if let Some(path) = file_path {
                let _ = window.emit("file-path", path.as_str());
            }

            // If installer, force size (this will be saved to installer-state, not main-state)
            if is_installer_mode {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
                    width: 450.0,
                    height: 550.0,
                }));
                let _ = window.center();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_markdown,
            open_markdown_preview,
            render_markdown,
            send_markdown_path,
            read_file_content,
            save_file_content,
            save_file_binary,
            get_app_mode,
            setup::install_app,
            setup::uninstall_app,
            setup::check_install_status,
            is_win11,
            open_file_folder,
            rename_file,
            watch_file,
            unwatch_file,
            show_window,
            save_theme,
            get_system_fonts,
            get_os_type,
            // Tree-sitter highlighting
            highlight_code,
            is_language_supported,
            get_supported_languages,
            // Diagram rendering (Rust)
            render_graphviz_rust,
            render_svgbob_rust,
            // PDF generation
            pdf::prepare_pdf_pages,
            pdf::merge_pdf_files,
            // Clipboard (upstream)
            clipboard_write_text,
            clipboard_read_text,
            clipboard_read_image,
            // File operations (upstream)
            save_image,
            copy_file_to_img,
            delete_file,
            copy_file,
            cleanup_empty_img_dir,
            list_directory_contents,
            // VSCode themes (upstream)
            fetch_vscode_theme,
            get_saved_vscode_themes,
            read_vscode_theme,
            delete_vscode_theme
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                if let Some(url) = urls.first() {
                    if let Ok(path_buf) = url.to_file_path() {
                        let path_str = path_buf.to_string_lossy().to_string();

                        let state = _app_handle.state::<AppState>();
                        *state.startup_file.lock().unwrap() = Some(path_str.clone());

                        if let Some(window) = _app_handle.get_webview_window("main") {
                            let _ = window.emit("file-path", path_str);
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        });
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

	#[test]
	fn test_process_latex_delimiters() {
		// Test \[...\] -> $$...$$
		let input1 = r#"Some text \[\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\] more text"#;
		let output1 = process_latex_delimiters(input1);
		println!("Input1: {}", input1);
		println!("Output1: {}", output1);
		assert!(output1.contains("$$"), "Should contain $$ for display math");
		assert!(!output1.contains(r#"\["#), "Should not contain \\[");
		assert!(!output1.contains(r#"\]"#), "Should not contain \\]");
		
		// Test \(...\) -> $...$
		let input2 = r#"Inline math \(x^2\) here"#;
		let output2 = process_latex_delimiters(input2);
		println!("Input2: {}", input2);
		println!("Output2: {}", output2);
		assert!(output2.contains("$x^2$"), "Should convert \\(\\) to $");
		assert!(!output2.contains(r#"\("#), "Should not contain \\(");
		assert!(!output2.contains(r#"\)"#), "Should not contain \\)");
	}

	#[test]
	fn test_convert_markdown_latex() {
		// Test full markdown conversion with LaTeX delimiters
		let input = r#"LaTeX 分隔符 \[...\]：
\[\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\]
"#;
		let output = convert_markdown(input);
		println!("=== Markdown Input ===");
		println!("{}", input);
		println!("=== HTML Output ===");
		println!("{}", output);
		
		// Should contain data-math-style="display" from comrak
		assert!(output.contains("data-math-style"), "Should contain data-math-style attribute");
		
		// Count math spans
		let count = output.matches("data-math-style").count();
		println!("Number of math spans: {}", count);
	}
	
	#[test]
	fn test_specific_line() {
		// Test the specific line from demo_features.md
		let input = r#"\[\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\]"#;
		println!("=== Input ===");
		println!("{}", input);
		
		let processed = process_latex_delimiters(input);
		println!("=== After process_latex_delimiters ===");
		println!("{}", processed);
		
		let output = convert_markdown(input);
		println!("=== Final HTML ===");
		println!("{}", output);
		
		assert!(output.contains("data-math-style"), "Should contain data-math-style");
	}
	
	#[test]
	fn test_lines_289_290() {
		// Test the exact content of lines 289-290
		let input = "LaTeX 分隔符 `\\[...\\]`：\n\\[\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\\]";
		
		println!("=== Input ===");
		println!("{}", input);
		
		let processed = process_latex_delimiters(input);
		println!("\n=== After process_latex_delimiters ===");
		println!("{}", processed);
		
		// Line 290 should be converted to $$...$$
		assert!(processed.contains("$$\\sum"), "Line 290 should be converted to $$ format");
	}
	
	#[test]
	fn test_debug_state() {
		// Test to debug the state tracking issue
		let demo_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
			.parent()
			.unwrap()
			.join("docs/demo/demo_features.md");
		
		let content = std::fs::read_to_string(&demo_path).expect("Failed to read file");
		
		// Simulate the process_latex_delimiters function with debug output
		let mut in_inline_code = false;
		let mut in_code_block = false;
		let mut line_num = 1;
		
		for line in content.lines() {
			let chars: Vec<char> = line.chars().collect();
			let mut i = 0;
			
			while i < chars.len() {
				let c = chars[i];
				
				// Check for code block
				if !in_inline_code {
					if c == '`' && i + 2 < chars.len() && chars[i + 1] == '`' && chars[i + 2] == '`' {
						in_code_block = !in_code_block;
						i += 3;
						println!("Line {}: CODE BLOCK TOGGLE (now {})", line_num, in_code_block);
						continue;
					}
				}
				
				// Check for inline code
				if !in_code_block {
					if c == '`' {
						in_inline_code = !in_inline_code;
						i += 1;
						println!("Line {}: INLINE CODE TOGGLE (now {})", line_num, in_inline_code);
						continue;
					}
				}
				
				i += 1;
			}
			
			// Print state at specific lines
			if line_num >= 288 && line_num <= 292 {
				println!("Line {} END: in_inline_code={}, in_code_block={}, content: {}", 
					line_num, in_inline_code, in_code_block, 
					if line.len() > 50 { &line[..50] } else { line });
			}
			
			line_num += 1;
		}
		
		println!("\nFinal state: in_inline_code={}, in_code_block={}", in_inline_code, in_code_block);
	}
	
	#[test]
	fn test_demo_features_file() {
		// Test the actual demo_features.md file
		let demo_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
			.parent()
			.unwrap()
			.join("docs/demo/demo_features.md");
		
		println!("=== Reading demo file: {} ===", demo_path.display());
		
		if demo_path.exists() {
			let content = std::fs::read_to_string(&demo_path).expect("Failed to read demo file");
			println!("File size: {} bytes", content.len());
			
			// Check if file contains \[ delimiters
			let has_latex_bracket = content.contains(r#"\["#);
			println!("Contains \\[ delimiter: {}", has_latex_bracket);
			
			// Count occurrences
			let bracket_count = content.matches(r#"\["#).count();
			println!("Number of \\[ occurrences: {}", bracket_count);
			
			// Process the content
			let processed = process_latex_delimiters(&content);
			let dollar_count = processed.matches("$$").count();
			println!("Number of $$ after processing: {}", dollar_count);
			
			// Find and print line 290 specifically
			for (i, line) in content.lines().enumerate() {
				if i == 289 { // 0-indexed, line 290
					println!("\n=== Line 290 original ===");
					println!("{}", line);
					println!("Bytes: {:?}", line.as_bytes());
				}
			}
			
			// Find and print line 290 in processed content
			for (i, line) in processed.lines().enumerate() {
				if i == 289 {
					println!("\n=== Line 290 after processing ===");
					println!("{}", line);
				}
			}
			
			// Render to HTML
			let html = convert_markdown(&content);
			let math_span_count = html.matches("data-math-style").count();
			println!("\nNumber of data-math-style spans in HTML: {}", math_span_count);
			
			// Find and print the specific LaTeX section
			if let Some(start) = html.find("LaTeX 分隔符") {
				let end = std::cmp::min(start + 500, html.len());
				println!("\n=== LaTeX section in HTML ===");
				println!("{}", &html[start..end]);
			}
			
			assert!(has_latex_bracket, "Demo file should contain \\[ delimiters");
			assert!(dollar_count > 0, "Processed content should contain $$");
		} else {
			println!("Demo file not found at {}", demo_path.display());
		}
	}
	
	#[test]
	fn test_inline_code_with_latex() {
		// Test that \[...\] inside backticks is NOT converted
		let input = r#"LaTeX 分隔符 `\[...\]`："#;
		
		println!("=== Input ===");
		println!("{}", input);
		
		let processed = process_latex_delimiters(input);
		println!("=== After process_latex_delimiters ===");
		println!("{}", processed);
		
		// Should NOT contain $$ because \[...\] is inside backticks
		assert!(!processed.contains("$$"), "Should NOT convert \\[...\\] inside backticks");
		
		// Should still contain the original \[...\]
		assert!(processed.contains(r#"\["#), "Should contain original \\[");
		assert!(processed.contains(r#"\]"#), "Should contain original \\]");
		
		// Now test the actual markdown rendering
		let html = convert_markdown(input);
		println!("=== Final HTML ===");
		println!("{}", html);
		
		// The HTML should contain <code> tag with \[...\] inside
		// Note: comrak might generate different HTML structure
		// Just check that the backticks are processed correctly by our function
	}
	
	#[test]
	fn test_actual_line_281_282() {
		// Test the exact lines from demo file
		let input = r#"LaTeX 分隔符 `\[...\]`：
\[\sum_{i=1}^{n} i = \frac{n(n+1)}{2}\]"#;
		
		eprintln!("=== Input ===");
		eprintln!("{}", input);
		
		let processed = process_latex_delimiters(input);
		eprintln!("\n=== After process_latex_delimiters ===");
		eprintln!("{}", processed);
		
		// Line 1 should NOT be converted (inside backticks)
		let line1 = processed.lines().next().unwrap();
		eprintln!("\nLine 1: {}", line1);
		assert!(line1.contains(r#"\["#), "Line 1 should still have \\[");
		assert!(!line1.contains("$$"), "Line 1 should NOT have $$");
		
		// Line 2 SHOULD be converted (not inside backticks)
		let line2 = processed.lines().nth(1).unwrap();
		eprintln!("Line 2: {}", line2);
		assert!(line2.contains("$$"), "Line 2 should have $$");
		
		// Final HTML check
		let html = convert_markdown(input);
		eprintln!("\n=== Final HTML ===");
		eprintln!("{}", html);
	}
	
	#[test]
	fn test_backtick_state_reset() {
		// Test that inline code state is properly reset at end of line
		let input = "Some `inline code` here\nNext line with \\[math\\]";
		
		eprintln!("=== Input ===");
		eprintln!("{}", input);
		
		let processed = process_latex_delimiters(input);
		eprintln!("\n=== After processing ===");
		eprintln!("{}", processed);
		
		// The math on line 2 should be converted
		assert!(processed.contains("$$"), "Math should be converted");
	}
	
	#[test]
	fn test_comrak_code_math() {
		// Test how comrak handles math inside code blocks
		use comrak::{markdown_to_html, ComrakOptions};
		
		// Test 1: $$ inside backticks
		let input1 = r#"Test `$$x^2$$` here"#;
		let mut options = ComrakOptions::default();
		options.extension.math_dollars = true;
		options.render.unsafe_ = true;
		options.render.sourcepos = true;
		
		let html1 = markdown_to_html(input1, &options);
		eprintln!("=== Input: {} ===", input1);
		eprintln!("HTML: {}", html1);
		
		// Test 2: Our preprocessing result - \[...\] in backticks should stay as-is
		let input2 = r#"LaTeX 分隔符 `\[...\]`："#;
		let processed2 = process_latex_delimiters(input2);
		eprintln!("\n=== Input: {} ===", input2);
		eprintln!("Processed: {}", processed2);
		
		let html2 = markdown_to_html(&processed2, &options);
		eprintln!("HTML: {}", html2);
		
		// Check if comrak adds data-math-style inside code tags
		let has_math_in_code = html2.contains("<code>") && html2.contains("data-math-style");
		eprintln!("Has math inside code: {}", has_math_in_code);
	}
}