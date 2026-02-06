"""Parser for Hadolint text output."""
import re
from pathlib import Path
from typing import List

from ..models import Finding


def parse_hadolint(text_file: Path, scan_id: str) -> List[Finding]:
    """Parse Hadolint text output into normalized findings.
    
    Hadolint output format:
    Dockerfile:10 DL3006 warning: Always tag the version of an explicit base image
    Dockerfile:15 DL4000 error: MAINTAINER is deprecated
    
    Format: <file>:<line> <rule> <severity>: <message>
    """
    findings = []
    
    if not text_file.exists():
        return findings
    
    try:
        content = text_file.read_text(encoding="utf-8")
    except IOError:
        return findings
    
    # Parse each line for findings
    # Pattern: <file>:<line> <rule> <severity>: <message>
    # Example: Dockerfile:10 DL3006 warning: Always tag the version...
    pattern = r'^([^:]+):(\d+)\s+([A-Z]{2}\d{4})\s+(error|warning|info|style|ignore):\s*(.+)$'
    
    for line in content.splitlines():
        line = line.strip()
        match = re.match(pattern, line, re.IGNORECASE)
        
        if match:
            file_path = match.group(1)
            line_num = int(match.group(2))
            rule_id = match.group(3)
            severity_str = match.group(4).lower()
            message = match.group(5)
            
            # Map severity
            severity_map = {
                "error": "high",
                "warning": "medium",
                "info": "low",
                "style": "info",
                "ignore": "info",
            }
            severity = severity_map.get(severity_str, "medium")
            
            # Infer category from rule ID
            category = _infer_category(rule_id, message)
            
            finding = Finding(
                scan_id=scan_id,
                scanner="hadolint",
                severity=severity,
                category=category,
                title=f"[{rule_id}] Dockerfile Best Practice",
                description=message,
                file_path=file_path,
                line_start=line_num,
                line_end=line_num,
                code_snippet=None,
                confidence="high",
                metadata={
                    "rule_id": rule_id,
                    "severity_original": severity_str,
                }
            )
            findings.append(finding)
    
    return findings


def _infer_category(rule_id: str, message: str) -> str:
    """Infer category from Hadolint rule ID and message."""
    combined = f"{rule_id} {message}".lower()
    
    # DL3xxx rules are about base images, tags, versions
    if rule_id.startswith("DL3"):
        if "tag" in combined or "version" in combined:
            return "dockerfile-versioning"
        if "apk" in combined or "apt" in combined or "yum" in combined or "pip" in combined:
            return "dockerfile-packages"
        if "user" in combined:
            return "dockerfile-user"
        if "workdir" in combined:
            return "dockerfile-workdir"
        return "dockerfile-best-practice"
    
    # DL4xxx rules are about deprecated features, metadata
    if rule_id.startswith("DL4"):
        if "deprecated" in combined:
            return "dockerfile-deprecated"
        if "maintainer" in combined:
            return "dockerfile-metadata"
        if "sudo" in combined or "setuid" in combined:
            return "dockerfile-security"
        return "dockerfile-best-practice"
    
    # DL6xxx rules are about build practices
    if rule_id.startswith("DL6"):
        return "dockerfile-build"
    
    # SC2xxx rules are shellcheck rules (embedded in Hadolint)
    if rule_id.startswith("SC"):
        return "dockerfile-shell"
    
    return "dockerfile"
