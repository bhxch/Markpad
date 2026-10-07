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
        ("ada", "ada", "", "tree_sitter_ada"),
        ("adl", "adl", "", "tree_sitter_adl"),
        ("agda", "agda", "", "tree_sitter_agda"),
        ("alloy", "alloy", "", "tree_sitter_alloy"),
        ("amber", "amber", "", "tree_sitter_amber"),
        ("astro", "astro", "", "tree_sitter_astro"),
        ("awk", "awk", "", "tree_sitter_awk"),
        ("bash", "bash", "", "tree_sitter_bash"),
        ("basic", "basic", "", "tree_sitter_basic"),
        ("bass", "bass", "", "tree_sitter_bass"),
        ("batch", "batch", "", "tree_sitter_batch"),
        ("beancount", "beancount", "", "tree_sitter_beancount"),
        ("bibtex", "bibtex", "", "tree_sitter_bibtex"),
        ("bicep", "bicep", "", "tree_sitter_bicep"),
        ("bitbake", "bitbake", "", "tree_sitter_bitbake"),
        ("blade", "blade", "", "tree_sitter_blade"),
        ("blueprint", "blueprint", "", "tree_sitter_blueprint"),
        ("c", "c", "", "tree_sitter_c"),
        ("c-sharp", "c-sharp", "", "tree_sitter_c_sharp"),
        ("c3", "c3", "", "tree_sitter_c3"),
        ("caddyfile", "caddyfile", "", "tree_sitter_caddyfile"),
        ("cairo", "cairo", "", "tree_sitter_cairo"),
        ("capnp", "capnp", "", "tree_sitter_capnp"),
        ("cel", "cel", "", "tree_sitter_cel"),
        ("chuck", "chuck", "", "tree_sitter_chuck"),
        ("circom", "circom", "", "tree_sitter_circom"),
        ("clarity", "clarity", "", "tree_sitter_clarity"),
        ("clojure", "clojure", "", "tree_sitter_clojure"),
        ("cmake", "cmake", "", "tree_sitter_cmake"),
        ("comment", "comment", "", "tree_sitter_comment"),
        ("commonlisp", "commonlisp", "", "tree_sitter_commonlisp"),
        ("concerto", "concerto", "", "tree_sitter_concerto"),
        ("cpon", "cpon", "", "tree_sitter_cpon"),
        ("cpp", "cpp", "", "tree_sitter_cpp"),
        ("crystal", "crystal", "", "tree_sitter_crystal"),
        ("css", "css", "", "tree_sitter_css"),
        ("csv", "csv", "", "tree_sitter_csv"),
        ("cue", "cue", "", "tree_sitter_cue"),
        ("cylc", "cylc", "", "tree_sitter_cylc"),
        ("cython", "cython", "", "tree_sitter_cython"),
        ("d", "d", "", "tree_sitter_d"),
        ("dart", "dart", "", "tree_sitter_dart"),
        ("dbml", "dbml", "", "tree_sitter_dbml"),
        ("debian", "debian", "", "tree_sitter_debian"),
        ("devicetree", "devicetree", "", "tree_sitter_devicetree"),
        ("dhall", "dhall", "", "tree_sitter_dhall"),
        ("diff", "diff", "", "tree_sitter_diff"),
        ("djot", "djot", "", "tree_sitter_djot"),
        ("dockerfile", "dockerfile", "", "tree_sitter_dockerfile"),
        ("dot", "dot", "", "tree_sitter_dot"),
        ("doxyfile", "doxyfile", "", "tree_sitter_doxyfile"),
        ("drools", "drools", "", "tree_sitter_drools"),
        ("dtd", "dtd", "", "tree_sitter_dtd"),
        ("dunstrc", "dunstrc", "", "tree_sitter_dunstrc"),
        ("earthfile", "earthfile", "", "tree_sitter_earthfile"),
        ("ebnf", "ebnf", "crates/tree-sitter-ebnf", "tree_sitter_ebnf"),
        ("edoc", "edoc", "", "tree_sitter_edoc"),
        ("eex", "eex", "", "tree_sitter_eex"),
        ("eiffel", "eiffel", "", "tree_sitter_eiffel"),
        ("elisp", "elisp", "", "tree_sitter_elisp"),
        ("elixir", "elixir", "", "tree_sitter_elixir"),
        ("elm", "elm", "", "tree_sitter_elm"),
        ("elvish", "elvish", "", "tree_sitter_elvish"),
        ("embedded-perl", "embedded-perl", "", "tree_sitter_embedded_perl"),
        ("embedded-template", "embedded-template", "", "tree_sitter_embedded_template"),
        ("erlang", "erlang", "", "tree_sitter_erlang"),
        ("esdl", "esdl", "", "tree_sitter_esdl"),
        ("fennel", "fennel", "", "tree_sitter_fennel"),
        ("fga", "fga", "", "tree_sitter_fga"),
        ("fidl", "fidl", "", "tree_sitter_fidl"),
        ("fish", "fish", "", "tree_sitter_fish"),
        ("flatbuffers", "flatbuffers", "", "tree_sitter_flatbuffers"),
        ("forth", "forth", "", "tree_sitter_forth"),
        ("fortran", "fortran", "", "tree_sitter_fortran"),
        ("freebasic", "freebasic", "", "tree_sitter_freebasic"),
        ("fsharp", "fsharp", "fsharp", "tree_sitter_fsharp"),
        ("gas", "gas", "", "tree_sitter_gas"),
        ("gdscript", "gdscript", "", "tree_sitter_gdscript"),
        ("gherkin", "gherkin", "", "tree_sitter_gherkin"),
        ("ghostty", "ghostty", "", "tree_sitter_ghostty"),
        ("git-config", "git-config", "", "tree_sitter_git_config"),
        ("git-rebase", "git-rebase", "", "tree_sitter_git_rebase"),
        ("gitattributes", "gitattributes", "", "tree_sitter_gitattributes"),
        ("gitcommit", "gitcommit", "", "tree_sitter_gitcommit"),
        ("gitignore", "gitignore", "", "tree_sitter_gitignore"),
        ("gleam", "gleam", "", "tree_sitter_gleam"),
        ("glimmer", "glimmer", "", "tree_sitter_glimmer"),
        ("glimmer-javascript", "glimmer-javascript", "", "tree_sitter_glimmer_javascript"),
        ("glimmer-typescript", "glimmer-typescript", "", "tree_sitter_glimmer_typescript"),
        ("glsl", "glsl", "", "tree_sitter_glsl"),
        ("gn", "gn", "", "tree_sitter_gn"),
        ("gnuplot", "gnuplot", "", "tree_sitter_gnuplot"),
        ("go", "go", "", "tree_sitter_go"),
        ("go-format-string", "go-format-string", "", "tree_sitter_go_format_string"),
        ("godot-resource", "godot-resource", "", "tree_sitter_godot_resource"),
        ("gomod", "gomod", "", "tree_sitter_gomod"),
        ("gotmpl", "gotmpl", "", "tree_sitter_gotmpl"),
        ("gowork", "gowork", "", "tree_sitter_gowork"),
        ("gpr", "gpr", "", "tree_sitter_gpr"),
        ("graphql", "graphql", "", "tree_sitter_graphql"),
        ("gren", "gren", "", "tree_sitter_gren"),
        ("groovy", "groovy", "", "tree_sitter_groovy"),
        ("hare", "hare", "", "tree_sitter_hare"),
        ("haskell", "haskell", "", "tree_sitter_haskell"),
        ("haskell-literate", "haskell-literate", "", "tree_sitter_haskell_literate"),
        ("haskell-persistent", "haskell-persistent", "", "tree_sitter_haskell_persistent"),
        ("haxe", "haxe", "", "tree_sitter_haxe"),
        ("hcl", "hcl", "", "tree_sitter_hcl"),
        ("hdl", "hdl", "", "tree_sitter_hdl"),
        ("heex", "heex", "", "tree_sitter_heex"),
        ("hocon", "hocon", "", "tree_sitter_hocon"),
        ("hoon", "hoon", "", "tree_sitter_hoon"),
        ("hosts", "hosts", "", "tree_sitter_hosts"),
        ("html", "html", "", "tree_sitter_html"),
        ("htmldjango", "htmldjango", "", "tree_sitter_htmldjango"),
        ("hurl", "hurl", "", "tree_sitter_hurl"),
        ("hyprlang", "hyprlang", "", "tree_sitter_hyprlang"),
        ("iex", "iex", "", "tree_sitter_iex"),
        ("ini", "ini", "", "tree_sitter_ini"),
        ("ink", "ink", "", "tree_sitter_ink"),
        ("inko", "inko", "", "tree_sitter_inko"),
        ("janet-simple", "janet-simple", "", "tree_sitter_janet_simple"),
        ("java", "java", "", "tree_sitter_java"),
        ("javascript", "javascript", "", "tree_sitter_javascript"),
        ("jinja2", "jinja2", "", "tree_sitter_jinja2"),
        ("jjdescription", "jjdescription", "", "tree_sitter_jjdescription"),
        ("jjrevset", "jjrevset", "", "tree_sitter_jjrevset"),
        ("jjtemplate", "jjtemplate", "", "tree_sitter_jjtemplate"),
        ("jq", "jq", "", "tree_sitter_jq"),
        ("jsdoc", "jsdoc", "", "tree_sitter_jsdoc"),
        ("json", "json", "", "tree_sitter_json"),
        ("json5", "json5", "", "tree_sitter_json5"),
        ("jsonnet", "jsonnet", "", "tree_sitter_jsonnet"),
        ("julia", "julia", "", "tree_sitter_julia"),
        ("just", "just", "", "tree_sitter_just"),
        ("kcl", "kcl", "", "tree_sitter_kcl"),
        ("kconfig", "kconfig", "", "tree_sitter_kconfig"),
        ("kdl", "kdl", "", "tree_sitter_kdl"),
        ("klog", "klog", "", "tree_sitter_klog"),
        ("koka", "koka", "", "tree_sitter_koka"),
        ("kotlin", "kotlin", "", "tree_sitter_kotlin"),
        ("koto", "koto", "", "tree_sitter_koto"),
        ("latex", "latex", "", "tree_sitter_latex"),
        ("ld", "ld", "", "tree_sitter_ld"),
        ("ldif", "ldif", "", "tree_sitter_ldif"),
        ("lean", "lean", "", "tree_sitter_lean"),
        ("ledger", "ledger", "", "tree_sitter_ledger"),
        ("less", "less", "", "tree_sitter_less"),
        ("llvm", "llvm", "", "tree_sitter_llvm"),
        ("llvm-mir", "llvm-mir", "", "tree_sitter_llvm_mir"),
        ("log", "log", "", "tree_sitter_log"),
        ("lpf", "lpf", "", "tree_sitter_lpf"),
        ("lua", "lua", "", "tree_sitter_lua"),
        ("lua-format-string", "lua-format-string", "", "tree_sitter_lua_format_string"),
        ("luap", "luap", "", "tree_sitter_luap"),
        ("luau", "luau", "", "tree_sitter_luau"),
        ("mail", "mail", "", "tree_sitter_mail"),
        ("make", "make", "", "tree_sitter_make"),
        ("markdoc", "markdoc", "", "tree_sitter_markdoc"),
        ("markdown", "markdown", "tree-sitter-markdown", "tree_sitter_markdown"),
        ("markdown_inline", "markdown_inline", "tree-sitter-markdown-inline", "tree_sitter_markdown_inline"),
        ("matlab", "matlab", "", "tree_sitter_matlab"),
        ("mermaid", "mermaid", "", "tree_sitter_mermaid"),
        ("meson", "meson", "", "tree_sitter_meson"),
        ("metamath", "metamath", "", "tree_sitter_metamath"),
        ("mojo", "mojo", "", "tree_sitter_mojo"),
        ("moonbit", "moonbit", "", "tree_sitter_moonbit"),
        ("move", "move", "", "tree_sitter_move"),
        ("nasm", "nasm", "", "tree_sitter_nasm"),
        ("nearley", "nearley", "", "tree_sitter_nearley"),
        ("nginx", "nginx", "", "tree_sitter_nginx"),
        ("nickel", "nickel", "", "tree_sitter_nickel"),
        ("nim", "nim", "", "tree_sitter_nim"),
        ("nix", "nix", "", "tree_sitter_nix"),
        ("nu", "nu", "", "tree_sitter_nu"),
        ("ocaml", "ocaml", "grammars/ocaml", "tree_sitter_ocaml"),
        ("ocaml-interface", "ocaml-interface", "grammars/interface", "tree_sitter_ocaml_interface"),
        ("odin", "odin", "", "tree_sitter_odin"),
        ("ohm", "ohm", "", "tree_sitter_ohm"),
        ("opencl", "opencl", "", "tree_sitter_opencl"),
        ("openscad", "openscad", "", "tree_sitter_openscad"),
        ("org", "org", "", "tree_sitter_org"),
        ("p", "p", "", "tree_sitter_p"),
        ("pascal", "pascal", "", "tree_sitter_pascal"),
        ("passwd", "passwd", "", "tree_sitter_passwd"),
        ("pem", "pem", "", "tree_sitter_pem"),
        ("penrose", "penrose", "", "tree_sitter_penrose"),
        ("perl", "perl", "", "tree_sitter_perl"),
        ("pest", "pest", "", "tree_sitter_pest"),
        ("php", "php", "php", "tree_sitter_php"),
        ("php-only", "php-only", "php_only", "tree_sitter_php_only"),
        ("picat", "picat", "", "tree_sitter_picat"),
        ("pkl", "pkl", "", "tree_sitter_pkl"),
        ("po", "po", "", "tree_sitter_po"),
        ("pod", "pod", "", "tree_sitter_pod"),
        ("ponylang", "ponylang", "", "tree_sitter_ponylang"),
        ("powershell", "powershell", "", "tree_sitter_powershell"),
        ("prisma", "prisma", "", "tree_sitter_prisma"),
        ("prolog", "prolog", "grammars/prolog", "tree_sitter_prolog"),
        ("properties", "properties", "", "tree_sitter_properties"),
        ("proto", "proto", "", "tree_sitter_proto"),
        ("proverif", "proverif", "", "tree_sitter_proverif"),
        ("prql", "prql", "", "tree_sitter_prql"),
        ("ptx", "ptx", "", "tree_sitter_ptx"),
        ("pug", "pug", "", "tree_sitter_pug"),
        ("puppet", "puppet", "", "tree_sitter_puppet"),
        ("purescript", "purescript", "", "tree_sitter_purescript"),
        ("python", "python", "", "tree_sitter_python"),
        ("ql", "ql", "", "tree_sitter_ql"),
        ("qmljs", "qmljs", "", "tree_sitter_qmljs"),
        ("query", "query", "", "tree_sitter_query"),
        ("quint", "quint", "", "tree_sitter_quint"),
        ("r", "r", "", "tree_sitter_r"),
        ("regex", "regex", "", "tree_sitter_regex"),
        ("rego", "rego", "", "tree_sitter_rego"),
        ("requirements", "requirements", "", "tree_sitter_requirements"),
        ("rescript", "rescript", "", "tree_sitter_rescript"),
        ("ripple", "ripple", "packages/tree-sitter", "tree_sitter_ripple"),
        ("robot", "robot", "", "tree_sitter_robot"),
        ("robots-txt", "robots-txt", "", "tree_sitter_robots_txt"),
        ("ron", "ron", "", "tree_sitter_ron"),
        ("rpmspec", "rpmspec", "", "tree_sitter_rpmspec"),
        ("rshtml", "rshtml", "", "tree_sitter_rshtml"),
        ("rst", "rst", "", "tree_sitter_rst"),
        ("ruby", "ruby", "", "tree_sitter_ruby"),
        ("rust", "rust", "", "tree_sitter_rust"),
        ("rust-format-args", "rust-format-args", "", "tree_sitter_rust_format_args"),
        ("scala", "scala", "", "tree_sitter_scala"),
        ("scfg", "scfg", "", "tree_sitter_scfg"),
        ("scheme", "scheme", "", "tree_sitter_scheme"),
        ("scss", "scss", "", "tree_sitter_scss"),
        ("sgf", "sgf", "", "tree_sitter_sgf"),
        ("shellcheckrc", "shellcheckrc", "", "tree_sitter_shellcheckrc"),
        ("slang", "slang", "", "tree_sitter_slang"),
        ("slint", "slint", "", "tree_sitter_slint"),
        ("slisp", "slisp", "", "tree_sitter_slisp"),
        ("smali", "smali", "", "tree_sitter_smali"),
        ("smithy", "smithy", "", "tree_sitter_smithy"),
        ("sml", "sml", "", "tree_sitter_sml"),
        ("snakemake", "snakemake", "", "tree_sitter_snakemake"),
        ("solidity", "solidity", "", "tree_sitter_solidity"),
        ("sourcepawn", "sourcepawn", "", "tree_sitter_sourcepawn"),
        ("spade", "spade", "", "tree_sitter_spade"),
        ("spicedb", "spicedb", "", "tree_sitter_spicedb"),
        ("sql", "sql", "", "tree_sitter_sql"),
        ("ssh_client_config", "ssh_client_config", "", "tree_sitter_ssh_client_config"),
        ("strace", "strace", "", "tree_sitter_strace"),
        ("strictdoc", "strictdoc", "", "tree_sitter_strictdoc"),
        ("styx", "styx", "crates/tree-sitter-styx", "tree_sitter_styx"),
        ("supercollider", "supercollider", "", "tree_sitter_supercollider"),
        ("svelte", "svelte", "crates/tree-sitter-svelte", "tree_sitter_svelte"),
        ("sway", "sway", "", "tree_sitter_sway"),
        ("swift", "swift", "", "tree_sitter_swift"),
        ("systemverilog", "systemverilog", "", "tree_sitter_systemverilog"),
        ("t32", "t32", "", "tree_sitter_t32"),
        ("tablegen", "tablegen", "", "tree_sitter_tablegen"),
        ("tact", "tact", "", "tree_sitter_tact"),
        ("task", "task", "", "tree_sitter_task"),
        ("tcl", "tcl", "", "tree_sitter_tcl"),
        ("teal", "teal", "", "tree_sitter_teal"),
        ("templ", "templ", "", "tree_sitter_templ"),
        ("tera", "tera", "", "tree_sitter_tera"),
        ("textproto", "textproto", "", "tree_sitter_textproto"),
        ("thrift", "thrift", "", "tree_sitter_thrift"),
        ("tlaplus", "tlaplus", "", "tree_sitter_tlaplus"),
        ("todotxt", "todotxt", "", "tree_sitter_todotxt"),
        ("tolk", "tolk", "server/src/languages/tolk/tree-sitter-tolk", "tree_sitter_tolk"),
        ("toml", "toml", "", "tree_sitter_toml"),
        ("tql", "tql", "", "tree_sitter_tql"),
        ("tsx", "tsx", "tsx", "tree_sitter_tsx"),
        ("twig", "twig", "", "tree_sitter_twig"),
        ("typescript", "typescript", "typescript", "tree_sitter_typescript"),
        ("typespec", "typespec", "", "tree_sitter_typespec"),
        ("typst", "typst", "", "tree_sitter_typst"),
        ("ungrammar", "ungrammar", "", "tree_sitter_ungrammar"),
        ("unison", "unison", "", "tree_sitter_unison"),
        ("uxntal", "uxntal", "", "tree_sitter_uxntal"),
        ("v", "v", "tree_sitter_v", "tree_sitter_v"),
        ("vala", "vala", "", "tree_sitter_vala"),
        ("varlink", "varlink", "", "tree_sitter_varlink"),
        ("vento", "vento", "", "tree_sitter_vento"),
        ("verilog", "verilog", "", "tree_sitter_verilog"),
        ("vhdl", "vhdl", "", "tree_sitter_vhdl"),
        ("vhs", "vhs", "", "tree_sitter_vhs"),
        ("vim", "vim", "", "tree_sitter_vim"),
        ("vue", "vue", "", "tree_sitter_vue"),
        ("wast", "wast", "wast", "tree_sitter_wast"),
        ("wat", "wat", "wat", "tree_sitter_wat"),
        ("werk", "werk", "", "tree_sitter_werk"),
        ("wesl", "wesl", "", "tree_sitter_wesl"),
        ("wgsl", "wgsl", "", "tree_sitter_wgsl"),
        ("wikitext", "wikitext", "", "tree_sitter_wikitext"),
        ("wit", "wit", "", "tree_sitter_wit"),
        ("xit", "xit", "", "tree_sitter_xit"),
        ("xml", "xml", "", "tree_sitter_xml"),
        ("xtc", "xtc", "", "tree_sitter_xtc"),
        ("xwiki", "xwiki", "", "tree_sitter_xwiki"),
        ("yaml", "yaml", "", "tree_sitter_yaml"),
        ("yara", "yara", "", "tree_sitter_yara"),
        ("yuck", "yuck", "", "tree_sitter_yuck"),
        ("zig", "zig", "", "tree_sitter_zig"),
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
    // 固定 C 标准为 gnu11: gcc 16+ 默认使用 C23, glibc 在 C23 下会用 _Generic
    // 将 bsearch() 等 stdlib 函数宏化, 与部分 grammar 自带同名 C 函数冲突
    // (例如 grammars/perl/src/bsearch.c 定义了自己的 bsearch), 预处理后
    // 变成 `void *_Generic(...)` 触发 "expected identifier before '_Generic'" 错误。
    // 用 gnu11 编译既修复此问题, 也符合 tree-sitter 生成的 C 代码的预期标准。
    let mut build = cc::Build::new();
    build
        .file(&parser_c)
        .include(&src_dir)
        .include(grammar_dir)
        .warnings(false)
        .flag("-std=gnu11");

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
        let (compiler, ar_cmd, objcopy_cmd) = if target.contains("windows-gnu") {
            ("x86_64-w64-mingw32-g++".to_string(), "x86_64-w64-mingw32-ar", "x86_64-w64-mingw32-objcopy")
        } else if target.contains("linux") && target.contains("aarch64") {
            ("aarch64-linux-gnu-g++".to_string(), "aarch64-linux-gnu-ar", "objcopy")
        } else {
            ("g++".to_string(), "ar", "objcopy")
        };

        // 内嵌其他语言 scanner 实现且未重命名符号的语法: 这些符号与本体的独立
        // 语法静态链接时重定义冲突(vue scanner.cc 直接 #include html 的 scanner)。
        // 它们在本语法 parser 中无引用, 降级为本地符号即可, 不影响本体入口。
        let localize_syms: &[&str] = match name {
            "vue" => &[
                "tree_sitter_html_external_scanner_create",
                "tree_sitter_html_external_scanner_destroy",
                "tree_sitter_html_external_scanner_scan",
                "tree_sitter_html_external_scanner_serialize",
                "tree_sitter_html_external_scanner_deserialize",
            ],
            _ => &[],
        };

        let mut obj_files: Vec<String> = Vec::new();
        for cpp_file in &cpp_files {
            let obj_name = format!("{}_{}.o",
                lib_name,
                cpp_file.file_stem().unwrap().to_str().unwrap());
            let obj_path = std::path::Path::new(&out_dir).join(&obj_name);

            let status = std::process::Command::new(&compiler)
                .args(&[
                    // 固定 C++ 标准为 gnu++17: gcc 16 默认标准下 mingw 的 libstdc++
                    // 缺少 std::string move 构造符号, 导致链接报 undefined reference
                    // to basic_string::basic_string(&&). 显式 gnu++17 规避此问题.
                    // -include cstdint: 部分 grammar 生成文件(如 yaml 的
                    // schema.generated.cc)直接使用 int8_t 但未包含 <cstdint>.
                    "-std=gnu++17",
                    "-include", "cstdint",
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

            if !localize_syms.is_empty() {
                let mut cmd = std::process::Command::new(objcopy_cmd);
                for sym in localize_syms {
                    cmd.arg(format!("--localize-symbol={}", sym));
                }
                cmd.arg(obj_path.to_str().unwrap());
                let st = cmd.status().expect("failed to run objcopy");
                if !st.success() {
                    panic!("objcopy localize failed for {:?}", obj_path);
                }
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