use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let grammars_dir = Path::new("grammars");
    
    if !grammars_dir.exists() {
        println!("cargo:warning=Grammars directory not found. Run python scripts/download_grammars_git.py first");
        tauri_build::build();
        return;
    }
    
    // List of grammars: (name, directory, subpath, c_symbol_override)
    // c_symbol_override: empty string means use default (tree_sitter_<name>)
    let grammars: Vec<(&str, &str, &str, &str)> = vec![
        ("ada", "ada", "", ""),
        ("adl", "adl", "", ""),
        ("agda", "agda", "", ""),
        ("alloy", "alloy", "", ""),
        ("amber", "amber", "", ""),
        ("astro", "astro", "", ""),
        ("awk", "awk", "", ""),
        ("bash", "bash", "", ""),
        ("basic", "basic", "", ""),
        ("bass", "bass", "", ""),
        ("beancount", "beancount", "", ""),
        ("bibtex", "bibtex", "", ""),
        ("bicep", "bicep", "", ""),
        ("bitbake", "bitbake", "", ""),
        ("blade", "blade", "", ""),
        ("blueprint", "blueprint", "", ""),
        ("c", "c", "", ""),
        ("c-sharp", "c-sharp", "", ""),
        ("c3", "c3", "", ""),
        ("caddyfile", "caddyfile", "", ""),
        ("cairo", "cairo", "", ""),
        ("capnp", "capnp", "", ""),
        ("cel", "cel", "", ""),
        ("chuck", "chuck", "", ""),
        ("clarity", "clarity", "", ""),
        ("clojure", "clojure", "", ""),
        ("cmake", "cmake", "", ""),
        ("comment", "comment", "", ""),
        ("cpon", "cpon", "", ""),
        ("cpp", "cpp", "", ""),
        ("crystal", "crystal", "", ""),
        ("css", "css", "", ""),
        ("csv", "csv", "", ""),
        ("cue", "cue", "", ""),
        ("cylc", "cylc", "", ""),
        ("cython", "cython", "", ""),
        ("d", "d", "", ""),
        ("dart", "dart", "", ""),
        ("dbml", "dbml", "", ""),
        ("debian", "debian", "", ""),
        ("devicetree", "devicetree", "", ""),
        ("dhall", "dhall", "", ""),
        ("diff", "diff", "", ""),
        ("djot", "djot", "", ""),
        ("dockerfile", "dockerfile", "", ""),
        ("dot", "dot", "", ""),
        ("doxyfile", "doxyfile", "", ""),
        ("dtd", "dtd", "", ""),
        ("dunstrc", "dunstrc", "", ""),
        ("earthfile", "earthfile", "", ""),
        ("edoc", "edoc", "", ""),
        ("eex", "eex", "", ""),
        ("eiffel", "eiffel", "", ""),
        ("elisp", "elisp", "", ""),
        ("elixir", "elixir", "", ""),
        ("elm", "elm", "", ""),
        ("elvish", "elvish", "", ""),
        ("embedded-template", "embedded-template", "", ""),
        ("erlang", "erlang", "", ""),
        ("fennel", "fennel", "", ""),
        ("fga", "fga", "", ""),
        ("fidl", "fidl", "", ""),
        ("fish", "fish", "", ""),
        ("flatbuffers", "flatbuffers", "", ""),
        ("forth", "forth", "", ""),
        ("freebasic", "freebasic", "", ""),
        ("fsharp", "fsharp", "", ""),
        ("gas", "gas", "", ""),
        ("gdscript", "gdscript", "", ""),
        ("gherkin", "gherkin", "", ""),
        ("ghostty", "ghostty", "", ""),
        ("git-config", "git-config", "", ""),
        ("git-rebase", "git-rebase", "", ""),
        ("gitattributes", "gitattributes", "", ""),
        ("gitcommit", "gitcommit", "", ""),
        ("gitignore", "gitignore", "", ""),
        ("gleam", "gleam", "", ""),
        ("glsl", "glsl", "", ""),
        ("gn", "gn", "", ""),
        ("gnuplot", "gnuplot", "", ""),
        ("go", "go", "", ""),
        ("go-format-string", "go-format-string", "", ""),
        ("godot-resource", "godot-resource", "", ""),
        ("gomod", "gomod", "", ""),
        ("gotmpl", "gotmpl", "", ""),
        ("gowork", "gowork", "", ""),
        ("gpr", "gpr", "", ""),
        ("graphql", "graphql", "", ""),
        ("gren", "gren", "", ""),
        ("groovy", "groovy", "", ""),
        ("hare", "hare", "", ""),
        ("haskell", "haskell", "", ""),
        ("haskell-literate", "haskell-literate", "", ""),
        ("haskell-persistent", "haskell-persistent", "", ""),
        ("haxe", "haxe", "", ""),
        ("hcl", "hcl", "", ""),
        ("hdl", "hdl", "", ""),
        ("heex", "heex", "", ""),
        ("hocon", "hocon", "", ""),
        ("hoon", "hoon", "", ""),
        ("hosts", "hosts", "", ""),
        ("html", "html", "", ""),
        ("htmldjango", "htmldjango", "", ""),
        ("hurl", "hurl", "", ""),
        ("hyprlang", "hyprlang", "", ""),
        ("iex", "iex", "", ""),
        ("ini", "ini", "", ""),
        ("ink", "ink", "", ""),
        ("inko", "inko", "", ""),
        ("janet-simple", "janet-simple", "", ""),
        ("java", "java", "", ""),
        ("javascript", "javascript", "", ""),
        ("jinja2", "jinja2", "", ""),
        ("jjdescription", "jjdescription", "", ""),
        ("jjrevset", "jjrevset", "", ""),
        ("jjtemplate", "jjtemplate", "", ""),
        ("jq", "jq", "", ""),
        ("jsdoc", "jsdoc", "", ""),
        ("json", "json", "", ""),
        ("json5", "json5", "", ""),
        ("jsonnet", "jsonnet", "", ""),
        ("julia", "julia", "", ""),
        ("just", "just", "", ""),
        ("kcl", "kcl", "", ""),
        ("kconfig", "kconfig", "", ""),
        ("kdl", "kdl", "", ""),
        ("klog", "klog", "", ""),
        ("koka", "koka", "", ""),
        ("kotlin", "kotlin", "", ""),
        ("koto", "koto", "", ""),
        ("latex", "latex", "", ""),
        ("ld", "ld", "", ""),
        ("ldif", "ldif", "", ""),
        ("lean", "lean", "", ""),
        ("ledger", "ledger", "", ""),
        ("less", "less", "", ""),
        ("llvm", "llvm", "", ""),
        ("llvm-mir", "llvm-mir", "", ""),
        ("log", "log", "", ""),
        ("lpf", "lpf", "", ""),
        ("lua", "lua", "", ""),
        ("lua-format-string", "lua-format-string", "", ""),
        ("luap", "luap", "", ""),
        ("luau", "luau", "", ""),
        ("mail", "mail", "", ""),
        ("make", "make", "", ""),
        ("markdoc", "markdoc", "", ""),
        ("matlab", "matlab", "", ""),
        ("mermaid", "mermaid", "", ""),
        ("meson", "meson", "", ""),
        ("mojo", "mojo", "", ""),
        ("move", "move", "", ""),
        ("nasm", "nasm", "", ""),
        ("nearley", "nearley", "", ""),
        ("nginx", "nginx", "", ""),
        ("nickel", "nickel", "", ""),
        ("nim", "nim", "", ""),
        ("nix", "nix", "", ""),
        ("nu", "nu", "", ""),
        ("odin", "odin", "", ""),
        ("ohm", "ohm", "", ""),
        ("opencl", "opencl", "", ""),
        ("openscad", "openscad", "", ""),
        ("org", "org", "", ""),
        ("pascal", "pascal", "", ""),
        ("passwd", "passwd", "", ""),
        ("pem", "pem", "", ""),
        ("penrose", "penrose", "", ""),
        ("perl", "perl", "", ""),
        ("pest", "pest", "", ""),
        ("picat", "picat", "", ""),
        ("pkl", "pkl", "", ""),
        ("po", "po", "", ""),
        ("pod", "pod", "", ""),
        ("ponylang", "ponylang", "", ""),
        ("powershell", "powershell", "", ""),
        ("prisma", "prisma", "", ""),
        ("properties", "properties", "", ""),
        ("proto", "proto", "", ""),
        ("prql", "prql", "", ""),
        ("pug", "pug", "", ""),
        ("purescript", "purescript", "", ""),
        ("python", "python", "", ""),
        ("ql", "ql", "", ""),
        ("qmljs", "qmljs", "", ""),
        ("query", "query", "", ""),
        ("quint", "quint", "", ""),
        ("r", "r", "", ""),
        ("regex", "regex", "", ""),
        ("rego", "rego", "", ""),
        ("requirements", "requirements", "", ""),
        ("rescript", "rescript", "", ""),
        ("robot", "robot", "", ""),
        ("robots", "robots", "", ""),
        ("ron", "ron", "", ""),
        ("rshtml", "rshtml", "", ""),
        ("rst", "rst", "", ""),
        ("ruby", "ruby", "", ""),
        ("rust", "rust", "", ""),
        ("rust-format-args", "rust-format-args", "", ""),
        ("scala", "scala", "", ""),
        ("scfg", "scfg", "", ""),
        ("scheme", "scheme", "", ""),
        ("scss", "scss", "", ""),
        ("shellcheckrc", "shellcheckrc", "", ""),
        ("slang", "slang", "", ""),
        ("slint", "slint", "", ""),
        ("slisp", "slisp", "", ""),
        ("smali", "smali", "", ""),
        ("smithy", "smithy", "", ""),
        ("sml", "sml", "", ""),
        ("snakemake", "snakemake", "", ""),
        ("solidity", "solidity", "", ""),
        ("sourcepawn", "sourcepawn", "", ""),
        ("spade", "spade", "", ""),
        ("spicedb", "spicedb", "", ""),
        ("sql", "sql", "", ""),
        ("sshclientconfig", "sshclientconfig", "", "tree_sitter_ssh_client_config"),
        ("strace", "strace", "", ""),
        ("strictdoc", "strictdoc", "", ""),
        ("supercollider", "supercollider", "", ""),
        ("svelte", "svelte", "", ""),
        ("sway", "sway", "", ""),
        ("swift", "swift", "", ""),
        ("systemverilog", "systemverilog", "", ""),
        ("t32", "t32", "", ""),
        ("tablegen", "tablegen", "", ""),
        ("tact", "tact", "", ""),
        ("task", "task", "", ""),
        ("tcl", "tcl", "", ""),
        ("teal", "teal", "", ""),
        ("templ", "templ", "", ""),
        ("tera", "tera", "", ""),
        ("textproto", "textproto", "", ""),
        ("thrift", "thrift", "", ""),
        ("tlaplus", "tlaplus", "", ""),
        ("todotxt", "todotxt", "", ""),
        ("toml", "toml", "", ""),
        ("tsx", "tsx", "tsx", ""),
        ("twig", "twig", "", ""),
        ("typescript", "typescript", "typescript", ""),
        ("typespec", "typespec", "", ""),
        ("typst", "typst", "", ""),
        ("ungrammar", "ungrammar", "", ""),
        ("unison", "unison", "", ""),
        ("uxntal", "uxntal", "", ""),
        ("vala", "vala", "", ""),
        ("vento", "vento", "", ""),
        ("verilog", "verilog", "", ""),
        ("vhdl", "vhdl", "", ""),
        ("vhs", "vhs", "", ""),
        ("vim", "vim", "", ""),
        ("werk", "werk", "", ""),
        ("wesl", "wesl", "", ""),
        ("wgsl", "wgsl", "", ""),
        ("wikitext", "wikitext", "", ""),
        ("wit", "wit", "", ""),
        ("xit", "xit", "", ""),
        ("xml", "xml", "", ""),
        ("xtc", "xtc", "", ""),
        ("yaml", "yaml", "", ""),
        ("yara", "yara", "", ""),
        ("yuck", "yuck", "", ""),
        ("zig", "zig", "", ""),
    ];
    
    for (name, dir, subpath, c_symbol) in &grammars {
        compile_grammar(name, &grammars_dir.join(dir), subpath, c_symbol);
    }

    generate_ffi_module(&grammars);

    // Link C++ runtime for grammars with C++ scanners (ruby, yaml, lean, etc.)
    println!("cargo:rustc-link-lib=dylib=stdc++");

    tauri_build::build();
}

