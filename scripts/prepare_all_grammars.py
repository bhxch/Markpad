#!/usr/bin/env python3
"""
Prepare all tree-sitter grammars from Helix configuration.
Downloads grammars and highlight queries, then generates Rust code.
"""

import json
import os
import re
import subprocess
import urllib.request
import zipfile
import io
import shutil
from pathlib import Path

# Configuration
LANGUAGES_TOML = Path(__file__).parent.parent / "src-tauri" / "languages.toml"
GRAMMARS_DIR = Path(__file__).parent.parent / "src-tauri" / "grammars"
QUERIES_DIR = Path(__file__).parent.parent / "src-tauri" / "queries"
BUILD_RS = Path(__file__).parent.parent / "src-tauri" / "build.rs"
REGISTRY_RS = Path(__file__).parent.parent / "src-tauri" / "src" / "highlight" / "registry.rs"

# Helix runtime queries URL (for highlights.scm files)
HELIX_RUNTIME_URL = "https://raw.githubusercontent.com/helix-editor/helix/master/runtime/queries"

# Grammars to exclude (problematic or not useful for Markdown highlighting)
EXCLUDED_GRAMMARS = {
    "wren", "gemini",  # Explicitly excluded in Helix config
    "embedded-template",  # Template language, not useful standalone
    "tablegen",  # May have build issues
    "wit",  # WebAssembly Interface Types, rare
}

def parse_languages_toml(content: str) -> dict:
    """Parse languages.toml and extract grammar definitions."""
    grammars = {}
    
    # Find all [[grammar]] sections
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line == '[[grammar]]':
            i += 1
            name = None
            git = None
            rev = None
            subpath = ""
            
            while i < len(lines) and not lines[i].strip().startswith('[['):
                line = lines[i].strip()
                if line.startswith('name = '):
                    name = line.split('=', 1)[1].strip().strip('"')
                elif line.startswith('source = {'):
                    # Parse source line
                    source_line = line
                    # Continue reading if multi-line
                    while '}' not in source_line and i + 1 < len(lines):
                        i += 1
                        source_line += ' ' + lines[i].strip()
                    
                    # Extract git and rev
                    git_match = re.search(r'git\s*=\s*"([^"]+)"', source_line)
                    rev_match = re.search(r'rev\s*=\s*"([^"]+)"', source_line)
                    subpath_match = re.search(r'subpath\s*=\s*"([^"]+)"', source_line)
                    
                    if git_match:
                        git = git_match.group(1)
                    if rev_match:
                        rev = rev_match.group(1)
                    if subpath_match:
                        subpath = subpath_match.group(1)
                i += 1
            
            if name and git and rev:
                grammars[name] = {
                    "name": name,
                    "git": git,
                    "rev": rev,
                    "subpath": subpath
                }
        else:
            i += 1
    
    return grammars


