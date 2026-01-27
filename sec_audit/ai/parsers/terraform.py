"""Parsers for Terraform scanner outputs (tfsec, checkov, tflint)."""
import json
import re
from pathlib import Path
from typing import List

from ..models import Finding


def parse_tfsec(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse tfsec output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # tfsec can output JSON or text
    if content.strip().startswith("["):
        return _parse_tfsec_json(content, scan_id)
    
    return _parse_tfsec_text(content, scan_id)


def _parse_tfsec_json(content: str, scan_id: str) -> List[Finding]:
    """Parse tfsec JSON output."""
    findings = []
    
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return findings
    
    if not isinstance(data, list):
        return findings
    
    severity_map = {
        "CRITICAL": "critical",
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
    }
    
    for result in data:
        if not isinstance(result, dict):
            continue
        
        severity_str = result.get("severity", "MEDIUM").upper()
        severity = severity_map.get(severity_str, "medium")
        
        rule_id = result.get("rule_id", "")
        description = result.get("description", "")
        link = result.get("link", "")
        
        # Extract file and line info
        location = result.get("location", {})
        file_path = location.get("filename", "")
        start_line = location.get("start_line")
        end_line = location.get("end_line")
        
        # Extract code snippet
        code_snippet = None
        if "code" in result:
            code_snippet = result["code"]
        
        # Infer category from rule_id
        category = _infer_terraform_category(rule_id)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="tfsec",
            severity=severity,
            category=category,
            title=result.get("rule_description", rule_id),
            description=description,
            file_path=file_path,
            line_start=start_line,
            line_end=end_line,
            code_snippet=code_snippet[:500] if code_snippet else None,
            remediation=link,
            confidence="high",
            metadata={
                "rule_id": rule_id,
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings


def _parse_tfsec_text(content: str, scan_id: str) -> List[Finding]:
    """Parse tfsec text output."""
    findings = []
    
    # tfsec text format:
    # [severity] rule_id: description
    #   file:path:line
    
    pattern = re.compile(
        r"\[([A-Z]+)\]\s+([^\s:]+):\s*(.+?)\n\s+([^\s:]+):(\d+)",
        re.MULTILINE
    )
    
    severity_map = {
        "CRITICAL": "critical",
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
    }
    
    for match in pattern.finditer(content):
        severity_str = match.group(1).upper()
        rule_id = match.group(2)
        description = match.group(3).strip()
        file_path = match.group(4)
        line_num = int(match.group(5))
        
        severity = severity_map.get(severity_str, "medium")
        category = _infer_terraform_category(rule_id)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="tfsec",
            severity=severity,
            category=category,
            title=rule_id,
            description=description,
            file_path=file_path,
            line_start=line_num,
            line_end=line_num,
            confidence="high",
            metadata={
                "rule_id": rule_id,
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings


def parse_checkov(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse checkov output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # checkov can output JSON or text
    if content.strip().startswith("{"):
        return _parse_checkov_json(content, scan_id)
    
    return _parse_checkov_text(content, scan_id)


def _parse_checkov_json(content: str, scan_id: str) -> List[Finding]:
    """Parse checkov JSON output."""
    findings = []
    
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return findings
    
    # checkov JSON structure: {"results": {"failed_checks": [...]}}
    results = data.get("results", {})
    failed_checks = results.get("failed_checks", [])
    
    severity_map = {
        "CRITICAL": "critical",
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
    }
    
    for check in failed_checks:
        if not isinstance(check, dict):
            continue
        
        severity_str = check.get("check_result", {}).get("result", {}).get("severity", "MEDIUM").upper()
        severity = severity_map.get(severity_str, "medium")
        
        check_id = check.get("check_id", "")
        check_name = check.get("check_name", check_id)
        description = check.get("check_result", {}).get("result", {}).get("evaluated_keys", [])
        
        # Extract file and line info
        file_path = check.get("file_path", "")
        file_line_range = check.get("file_line_range", [])
        line_start = file_line_range[0] if file_line_range else None
        line_end = file_line_range[1] if len(file_line_range) > 1 else line_start
        
        category = _infer_terraform_category(check_id)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="checkov",
            severity=severity,
            category=category,
            title=check_name,
            description=str(description) if description else "",
            file_path=file_path,
            line_start=line_start,
            line_end=line_end,
            confidence="high",
            metadata={
                "check_id": check_id,
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings


def _parse_checkov_text(content: str, scan_id: str) -> List[Finding]:
    """Parse checkov text output."""
    findings = []
    
    # checkov text format:
    # Check: check_id
    # 	FAILED for resource: resource_name
    # 	File: /path/to/file.tf:1-5
    
    pattern = re.compile(
        r"Check:\s+([^\n]+)\n.*?FAILED.*?\n.*?File:\s+([^:]+):(\d+)(?:-(\d+))?",
        re.MULTILINE
    )
    
    severity_map = {
        "CRITICAL": "critical",
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
    }
    
    for match in pattern.finditer(content):
        check_id = match.group(1).strip()
        file_path = match.group(2).strip()
        line_start = int(match.group(3))
        line_end = int(match.group(4)) if match.group(4) else line_start
        
        # Default severity (checkov text doesn't always include it)
        severity = "medium"
        category = _infer_terraform_category(check_id)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="checkov",
            severity=severity,
            category=category,
            title=check_id,
            description=f"Checkov check failed: {check_id}",
            file_path=file_path,
            line_start=line_start,
            line_end=line_end,
            confidence="high",
            metadata={
                "check_id": check_id,
            }
        )
        findings.append(finding)
    
    return findings


def parse_tflint(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse tflint output into normalized findings."""
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # tflint typically outputs JSON
    if content.strip().startswith("{"):
        return _parse_tflint_json(content, scan_id)
    
    return _parse_tflint_text(content, scan_id)


def _parse_tflint_json(content: str, scan_id: str) -> List[Finding]:
    """Parse tflint JSON output."""
    findings = []
    
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return findings
    
    # tflint JSON structure: {"issues": [...]}
    issues = data.get("issues", [])
    
    for issue in issues:
        if not isinstance(issue, dict):
            continue
        
        rule_name = issue.get("rule", {}).get("name", "")
        message = issue.get("message", "")
        severity_str = issue.get("rule", {}).get("severity", "warning").lower()
        
        severity_map = {
            "error": "high",
            "warning": "medium",
            "notice": "low",
        }
        severity = severity_map.get(severity_str, "medium")
        
        # Extract file and line info
        file_path = issue.get("range", {}).get("filename", "")
        start_line = issue.get("range", {}).get("start", {}).get("line")
        end_line = issue.get("range", {}).get("end", {}).get("line")
        
        category = _infer_terraform_category(rule_name)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="tflint",
            severity=severity,
            category=category,
            title=rule_name,
            description=message,
            file_path=file_path,
            line_start=start_line,
            line_end=end_line,
            confidence="medium",  # tflint is more of a linter
            metadata={
                "rule_name": rule_name,
                "severity_original": severity_str,
            }
        )
        findings.append(finding)
    
    return findings


def _parse_tflint_text(content: str, scan_id: str) -> List[Finding]:
    """Parse tflint text output."""
    findings = []
    
    # tflint text format:
    # Warning: message (rule_name)
    #   on file.tf line 1
    
    pattern = re.compile(
        r"(Error|Warning|Notice):\s+(.+?)\s+\(([^)]+)\)\s+on\s+([^\s]+)\s+line\s+(\d+)",
        re.MULTILINE
    )
    
    severity_map = {
        "Error": "high",
        "Warning": "medium",
        "Notice": "low",
    }
    
    for match in pattern.finditer(content):
        severity_str = match.group(1)
        message = match.group(2).strip()
        rule_name = match.group(3)
        file_path = match.group(4)
        line_num = int(match.group(5))
        
        severity = severity_map.get(severity_str, "medium")
        category = _infer_terraform_category(rule_name)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="tflint",
            severity=severity,
            category=category,
            title=rule_name,
            description=message,
            file_path=file_path,
            line_start=line_num,
            line_end=line_num,
            confidence="medium",
            metadata={
                "rule_name": rule_name,
                "severity_original": severity_str.lower(),
            }
        )
        findings.append(finding)
    
    return findings


def _infer_terraform_category(rule_id: str) -> str:
    """Infer vulnerability category from Terraform rule ID."""
    rule_lower = rule_id.lower()
    
    if any(x in rule_lower for x in ["secret", "password", "api_key", "token"]):
        return "secrets"
    if any(x in rule_lower for x in ["public", "expose", "ingress", "0.0.0.0"]):
        return "config"
    if any(x in rule_lower for x in ["encrypt", "ssl", "tls", "crypto"]):
        return "crypto"
    if any(x in rule_lower for x in ["auth", "iam", "permission", "access"]):
        return "auth"
    if any(x in rule_lower for x in ["backup", "logging", "monitor"]):
        return "config"
    
    return "config"  # Default category
