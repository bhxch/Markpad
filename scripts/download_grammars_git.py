#!/usr/bin/env python3
"""
Download tree-sitter grammars using git clone.
Also downloads query files (highlights, injections, locals) from Helix runtime,
with support for Helix-style '; inherits:' directive resolution.
"""

import json
import os
import re
import subprocess
import shutil
import urllib.request
import urllib.error
from pathlib import Path

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

# Query file types used by the highlight engine
QUERY_FILE_TYPES = ["highlights.scm", "injections.scm", "locals.scm"]


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
            # For grammars with subpath, build.rs expects grammars/<name>/<subpath>/src/
            if subpath:
                target_src = target_dir / subpath / "src"
            else:
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


def download_file_from_helix(lang_name: str, file_name: str, force: bool = False) -> bool:
    """Download a query file from Helix runtime via HTTP.

    Args:
        lang_name: Language directory name (e.g. 'cpp', 'ecma', '_typescript')
        file_name: File name (e.g. 'highlights.scm', 'injections.scm')
        force: If True, overwrite existing files with Helix version

    Returns:
        True if file exists (either already or just downloaded)
    """
    target_file = QUERIES_DIR / lang_name / file_name

    if target_file.exists() and not force:
        return True

    target_file.parent.mkdir(parents=True, exist_ok=True)

    url = f"{HELIX_RUNTIME_URL}/{lang_name}/{file_name}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "markpad-build/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                with open(target_file, 'wb') as f:
                    f.write(resp.read())
                return True
    except (urllib.error.HTTPError, urllib.error.URLError, Exception):
        pass

    # Only create empty placeholder for highlights.scm
    if file_name == "highlights.scm" and not target_file.exists():
        with open(target_file, 'w', encoding='utf-8') as f:
            f.write("; No highlights available\n")

    return target_file.exists()


def parse_inherits(content: str) -> list[str]:
    """Parse '; inherits:' directive from query file content.

    Returns list of parent directory names.
    """
    for line in content.split('\n'):
        line = line.strip()
        if line.startswith("; inherits:"):
            parts = line[len("; inherits:"):].strip()
            parents = [p.strip() for p in parts.split(',') if p.strip()]
            return parents
        # Stop at first non-comment line
        if not line.startswith(';') and line:
            break
    return []


def resolve_inheritance(lang_name: str, force: bool = False) -> set[str]:
    """Download query files for a language and resolve all inheritance.

    Downloads highlights.scm, injections.scm, locals.scm from Helix.
    Parses '; inherits:' directives and recursively downloads parent directories.

    Args:
        lang_name: Language name
        force: If True, overwrite existing files with Helix version

    Returns:
        Set of all directory names that were resolved (including parents)
    """
    resolved = set()

    def _resolve(name: str):
        if name in resolved:
            return
        resolved.add(name)

        # Download all query file types from Helix
        for file_type in QUERY_FILE_TYPES:
            download_file_from_helix(name, file_type, force=force)

        # Parse inheritance from highlights.scm
        highlights_path = QUERIES_DIR / name / "highlights.scm"
        if highlights_path.exists():
            content = highlights_path.read_text(encoding='utf-8')
            parents = parse_inherits(content)
            for parent in parents:
                _resolve(parent)

    _resolve(lang_name)
    return resolved


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

    # Download query files from Helix and resolve inheritance
    print("\nDownloading query files from Helix (with inheritance resolution)...")
    highlights_ok = 0
    highlights_missing = 0
    all_inherited_dirs = set()

    for name, _ in valid_grammars:
        resolved = resolve_inheritance(name, force=False)
        inherited = resolved - {name}
        if inherited:
            all_inherited_dirs.update(inherited)

        target_file = QUERIES_DIR / name / "highlights.scm"
        if target_file.exists():
            content = target_file.read_text().strip()
            if content == "; No highlights available":
                highlights_missing += 1
            else:
                highlights_ok += 1

    if all_inherited_dirs:
        print(f"  Inherited query directories resolved: {sorted(all_inherited_dirs)}")
    print(f"Highlights: {highlights_ok} ok, {highlights_missing} unavailable in Helix")

    # Save grammar info
    grammar_info = {name: {"subpath": subpath} for name, subpath in valid_grammars}
    with open(GRAMMAR_INFO, 'w') as f:
        json.dump(grammar_info, f, indent=2)

    print(f"\n=== Done ===")
    print(f"Valid grammars: {len(valid_grammars)}")
    print(f"Grammar info saved to: {GRAMMAR_INFO}")


if __name__ == "__main__":
    main()
