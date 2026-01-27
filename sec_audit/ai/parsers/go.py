"""Parser for govulncheck output."""
import re
from pathlib import Path
from typing import List

from ..models import Finding


def parse_govulncheck(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse govulncheck output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # govulncheck output format:
    # Found X vulnerabilities
    
    # Pattern for vulnerability entries
    # Format: CVE-YYYY-NNNN: description
    #         Package: path/to/package
    #         Found in: version
    #         Fixed in: version
    
    vuln_sections = re.split(r"\n\n+", content)
    
    for section in vuln_sections:
        if not section.strip() or "Found" in section and "vulnerabilities" in section:
            continue
        
        # Extract CVE
        cve_match = re.search(r"(CVE-\d{4}-\d+)", section)
        if not cve_match:
            continue
        
        cve = cve_match.group(1)
        
        # Extract description (first line after CVE)
        lines = section.split("\n")
        description = ""
        if len(lines) > 1:
            description = lines[1].strip()
        
        # Extract package
        package_match = re.search(r"Package:\s*(.+)", section)
        package = package_match.group(1).strip() if package_match else "unknown"
        
        # Extract version info
        found_in_match = re.search(r"Found in:\s*(.+)", section)
        fixed_in_match = re.search(r"Fixed in:\s*(.+)", section)
        
        # Severity is typically not in govulncheck output, default to high
        # (govulncheck focuses on known vulnerabilities which are typically important)
        severity = "high"
        
        finding = Finding(
            scan_id=scan_id,
            scanner="govulncheck",
            severity=severity,
            category="dependency",
            title=f"{cve} in {package}",
            description=description or f"Vulnerability {cve} found in package {package}",
            cve=cve,
            confidence="high",
            metadata={
                "package_name": package,
                "found_in": found_in_match.group(1).strip() if found_in_match else None,
                "fixed_in": fixed_in_match.group(1).strip() if fixed_in_match else None,
            }
        )
        findings.append(finding)
    
    return findings
