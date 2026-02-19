"""Parser for OWASP ZAP output (DAST).

ZAP (Zed Attack Proxy) performs dynamic application security testing (DAST)
by scanning a running application for vulnerabilities.
"""
import re
from pathlib import Path
from typing import List

from ..models import Finding


def parse_zap(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse OWASP ZAP output into normalized findings.
    
    ZAP quick scan output format:
    WARN-NEW: Cross-Domain JavaScript Source File Inclusion [10017] x 2
        http://target.com/script.js
    WARN-NEW: SQL Injection [40018] x 1
        http://target.com/search?q=test
    
    Note: Full ZAP reports (XML/JSON) are more detailed. This parser handles
    the basic quick scan text output. For production use, consider using
    ZAP's API to export structured reports.
    """
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # Parse WARN-NEW lines
    # Pattern: WARN-NEW: <Title> [<ID>] x <Count>
    warn_pattern = r'WARN-NEW:\s*(.+?)\s*\[(\d+)\]\s*x\s*(\d+)'
    
    # Find all warnings
    for match in re.finditer(warn_pattern, content):
        title = match.group(1).strip()
        alert_id = match.group(2)
        count = int(match.group(3))
        
        # Map alert ID to severity
        severity = _map_zap_alert_to_severity(alert_id, title)
        category = _infer_category(alert_id, title)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="zap",
            severity=severity,
            category=category,
            title=f"[ZAP-{alert_id}] {title}",
            description=f"Dynamic scan detected: {title}. Occurrences: {count}",
            file_path=None,  # DAST doesn't have file paths
            line_start=None,
            line_end=None,
            code_snippet=None,
            confidence="medium",  # DAST confidence varies
            metadata={
                "alert_id": alert_id,
                "count": count,
                "zap_type": "dast",
            }
        )
        findings.append(finding)
    
    # Also look for PASS lines to note what's working
    pass_pattern = r'PASS:\s*(.+?)\s*\[(\d+)\]'
    for match in re.finditer(pass_pattern, content):
        title = match.group(1).strip()
        alert_id = match.group(2)
        
        # Only add passing checks if they're interesting (info level)
        # This provides positive security confirmation
        finding = Finding(
            scan_id=scan_id,
            scanner="zap",
            severity="info",
            category="dast-pass",
            title=f"[ZAP-{alert_id}] {title} (Passed)",
            description=f"Dynamic scan verified: {title}",
            file_path=None,
            line_start=None,
            line_end=None,
            code_snippet=None,
            confidence="high",
            metadata={
                "alert_id": alert_id,
                "zap_type": "dast-pass",
            }
        )
        findings.append(finding)
    
    return findings


def _map_zap_alert_to_severity(alert_id: str, title: str) -> str:
    """Map ZAP alert to severity level.
    
    ZAP alert IDs:
    - 0-999: Informational
    - 1000-1999: Low
    - 2000-2999: Medium
    - 3000-3999: High
    - 4000+: Critical (includes SQL injection, RCE, etc.)
    """
    try:
        alert_num = int(alert_id)
        
        if alert_num >= 4000:
            return "critical"  # SQL injection, Command injection, etc.
        elif alert_num >= 3000:
            return "high"
        elif alert_num >= 2000:
            return "medium"
        elif alert_num >= 1000:
            return "low"
        else:
            return "info"
    except ValueError:
        pass
    
    # Fallback: check title for keywords
    title_lower = title.lower()
    critical_patterns = ["sql injection", "rce", "remote code", "command injection"]
    if any(p in title_lower for p in critical_patterns):
        return "critical"
    
    high_patterns = ["xss", "cross-site scripting", "authentication", "session"]
    if any(p in title_lower for p in high_patterns):
        return "high"
    
    return "medium"


def _infer_category(alert_id: str, title: str) -> str:
    """Infer vulnerability category from ZAP alert."""
    combined = f"{alert_id} {title}".lower()
    
    # Common ZAP alert categories
    sql_injection_ids = {"40018", "40019", "40020", "40021", "40022", "40023"}
    xss_ids = {"40012", "40013", "40014", "40015", "40016", "40017"}
    
    if alert_id in sql_injection_ids or "sql" in combined:
        return "injection"
    if alert_id in xss_ids or "xss" in combined or "cross-site" in combined:
        return "xss"
    if "csrf" in combined:
        return "csrf"
    if "authentication" in combined or "session" in combined:
        return "auth"
    if "certificate" in combined or "ssl" in combined or "tls" in combined:
        return "crypto"
    if "cors" in combined:
        return "cors"
    if "header" in combined:
        return "headers"
    if "information disclosure" in combined:
        return "info-disclosure"
    
    return "dast"
