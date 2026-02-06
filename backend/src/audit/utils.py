"""Utility functions for CSV normalization, validation, and audit selection."""
import csv
import re
from pathlib import Path
from typing import List
from urllib.parse import urlparse

from .scanner_config import SCANNER_DEFAULTS

# CSV safety limits
CSV_MAX_SIZE_BYTES = 10 * 1024 * 1024  # 10MB
CSV_MAX_ROWS = 10_000

# Allowed audit types — derived from the scanner registry (single source of truth).
ALLOWED_AUDITS = frozenset({"all"} | set(SCANNER_DEFAULTS.keys()))

# Branch name: alphanumeric, dots, underscores, slashes, hyphens. Max length 255.
BRANCH_RE = re.compile(r"^[a-zA-Z0-9._/-]+$")
BRANCH_MAX_LEN = 255

# Repo slug: safe characters only, max length
REPO_SLUG_MAX_LEN = 100
REPO_SLUG_SAFE_RE = re.compile(r"^[a-zA-Z0-9._-]+$")


def validate_repo_url(url: str) -> bool:
    """
    Validate repository URL to prevent SSRF (allow only http, https, git, ssh).

    Returns True if the URL scheme and host are allowed, False otherwise.
    """
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    if len(url) > 2048:
        return False
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    # Allow SSH clone URLs (e.g. git@github.com:user/repo.git)
    if url.strip().startswith("git@"):
        parts = url.split(":", 1)
        if len(parts) != 2 or not parts[1] or parts[1].startswith("/"):
            return False
        if ".." in parts[1]:
            return False
        return True
    allowed_schemes = {"http", "https", "git", "ssh"}
    if not parsed.scheme or parsed.scheme.lower() not in allowed_schemes:
        return False
    # Reject file:// and other local schemes (urlparse may give scheme "file")
    if parsed.scheme.lower() == "file":
        return False
    return True


def normalize_cell(value: str) -> str:
    """Normalize CSV cell value: strip and remove control characters."""
    if not isinstance(value, str):
        return ""
    normalized = value.strip()
    normalized = "".join(c for c in normalized if ord(c) >= 32)
    return normalized


def parse_audit_selection(selection: List[str]) -> List[str]:
    """
    Parse audit selection from CLI/API; only allow known audit types.
    Invalid values are ignored. Returns ["all"] when empty or no valid items.
    """
    if not selection:
        return ["all"]
    audits: List[str] = []
    for entry in selection:
        for item in entry.split(","):
            item = item.strip().lower()
            if item and item in ALLOWED_AUDITS:
                audits.append(item)
    return audits if audits else ["all"]


def should_run_audit(audits: List[str], name: str) -> bool:
    return "all" in audits or name in audits


def validate_branch(branch: str | None) -> str | None:
    """
    Validate branch name. Returns None if branch is None/empty or invalid (use default).
    Returns the stripped branch string if valid.
    Raises ValueError for invalid non-empty branch so API can return 422.
    """
    if branch is None:
        return None
    s = branch.strip()
    if not s:
        return None
    if len(s) > BRANCH_MAX_LEN or not BRANCH_RE.match(s):
        raise ValueError(
            f"Invalid branch name: allowed characters [a-zA-Z0-9._/-], max length {BRANCH_MAX_LEN}"
        )
    return s


def safe_repo_slug(repo: str) -> str:
    """
    Derive a safe directory name from a repository URL/path.
    Uses repo_name() then sanitizes: only alphanumeric, dot, underscore, hyphen; max length.
    If the URL path contains "..", returns "repo" to avoid path-traversal-style names.
    """
    parsed = urlparse(repo)
    if ".." in (parsed.path or ""):
        return "repo"
    name = Path(repo).name
    if name.endswith(".git"):
        name = name[:-4]
    return sanitize_repo_slug(name)


def read_csv_safely(csv_path: Path) -> List[List[str]]:
    """
    Read CSV file with size and row limits to prevent DoS.
    Validates file extension and raises ValueError on limit breach.
    """
    if csv_path.suffix.lower() != ".csv":
        raise ValueError(f"Invalid file type: expected .csv, got {csv_path.suffix!r}")
    max_size = CSV_MAX_SIZE_BYTES
    if csv_path.stat().st_size > max_size:
        raise ValueError(f"CSV file too large (max {max_size // (1024*1024)}MB)")
    rows: List[List[str]] = []
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        for row_num, row in enumerate(reader, start=1):
            if row_num > CSV_MAX_ROWS:
                raise ValueError(f"CSV file has too many rows (max {CSV_MAX_ROWS})")
            rows.append(row)
    return rows


def sanitize_repo_slug(repo_slug: str) -> str:
    """
    Sanitize a repo slug for use in paths (prevent path traversal).
    Only allows alphanumeric, dot, underscore, hyphen; removes ".."; max length 100.
    """
    if not repo_slug or not isinstance(repo_slug, str):
        return "repo"
    safe = "".join(c for c in repo_slug if c.isalnum() or c in "._-")
    safe = safe.replace("..", "")  # prevent path traversal
    safe = safe[:REPO_SLUG_MAX_LEN] if len(safe) > REPO_SLUG_MAX_LEN else safe
    # Treat slug that is only dots/underscores/hyphens as unsafe (e.g. "...")
    if not safe or not any(c.isalnum() for c in safe):
        return "repo"
    return safe
