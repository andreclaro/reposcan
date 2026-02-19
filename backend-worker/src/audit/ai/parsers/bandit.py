"""Parser for Bandit JSON output."""
import json
from pathlib import Path
from typing import List

from ..models import Finding


def parse_bandit(json_file: Path, scan_id: str) -> List[Finding]:
    """Parse Bandit JSON output into normalized findings.
    
    Bandit JSON format:
    {
        "errors": [],
        "generated_at": "2024-01-15T10:30:00Z",
        "metrics": {...},
        "results": [
            {
                "code": "1234567890abcdef",
                "filename": "path/to/file.py",
                "issue_confidence": "HIGH",
                "issue_cwe": {
                    "id": 78,
                    "link": "https://cwe.mitre.org/data/definitions/78.html"
                },
                "issue_severity": "HIGH",
                "issue_text": "Possible SQL injection...",
                "line_number": 42,
                "line_range": [42, 43],
                "more_info": "https://bandit.readthedocs.io/en/latest/...",
                "test_id": "B608",
                "test_name": "hardcoded_sql_expressions"
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
    
    # Bandit returns results in a "results" key
    results = data.get("results", []) if isinstance(data, dict) else []
    
    for result in results:
        # Map Bandit severity to normalized severity
        severity_map = {
            "CRITICAL": "critical",
            "HIGH": "high",
            "MEDIUM": "medium",
            "LOW": "low",
        }
        severity = severity_map.get(result.get("issue_severity", "MEDIUM").upper(), "medium")
        
        # Get confidence
        confidence_map = {
            "HIGH": "high",
            "MEDIUM": "medium",
            "LOW": "low",
        }
        confidence = confidence_map.get(result.get("issue_confidence", "MEDIUM").upper(), "medium")
        
        # Extract file and line information
        file_path = result.get("filename", "")
        line_start = result.get("line_number")
        line_range = result.get("line_range", [])
        line_end = line_range[-1] if line_range else line_start
        
        # Get test info
        test_id = result.get("test_id", "")
        test_name = result.get("test_name", "")
        issue_text = result.get("issue_text", "")
        
        # Get CWE info
        cwe = None
        cwe_info = result.get("issue_cwe", {})
        if cwe_info and "id" in cwe_info:
            cwe = f"CWE-{cwe_info['id']}"
        
        # Get code snippet
        code = result.get("code", "")
        # Decode hex string if needed (Bandit sometimes encodes code as hex)
        try:
            if code and all(c in "0123456789abcdefABCDEF" for c in code):
                code_snippet = bytes.fromhex(code).decode("utf-8", errors="ignore")
            else:
                code_snippet = code
        except Exception:
            code_snippet = code
        
        # Infer category from test_id and test_name
        category = _infer_category(test_id, test_name, issue_text)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="bandit",
            severity=severity,
            category=category,
            title=f"[{test_id}] {test_name}",
            description=issue_text,
            file_path=file_path,
            line_start=line_start,
            line_end=line_end,
            code_snippet=code_snippet[:500] if code_snippet else None,
            cwe=cwe,
            confidence=confidence,
            metadata={
                "test_id": test_id,
                "test_name": test_name,
                "more_info": result.get("more_info", ""),
            }
        )
        findings.append(finding)
    
    return findings


def _infer_category(test_id: str, test_name: str, issue_text: str) -> str:
    """Infer vulnerability category from Bandit test info."""
    combined = f"{test_id} {test_name} {issue_text}".lower()
    
    # B6xx series are security issues
    test_categories = {
        "B102": "exec",
        "B103": "file-permissions",
        "B104": "bind",
        "B105": "crypto",
        "B106": "crypto",
        "B107": "crypto",
        "B108": "file-permissions",
        "B110": "try-except",
        "B112": "try-except",
        "B201": "flask",
        "B301": "exec",
        "B302": "exec",
        "B303": "crypto",
        "B304": "crypto",
        "B305": "crypto",
        "B306": "crypto",
        "B307": "eval",
        "B308": "markup",
        "B309": "crypto",
        "B310": "network",
        "B311": "random",
        "B312": "network",
        "B313": "xml",
        "B314": "xml",
        "B315": "xml",
        "B316": "xml",
        "B317": "xml",
        "B318": "xml",
        "B319": "xml",
        "B320": "xml",
        "B321": "network",
        "B323": "crypto",
        "B324": "crypto",
        "B401": "import",
        "B402": "import",
        "B403": "import",
        "B404": "import",
        "B405": "import",
        "B406": "import",
        "B407": "import",
        "B408": "import",
        "B409": "import",
        "B410": "import",
        "B411": "import",
        "B412": "import",
        "B413": "crypto",
        "B414": "crypto",
        "B501": "network",
        "B502": "crypto",
        "B503": "crypto",
        "B504": "ssl",
        "B505": "crypto",
        "B506": "yaml",
        "B507": "ssh",
        "B601": "shell",
        "B602": "shell",
        "B603": "shell",
        "B604": "shell",
        "B605": "shell",
        "B606": "shell",
        "B607": "shell",
        "B608": "injection",
        "B609": "wildcard",
        "B610": "django",
        "B611": "django",
        "B612": "django",
        "B701": "jinja",
        "B702": "jinja",
        "B703": "django",
    }
    
    if test_id in test_categories:
        return test_categories[test_id]
    
    # Pattern-based detection
    if any(x in combined for x in ["sql", "sqli", "injection"]):
        return "injection"
    if any(x in combined for x in ["exec", "eval", "compile"]):
        return "exec"
    if any(x in combined for x in ["crypto", "hash", "md5", "sha1", "password"]):
        return "crypto"
    if any(x in combined for x in ["shell", "subprocess", "popen", "system"]):
        return "shell"
    if any(x in combined for x in ["yaml", "xml", "pickle", "marshal"]):
        return "deserialization"
    if any(x in combined for x in ["ssl", "tls"]):
        return "ssl"
    if any(x in combined for x in ["django", "flask", "jinja"]):
        return "framework"
    if any(x in combined for x in ["import", "importl"]):
        return "import"
    
    return "python-security"
