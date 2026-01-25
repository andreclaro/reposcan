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
    
    try:
        subprocess.run(
            git_cmd,
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        stdout_text = e.stdout.strip() if e.stdout else ""
        stderr_text = e.stderr.strip() if e.stderr else ""
        if stdout_text and stderr_text:
            error_msg = f"{stdout_text}\n{stderr_text}"
        else:
            error_msg = stdout_text or stderr_text or str(e)
        raise RuntimeError(
            f"Failed to clone repository {repo} (branch: {branch}): {error_msg}"
        ) from e


def update_submodules_if_present(dest_dir: Path) -> None:
    if not (dest_dir / ".gitmodules").is_file():
        return
    print(f"Updating submodules in: {dest_dir}")
    subprocess.run(
        [
            "git",
            "-C",
            str(dest_dir),
            "submodule",
            "update",
            "--init",
            "--recursive",
        ],
        check=True,
    )


def get_commit_hash(repo_path: Path, branch: str = "HEAD") -> str:
    """Get the commit hash for the current HEAD or specified branch."""
    result = subprocess.run(
        ["git", "-C", str(repo_path), "rev-parse", branch],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()
