use std::path::Path;

// D38 本地模块：语法清单与编译编排已迁至 grammar_catalog.rs（本地文件，
// spec: docs/superpowers/specs/2026-10-16-windows-installer-dll-split-design.md §5.2）。
// 上游新增语法请改 GRAMMARS 表所在文件，勿在本文件重建内联表。
#[path = "grammar_catalog.rs"]
mod catalog;

fn main() {
    let grammars_dir = Path::new("grammars");

    if !grammars_dir.exists() {
        println!("cargo:warning=Grammars directory not found. Run python scripts/download_grammars_git.py first");
        tauri_build::build();
        return;
    }

    // D38 本地接线：语法 DLL 模式（fork 发布脚本 MARKPAD_GRAMMAR_DLL=1 专用）。
    // 语法编译整体移交 grammars-cdylib，此侧仅链接其导入库；C++ 运行时随语法
    // 进 DLL 故不再 link_cpp_runtime。默认关闭，上游行为不变。
    // spec: docs/superpowers/specs/2026-10-16-windows-installer-dll-split-design.md §5.3
    if catalog::dll_mode_enabled() {
        catalog::link_grammar_dll();
        catalog::generate_ffi_module(catalog::GRAMMARS, Some("markpad_grammars"));
        tauri_build::build();
        return;
    }

    let grammars: Vec<(&str, &str, &str, &str)> = catalog::GRAMMARS.to_vec();

    for (name, dir, subpath, c_symbol) in &grammars {
        catalog::compile_grammar(name, &grammars_dir.join(dir), subpath, c_symbol, "");
    }

    catalog::generate_ffi_module(catalog::GRAMMARS, None);

    catalog::link_cpp_runtime();

    tauri_build::build();
}
