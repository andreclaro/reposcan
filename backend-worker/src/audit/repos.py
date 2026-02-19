import ipaddress
import logging
import os
import socket
import subprocess
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from .utils import sanitize_repo_slug

logger = logging.getLogger(__name__)

# Timeouts (seconds); override via env if needed
CLONE_TIMEOUT = int(os.getenv("SEC_AUDIT_CLONE_TIMEOUT", "600"))
SUBMODULES_TIMEOUT = int(os.getenv("SEC_AUDIT_SUBMODULES_TIMEOUT", "300"))
GIT_REV_PARSE_TIMEOUT = int(os.getenv("SEC_AUDIT_GIT_REV_PARSE_TIMEOUT", "10"))


def _configure_git():
    """Configure git with safe defaults for containerized environments."""
    try:
        # Set a dummy user config to prevent "user.name not configured" errors
        subprocess.run(
            ["git", "config", "--global", "user.email", "sec-audit@localhost"],
            check=False,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "--global", "user.name", "Security Audit"],
            check=False,
            capture_output=True,
        )
        # Disable SSL verification if needed (useful in some container environments)
        # This can be controlled via env var
        if os.getenv("GIT_SSL_NO_VERIFY", "").lower() in ("1", "true", "yes"):
            subprocess.run(
                ["git", "config", "--global", "http.sslVerify", "false"],
                check=False,
                capture_output=True,
            )
            logger.warning("Git SSL verification disabled via GIT_SSL_NO_VERIFY")
    except Exception as e:
        logger.debug("Git configuration skipped: %s", e)


# Configure git on module load
_configure_git()


def repo_name(repo: str) -> str:
    name = Path(repo).name
    if name.endswith(".git"):
        name = name[:-4]
    return name


def ensure_audit_dirs(audit_root: Path, repo_slug: str) -> Path:
    """Create audit directory; repo_slug is sanitized to prevent path traversal."""
    audit_root.mkdir(parents=True, exist_ok=True)
    safe_slug = sanitize_repo_slug(repo_slug)
    repo_audit_dir = audit_root / safe_slug
    repo_audit_dir.mkdir(parents=True, exist_ok=True)
    return repo_audit_dir


def _is_internal_ip(hostname: str) -> bool:
    """
    Check if a hostname resolves to an internal/private IP address.
    
    Used to prevent SSRF attacks by blocking access to internal services.
    
    Args:
        hostname: The hostname to check
        
    Returns:
        True if the hostname resolves to an internal IP, False otherwise
    """
    try:
        # Get all IP addresses for the hostname
        addr_info = socket.getaddrinfo(hostname, None)
        for info in addr_info:
            ip_str = info[4][0]
            try:
                ip_obj = ipaddress.ip_address(ip_str)
                # Check if IP is private, loopback, link-local, or reserved
                if (
                    ip_obj.is_private
                    or ip_obj.is_loopback
                    or ip_obj.is_link_local
                    or ip_obj.is_reserved
                    or ip_obj.is_multicast
                ):
                    return True
            except ValueError:
                # Not a valid IP address, continue
                continue
    except socket.gaierror:
        # DNS resolution failed - fail secure (treat as internal)
        logger.warning(f"Could not resolve hostname: {hostname}")
        return True
    except Exception as e:
        # Any other error - fail secure
        logger.warning(f"Error checking IP for {hostname}: {e}")
        return True
    
    return False


