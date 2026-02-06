"""Parser for Gitleaks JSON output."""
import json
from pathlib import Path
from typing import List

from ..models import Finding


def parse_gitleaks(json_file: Path, scan_id: str) -> List[Finding]:
    """Parse Gitleaks JSON output into normalized findings.
    
    Gitleaks JSON format:
    [
        {
            "Description": "AWS Access Key",
            "StartLine": 10,
            "EndLine": 10,
            "StartColumn": 5,
            "EndColumn": 25,
            "Match": "AKIAIOSFODNN7EXAMPLE",
            "Secret": "AKIAIOSFODNN7EXAMPLE",
            "File": "config/aws-credentials",
            "SymlinkFile": "",
            "Commit": "abc123...",
            "Entropy": 3.5,
            "Author": "author@example.com",
            "Email": "author@example.com",
            "Date": "2024-01-15T10:30:00Z",
            "Message": "Add AWS credentials",
            "Tags": ["aws", "access_key"],
            "RuleID": "aws-access-key-id",
            "Fingerprint": "abc123..."
        }
    ]
    """
    findings = []
    
    if not json_file.exists():
        return findings
    
    try:
        with json_file.open("r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return findings
    
    # Gitleaks returns a list of findings directly
    if not isinstance(data, list):
        # Handle case where it might be wrapped
        if isinstance(data, dict) and "findings" in data:
            data = data["findings"]
        else:
            return findings
    
    for result in data:
        # Map rule ID to severity
        rule_id = result.get("RuleID", "")
        severity = _map_severity(rule_id)
        
        # Extract file and line information
        file_path = result.get("File", "")
        start_line = result.get("StartLine")
        end_line = result.get("EndLine")
        
        # Get the secret and match
        secret = result.get("Secret", "")
        match = result.get("Match", "")
        description = result.get("Description", "Secret detected")
        
        # Create code snippet (truncate secret for safety)
        code_snippet = match
        if secret and len(secret) > 4:
            # Mask the secret in the snippet
            code_snippet = match.replace(secret, "***REDACTED***")
        
        # Get tags for category inference
        tags = result.get("Tags", [])
        category = _infer_category(rule_id, tags, description)
        
        finding = Finding(
            scan_id=scan_id,
            scanner="gitleaks",
            severity=severity,
            category=category,
            title=f"{description}",
            description=f"{description}. Secret type: {rule_id}",
            file_path=file_path,
            line_start=start_line,
            line_end=end_line,
            code_snippet=code_snippet[:500] if code_snippet else None,
            confidence="high",  # Gitleaks has high confidence for detected secrets
            metadata={
                "rule_id": rule_id,
                "tags": tags,
                "entropy": result.get("Entropy"),
                "commit": result.get("Commit"),
                "author": result.get("Author"),
                "date": result.get("Date"),
                "fingerprint": result.get("Fingerprint"),
            }
        )
        findings.append(finding)
    
    return findings


def _map_severity(rule_id: str) -> str:
    """Map Gitleaks rule ID to severity level.
    
    Gitleaks doesn't have built-in severity, so we map based on rule type.
    """
    rule_id_lower = rule_id.lower()
    
    # Critical: Cloud provider master keys, private keys
    critical_patterns = [
        "private-key", "privatekey", "rsa", "dsa", "ecdsa", "ed25519",
        "aws-secret", "aws-account", "gcp-api-key", "azure",
    ]
    for pattern in critical_patterns:
        if pattern in rule_id_lower:
            return "critical"
    
    # High: API keys, tokens, passwords
    high_patterns = [
        "api-key", "apikey", "api_token", "access-token", "access_token",
        "auth-token", "bearer", "jwt", "password", "secret",
        "github-token", "gitlab-token", "slack-token", "discord-token",
    ]
    for pattern in high_patterns:
        if pattern in rule_id_lower:
            return "high"
    
    # Medium: General credentials, connection strings
    medium_patterns = [
        "connection-string", "database-url", "jdbc", "mongodb",
    ]
    for pattern in medium_patterns:
        if pattern in rule_id_lower:
            return "medium"
    
    # Default to high for any detected secret
    return "high"


def _infer_category(rule_id: str, tags: List[str], description: str) -> str:
    """Infer vulnerability category from rule ID, tags, and description."""
    combined = f"{rule_id} {' '.join(tags)} {description}".lower()
    
    # Cloud providers
    if any(x in combined for x in ["aws", "amazon"]):
        return "cloud-aws"
    if any(x in combined for x in ["gcp", "google", "firebase"]):
        return "cloud-gcp"
    if any(x in combined for x in ["azure", "microsoft"]):
        return "cloud-azure"
    
    # Service types
    if any(x in combined for x in ["database", "db", "sql", "mongo", "redis", "postgres", "mysql"]):
        return "database"
    if any(x in combined for x in ["api-key", "apikey", "api_token"]):
        return "api-credentials"
    if any(x in combined for x in ["jwt", "bearer", "auth"]):
        return "auth"
    if any(x in combined for x in ["private-key", "privatekey", "certificate", "cert"]):
        return "crypto"
    if any(x in combined for x in ["webhook", "url"]):
        return "webhook"
    if any(x in combined for x in ["github", "gitlab", "bitbucket", "git"]):
        return "vcs"
    if any(x in combined for x in ["slack", "discord", "telegram", "teams"]):
        return "messaging"
    if any(x in combined for x in ["stripe", "paypal", "payment"]):
        return "payment"
    
    return "secrets"
