"""Parser for npm/pnpm audit output."""
import json
import re
from pathlib import Path
from typing import List

from ..models import Finding


def parse_npm_audit(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse npm/pnpm audit output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # Try to parse JSON format first (npm audit --json)
    if content.strip().startswith("{"):
        return _parse_npm_json(content, scan_id)
    
    # Otherwise parse text format
    return _parse_npm_text(content, scan_id)


def _parse_npm_json(content: str, scan_id: str) -> List[Finding]:
    """Parse npm audit JSON output."""
    findings = []
    
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return findings
    
    # npm audit JSON structure: {"vulnerabilities": {...}, "metadata": {...}}
    vulnerabilities = data.get("vulnerabilities", {})
    
    severity_map = {
        "critical": "critical",
        "high": "high",
        "moderate": "medium",
        "low": "low",
        "info": "info",
    }
    
    for package_name, vuln_data in vulnerabilities.items():
        if not isinstance(vuln_data, dict):
            continue
        
        severity_str = vuln_data.get("severity", "moderate").lower()
        severity = severity_map.get(severity_str, "medium")
        
        # Extract CVE if available
        cve = None
        if "cves" in vuln_data and vuln_data["cves"]:
            cve = vuln_data["cves"][0]
        
        title = vuln_data.get("title", f"Vulnerability in {package_name}")
        description = vuln_data.get("overview", "")
        
        # Extract via path (dependency chain)
        via = vuln_data.get("via", [])
        if isinstance(via, list) and via:
            if isinstance(via[0], dict):
                description = via[0].get("title", description)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="npm",
            severity=severity,
            category="dependency",
            title=title,
            description=description,
            cve=cve,
            confidence="high",
            metadata={
                "package_name": package_name,
                "package_version": vuln_data.get("range", ""),
                "severity_original": severity_str,
                "dependency_path": " > ".join([str(v) for v in via]) if isinstance(via, list) else None,
            }
        )
        findings.append(finding)
    
    return findings


def _parse_npm_text(content: str, scan_id: str) -> List[Finding]:
    """Parse npm audit text output."""
    findings = []
    
    # npm audit text format typically includes:
    # - Package name and version
    # - Severity
    # - Description
    # - CVE IDs
    
    # Pattern for vulnerability entries
    vuln_pattern = re.compile(
        r"(?:Package|Module):\s*([^\s]+)\s+.*?Severity:\s*([^\n]+).*?Description:\s*(.+?)(?=\n\n|\nPackage:|$)",
        re.MULTILINE | re.DOTALL
    )
    
    for match in vuln_pattern.finditer(content):
        package = match.group(1)
        severity_str = match.group(2).strip().lower()
        description = match.group(3).strip()
        
        severity_map = {
            "critical": "critical",
            "high": "high",
            "moderate": "medium",
            "low": "low",
        }
        severity = severity_map.get(severity_str, "medium")
        
        # Try to extract CVE
        cve_match = re.search(r"CVE-\d{4}-\d+", description)
        cve = cve_match.group(0) if cve_match else None
        
        finding = Finding(
            scan_id=scan_id,
            scanner="npm",
            severity=severity,
            category="dependency",
            title=f"Vulnerability in {package}",
            description=description,
            cve=cve,
            confidence="high",
            metadata={
                "package_name": package,
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings
