#!/usr/bin/env python3
"""
Download tree-sitter grammars using curl for better SSL handling.
"""

import json
import os
import re
import subprocess
import zipfile
import io
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


def download_with_curl(url: str, timeout: int = 120) -> bytes:
    """Download using curl which handles SSL better on Windows."""
    result = subprocess.run(
        ["curl", "-sL", "-f", "--connect-timeout", "30", "-m", str(timeout), url],
        capture_output=True
    )
    if result.returncode != 0:
        raise Exception(f"curl failed with code {result.returncode}")
    return result.stdout


def download_grammar(name: str, info: dict) -> tuple:
    """Download a grammar from git repository using curl."""
    target_dir = GRAMMARS_DIR / name
    
    if target_dir.exists():
        return (name, True, "exists", info.get("subpath", ""))
    
    git_url = info["git"]
    rev = info["rev"]
    subpath = info.get("subpath", "")
    
    # Convert git URL to archive URL
    if git_url.startswith("https://github.com/"):
        archive_url = f"{git_url.rstrip('/')}/archive/{rev}.zip"
    elif git_url.startswith("https://gitlab.com/"):
        archive_url = f"{git_url.rstrip('/')}/-/archive/{rev}/{git_url.split('/')[-1]}-{rev}.zip"
    else:
        return (name, False, "unsupported host", "")
    
    try:
        zip_data = download_with_curl(archive_url)
        
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
        
        return (name, True, "downloaded", subpath)
        
    except Exception as e:
        return (name, False, str(e), "")


def download_highlights_scm(name: str) -> tuple:
    """Download highlights.scm from Helix runtime queries."""
    target_file = QUERIES_DIR / name / "highlights.scm"
    
    if target_file.exists():
        return (name, True)
    
    target_file.parent.mkdir(parents=True, exist_ok=True)
    
    url = f"{HELIX_RUNTIME_URL}/{name}/highlights.scm"
    
    try:
        content = download_with_curl(url, timeout=30)
        with open(target_file, 'wb') as f:
            f.write(content)
        return (name, True)
    except Exception:
        # Create empty file
        with open(target_file, 'w', encoding='utf-8') as f:
            f.write("; No highlights available\n")
        return (name, True)


def main():
    print("=== Downloading All Tree-sitter Grammars (using curl) ===\n")
    
    GRAMMARS_DIR.mkdir(parents=True, exist_ok=True)
    QUERIES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Reading languages.toml...")
    with open(LANGUAGES_TOML, 'r', encoding='utf-8') as f:
        content = f.read()
    
    grammars = parse_languages_toml(content)
    grammars = {k: v for k, v in grammars.items() if k not in EXCLUDED_GRAMMARS}
    print(f"Found {len(grammars)} grammars to process\n")
    
    # Download grammars with threading
    print("Downloading grammars...")
    
    downloaded = 0
    existed = 0
    failed = []
    valid_grammars = []
    
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(download_grammar, name, info): name for name, info in grammars.items()}
        
        for i, future in enumerate(as_completed(futures), 1):
            name, success, status, subpath = future.result()
            if success:
                if status == "exists":
                    existed += 1
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
    
    # Download highlights.scm files
    print("\nDownloading highlights.scm files...")
    hl_count = 0
    for name in grammars.keys():
        _, success = download_highlights_scm(name)
        if success:
            hl_count += 1
    
    print(f"Highlights: {hl_count} processed")
    
    # Save grammar info
    grammar_info = {name: {"subpath": subpath} for name, subpath in valid_grammars}
    with open(GRAMMAR_INFO, 'w') as f:
        json.dump(grammar_info, f, indent=2)
    
    print(f"\n=== Done ===")
    print(f"Valid grammars: {len(valid_grammars)}")
    print(f"Grammar info saved to: {GRAMMAR_INFO}")


if __name__ == "__main__":
    main()