fn compile_grammar(name: &str, grammar_dir: &Path, subpath: &str, c_symbol: &str) {
    let src_dir = if subpath.is_empty() {
        grammar_dir.join("src")
    } else {
        grammar_dir.join(subpath).join("src")
    };
    
    if !src_dir.exists() {
        println!("cargo:warning=Grammar src directory not found for {} at {:?}", name, src_dir);
        return;
    }
    
    let parser_c = src_dir.join("parser.c");
    
    if !parser_c.exists() {
        println!("cargo:warning=parser.c not found for grammar {}", name);
        return;
    }
    
    println!("cargo:rerun-if-changed={}", parser_c.display());

    // Check for scanner files (C or C++)
    let scanner_c = src_dir.join("scanner.c");
    let scanner_cc = src_dir.join("scanner.cc");
    let schema_cc = src_dir.join("schema.generated.cc");

    let lib_name = if c_symbol.is_empty() {
        format!("tree_sitter_{}", name.replace("-", "_"))
    } else {
        c_symbol.to_string()
    };

    // Build C files (parser.c + optional scanner.c) with C compiler
    let mut build = cc::Build::new();
    build
        .file(&parser_c)
        .include(&src_dir)
        .include(grammar_dir)
        .warnings(false);

    let has_c_scanner = scanner_c.exists() && !scanner_cc.exists();
    if has_c_scanner {
        println!("cargo:rerun-if-changed={}", scanner_c.display());
        build.file(&scanner_c);
    }

    build.compile(&lib_name);

    // If there are C++ scanner files, compile them manually and merge into main archive
    let has_cpp_scanner = scanner_cc.exists() || schema_cc.exists();
    if has_cpp_scanner {
        let out_dir = env::var("OUT_DIR").unwrap();
        let target = env::var("TARGET").unwrap_or_default();

        // Get the right C++ compiler for cross-compilation
        let cpp_files: Vec<std::path::PathBuf> = {
            let mut files = Vec::new();
            if scanner_cc.exists() {
                println!("cargo:rerun-if-changed={}", scanner_cc.display());
                files.push(scanner_cc);
            }
            if schema_cc.exists() {
                println!("cargo:rerun-if-changed={}", schema_cc.display());
                files.push(schema_cc);
            }
            files
        };

        // Detect cross-compilation compiler
        let (compiler, ar_cmd) = if target.contains("windows-gnu") {
            ("x86_64-w64-mingw32-g++".to_string(), "x86_64-w64-mingw32-ar")
        } else if target.contains("linux") && target.contains("aarch64") {
            ("aarch64-linux-gnu-g++".to_string(), "aarch64-linux-gnu-ar")
        } else {
            ("g++".to_string(), "ar")
        };

        let mut obj_files: Vec<String> = Vec::new();
        for cpp_file in &cpp_files {
            let obj_name = format!("{}_{}.o",
                lib_name,
                cpp_file.file_stem().unwrap().to_str().unwrap());
            let obj_path = std::path::Path::new(&out_dir).join(&obj_name);

            let status = std::process::Command::new(&compiler)
                .args(&[
                    "-Os", "-fPIC", "-ffunction-sections", "-fdata-sections",
                    "-c", "-w",
                    &format!("-I{}", src_dir.display()),
                    &format!("-I{}", grammar_dir.display()),
                    &format!("-I{}", src_dir.join("..").display()),
                    "-o", obj_path.to_str().unwrap(),
                    cpp_file.to_str().unwrap(),
                ])
                .status()
                .expect("failed to compile C++ scanner");

            if !status.success() {
                panic!("C++ compilation failed for {:?}", cpp_file);
            }

            obj_files.push(obj_name);
        }

        // Merge C++ objects into the main static library
        if !obj_files.is_empty() {
            let main_lib = format!("{}/lib{}.a", out_dir, lib_name);
            std::process::Command::new(ar_cmd)
                .args(&["rs", &main_lib])
                .args(&obj_files)
                .current_dir(&out_dir)
                .status()
                .expect("failed to merge C++ objects into main archive");

            // Clean up object files
            for obj in &obj_files {
                let _ = std::fs::remove_file(std::path::Path::new(&out_dir).join(obj));
            }
        }
    }

    println!("cargo:rustc-link-lib=static={}", lib_name);
}

