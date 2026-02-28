#!/usr/bin/env python3
"""
Download tree-sitter grammars using git clone.
"""

import json
import os
import re
import subprocess
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
LANGUAGES_TOML = Path(__file__).parent.parent / "src-tauri" / "languages.toml"
GRAMMARS_DIR = Path(__file__).parent.parent / "src-tauri" / "grammars"
QUERIES_DIR = Path(__file__).parent.parent / "src-tauri" / "queries"
GRAMMAR_INFO = Path(__file__).parent.parent / "src-tauri" / "grammar_info.json"

# Helix runtime queries URL
HELIX_RUNTIME_URL = "https://raw.githubusercontent.com/helix-editor/helix/master/runtime/queries"

# Grammars to exclude
EXCLUDED_GRAMMARS = {
    "wren", "gemini",
}


def parse_languages_toml(content: str) -> dict:
    """Parse languages.toml and extract grammar definitions."""
    grammars = {}
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
                    source_line = line
                    while '}' not in source_line and i + 1 < len(lines):
                        i += 1
                        source_line += ' ' + lines[i].strip()
                    
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


def download_grammar_git(name: str, info: dict) -> tuple:
    """Download a grammar using git clone."""
    target_dir = GRAMMARS_DIR / name
    
    if target_dir.exists():
        return (name, True, "exists", info.get("subpath", ""))
    
    git_url = info["git"]
    rev = info["rev"]
    subpath = info.get("subpath", "")
    
    # Create temp directory for cloning
    temp_dir = GRAMMARS_DIR / f".tmp_{name}"
    
    try:
        # Clone with depth 1 and specific revision
        result = subprocess.run(
            ["git", "clone", "--depth", "1", "--branch", rev, git_url, str(temp_dir)],
            capture_output=True,
            text=True,
            timeout=120
        )
        
        if result.returncode != 0:
            # Try without branch flag (for older git versions or commit hashes)
            result = subprocess.run(
                ["git", "clone", "--depth", "50", git_url, str(temp_dir)],
                capture_output=True,
                text=True,
                timeout=180
            )
            
            if result.returncode != 0:
                return (name, False, f"git clone failed: {result.stderr[:100]}", "")
            
            # Checkout specific revision
            subprocess.run(["git", "checkout", rev], cwd=temp_dir, capture_output=True, timeout=30)
        
        # Copy the required files
        if subpath:
            src_dir = temp_dir / subpath
        else:
            src_dir = temp_dir
        
        # Copy src directory
        src_path = src_dir / "src"
        if src_path.exists():
            target_src = target_dir / "src"
            shutil.copytree(src_path, target_src)
        
        # Copy queries if available
        queries_path = src_dir / "queries"
        if queries_path.exists():
            target_queries = QUERIES_DIR / name
            if not target_queries.exists():
                shutil.copytree(queries_path, target_queries)
        
        # Cleanup temp
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        return (name, True, "downloaded", subpath)
        
    except subprocess.TimeoutExpired:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return (name, False, "timeout", "")
    except Exception as e:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return (name, False, str(e)[:100], "")


def download_highlights_git(name: str) -> tuple:
    """Download highlights.scm from Helix runtime using git."""
    target_file = QUERIES_DIR / name / "highlights.scm"
    
    if target_file.exists():
        return (name, True)
    
    target_file.parent.mkdir(parents=True, exist_ok=True)
    
    try:
        # Use git to fetch raw file
        url = f"{HELIX_RUNTIME_URL}/{name}/highlights.scm"
        result = subprocess.run(
            ["git", "cat-file", "-p", f"origin/master:runtime/queries/{name}/highlights.scm"],
            capture_output=True,
            cwd=GRAMMARS_DIR,
            timeout=30
        )
        
        if result.returncode == 0:
            with open(target_file, 'wb') as f:
                f.write(result.stdout)
            return (name, True)
    except:
        pass
    
    # Create empty file
    with open(target_file, 'w', encoding='utf-8') as f:
        f.write("; No highlights available\n")
    return (name, True)


def main():
    print("=== Downloading All Tree-sitter Grammars (using git) ===\n")
    
    GRAMMARS_DIR.mkdir(parents=True, exist_ok=True)
    QUERIES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Reading languages.toml...")
    with open(LANGUAGES_TOML, 'r', encoding='utf-8') as f:
        content = f.read()
    
    grammars = parse_languages_toml(content)
    grammars = {k: v for k, v in grammars.items() if k not in EXCLUDED_GRAMMARS}
    print(f"Found {len(grammars)} grammars to process\n")
    
    # Download grammars sequentially (git doesn't parallelize well)
    print("Downloading grammars...")
    
    downloaded = 0
    existed = 0
    failed = []
    valid_grammars = []
    
    for i, (name, info) in enumerate(sorted(grammars.items()), 1):
        success, status, subpath = False, "", ""
        
        try:
            name, success, status, subpath = download_grammar_git(name, info)
        except Exception as e:
            status = str(e)[:50]
        
        if success:
            if status == "exists":
                existed += 1
                subpath = info.get("subpath", "")
            else:
                downloaded += 1
                print(f"  [{i}/{len(grammars)}] + {name}")
            
            # Check if parser.c exists
            src_dir = GRAMMARS_DIR / name / "src"
            if subpath:
                src_dir = GRAMMARS_DIR / name / subpath / "src"
            if src_dir.exists() and (src_dir / "parser.c").exists():
                valid_grammars.append((name, subpath))
        else:
            failed.append((name, status))
            print(f"  [{i}/{len(grammars)}] X {name}: {status[:50]}")
    
    print(f"\nGrammars: {downloaded} downloaded, {existed} existed, {len(failed)} failed")
    print(f"Valid grammars with parser.c: {len(valid_grammars)}")
    
    # Save grammar info
    grammar_info = {name: {"subpath": subpath} for name, subpath in valid_grammars}
    with open(GRAMMAR_INFO, 'w') as f:
        json.dump(grammar_info, f, indent=2)
    
    print(f"\n=== Done ===")
    print(f"Valid grammars: {len(valid_grammars)}")
    print(f"Grammar info saved to: {GRAMMAR_INFO}")


if __name__ == "__main__":
    main()
