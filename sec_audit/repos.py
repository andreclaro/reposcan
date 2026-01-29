import subprocess
from pathlib import Path
from typing import Optional


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


def get_default_branch(repo: str) -> str:
    """
    Detect the default branch for a Git repository.
    
    Uses `git ls-remote --symref` to find the symbolic reference to HEAD,
    which points to the default branch.
    
    Args:
        repo: Repository URL (e.g., https://github.com/user/repo.git)
    
    Returns:
        Default branch name (e.g., 'main', 'master', 'develop')
    
    Raises:
        RuntimeError: If unable to detect the default branch
    """
    try:
        # Use --symref to get symbolic references
        result = subprocess.run(
            ["git", "ls-remote", "--symref", repo, "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,  # 30 second timeout
        )
        
        # Parse output: "ref: refs/heads/main\t<commit_hash>"
        # or "ref: refs/heads/master\t<commit_hash>"
        for line in result.stdout.strip().split("\n"):
            if line.startswith("ref:") and "refs/heads/" in line:
                # Extract branch name from "ref: refs/heads/BRANCH_NAME\t..."
                parts = line.split("refs/heads/")
                if len(parts) > 1:
                    branch = parts[1].split("\t")[0].strip()
                    if branch:
                        return branch
        
        # Fallback: try to get HEAD directly if symref doesn't work
        result = subprocess.run(
            ["git", "ls-remote", repo, "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        # If we get here, try to infer from common branch names
        # Check which branch HEAD points to by looking at refs
        result = subprocess.run(
            ["git", "ls-remote", repo],
            check=True,
            capture_output=True,
            text=True,
            timeout=30,
        )
        
        # Look for HEAD reference
        for line in result.stdout.strip().split("\n"):
            if "\tHEAD" in line or line.endswith("\tHEAD"):
                # Try common branch names
                for common_branch in ["main", "master", "develop", "trunk"]:
                    if f"refs/heads/{common_branch}" in result.stdout:
                        return common_branch
        
        # Last resort: return "main" as fallback
        return "main"
        
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"Timeout while detecting default branch for {repo}")
    except subprocess.CalledProcessError as e:
        raise RuntimeError(
            f"Failed to detect default branch for {repo}: {e.stderr or str(e)}"
        ) from e


def clone_repo(repo: str, dest_dir: Path, branch: Optional[str], skip_lfs: bool) -> str:
    """
    Clone a Git repository to the destination directory.
    
    Args:
        repo: Repository URL
        dest_dir: Destination directory path
        branch: Branch name to clone. If None, detects the default branch.
        skip_lfs: Whether to skip Git LFS files
    
    Returns:
        The branch name that was cloned (useful when branch was None and auto-detected)
    
    Raises:
        RuntimeError: If cloning fails
    """
    if (dest_dir / ".git").is_dir():
        print(f"Already cloned, skipping: {repo}")
        # Try to determine the current branch
        try:
            result = subprocess.run(
                ["git", "-C", str(dest_dir), "rev-parse", "--abbrev-ref", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError:
            return branch or "main"
    
    # Detect default branch if not specified
    requested_branch = branch
    if branch is None:
        print(f"Detecting default branch for {repo}...")
        branch = get_default_branch(repo)
        print(f"Detected default branch: {branch}")
    
    print(f"Cloning {repo} -> {dest_dir} (branch: {branch})")
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
    git_cmd.extend(["--branch", branch])
    git_cmd.extend([repo, str(dest_dir)])
    
    try:
        subprocess.run(
            git_cmd,
            check=True,
            capture_output=True,
            text=True,
        )
        return branch
    except subprocess.CalledProcessError as e:
        stdout_text = e.stdout.strip() if e.stdout else ""
        stderr_text = e.stderr.strip() if e.stderr else ""
        if stdout_text and stderr_text:
            error_msg = f"{stdout_text}\n{stderr_text}"
        else:
            error_msg = stdout_text or stderr_text or str(e)
        
        # Check if the error is due to branch not found
        branch_not_found_indicators = [
            "Remote branch",
            "not found in upstream origin",
            "fatal: Remote branch",
            "could not find remote branch",
        ]
        is_branch_not_found = any(
            indicator in error_msg for indicator in branch_not_found_indicators
        )
        
        # If branch was specified (not None) and not found, try falling back to default branch
        # Only retry if we had an explicit branch request (not auto-detected)
        if is_branch_not_found and requested_branch is not None:
            print(f"Branch '{requested_branch}' not found. Detecting default branch for {repo}...")
            default_branch = get_default_branch(repo)
            print(f"Detected default branch: {default_branch}. Retrying clone...")
            
            # Retry with default branch
            git_cmd_retry = ["git"]
            if skip_lfs:
                git_cmd_retry.extend(
                    [
                        "-c",
                        "filter.lfs.smudge=",
                        "-c",
                        "filter.lfs.process=",
                        "-c",
                        "filter.lfs.required=false",
                    ]
                )
            git_cmd_retry.append("clone")
            git_cmd_retry.extend(["--branch", default_branch])
            git_cmd_retry.extend([repo, str(dest_dir)])
            
            try:
                subprocess.run(
                    git_cmd_retry,
                    check=True,
                    capture_output=True,
                    text=True,
                )
                print(f"Successfully cloned using default branch: {default_branch}")
                return default_branch
            except subprocess.CalledProcessError as retry_e:
                retry_stdout = retry_e.stdout.strip() if retry_e.stdout else ""
                retry_stderr = retry_e.stderr.strip() if retry_e.stderr else ""
                if retry_stdout and retry_stderr:
                    retry_error_msg = f"{retry_stdout}\n{retry_stderr}"
                else:
                    retry_error_msg = retry_stdout or retry_stderr or str(retry_e)
                raise RuntimeError(
                    f"Failed to clone repository {repo} (requested branch: {requested_branch}, "
                    f"default branch: {default_branch}): {retry_error_msg}"
                ) from retry_e
        
        # If we get here, either it's not a branch-not-found error, or fallback also failed
        raise RuntimeError(
            f"Failed to clone repository {repo} (branch: {branch}): {error_msg}"
        ) from e


def update_submodules_if_present(dest_dir: Path) -> None:
    if not (dest_dir / ".gitmodules").is_file():
        return
    print(f"Updating submodules in: {dest_dir}")
    try:
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
    except subprocess.CalledProcessError as e:
        # Submodule updates are best-effort. In many environments (like containers
        # without SSH configured), submodules that use SSH URLs (git@github.com:...)
        # cannot be fetched. This should not cause the entire scan to fail.
        error_msg = getattr(e, "stderr", None)
        error_text = error_msg.decode("utf-8", errors="replace") if isinstance(error_msg, (bytes, bytearray)) else (error_msg or str(e))
        print(
            "Warning: failed to update git submodules. "
            "Continuing scan without submodules. "
            f"Error: {error_text}"
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