fn generate_ffi_module(grammars: &[(&str, &str, &str, &str)]) {
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("grammar_ffi.rs");
    
    let mut content = String::new();
    content.push_str("// Auto-generated by build.rs
");
    content.push_str("// FFI declarations for tree-sitter grammars

");
    content.push_str("use tree_sitter_language::LanguageFn;

");
    
    for (name, _, _, c_symbol) in grammars {
        let fn_name = if c_symbol.is_empty() {
            format!("tree_sitter_{}", name.replace("-", "_"))
        } else {
            c_symbol.to_string()
        };
        content.push_str(&format!(r#"extern "C" {{ fn {}() -> *const (); }}"#, fn_name));
        content.push_str("
");
    }

    content.push_str("
/// Get the language function for a grammar by name.
");
    content.push_str("pub fn get_language(name: &str) -> Option<tree_sitter::Language> {
");
    content.push_str("    match name {
");

    for (name, _, _, c_symbol) in grammars {
        let fn_name = if c_symbol.is_empty() {
            format!("tree_sitter_{}", name.replace("-", "_"))
        } else {
            c_symbol.to_string()
        };
        content.push_str(&format!(r#"        "{}" => Some(unsafe {{ LanguageFn::from_raw({}) }}.into()),"#, name, fn_name));
        content.push_str("
");
    }
    
    content.push_str("        _ => None,
");
    content.push_str("    }
");
    content.push_str("}
");
    
    fs::write(&dest_path, &content).unwrap();
    println!("cargo:rerun-if-changed=build.rs");
}