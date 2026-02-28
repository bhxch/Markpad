#!/usr/bin/env python3
"""
Simplified script to download all grammars and generate Rust code.
Run this after prepare_all_grammars.py has been run once.
"""

import json
import os
import re
import urllib.request
import zipfile
import io
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Configuration
LANGUAGES_TOML = Path(__file__).parent.parent / "src-tauri" / "languages.toml"
GRAMMARS_DIR = Path(__file__).parent.parent / "src-tauri" / "grammars"
QUERIES_DIR = Path(__file__).parent.parent / "src-tauri" / "queries"

# Helix runtime queries URL
HELIX_RUNTIME_URL = "https://raw.githubusercontent.com/helix-editor/helix/master/runtime/queries"

# Grammars to exclude
EXCLUDED_GRAMMARS = {
    "wren", "gemini",  # Explicitly excluded in Helix config
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


def download_grammar(name: str, info: dict) -> tuple:
    """Download a grammar from git repository. Returns (name, success)."""
    target_dir = GRAMMARS_DIR / name
    
    if target_dir.exists():
        return (name, True, "exists")
    
    git_url = info["git"]
    rev = info["rev"]
    subpath = info.get("subpath", "")
    
    # Convert git URL to archive URL
    if git_url.startswith("https://github.com/"):
        archive_url = f"{git_url.rstrip('/')}/archive/{rev}.zip"
    elif git_url.startswith("https://gitlab.com/"):
        archive_url = f"{git_url.rstrip('/')}/-/archive/{rev}/{git_url.split('/')[-1]}-{rev}.zip"
    else:
        return (name, False, "unsupported host")
    
    try:
        req = urllib.request.Request(archive_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=120) as response:
            zip_data = response.read()
        
        with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
            root_dir = zf.namelist()[0].split('/')[0]
            
            if subpath:
                prefix = f"{root_dir}/{subpath}/"
                for member in zf.namelist():
                    if member.startswith(prefix):
                        rel_path = member[len(prefix):]
                        if rel_path:
                            target_path = target_dir / rel_path
                            if member.endswith('/'):
                                target_path.mkdir(parents=True, exist_ok=True)
                            else:
                                target_path.parent.mkdir(parents=True, exist_ok=True)
                                with zf.open(member) as src, open(target_path, 'wb') as dst:
                                    dst.write(src.read())
            else:
                for member in zf.namelist():
                    rel_path = member[len(root_dir) + 1:]
                    if rel_path:
                        target_path = target_dir / rel_path
                        if member.endswith('/'):
                            target_path.mkdir(parents=True, exist_ok=True)
                        else:
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with zf.open(member) as src, open(target_path, 'wb') as dst:
                                dst.write(src.read())
        
        return (name, True, "downloaded")
        
    except Exception as e:
        return (name, False, str(e))


def download_highlights_scm(name: str) -> tuple:
    """Download highlights.scm from Helix runtime queries."""
    target_file = QUERIES_DIR / name / "highlights.scm"
    
    if target_file.exists():
        return (name, True, "exists")
    
    target_file.parent.mkdir(parents=True, exist_ok=True)
    
    url = f"{HELIX_RUNTIME_URL}/{name}/highlights.scm"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=30) as response:
            content = response.read().decode('utf-8')
        
        with open(target_file, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return (name, True, "downloaded")
        
    except urllib.error.HTTPError as e:
        if e.code == 404:
            with open(target_file, 'w', encoding='utf-8') as f:
                f.write("; No highlights available\n")
            return (name, True, "empty")
        return (name, False, str(e))
    except Exception as e:
        return (name, False, str(e))


def main():
    print("=== Downloading All Tree-sitter Grammars ===\n")
    
    GRAMMARS_DIR.mkdir(parents=True, exist_ok=True)
    QUERIES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Reading languages.toml...")
    with open(LANGUAGES_TOML, 'r', encoding='utf-8') as f:
        content = f.read()
    
    grammars = parse_languages_toml(content)
    grammars = {k: v for k, v in grammars.items() if k not in EXCLUDED_GRAMMARS}
    print(f"Found {len(grammars)} grammars to download\n")
    
    # Download grammars with threading
    print("Downloading grammars (this may take a while)...")
    
    downloaded = 0
    existed = 0
    failed = []
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download_grammar, name, info): name for name, info in grammars.items()}
        
        for i, future in enumerate(as_completed(futures), 1):
            name, success, status = future.result()
            if success:
                if status == "exists":
                    existed += 1
                else:
                    downloaded += 1
                    print(f"  [{i}/{len(grammars)}] Downloaded: {name}")
            else:
                failed.append((name, status))
                print(f"  [{i}/{len(grammars)}] FAILED: {name} - {status}")
    
    print(f"\nGrammars: {downloaded} downloaded, {existed} existed, {len(failed)} failed")
    
    # Download highlights.scm files
    print("\nDownloading highlights.scm files...")
    
    hl_downloaded = 0
    hl_failed = []
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(download_highlights_scm, name): name for name in grammars.keys()}
        
        for future in as_completed(futures):
            name, success, status = future.result()
            if success:
                if status == "downloaded":
                    hl_downloaded += 1
            else:
                hl_failed.append((name, status))
    
    print(f"Highlights: {hl_downloaded} downloaded, {len(hl_failed)} failed")
    
    # Count valid grammars (those with parser.c)
    valid_grammars = []
    for name, info in sorted(grammars.items()):
        src_dir = GRAMMARS_DIR / name / "src"
        if not src_dir.exists():
            subpath = info.get("subpath", "")
            if subpath:
                src_dir = GRAMMARS_DIR / name / subpath / "src"
        
        if src_dir.exists() and (src_dir / "parser.c").exists():
            valid_grammars.append((name, info.get("subpath", "")))
    
    print(f"\nValid grammars with parser.c: {len(valid_grammars)}")
    
    # Save grammar info for build.rs generation
    grammar_info = {name: {"subpath": subpath} for name, subpath in valid_grammars}
    with open(Path(__file__).parent.parent / "src-tauri" / "grammar_info.json", 'w') as f:
        json.dump(grammar_info, f, indent=2)
    
    print("\n=== Done ===")
    print(f"Grammar info saved to: src-tauri/grammar_info.json")


if __name__ == "__main__":
    main()
