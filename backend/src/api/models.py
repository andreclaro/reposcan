"""Pydantic models for API requests and responses."""
from pydantic import BaseModel, field_validator
from typing import List, Optional

# Allowed audit types (must match audit.utils.ALLOWED_AUDITS minus "all")
ALLOWED_AUDIT_TYPES = ["all", "sast", "terraform", "dockerfile", "node", "go", "rust"]
AUDIT_TYPES_MAX_LEN = 50


class ScanRequest(BaseModel):
    """Request model for creating a scan."""
    repo_url: str
    branch: Optional[str] = None  # None means auto-detect default branch
    audit_types: List[str]
    skip_lfs: bool = False
    force_rescan: bool = False  # Bypass scan caching

    @field_validator("repo_url")
    @classmethod
    def repo_url_allowed(cls, v: str) -> str:
        from audit.utils import validate_repo_url
        if not v or not v.strip():
            raise ValueError("repo_url is required")
        if len(v.strip()) > 2048:
            raise ValueError("repo_url too long")
        if not validate_repo_url(v.strip()):
            raise ValueError("Invalid repo_url: only http, https, git, ssh URLs are allowed")
        return v.strip()

    @field_validator("branch")
    @classmethod
    def branch_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        from audit.utils import validate_branch
        try:
            return validate_branch(v.strip())
        except ValueError as e:
            raise ValueError(str(e))

    @field_validator("audit_types")
    @classmethod
    def audit_types_allowed(cls, v: List[str]) -> List[str]:
        if not isinstance(v, list):
            raise ValueError("audit_types must be a list")
        if len(v) > AUDIT_TYPES_MAX_LEN:
            raise ValueError(f"audit_types has at most {AUDIT_TYPES_MAX_LEN} entries")
        allowed = set(ALLOWED_AUDIT_TYPES)
        normalized = []
        for entry in v:
            for item in str(entry).split(","):
                item = item.strip().lower()
                if item and item in allowed:
                    normalized.append(item)
        return normalized if normalized else ["all"]


class ScanResponse(BaseModel):
    """Response model for scan creation."""
    scan_id: str
    status: str
    cached: bool = False
    cached_scan_id: Optional[str] = None


class ScanStatusResponse(BaseModel):
    """Response model for scan status."""
    scan_id: str
    status: str
    progress: Optional[int] = None
    results_path: Optional[str] = None
    commit_hash: Optional[str] = None
    error: Optional[str] = None
    result: Optional[dict] = None


class HealthResponse(BaseModel):
    """Response model for health check."""
    status: str
