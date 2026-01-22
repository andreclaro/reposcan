import subprocess
from pathlib import Path


def repo_name(repo: str) -> str:
    name = Path(repo).name
    if name.endswith(".git"):
        name = name[:-4]
    return name


def ensure_audit_dirs(audit_root: Path, repo_slug: str) -> Path:
    audit_root.mkdir(parents=True, exist_ok=True)
    repo_audit_dir = audit_root / repo_slug
    repo_audit_dir.mkdir(parents=True, exist_ok=True)
    return repo_audit_dir


def clone_repo(repo: str, dest_dir: Path, branch: str, skip_lfs: bool) -> None:
    if (dest_dir / ".git").is_dir():
        print(f"Already cloned, skipping: {repo}")
        return
    print(f"Cloning {repo} -> {dest_dir}")
    git_cmd = ["git"]
    if skip_lfs:
        git_cmd.extend(
            [
                "-c",
                "filter.lfs.smudge=",
                "-c",
                "filter.lfs.process=",
                "-c",
                "filter.lfs.required=false",
            ]
        )

    git_cmd.append("clone")
    if branch:
        git_cmd.extend(["--branch", branch])
    git_cmd.extend([repo, str(dest_dir)])
    subprocess.run(git_cmd, check=True)
