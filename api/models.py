"""Pydantic models for API requests and responses."""
from pydantic import BaseModel
from typing import List, Optional


class ScanRequest(BaseModel):
    """Request model for creating a scan."""
    repo_url: str
    branch: Optional[str] = None  # None means auto-detect default branch
    audit_types: List[str]
    skip_lfs: bool = False


class ScanResponse(BaseModel):
    """Response model for scan creation."""
    scan_id: str
    status: str


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