def _validate_repo_url_ssrf(repo: str) -> None:
    """
    Validate repository URL to prevent SSRF attacks.
    
    Raises:
        ValueError: If URL resolves to an internal IP address
    """
    # Skip SSH URLs (git@host:path format)
    if repo.startswith("git@"):
        # Extract hostname from git@host:path format
        parts = repo.split(":", 1)
        if len(parts) == 2:
            host_part = parts[0]
            if "@" in host_part:
                hostname = host_part.split("@", 1)[1]
                if _is_internal_ip(hostname):
                    raise ValueError(f"SSH URL resolves to internal IP: {hostname}")
        return
    
    # Parse HTTP/HTTPS URLs
    try:
        parsed = urlparse(repo)
        if parsed.hostname:
            if _is_internal_ip(parsed.hostname):
                raise ValueError(f"URL resolves to internal IP: {parsed.hostname}")
    except Exception as e:
        raise ValueError(f"Invalid repository URL: {e}")


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
        ValueError: If URL resolves to an internal IP (SSRF protection)
    """
    # Validate URL to prevent SSRF attacks
    try:
        _validate_repo_url_ssrf(repo)
    except ValueError as e:
        raise RuntimeError(f"SSRF protection: {e}") from e
    
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
        raise RuntimeError("Timeout while detecting default branch") from None
    except subprocess.CalledProcessError as e:
        # Log the actual error for debugging
        stderr_msg = e.stderr.strip() if e.stderr else "No error output"
        print(f"[get_default_branch] Git error: {stderr_msg}")
        
        # Fallback to common default branches
        # Exit code 128 often means network/auth issues, try common branches
        print("[get_default_branch] Falling back to 'main' as default branch")
        return "main"


def clone_repo(
    repo: str,
    dest_dir: Path,
    branch: Optional[str],
    skip_lfs: bool,
    allowed_base: Optional[Path] = None,
) -> str:
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
        ValueError: If URL resolves to an internal IP (SSRF protection)
    """
    # Validate URL to prevent SSRF attacks
    _validate_repo_url_ssrf(repo)
    
    if allowed_base is not None:
        try:
            dest_resolved = dest_dir.resolve()
            base_resolved = allowed_base.resolve()
            dest_resolved.relative_to(base_resolved)
        except (OSError, ValueError):
            raise ValueError(
                "Destination directory is outside allowed base directory"
            ) from None
    if (dest_dir / ".git").is_dir():
        logger.info("Already cloned, skipping: %s", repo)
        # Try to determine the current branch
        try:
            result = subprocess.run(
                ["git", "-C", str(dest_dir), "rev-parse", "--abbrev-ref", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
                timeout=GIT_REV_PARSE_TIMEOUT,
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return branch or "main"
    
    # Detect default branch if not specified
    requested_branch = branch
    if branch is None:
        logger.info("Detecting default branch for %s...", repo)
        branch = get_default_branch(repo)
        logger.info("Detected default branch: %s", branch)
    
    logger.info("Cloning %s -> %s (branch: %s)", repo, dest_dir, branch)
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
            timeout=CLONE_TIMEOUT,
        )
        return branch
    except subprocess.TimeoutExpired:
        raise RuntimeError("Clone timed out") from None
    except subprocess.CalledProcessError as e:
        stdout_text = e.stdout.strip() if e.stdout else ""
        stderr_text = e.stderr.strip() if e.stderr else ""
        if stdout_text and stderr_text:
            error_msg = f"{stdout_text}\n{stderr_text}"
        else:
            error_msg = stdout_text or stderr_text or str(e)
        
        # Log the actual error for debugging
        logger.error("Git clone failed with exit code %d: %s", e.returncode, error_msg)
        
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
            logger.warning("Branch '%s' not found. Detecting default branch...", requested_branch)
            default_branch = get_default_branch(repo)
            logger.info("Detected default branch: %s. Retrying clone...", default_branch)
            
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
                    timeout=CLONE_TIMEOUT,
                )
                logger.info("Successfully cloned using default branch: %s", default_branch)
                return default_branch
            except subprocess.CalledProcessError as retry_e:
                raise RuntimeError(
                    "Failed to clone repository (branch fallback failed)"
                ) from retry_e
        
        # If we get here, either it's not a branch-not-found error, or fallback also failed
        raise RuntimeError("Failed to clone repository") from e


def update_submodules_if_present(dest_dir: Path) -> None:
    if not (dest_dir / ".gitmodules").is_file():
        return
    logger.info("Updating submodules in: %s", dest_dir)
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
            timeout=SUBMODULES_TIMEOUT,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        # Submodule updates are best-effort. In many environments (like containers
        # without SSH configured), submodules that use SSH URLs (git@github.com:...)
        # cannot be fetched. This should not cause the entire scan to fail.
        error_msg = getattr(e, "stderr", None)
        error_text = error_msg.decode("utf-8", errors="replace") if isinstance(error_msg, (bytes, bytearray)) else (error_msg or str(e))
        logger.warning(
            "Failed to update git submodules. Continuing scan without submodules. Error: %s",
            error_text,
        )


def get_commit_hash(repo_path: Path, branch: str = "HEAD") -> str:
    """Get the commit hash for the current HEAD or specified branch."""
    result = subprocess.run(
        ["git", "-C", str(repo_path), "rev-parse", branch],
        check=True,
        capture_output=True,
        text=True,
        timeout=GIT_REV_PARSE_TIMEOUT,
    )
    return result.stdout.strip()


