"""Parser for cargo-audit output."""
import json
import re
from pathlib import Path
from typing import List

from ..models import Finding


def parse_cargo_audit(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse cargo-audit output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # cargo-audit can output JSON or text
    if content.strip().startswith("{"):
        return _parse_cargo_json(content, scan_id)
    
    return _parse_cargo_text(content, scan_id)


def _parse_cargo_json(content: str, scan_id: str) -> List[Finding]:
    """Parse cargo-audit JSON output."""
    findings = []
    
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return findings
    
    # cargo-audit JSON structure: {"vulnerabilities": [...]}
    vulnerabilities = data.get("vulnerabilities", [])
    
    severity_map = {
        "critical": "critical",
        "high": "high",
        "medium": "medium",
        "low": "low",
    }
    
    for vuln in vulnerabilities:
        if not isinstance(vuln, dict):
            continue
        
        advisory = vuln.get("advisory", {})
        if not advisory:
            continue
        
        severity_str = advisory.get("severity", "medium").lower()
        severity = severity_map.get(severity_str, "medium")
        
        cve = advisory.get("id")  # cargo-audit uses "id" for CVE
        title = advisory.get("title", "Rust dependency vulnerability")
        description = advisory.get("description", "")
        
        package = vuln.get("package", {})
        package_name = package.get("name", "unknown") if isinstance(package, dict) else "unknown"
        
        finding = Finding(
            scan_id=scan_id,
            scanner="cargo-audit",
            severity=severity,
            category="dependency",
            title=title,
            description=description,
            cve=cve,
            confidence="high",
            metadata={
                "package_name": package_name,
                "package_version": package.get("version", "") if isinstance(package, dict) else "",
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings


def _parse_cargo_text(content: str, scan_id: str) -> List[Finding]:
    """Parse cargo-audit text output."""
    findings = []
    
    # cargo-audit text format:
    # Crate: package-name
    # Version: x.y.z
    # Title: Vulnerability title
    # Description: ...
    # CVE: CVE-YYYY-NNNN
    
    vuln_sections = re.split(r"\n\n+", content)
    
    for section in vuln_sections:
        if not section.strip():
            continue
        
        # Extract CVE
        cve_match = re.search(r"CVE:\s*(CVE-\d{4}-\d+)", section)
        cve = cve_match.group(1) if cve_match else None
        
        # Extract package
        crate_match = re.search(r"Crate:\s*(.+)", section)
        package = crate_match.group(1).strip() if crate_match else "unknown"
        
        # Extract title
        title_match = re.search(r"Title:\s*(.+)", section)
        title = title_match.group(1).strip() if title_match else f"Vulnerability in {package}"
        
        # Extract description
        desc_match = re.search(r"Description:\s*(.+?)(?=\n[A-Z]|$)", section, re.DOTALL)
        description = desc_match.group(1).strip() if desc_match else ""
        
        # Severity not always in text output, default to high
        severity = "high"
        
        finding = Finding(
            scan_id=scan_id,
            scanner="cargo-audit",
            severity=severity,
            category="dependency",
            title=title,
            description=description,
            cve=cve,
            confidence="high",
            metadata={
                "package_name": package,
            }
        )
        findings.append(finding)
    
    return findings