def download_grammar(name: str, info: dict) -> bool:
    """Download a grammar from git repository."""
    target_dir = GRAMMARS_DIR / name
    
    if target_dir.exists():
        print(f"  [SKIP] {name} already exists")
        return True
    
    git_url = info["git"]
    rev = info["rev"]
    subpath = info.get("subpath", "")
    
    # Convert git URL to archive URL
    if git_url.startswith("https://github.com/"):
        archive_url = f"{git_url.rstrip('/')}/archive/{rev}.zip"
    elif git_url.startswith("https://gitlab.com/"):
        archive_url = f"{git_url.rstrip('/')}/-/archive/{rev}/{git_url.split('/')[-1]}-{rev}.zip"
    else:
        print(f"  [WARN] Unsupported git host for {name}: {git_url}")
        return False
    
    try:
        print(f"  [DOWN] {name} from {archive_url}")
        
        # Download zip
        req = urllib.request.Request(archive_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as response:
            zip_data = response.read()
        
        # Extract zip
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            # Find the root directory in the archive
            root_dir = zf.namelist()[0].split('/')[0]
            
            if subpath:
                # Extract only the subpath
                prefix = f"{root_dir}/{subpath}/"
                for member in zf.namelist():
                    if member.startswith(prefix):
                        # Get relative path
                        rel_path = member[len(prefix):]
                        if rel_path:  # Skip the directory itself
                            target_path = target_dir / rel_path
                            if member.endswith('/'):
                                target_path.mkdir(parents=True, exist_ok=True)
                            else:
                                target_path.parent.mkdir(parents=True, exist_ok=True)
                                with zf.open(member) as src, open(target_path, 'wb') as dst:
                                    dst.write(src.read())
            else:
                # Extract everything
                for member in zf.namelist():
                    rel_path = member[len(root_dir) + 1:]  # +1 for the /
                    if rel_path:  # Skip the root directory itself
                        target_path = target_dir / rel_path
                        if member.endswith('/'):
                            target_path.mkdir(parents=True, exist_ok=True)
                        else:
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with zf.open(member) as src, open(target_path, 'wb') as dst:
                                dst.write(src.read())
        
        print(f"  [OK] {name} downloaded")
        return True
        
    except Exception as e:
        print(f"  [FAIL] {name}: {e}")
        return False


def download_highlights_scm(name: str) -> bool:
    """Download highlights.scm from Helix runtime queries."""
    target_file = QUERIES_DIR / name / "highlights.scm"
    
    if target_file.exists():
        print(f"  [SKIP] highlights.scm for {name} already exists")
        return True
    
    target_file.parent.mkdir(parents=True, exist_ok=True)
    
    url = f"{HELIX_RUNTIME_URL}/{name}/highlights.scm"
    
    try:
        print(f"  [DOWN] highlights.scm for {name}")
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read().decode('utf-8')
        
        with open(target_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"  [OK] highlights.scm for {name}")
        return True
        
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"  [WARN] No highlights.scm for {name}")
            # Create empty file
            with open(target_file, 'w', encoding='utf-8') as f:
                f.write("; No highlights available\n")
            return True
        print(f"  [FAIL] highlights.scm for {name}: {e}")
        return False
    except Exception as e:
        print(f"  [FAIL] highlights.scm for {name}: {e}")
        return False


def generate_build_rs(grammars: dict) -> str:
    """Generate build.rs content with all grammars."""
    # Filter and sort grammars
    valid_grammars = []
    for name, info in sorted(grammars.items()):
        src_dir = GRAMMARS_DIR / name / "src"
        if not src_dir.exists():
            subpath = info.get("subpath", "")
            if subpath:
                src_dir = GRAMMARS_DIR / name / subpath / "src"
        
        parser_c = src_dir / "parser.c" if src_dir.exists() else None
        if parser_c and parser_c.exists():
            valid_grammars.append((name, info.get("subpath", "")))
    
    content = '''use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let grammars_dir = Path::new("grammars");
    
    if !grammars_dir.exists() {
        println!("cargo:warning=Grammars directory not found. Run python scripts/prepare_grammars.py first");
        tauri_build::build();
        return;
    }
    
    // List of grammars: (name, directory, subpath)
    let grammars = vec![
'''
    
    for name, subpath in valid_grammars:
        content += f'        ("{name}", "{name}", "{subpath}"),\n'
    
    content += '''    ];
    
    for (name, dir, subpath) in &grammars {
        compile_grammar(name, &grammars_dir.join(dir), subpath);
    }
    
    generate_ffi_module(&grammars);
    
    tauri_build::build();
}

fn compile_grammar(name: &str, grammar_dir: &Path, subpath: &str) {
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
    
    // Build parser with C compiler
    let mut build = cc::Build::new();
    build
        .file(&parser_c)
        .include(&src_dir)
        .include(grammar_dir)
        .warnings(false);
    
    if scanner_c.exists() {
        println!("cargo:rerun-if-changed={}", scanner_c.display());
        build.file(&scanner_c);
    }
    
    build.compile(&format!("tree_sitter_{}", name.replace("-", "_")));
    
    // If there are C++ files, compile them separately with C++ compiler
    if scanner_cc.exists() || schema_cc.exists() {
        let mut cpp_build = cc::Build::new();
        cpp_build
            .cpp(true)
            .include(&src_dir)
            .include(grammar_dir)
            .warnings(false);
        
        if scanner_cc.exists() {
            println!("cargo:rerun-if-changed={}", scanner_cc.display());
            cpp_build.file(&scanner_cc);
        }
        if schema_cc.exists() {
            println!("cargo:rerun-if-changed={}", schema_cc.display());
            cpp_build.file(&schema_cc);
        }
        
        cpp_build.compile(&format!("tree_sitter_{}_cpp", name.replace("-", "_")));
    }
    
    println!("cargo:rustc-link-lib=static=tree_sitter_{}", name.replace("-", "_"));
}

fn generate_ffi_module(grammars: &[(&str, &str, &str)]) {
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("grammar_ffi.rs");
    
    let mut content = String::new();
    content.push_str("// Auto-generated by build.rs\\n");
    content.push_str("// FFI declarations for tree-sitter grammars\\n\\n");
    content.push_str("use tree_sitter_language::LanguageFn;\\n\\n");
    
    for (name, _, _) in grammars {
        let fn_name = format!("tree_sitter_{}", name.replace("-", "_"));
        content.push_str(&format!(
            "extern \\"C\\" {{ fn {}() -> *const (); }}\\n",
            fn_name
        ));
    }
    
    content.push_str("\\n/// Get the language function for a grammar by name.\\n");
    content.push_str("pub fn get_language(name: &str) -> Option<tree_sitter::Language> {\\n");
    content.push_str("    match name {\\n");
    
    for (name, _, _) in grammars {
        let fn_name = format!("tree_sitter_{}", name.replace("-", "_"));
        content.push_str(&format!(
            "        \\"{}\\" => Some(unsafe {{ LanguageFn::from_raw({}) }}.into()),\\n",
            name, fn_name
        ));
    }
    
    content.push_str("        _ => None,\\n");
    content.push_str("    }\\n");
    content.push_str("}\\n");
    
    fs::write(&dest_path, &content).unwrap();
    println!("cargo:rerun-if-changed=build.rs");
}
'''
    
    return content


