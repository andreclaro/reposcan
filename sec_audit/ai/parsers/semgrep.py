"""Parser for Semgrep JSON output."""
import json
from pathlib import Path
from typing import List

from ..models import Finding


def parse_semgrep(json_file: Path, scan_id: str) -> List[Finding]:
    """Parse Semgrep JSON output into normalized findings."""
    findings = []
    
    if not json_file.exists():
        return findings
    
    try:
        with json_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return findings
    
    # Semgrep JSON structure: {"results": [...], "errors": [...]}
    results = data.get("results", [])
    
    for result in results:
        # Extract severity mapping
        severity_map = {
            "ERROR": "critical",
            "WARNING": "high",
            "INFO": "medium",
        }
        
        check_id = result.get("check_id", "")
        severity_str = result.get("extra", {}).get("severity", "INFO")
        severity = severity_map.get(severity_str, "medium")
        
        # Extract category from check_id or metadata
        category = _infer_category(check_id, result.get("extra", {}))
        
        # Extract file and line information
        path = result.get("path", "")
        start_line = result.get("start", {}).get("line", None)
        end_line = result.get("end", {}).get("line", None)
        
        # Extract code snippet
        code_snippet = None
        if "lines" in result:
            code_snippet = "\n".join(result["lines"])
        elif "extra" in result and "lines" in result["extra"]:
            code_snippet = "\n".join(result["extra"]["lines"])
        
        # Extract CWE if available
        cwe = None
        if "extra" in result:
            metadata = result["extra"]
            if "metadata" in metadata:
                cwe_list = metadata["metadata"].get("cwe", [])
                if cwe_list:
                    cwe = f"CWE-{cwe_list[0]}"
        
        finding = Finding(
            scan_id=scan_id,
            scanner="semgrep",
            severity=severity,
            category=category,
            title=result.get("extra", {}).get("message", check_id),
            description=result.get("extra", {}).get("message", ""),
            file_path=path,
            line_start=start_line,
            line_end=end_line,
            code_snippet=code_snippet[:500] if code_snippet else None,
            cwe=cwe,
            confidence="high",  # Semgrep rules are generally high confidence
            metadata={
                "check_id": check_id,
                "rule_id": check_id,
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings


def _infer_category(check_id: str, extra: dict) -> str:
    """Infer vulnerability category from check_id and metadata."""
    check_lower = check_id.lower()
    
    # Common patterns
    if any(x in check_lower for x in ["sql", "injection", "sqli"]):
        return "injection"
    if any(x in check_lower for x in ["xss", "cross-site"]):
        return "xss"
    if any(x in check_lower for x in ["auth", "authentication", "authorization"]):
        return "auth"
    if any(x in check_lower for x in ["crypto", "encrypt", "hash", "password"]):
        return "crypto"
    if any(x in check_lower for x in ["secret", "api-key", "token", "credential"]):
        return "secrets"
    if any(x in check_lower for x in ["rce", "command-injection", "eval"]):
        return "rce"
    if any(x in check_lower for x in ["ssrf", "server-side-request"]):
        return "ssrf"
    if any(x in check_lower for x in ["path-traversal", "directory-traversal"]):
        return "config"
    if any(x in check_lower for x in ["cors", "origin"]):
        return "config"
    
    # Check metadata
    if "metadata" in extra:
        metadata = extra["metadata"]
        if "category" in metadata:
            return metadata["category"].lower()
        if "cwe" in metadata:
            cwe_num = str(metadata["cwe"][0]) if isinstance(metadata["cwe"], list) else str(metadata["cwe"])
            # Map common CWEs to categories
            if cwe_num.startswith("79"):
                return "xss"
            if cwe_num.startswith("89"):
                return "injection"
            if cwe_num.startswith("22"):
                return "config"
    
    return "config"  # Default category
