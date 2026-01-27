"""Parser for Trivy Dockerfile scan output."""
import re
from pathlib import Path
from typing import List, Optional

from ..models import Finding


def parse_trivy(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse Trivy Dockerfile scan text output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # Trivy output format varies, but typically includes:
    # - CVE IDs
    # - Severity levels
    # - Package names and versions
    # - Descriptions
    
    # Split by Dockerfile sections
    sections = re.split(r"={80}", content)
    
    for section in sections:
        if not section.strip():
            continue
        
        # Extract Dockerfile path if present
        dockerfile_match = re.search(r"Dockerfile:\s*(.+?)\n", section)
        dockerfile_path = dockerfile_match.group(1) if dockerfile_match else None
        
        # Parse vulnerabilities from this section
        # Trivy typically formats vulnerabilities as:
        # CVE-ID    SEVERITY    Package    Description
        vuln_pattern = re.compile(
            r"(CVE-\d{4}-\d+)\s+([A-Z]+)\s+([^\s]+)\s+(.+?)(?=\nCVE-|\n\n|$)",
            re.MULTILINE | re.DOTALL
        )
        
        for match in vuln_pattern.finditer(section):
            cve_id = match.group(1)
            severity_str = match.group(2).upper()
            package = match.group(3)
            description = match.group(4).strip()
            
            # Map Trivy severity to normalized severity
            severity_map = {
                "CRITICAL": "critical",
                "HIGH": "high",
                "MEDIUM": "medium",
                "LOW": "low",
                "UNKNOWN": "info",
            }
            severity = severity_map.get(severity_str, "medium")
            
            finding = Finding(
                scan_id=scan_id,
                scanner="trivy",
                severity=severity,
                category="dependency",
                title=f"{cve_id} in {package}",
                description=description,
                file_path=dockerfile_path,
                cve=cve_id,
                confidence="high",
                metadata={
                    "package_name": package,
                    "severity_original": severity_str,
                }
            )
            findings.append(finding)
        
        # Also try to parse JSON-like structures if present
        # Some Trivy outputs include structured data
        json_match = re.search(r'\{[^{}]*"VulnerabilityID"[^{}]*\}', section)
        if json_match:
            # Try to extract structured vulnerability data
            # This is a simplified parser - full implementation would parse JSON properly
            pass
    
    return findings
