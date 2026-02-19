"""Parser for OSV-Scanner JSON output."""
import json
from pathlib import Path
from typing import List

from ..models import Finding


def parse_osv_scanner(json_file: Path, scan_id: str) -> List[Finding]:
    """Parse OSV-Scanner JSON output into normalized findings.
    
    OSV-Scanner JSON format:
    {
        "results": [
            {
                "source": {
                    "path": "requirements.txt",
                    "type": "lockfile"
                },
                "packages": [
                    {
                        "package": {
                            "name": "django",
                            "version": "3.2.0",
                            "ecosystem": "PyPI"
                        },
                        "vulnerabilities": [
                            {
                                "id": "GHSA-xxxx-xxxx-xxxx",
                                "aliases": ["CVE-2023-xxxxx"],
                                "summary": "Vulnerability summary",
                                "details": "Detailed description",
                                "severity": [{"type": "CVSS_V3", "score": "7.5"}],
                                "affected": [...],
                                "references": [...]
                            }
                        ]
                    }
                ]
            }
        ]
    }
    """
    findings = []
    
    if not json_file.exists():
        return findings
    
    try:
        with json_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return findings
    
    # OSV returns results as a list
    results = data.get("results", []) if isinstance(data, dict) else []
    
    for source_result in results:
        source_path = source_result.get("source", {}).get("path", "")
        source_type = source_result.get("source", {}).get("type", "")
        
        packages = source_result.get("packages", [])
        for pkg in packages:
            pkg_info = pkg.get("package", {})
            pkg_name = pkg_info.get("name", "")
            pkg_version = pkg_info.get("version", "")
            pkg_ecosystem = pkg_info.get("ecosystem", "")
            
            vulnerabilities = pkg.get("vulnerabilities", [])
            for vuln in vulnerabilities:
                finding = _create_finding(
                    vuln, pkg_name, pkg_version, pkg_ecosystem,
                    source_path, scan_id
                )
                if finding:
                    findings.append(finding)
    
    return findings


def _create_finding(
    vuln: dict,
    pkg_name: str,
    pkg_version: str,
    pkg_ecosystem: str,
    source_path: str,
    scan_id: str,
) -> Finding | None:
    """Create a Finding from an OSV vulnerability entry."""
    
    vuln_id = vuln.get("id", "")
    summary = vuln.get("summary", "")
    details = vuln.get("details", "")
    
    # Get CVE from aliases
    cve = None
    aliases = vuln.get("aliases", [])
    for alias in aliases:
        if alias.startswith("CVE-"):
            cve = alias
            break
    
    # Parse severity
    severity = _parse_severity(vuln.get("severity", []))
    
    # Create title and description
    title = f"{pkg_name}@{pkg_version}: {summary or vuln_id}"
    # Build CVE line separately to avoid backslash in f-string expression
    cve_line = f"CVE: {cve}" if cve else ""
    description = f"""
Package: {pkg_name}@{pkg_version}
Ecosystem: {pkg_ecosystem}
Source: {source_path}
Vulnerability: {vuln_id}
{cve_line}

{details or summary}
    """.strip()
    
    # Map ecosystem to category
    category = _map_ecosystem_to_category(pkg_ecosystem)
    
    # Get affected version info
    affected_versions = _extract_affected_versions(vuln.get("affected", []))
    
    return Finding(
        scan_id=scan_id,
        scanner="osv-scanner",
        severity=severity,
        category=category,
        title=title,
        description=description,
        file_path=source_path,
        line_start=None,
        line_end=None,
        code_snippet=None,
        cve=cve,
        confidence="high",
        metadata={
            "vuln_id": vuln_id,
            "package": pkg_name,
            "version": pkg_version,
            "ecosystem": pkg_ecosystem,
            "aliases": aliases,
            "affected_versions": affected_versions,
            "references": [ref.get("url", "") for ref in vuln.get("references", [])],
        }
    )


def _parse_severity(severity_list: list) -> str:
    """Parse OSV severity information to normalized severity."""
    if not severity_list:
        return "medium"
    
    for sev in severity_list:
        score = sev.get("score", "")
        
        # Try to parse CVSS score
        try:
            # CVSS v3 scores are 0-10
            if isinstance(score, (int, float)):
                cvss_score = float(score)
            elif isinstance(score, str):
                # Handle CVSS vector strings or numeric scores
                if score.startswith("CVSS:"):
                    # Extract score from vector if possible, or use default
                    cvss_score = None
                else:
                    cvss_score = float(score)
            else:
                continue
            
            if cvss_score is not None:
                if cvss_score >= 9.0:
                    return "critical"
                elif cvss_score >= 7.0:
                    return "high"
                elif cvss_score >= 4.0:
                    return "medium"
                else:
                    return "low"
        except (ValueError, TypeError):
            continue
    
    return "medium"


def _map_ecosystem_to_category(ecosystem: str) -> str:
    """Map OSV ecosystem to vulnerability category."""
    ecosystem_map = {
        "PyPI": "python-dependency",
        "Maven": "java-dependency",
        "Gradle": "java-dependency",
        "npm": "node-dependency",
        "Go": "go-dependency",
        "Crates.io": "rust-dependency",
        "Packagist": "php-dependency",
        "NuGet": "dotnet-dependency",
    }
    return ecosystem_map.get(ecosystem, "dependency")


def _extract_affected_versions(affected: list) -> list:
    """Extract affected version ranges from OSV affected field."""
    versions = []
    for aff in affected:
        ranges = aff.get("ranges", [])
        for range_info in ranges:
            events = range_info.get("events", [])
            for event in events:
                if "introduced" in event:
                    versions.append(f">= {event['introduced']}")
                if "fixed" in event:
                    versions.append(f"< {event['fixed']}")
    return versions
