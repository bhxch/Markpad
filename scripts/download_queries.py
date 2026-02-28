#!/usr/bin/env python3
"""
Download highlights.scm query files from Helix runtime.
"""

import json
import subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# Paths
GRAMMAR_INFO = Path(__file__).parent.parent / "src-tauri" / "grammar_info.json"
QUERIES_DIR = Path(__file__).parent.parent / "src-tauri" / "queries"
GRAMMARS_DIR = Path(__file__).parent.parent / "src-tauri" / "grammars"

# Helix queries repo
HELIX_QUERIES_REPO = "https://github.com/helix-editor/helix.git"
HELIX_QUERIES_DIR = Path(__file__).parent.parent / ".helix_queries"


def get_helix_queries():
    """Clone or update Helix repo to get queries."""
    if not HELIX_QUERIES_DIR.exists():
        print("Cloning Helix repo for queries...")
        subprocess.run(
            ["git", "clone", "--depth", "1", HELIX_QUERIES_REPO, str(HELIX_QUERIES_DIR)],
            capture_output=True,
            timeout=300
        )
    return HELIX_QUERIES_DIR / "runtime" / "queries"


def copy_queries_from_grammar(name: str, subpath: str) -> bool:
    """Copy queries from grammar repository if available."""
    grammar_dir = GRAMMARS_DIR / name
    if subpath:
        queries_src = grammar_dir / subpath / "queries"
    else:
        queries_src = grammar_dir / "queries"
    
    if queries_src.exists():
        queries_dst = QUERIES_DIR / name
        if not queries_dst.exists():
            import shutil
            shutil.copytree(queries_src, queries_dst)
            return True
    return False


def copy_query_from_helix(name: str, helix_queries_dir: Path) -> bool:
    """Copy highlights.scm from Helix runtime."""
    helix_query_dir = helix_queries_dir / name
    highlights = helix_query_dir / "highlights.scm"
    
    if highlights.exists():
        queries_dst = QUERIES_DIR / name
        queries_dst.mkdir(parents=True, exist_ok=True)
        
        import shutil
        shutil.copy(highlights, queries_dst / "highlights.scm")
        
        # Also copy injections.scm if available
        injections = helix_query_dir / "injections.scm"
        if injections.exists():
            shutil.copy(injections, queries_dst / "injections.scm")
        
        return True
    return False


def create_empty_highlights(name: str) -> bool:
    """Create an empty highlights.scm file."""
    queries_dst = QUERIES_DIR / name
    queries_dst.mkdir(parents=True, exist_ok=True)
    
    highlights = queries_dst / "highlights.scm"
    if not highlights.exists():
        with open(highlights, 'w') as f:
            f.write(f"; Highlights for {name}\n; No highlights defined\n")
        return True
    return False


def main():
    print("=== Setting up Query Files ===\n")
    
    QUERIES_DIR.mkdir(parents=True, exist_ok=True)
    
    print("Reading grammar_info.json...")
    with open(GRAMMAR_INFO, 'r') as f:
        grammars = json.load(f)
    print(f"Found {len(grammars)} grammars\n")
    
    # Get Helix queries
    helix_queries_dir = get_helix_queries()
    
    from_grammar = 0
    from_helix = 0
    created_empty = 0
    already_exists = 0
    
    for name, info in sorted(grammars.items()):
        subpath = info.get("subpath", "")
        query_dir = QUERIES_DIR / name
        highlights = query_dir / "highlights.scm"
        
        if highlights.exists():
            already_exists += 1
            continue
        
        # Try grammar source first
        if copy_queries_from_grammar(name, subpath):
            from_grammar += 1
            print(f"  [grammar] {name}")
            continue
        
        # Try Helix runtime
        if helix_queries_dir and copy_query_from_helix(name, helix_queries_dir):
            from_helix += 1
            print(f"  [helix] {name}")
            continue
        
        # Create empty
        if create_empty_highlights(name):
            created_empty += 1
            print(f"  [empty] {name}")
    
    print(f"\nQueries: {from_grammar} from grammar, {from_helix} from Helix, {created_empty} created empty, {already_exists} already existed")
    print(f"Total languages with queries: {len(grammars)}")


if __name__ == "__main__":
    main()
