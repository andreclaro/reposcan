"""Parser for TruffleHog JSON output.

TruffleHog is an enhanced secret scanner with 800+ detectors and
entropy analysis to reduce false positives.
"""
import json
from pathlib import Path
from typing import List

from ..models import Finding


def parse_trufflehog(json_file: Path, scan_id: str) -> List[Finding]:
    """Parse TruffleHog JSON output into normalized findings.
    
    TruffleHog JSON format (one object per line, but we aggregate):
    {
        "findings": [
            {
                "SourceMetadata": {
                    "Data": {
                        "Git": {
                            "commit": "abc123...",
                            "file": "config/secrets.yml",
                            "email": "author@example.com",
                            "repository": "https://github.com/org/repo",
                            "timestamp": "2024-01-15T10:30:00Z",
                            "line": 42
                        }
                    }
                },
                "SourceID": 1,
                "SourceType": 16,
                "SourceName": "trufflehog - git",
                "DetectorType": 17,
                "DetectorName": "AWS",
                "DecoderName": "PLAIN",
                "Verified": true,
                "Raw": "AKIAIOSFODNN7EXAMPLE",
                "Redacted": "AKIAIOSFODNN7EXAMPLE",
                "ExtraData": {
                    "account": "123456789012"
                },
                "StructuredData": null
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
    
    # TruffleHog wraps findings in a "findings" key
    if isinstance(data, dict):
        results = data.get("findings", [])
    elif isinstance(data, list):
        results = data
    else:
        return findings
    
    for result in results:
        if not isinstance(result, dict):
            continue
        
        # Extract detector info
        detector_name = result.get("DetectorName", "Unknown")
        is_verified = result.get("Verified", False)
        
        # Get source metadata
        source_metadata = result.get("SourceMetadata", {})
        data_info = source_metadata.get("Data", {})
        git_info = data_info.get("Git", {})
        
        file_path = git_info.get("file", "")
        line_num = git_info.get("line")
        commit = git_info.get("commit", "")
        
        # Get the raw secret (redacted in output)
        raw_secret = result.get("Raw", "")
        redacted = result.get("Redacted", "")
        
        # Use redacted version for display
        secret_display = redacted if redacted else "***REDACTED***"
        
        # Determine severity based on verification status
        # Verified secrets are more critical
        if is_verified:
            severity = "critical"
            confidence = "high"
        else:
            severity = "high"
            confidence = "medium"
        
        # Get extra data
        extra_data = result.get("ExtraData", {})
        
        # Infer category
        category = _infer_category(detector_name)
        
        # Create title and description
        title = f"[{detector_name}] Secret Detected"
        if is_verified:
            title = f"[VERIFIED] {title}"
        
        description = f"""
Secret Type: {detector_name}
Verified: {is_verified}
Detector: {result.get("DecoderName", "PLAIN")}
{extra_data and "Extra Info: " + str(extra_data) or ""}

This secret was detected using TruffleHog's {detector_name} detector.
{"WARNING: This secret has been VERIFIED as valid/live!" if is_verified else ""}
        """.strip()
        
        finding = Finding(
            scan_id=scan_id,
            scanner="trufflehog",
            severity=severity,
            category=category,
            title=title,
            description=description,
            file_path=file_path,
            line_start=line_num,
            line_end=line_num,
            code_snippet=secret_display[:500] if secret_display else None,
            confidence=confidence,
            metadata={
                "detector": detector_name,
                "verified": is_verified,
                "commit": commit,
                "decoder": result.get("DecoderName", "PLAIN"),
                "extra_data": extra_data,
            }
        )
        findings.append(finding)
    
    return findings


def _infer_category(detector_name: str) -> str:
    """Infer vulnerability category from TruffleHog detector name."""
    detector_lower = detector_name.lower()
    
    # Cloud providers
    if any(x in detector_lower for x in ["aws", "amazon"]):
        return "cloud-aws"
    if any(x in detector_lower for x in ["gcp", "google", "firebase"]):
        return "cloud-gcp"
    if any(x in detector_lower for x in ["azure", "microsoft"]):
        return "cloud-azure"
    
    # Service types
    if any(x in detector_lower for x in ["database", "db", "sql", "mongo", "redis", "postgres", "mysql"]):
        return "database"
    if any(x in detector_lower for x in ["api", "token", "key"]):
        return "api-credentials"
    if any(x in detector_lower for x in ["jwt", "bearer", "auth"]):
        return "auth"
    if any(x in detector_lower for x in ["privatekey", "private_key", "certificate", "cert"]):
        return "crypto"
    if any(x in detector_lower for x in ["webhook", "url", "uri"]):
        return "webhook"
    if any(x in detector_lower for x in ["github", "gitlab", "bitbucket", "git"]):
        return "vcs"
    if any(x in detector_lower for x in ["slack", "discord", "telegram", "teams"]):
        return "messaging"
    if any(x in detector_lower for x in ["stripe", "paypal", "payment", "financial"]):
        return "payment"
    
    return "secrets"