def generate_registry_code(grammars: dict) -> str:
    """Generate the language registration code."""
    valid_grammars = []
    for name in sorted(grammars.keys()):
        src_dir = GRAMMARS_DIR / name / "src"
        if not src_dir.exists():
            continue
        parser_c = src_dir / "parser.c"
        if parser_c.exists():
            valid_grammars.append(name)
    
    code = '''//! Language registry for tree-sitter grammars.
//!
//! Manages available languages and provides language lookup by name or alias.
//! Grammars are compiled from source during the build process.

use std::collections::HashMap;
use tree_sitter::Language;

// Include the FFI bindings generated by build.rs
include!(concat!(env!("OUT_DIR"), "/grammar_ffi.rs"));

/// Registry containing all supported languages.
pub struct LanguageRegistry {
    /// Map from language name to tree-sitter Language
    languages: HashMap<String, Language>,
    /// Map from alias to canonical language name
    aliases: HashMap<String, String>,
}

impl LanguageRegistry {
    /// Create a new language registry with all supported languages.
    pub fn new() -> Self {
        let mut registry = Self {
            languages: HashMap::new(),
            aliases: HashMap::new(),
        };
        
        // Register languages compiled from source
        let languages = [
'''
    
    for name in valid_grammars:
        code += f'            ("{name}", "{name}"),\n'
    
    code += '''        ];
        
        for (name, ffi_name) in languages {
            if let Some(lang) = get_language(ffi_name) {
                registry.register(name, lang);
            }
        }
        
        // Register common aliases
'''
    
    # Add aliases
    aliases_map = {
        "javascript": ["js", "ecmascript"],
        "python": ["py"],
        "rust": ["rs"],
        "typescript": ["ts"],
        "cpp": ["c++", "cc", "cxx"],
        "bash": ["sh", "shell", "zsh"],
        "markdown": ["md", "mkd"],
        "yaml": ["yml"],
        "terraform": ["tf", "hcl"],
        "dockerfile": ["docker"],
        "docker-compose": ["docker-compose.yaml", "docker-compose.yml"],
        "git-commit": ["gitcommit"],
        "git-rebase": ["gitrebase"],
        "jsonnet": ["libsonnet"],
        "ocaml": ["ml", "mli"],
        "ocaml-interface": ["eli", "eliomi"],
        "php": ["php3", "php4", "php5", "php7", "php8"],
        "ruby": ["rb"],
        "scala": ["sc"],
        "svelte": ["svelte"],
        "vue": ["vuejs"],
        "xml": ["xml"],
        "zion": ["zion"],
    }
    
    for lang, aliases in aliases_map.items():
        if lang in valid_grammars:
            aliases_str = ', '.join(f'"{a}"' for a in aliases)
            code += f'        registry.register_aliases("{lang}", &[{aliases_str}]);\n'
    
    code += '''        
        registry
    }
    
    /// Register a language with its tree-sitter Language.
    pub fn register(&mut self, name: &str, language: Language) {
        self.languages.insert(name.to_lowercase(), language);
    }
    
    /// Register aliases for a language.
    pub fn register_aliases(&mut self, canonical: &str, aliases: &[&str]) {
        for alias in aliases {
            self.aliases.insert(alias.to_lowercase(), canonical.to_lowercase());
        }
    }
    
    /// Get a language by name or alias.
    ///
    /// Returns `Some(Language)` if found, `None` otherwise.
    pub fn get_language(&self, name: &str) -> Option<Language> {
        let name_lower = name.to_lowercase();
        
        // Try direct lookup first
        if let Some(lang) = self.languages.get(&name_lower) {
            return Some(lang.clone());
        }
        
        // Try alias lookup
        if let Some(canonical) = self.aliases.get(&name_lower) {
            return self.languages.get(canonical).map(|l| l.clone());
        }
        
        None
    }
    
    /// Check if a language is supported.
    pub fn is_supported(&self, name: &str) -> bool {
        self.get_language(name).is_some()
    }
    
    /// Get list of all supported language names.
    pub fn supported_languages(&self) -> Vec<&str> {
        self.languages.keys().map(|s| s.as_str()).collect()
    }
}

impl Default for LanguageRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_registry_creation() {
        let registry = LanguageRegistry::new();
        assert!(registry.languages.len() > 0);
    }
    
    #[test]
    fn test_get_language() {
        let registry = LanguageRegistry::new();
        // Test a common language
        if registry.is_supported("rust") {
            assert!(registry.get_language("rust").is_some());
        }
    }
    
    #[test]
    fn test_aliases() {
        let registry = LanguageRegistry::new();
        if registry.is_supported("javascript") {
            assert!(registry.get_language("js").is_some());
        }
    }
    
    #[test]
    fn test_is_supported() {
        let registry = LanguageRegistry::new();
        // Should handle unknown languages
        assert!(!registry.is_supported("unknown_language_xyz"));
    }
}
'''
    
    return code


