"""Parser for Trivy scan output (Dockerfile and filesystem scans)."""
import re
from pathlib import Path
from typing import List, Optional

from ..models import Finding


def parse_trivy(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse Trivy scan text output into normalized findings.

    Handles both trivy_dockerfile_scan.txt and trivy_fs_scan.txt formats.
    Trivy outputs vulnerabilities in a table format with box-drawing characters.
    """
    findings = []

    if not text_file.exists():
        return findings

    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings

    # Skip if no vulnerabilities found
    if "No issues detected" in content or "0 (UNKNOWN: 0" in content:
        return findings

    # Current file being scanned (for context)
    current_file = None
    current_type = None

    # Parse the table format used by Trivy
    # Example row: │ lodash-es │ CVE-2025-13465 │ MEDIUM │ fixed │ 4.17.21 │ 4.17.23 │ title... │

    # Pattern to extract file context (e.g., "go.mod (gomod)" or "package-lock.json (npm)")
    file_pattern = re.compile(r"^([^\s]+)\s+\((\w+)\)\s*$", re.MULTILINE)

    # Pattern to match table rows with CVE
    # Columns: Library | Vulnerability | Severity | Status | Installed Version | Fixed Version | Title
    table_row_pattern = re.compile(
        r"│\s*([^│]+?)\s*│\s*(CVE-\d{4}-\d+|GHSA-[\w-]+)\s*│\s*(\w+)\s*│\s*(\w*)\s*│\s*([^│]*?)\s*│\s*([^│]*?)\s*│\s*([^│]+?)\s*│",
        re.MULTILINE
    )

    # Also try to match rows where library is empty (continuation of previous library)
    continuation_pattern = re.compile(
        r"│\s*│\s*(CVE-\d{4}-\d+|GHSA-[\w-]+)\s*│\s*(\w+)?\s*│\s*(\w*)\s*│\s*([^│]*?)\s*│\s*([^│]*?)\s*│\s*([^│]+?)\s*│",
        re.MULTILINE
    )

    lines = content.split("\n")
    current_library = None
    current_installed_version = None

    for i, line in enumerate(lines):
        # Check for file context lines
        file_match = file_pattern.match(line.strip())
        if file_match:
            current_file = file_match.group(1)
            current_type = file_match.group(2)
            continue

        # Try to match a full table row
        row_match = table_row_pattern.search(line)
        if row_match:
            library = row_match.group(1).strip()
            vuln_id = row_match.group(2).strip()
            severity_str = row_match.group(3).strip().upper()
            status = row_match.group(4).strip()
            installed_version = row_match.group(5).strip()
            fixed_version = row_match.group(6).strip()
            title = row_match.group(7).strip()

            # Update current library if not empty
            if library:
                current_library = library
                current_installed_version = installed_version
            else:
                # Use previous library
                library = current_library
                installed_version = current_installed_version

            # Map severity
            severity_map = {
                "CRITICAL": "critical",
                "HIGH": "high",
                "MEDIUM": "medium",
                "LOW": "low",
                "UNKNOWN": "info",
            }
            severity = severity_map.get(severity_str, "medium")

            # Clean up title (may span multiple lines via URL)
            title = re.sub(r"https?://\S+", "", title).strip()
            if not title:
                title = f"{vuln_id} in {library}"

            finding = Finding(
                scan_id=scan_id,
                scanner="trivy",
                severity=severity,
                category="dependency",
                title=f"{vuln_id}: {title[:100]}" if title else f"{vuln_id} in {library}",
                description=f"Vulnerability {vuln_id} found in {library}. "
                           f"Installed: {installed_version or 'unknown'}, "
                           f"Fixed in: {fixed_version or 'not specified'}.",
                file_path=current_file,
                cve=vuln_id if vuln_id.startswith("CVE-") else None,
                confidence="high",
                metadata={
                    "package_name": library,
                    "package_type": current_type,
                    "installed_version": installed_version,
                    "fixed_version": fixed_version,
                    "status": status,
                    "vulnerability_id": vuln_id,
                    "severity_original": severity_str,
                }
            )
            findings.append(finding)
            continue

        # Try continuation pattern (library column is empty)
        cont_match = continuation_pattern.search(line)
        if cont_match and current_library:
            vuln_id = cont_match.group(1).strip()
            severity_str = (cont_match.group(2) or "").strip().upper()
            status = cont_match.group(3).strip()
            fixed_version = cont_match.group(5).strip()
            title = cont_match.group(6).strip()

            # Use severity from previous row if empty
            severity_map = {
                "CRITICAL": "critical",
                "HIGH": "high",
                "MEDIUM": "medium",
                "LOW": "low",
                "UNKNOWN": "info",
            }
            severity = severity_map.get(severity_str, "medium") if severity_str else "medium"

            title = re.sub(r"https?://\S+", "", title).strip()
            if not title:
                title = f"{vuln_id} in {current_library}"

            finding = Finding(
                scan_id=scan_id,
                scanner="trivy",
                severity=severity,
                category="dependency",
                title=f"{vuln_id}: {title[:100]}" if title else f"{vuln_id} in {current_library}",
                description=f"Vulnerability {vuln_id} found in {current_library}. "
                           f"Installed: {current_installed_version or 'unknown'}, "
                           f"Fixed in: {fixed_version or 'not specified'}.",
                file_path=current_file,
                cve=vuln_id if vuln_id.startswith("CVE-") else None,
                confidence="high",
                metadata={
                    "package_name": current_library,
                    "package_type": current_type,
                    "installed_version": current_installed_version,
                    "fixed_version": fixed_version,
                    "status": status,
                    "vulnerability_id": vuln_id,
                    "severity_original": severity_str,
                }
            )
            findings.append(finding)

    return findings
