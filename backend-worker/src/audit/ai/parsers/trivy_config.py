"""Parser for Trivy Config output (Kubernetes, Docker Compose).

Trivy config scan uses the same output format as Trivy image/fs scans,
but targets Kubernetes YAML and Docker Compose files instead.
"""
from pathlib import Path
from typing import List

from ..models import Finding
from .trivy import parse_trivy


def parse_trivy_config(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse Trivy config scan output into normalized findings.
    
    Reuses the existing Trivy text parser since the format is the same.
    This scan targets:
    - Kubernetes YAML/JSON manifests
    - Docker Compose files
    - Helm charts
    
    Note: Intentionally skips Terraform files (.tf) as they're covered
    by dedicated scanners (tfsec, checkov, tflint).
    """
    # Reuse the existing Trivy parser - the output format is the same
    findings = parse_trivy(text_file, scan_id)
    
    # Override scanner name to distinguish from other Trivy scans
    for finding in findings:
        finding.scanner = "trivy-config"
    
    return findings