def main():
    print("=== Preparing Tree-sitter Grammars ===\n")
    
    # Create directories
    GRAMMARS_DIR.mkdir(parents=True, exist_ok=True)
    QUERIES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Read languages.toml
    print("Reading languages.toml...")
    with open(LANGUAGES_TOML, 'r', encoding='utf-8') as f:
        content = f.read()
    
    grammars = parse_languages_toml(content)
    print(f"Found {len(grammars)} grammar definitions\n")
    
    # Filter out excluded grammars
    grammars = {k: v for k, v in grammars.items() if k not in EXCLUDED_GRAMMARS}
    print(f"After exclusions: {len(grammars)} grammars\n")
    
    # Download grammars
    print("=== Downloading Grammars ===\n")
    success_count = 0
    for name, info in sorted(grammars.items()):
        if download_grammar(name, info):
            success_count += 1
    
    print(f"\nDownloaded {success_count}/{len(grammars)} grammars\n")
    
    # Download highlights.scm files
    print("=== Downloading Highlights ===\n")
    for name in sorted(grammars.keys()):
        download_highlights_scm(name)
    
    # Generate Rust code
    print("\n=== Generating Rust Code ===\n")
    
    # Read existing files to check if we need to update
    build_rs_content = generate_build_rs(grammars)
    registry_rs_content = generate_registry_code(grammars)
    
    print(f"Writing build.rs...")
    with open(BUILD_RS, 'w', encoding='utf-8') as f:
        f.write(build_rs_content)
    
    print(f"Writing registry.rs...")
    with open(REGISTRY_RS, 'w', encoding='utf-8') as f:
        f.write(registry_rs_content)
    
    print("\n=== Done ===")
    print(f"Grammars directory: {GRAMMARS_DIR}")
    print(f"Queries directory: {QUERIES_DIR}")


if __name__ == "__main__":
    main()
