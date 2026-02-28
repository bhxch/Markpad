import os
import json
import subprocess
import sys
from pathlib import Path

DEFAULT_GRAMMARS = [
    "rust", "javascript", "python", "typescript", "go",
    "c", "cpp", "java", "json", "html", "css", "bash", "tsx", "markdown", "yaml", "toml"
]

def parse_grammars(toml_path):
    grammars = {}
    with open(toml_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
    current = None
    for line in lines:
        s = line.strip()
        if s == "[[grammar]]":
            current = {}
        elif current is not None:
            if s.startswith("name = "):
                current["name"] = s.split("=", 1)[1].strip().strip('"')
            elif s.startswith("source = "):
                src = s.split("=", 1)[1].strip().strip("{}")
                for p in src.split(","):
                    p = p.strip()
                    if p.startswith("git = "):
                        current["git"] = p.split("=", 1)[1].strip().strip('"')
                    elif p.startswith("rev = "):
                        current["rev"] = p.split("=", 1)[1].strip().strip('"')
                    elif p.startswith("subpath = "):
                        current["subpath"] = p.split("=", 1)[1].strip().strip('"')
                if "name" in current and "git" in current and "rev" in current:
                    grammars[current["name"]] = {
                        "git": current["git"],
                        "rev": current["rev"],
                        "subpath": current.get("subpath", "")
                    }
                current = None
    return grammars

def download_grammar(name, config, grammars_dir):
    git_url = config["git"]
    rev = config["rev"]
    subpath = config.get("subpath", "")
    dir_name = name.replace("-", "_")
    grammar_path = grammars_dir / dir_name
    if grammar_path.exists():
        print(f"Grammar {name} exists")
        return grammar_path
    print(f"Downloading {name} from {git_url}...")
    temp_dir = grammars_dir / f"_temp_{dir_name}"
    result = subprocess.run(["git", "clone", git_url, str(temp_dir)], capture_output=True)
    if result.returncode != 0:
        print(f"Clone failed for {name}: {result.stderr.decode()}")
        return None
    subprocess.run(["git", "-C", str(temp_dir), "checkout", rev], capture_output=True)
    
    # For grammars with subpath, copy the whole repo (needed for includes)
    # but mark the subpath for build.rs
    source_dir = temp_dir
    if subpath:
        # Keep the whole repo structure for proper include paths
        pass
    
    grammar_path.mkdir(parents=True, exist_ok=True)
    for item in source_dir.iterdir():
        dst = grammar_path / item.name
        if item.is_dir():
            subprocess.run(["xcopy", "/E", "/I", "/Y", str(item), str(dst)], shell=True)
        else:
            subprocess.run(["copy", "/Y", str(item), str(dst)], shell=True)
    
    # Clean up temp dir
    subprocess.run(["rmdir", "/S", "/Q", str(temp_dir)], shell=True)
    return grammar_path

def main():
    src_tauri = Path("E:/repos/0000/Markpad/src-tauri")
    grammars_dir = src_tauri / "grammars"
    grammars_dir.mkdir(exist_ok=True)
    all_g = parse_grammars(src_tauri / "languages.toml")
    print(f"Found {len(all_g)} grammars")
    selected = {k: v for k, v in all_g.items() if k in DEFAULT_GRAMMARS}
    print(f"Selected: {list(selected.keys())}")
    grammar_paths = {}
    for name, config in selected.items():
        path = download_grammar(name, config, grammars_dir)
        if path:
            grammar_paths[name] = str(path.relative_to(src_tauri))
    output = {"grammars": {name: {**config, "path": grammar_paths.get(name, "")} for name, config in selected.items()}}
    with open(src_tauri / "grammar_config.json", "w") as f:
        json.dump(output, f, indent=2)
    print("Done!")

if __name__ == "__main__":
    main()