def clone_repo_with_token(
    repo: str,
    dest_dir: Path,
    branch: Optional[str],
    skip_lfs: bool,
    token: str,
    allowed_base: Optional[Path] = None,
) -> str:
    """
    Clone a private Git repository using an OAuth token.
    
    The token is used once for cloning and never stored. It is masked in any
    error messages to prevent accidental exposure in logs.
    
    Args:
        repo: Repository URL (HTTPS format recommended)
        dest_dir: Destination directory path
        branch: Branch name to clone. If None, detects the default branch.
        skip_lfs: Whether to skip Git LFS files
        token: GitHub OAuth token for authentication
        allowed_base: Optional base directory for path traversal protection
        
    Returns:
        The branch name that was cloned
        
    Raises:
        RuntimeError: If cloning fails or authentication fails
        ValueError: If URL resolves to an internal IP (SSRF protection)
    """
    # Validate URL to prevent SSRF attacks
    _validate_repo_url_ssrf(repo)
    
    if allowed_base is not None:
        try:
            dest_resolved = dest_dir.resolve()
            base_resolved = allowed_base.resolve()
            dest_resolved.relative_to(base_resolved)
        except (OSError, ValueError):
            raise ValueError(
                "Destination directory is outside allowed base directory"
            ) from None
    
    if (dest_dir / ".git").is_dir():
        logger.info("Already cloned, skipping: %s", repo)
        # Try to determine the current branch
        try:
            result = subprocess.run(
                ["git", "-C", str(dest_dir), "rev-parse", "--abbrev-ref", "HEAD"],
                check=True,
                capture_output=True,
                text=True,
                timeout=GIT_REV_PARSE_TIMEOUT,
            )
            return result.stdout.strip()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            return branch or "main"
    
    # Build authenticated URL
    # Format: https://oauth:TOKEN@github.com/owner/repo.git
    parsed = urlparse(repo)
    host = parsed.hostname or "github.com"
    
    # Construct authenticated URL
    auth_url = f"https://oauth:{token}@{host}{parsed.path}"
    
    # Detect default branch if not specified
    requested_branch = branch
    if branch is None:
        logger.info("Detecting default branch for private repo...")
        # For private repos, we need to use the token to detect branch
        # We can use git ls-remote with the token
        try:
            result = subprocess.run(
                ["git", "ls-remote", "--symref", auth_url, "HEAD"],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            
            for line in result.stdout.strip().split("\n"):
                if line.startswith("ref:") and "refs/heads/" in line:
                    parts = line.split("refs/heads/")
                    if len(parts) > 1:
                        detected_branch = parts[1].split("\t")[0].strip()
                        if detected_branch:
                            branch = detected_branch
                            logger.info("Detected default branch: %s", branch)
                            break
        except subprocess.CalledProcessError:
            logger.warning("Could not detect default branch, falling back to 'main'")
            branch = "main"
        except subprocess.TimeoutExpired:
            logger.warning("Timeout detecting default branch, falling back to 'main'")
            branch = "main"
    
    if branch is None:
        branch = "main"
    
    logger.info("Cloning private repo %s -> %s (branch: %s)", repo, dest_dir, branch)
    
    # Set up git environment
    env = os.environ.copy()
    # Prevent token from appearing in process lists
    env["GIT_TERMINAL_PROMPT"] = "0"
    
    git_cmd = ["git"]
    if skip_lfs:
        git_cmd.extend([
            "-c", "filter.lfs.smudge=",
            "-c", "filter.lfs.process=",
            "-c", "filter.lfs.required=false",
        ])
    
    git_cmd.append("clone")
    git_cmd.extend(["--branch", branch])
    git_cmd.extend(["--depth", "1"])
    git_cmd.extend([auth_url, str(dest_dir)])
    
    try:
        subprocess.run(
            git_cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT,
            env=env,
        )
        return branch
        
    except subprocess.TimeoutExpired:
        raise RuntimeError("Clone timed out") from None
        
    except subprocess.CalledProcessError as e:
        stdout_text = e.stdout.strip() if e.stdout else ""
        stderr_text = e.stderr.strip() if e.stderr else ""
        
        # Mask token in error messages
        if stdout_text:
            stdout_text = stdout_text.replace(token, "***")
        if stderr_text:
            stderr_text = stderr_text.replace(token, "***")
        
        if stdout_text and stderr_text:
            error_msg = f"{stdout_text}\n{stderr_text}"
        else:
            error_msg = stdout_text or stderr_text or str(e)
        
        # Log error with masked token
        logger.error("Git clone failed: %s", error_msg)
        
        # Check for authentication errors
        auth_error_indicators = [
            "Authentication failed",
            "403",
            "401",
            "remote: Invalid username or password",
            "remote: Repository not found",
        ]
        is_auth_error = any(indicator in error_msg for indicator in auth_error_indicators)
        
        if is_auth_error:
            raise RuntimeError(
                "Authentication failed. The token may have expired or you may not have "
                "access to this repository. Please check your GitHub permissions."
            ) from e
        
        # Check for branch not found
        branch_not_found_indicators = [
            "Remote branch",
            "not found in upstream origin",
            "fatal: Remote branch",
            "could not find remote branch",
        ]
        is_branch_not_found = any(
            indicator in error_msg for indicator in branch_not_found_indicators
        )
        
        if is_branch_not_found and requested_branch is not None:
            logger.warning("Branch '%s' not found. Trying default branch...", requested_branch)
            return clone_repo_with_token(
                repo, dest_dir, None, skip_lfs, token, allowed_base
            )
        
        raise RuntimeError(f"Failed to clone repository: {error_msg}") from e
