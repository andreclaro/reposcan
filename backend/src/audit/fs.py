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


def has_git_history(repo_dir: Path) -> bool:
    """Check if repository has git history (for secret scanning)."""
    git_dir = repo_dir / ".git"
    return git_dir.exists() and git_dir.is_dir()


def has_osv_supported_lockfiles(repo_dir: Path) -> tuple[bool, list[str]]:
    """Check for lockfiles that OSV-Scanner can analyze.
    
    Returns:
        Tuple of (has_supported_lockfiles, list_of_lockfile_types)
        Only returns True for languages WITHOUT dedicated scanners (Python, Java, .NET).
        Skips Node.js (npm audit), Go (govulncheck), and Rust (cargo-audit).
    """
    supported_lockfiles = {
        # Python
        "requirements.txt": "requirements.txt",
        "Pipfile.lock": "Pipfile.lock",
        "poetry.lock": "poetry.lock",
        # Java
        "pom.xml": "pom.xml",
        "gradle.lockfile": "gradle.lockfile",
        # .NET
        "packages.lock.json": "packages.lock.json",
        # PHP
        "composer.lock": "composer.lock",
    }
    
    found_types = []
    
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        filename = file_path.name
        if filename in supported_lockfiles:
            lockfile_type = supported_lockfiles[filename]
            if lockfile_type not in found_types:
                found_types.append(lockfile_type)
    
    return len(found_types) > 0, found_types


def has_python_files(repo_dir: Path) -> bool:
    """Check if repository contains Python files for Bandit scanning."""
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        if file_path.suffix.lower() == ".py":
            return True
    return False


def has_kubernetes_manifests(repo_dir: Path) -> bool:
    """Check if repository contains Kubernetes YAML/JSON manifests."""
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        # Check for .yaml/.yml files that might be K8s manifests
        if file_path.suffix.lower() in (".yaml", ".yml", ".json"):
            # Simple heuristic: check first few lines for K8s indicators
            try:
                with file_path.open("r", encoding="utf-8", errors="ignore") as f:
                    content = f.read(2000)  # Read first 2KB
                    if any(indicator in content for indicator in [
                        "apiVersion:",
                        "kind:",
                        "Service",
                        "Deployment",
                        "Pod",
                        "ConfigMap",
                        "Secret",
                        "Ingress",
                        "StatefulSet",
                        "DaemonSet",
                    ]):
                        return True
            except Exception:
                continue
    return False


def has_docker_compose(repo_dir: Path) -> bool:
    """Check if repository contains Docker Compose files."""
    compose_names = {
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
    }
    for file_path in iter_repo_files(repo_dir, DEFAULT_IGNORE_DIRS):
        if file_path.name.lower() in compose_names:
            return True
    return False
