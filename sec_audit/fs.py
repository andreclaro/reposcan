import os
from pathlib import Path
from typing import Dict, Iterable, List

# Shared ignore list for language detection, Dockerfile search, and Terraform detection
DEFAULT_IGNORE_DIRS = frozenset({
    ".git",
    ".hg",
    ".svn",
    "__pycache__",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    "vendor",
    "target",
    "coverage",
    "out",
    ".next",
    ".cache",
    ".idea",
    ".vscode",
})


def iter_repo_files(repo_dir: Path, ignore_dirs: Iterable[str]) -> Iterable[Path]:
    ignore_set = set(ignore_dirs)
    for root, dirs, files in os.walk(repo_dir):
        dirs[:] = [d for d in dirs if d not in ignore_set]
        for filename in files:
            yield Path(root) / filename


def detect_languages(repo_dir: Path) -> Dict[str, int]:
    extension_map = {
        ".py": "Python",
        ".js": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".jsx": "JavaScript",
        ".java": "Java",
        ".kt": "Kotlin",
        ".go": "Go",
        ".rb": "Ruby",
        ".php": "PHP",
        ".cs": "C#",
        ".cpp": "C++",
        ".cxx": "C++",
        ".cc": "C++",
        ".c": "C",
        ".h": "C/C++ Header",
        ".hpp": "C/C++ Header",
        ".rs": "Rust",
        ".swift": "Swift",
        ".m": "Objective-C",
        ".mm": "Objective-C++",
        ".scala": "Scala",
        ".sh": "Shell",
        ".ps1": "PowerShell",
        ".sql": "SQL",
        ".html": "HTML",
        ".css": "CSS",
        ".scss": "SCSS",
        ".less": "Less",
        ".json": "JSON",
        ".yml": "YAML",
        ".yaml": "YAML",
        ".xml": "XML",
        ".md": "Markdown",
        ".tf": "Terraform",
        ".tfvars": "Terraform",
        ".dockerfile": "Dockerfile",
        ".gradle": "Gradle",
        ".groovy": "Groovy",
    }

    counts: Dict[str, int] = {}
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        name_lower = file_path.name.lower()
        suffix = file_path.suffix.lower()
        if name_lower == "dockerfile":
            language = "Dockerfile"
        else:
            language = extension_map.get(suffix)
        if not language:
            continue
        counts[language] = counts.get(language, 0) + 1
    return counts


def find_dockerfiles(repo_dir: Path) -> List[Path]:
    dockerfiles = []
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        if file_path.name.lower() == "dockerfile":
            dockerfiles.append(file_path)
    return dockerfiles


def has_terraform(repo_dir: Path) -> bool:
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        if file_path.suffix.lower() == ".tf":
            return True
    return False
