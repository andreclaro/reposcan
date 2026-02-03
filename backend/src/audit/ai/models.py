"""Data models for normalized findings."""
from dataclasses import dataclass, field
from typing import Optional, Dict, Any, Literal

# Type aliases for better type safety
ScannerType = Literal[
    "semgrep",
    "trivy",
    "npm",
    "govulncheck",
    "cargo-audit",
    "tfsec",
    "checkov",
    "tflint",
]

SeverityType = Literal["critical", "high", "medium", "low", "info"]

CategoryType = Literal[
    "injection",
    "xss",
    "auth",
    "crypto",
    "dependency",
    "config",
    "secrets",
    "rce",
    "ssrf",
    "idor",
]

ConfidenceType = Literal["high", "medium", "low"]

# Valid value sets for validation
VALID_SCANNERS: set[str] = {
    "semgrep",
    "trivy",
    "npm",
    "govulncheck",
    "cargo-audit",
    "tfsec",
    "checkov",
    "tflint",
}

VALID_SEVERITIES: set[str] = {"critical", "high", "medium", "low", "info"}

VALID_CATEGORIES: set[str] = {
    "injection",
    "xss",
    "auth",
    "crypto",
    "dependency",
    "config",
    "secrets",
    "rce",
    "ssrf",
    "idor",
}

VALID_CONFIDENCE_LEVELS: set[str] = {"high", "medium", "low"}

# Severity mapping for normalization
SEVERITY_MAPPING: Dict[str, SeverityType] = {
    # Common variations
    "error": "critical",
    "err": "critical",
    "critical": "critical",
    "high": "high",
    "warning": "high",
    "warn": "high",
    "medium": "medium",
    "moderate": "medium",
    "med": "medium",
    "low": "low",
    "info": "info",
    "informational": "info",
    "note": "info",
    # Numeric severities (0-10 scale)
    "10": "critical",
    "9": "critical",
    "8": "high",
    "7": "high",
    "6": "medium",
    "5": "medium",
    "4": "low",
    "3": "low",
    "2": "info",
    "1": "info",
    "0": "info",
}


@dataclass
class Finding:
    """Normalized finding from any security scanner.
    
    This model represents a security finding in a standardized format,
    regardless of the source scanner. All scanner-specific outputs are
    normalized to this common structure.
    
    Attributes:
        scan_id: Unique identifier for the scan this finding belongs to
        scanner: Source scanner that generated this finding
        severity: Normalized severity level (critical/high/medium/low/info)
        category: Vulnerability category (injection/xss/auth/etc.)
        title: Short title/name of the finding
        description: Detailed description of the vulnerability
        file_path: Relative path to the file containing the issue
        line_start: Starting line number (1-indexed)
        line_end: Ending line number (1-indexed)
        code_snippet: Code snippet showing the vulnerable code (max 500 chars)
        cwe: Common Weakness Enumeration identifier (e.g., "CWE-79")
        cve: Common Vulnerabilities and Exposures identifier (e.g., "CVE-2024-1234")
        remediation: Suggested fix or remediation steps
        confidence: Confidence level in the finding (high/medium/low)
        metadata: Scanner-specific additional data (rule_id, package_name, etc.)
    """

    scan_id: str
    scanner: str
    severity: str
    category: Optional[str] = None
    title: str = ""
    description: Optional[str] = None
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    code_snippet: Optional[str] = None
    cwe: Optional[str] = None
    cve: Optional[str] = None
    remediation: Optional[str] = None
    confidence: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Validate and normalize finding data after initialization."""
        # Normalize severity
        self.severity = self.normalize_severity(self.severity)
        
        # Validate scanner
        if self.scanner not in VALID_SCANNERS:
            raise ValueError(
                f"Invalid scanner: {self.scanner}. "
                f"Must be one of: {', '.join(sorted(VALID_SCANNERS))}"
            )
        
        # Validate severity
        if self.severity not in VALID_SEVERITIES:
            raise ValueError(
                f"Invalid severity: {self.severity}. "
                f"Must be one of: {', '.join(sorted(VALID_SEVERITIES))}"
            )
        
        # Validate category if provided
        if self.category is not None and self.category not in VALID_CATEGORIES:
            # Allow unknown categories but log a warning
            # This allows for future extensibility
            pass
        
        # Validate confidence if provided
        if self.confidence is not None and self.confidence not in VALID_CONFIDENCE_LEVELS:
            raise ValueError(
                f"Invalid confidence: {self.confidence}. "
                f"Must be one of: {', '.join(sorted(VALID_CONFIDENCE_LEVELS))}"
            )
        
        # Ensure title is not empty
        if not self.title:
            self.title = f"Security finding from {self.scanner}"
        
        # Truncate code snippet to 500 characters
        if self.code_snippet and len(self.code_snippet) > 500:
            self.code_snippet = self.code_snippet[:500]
        
        # Normalize CWE format (ensure CWE- prefix)
        if self.cwe and not self.cwe.upper().startswith("CWE-"):
            # Try to extract CWE number
            import re
            cwe_match = re.search(r"\d+", self.cwe)
            if cwe_match:
                self.cwe = f"CWE-{cwe_match.group()}"
            else:
                self.cwe = None
        
        # Normalize CVE format (ensure CVE- prefix)
        if self.cve and not self.cve.upper().startswith("CVE-"):
            # Try to extract CVE identifier
            import re
            cve_match = re.search(r"CVE-\d{4}-\d+", self.cve.upper())
            if cve_match:
                self.cve = cve_match.group()
            else:
                # Try to construct from year and number
                cve_parts = re.findall(r"\d+", self.cve)
                if len(cve_parts) >= 2:
                    self.cve = f"CVE-{cve_parts[0]}-{cve_parts[1]}"
                else:
                    self.cve = None

    @staticmethod
    def normalize_severity(severity: str) -> SeverityType:
        """Normalize severity string to standard format.
        
        Args:
            severity: Severity string from scanner (case-insensitive)
            
        Returns:
            Normalized severity (critical/high/medium/low/info)
            
        Examples:
            >>> Finding.normalize_severity("ERROR")
            'critical'
            >>> Finding.normalize_severity("warning")
            'high'
            >>> Finding.normalize_severity("8")
            'high'
        """
        severity_lower = severity.lower().strip()
        normalized = SEVERITY_MAPPING.get(severity_lower)
        
        if normalized:
            return normalized
        
        # Default to medium if unknown
        return "medium"

    def to_dict(self) -> Dict[str, Any]:
        """Convert finding to dictionary for database insertion.
        
        Returns:
            Dictionary with all finding fields, ready for database insertion
        """
        return {
            "scan_id": self.scan_id,
            "scanner": self.scanner,
            "severity": self.severity,
            "category": self.category,
            "title": self.title,
            "description": self.description,
            "file_path": self.file_path,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "code_snippet": self.code_snippet,
            "cwe": self.cwe,
            "cve": self.cve,
            "remediation": self.remediation,
            "confidence": self.confidence,
            "metadata": self.metadata,
        }

    def is_critical(self) -> bool:
        """Check if finding is critical severity."""
        return self.severity == "critical"

    def is_high_or_critical(self) -> bool:
        """Check if finding is high or critical severity."""
        return self.severity in ("critical", "high")

    def get_severity_weight(self) -> int:
        """Get numeric weight for severity (higher = more severe).
        
        Returns:
            Weight value: critical=5, high=4, medium=3, low=2, info=1
        """
        weights = {
            "critical": 5,
            "high": 4,
            "medium": 3,
            "low": 2,
            "info": 1,
        }
        return weights.get(self.severity, 0)

    def has_location(self) -> bool:
        """Check if finding has file location information."""
        return self.file_path is not None and self.line_start is not None

    def get_location_string(self) -> str:
        """Get human-readable location string.
        
        Returns:
            Location string like "src/file.py:42" or "src/file.py:42-45"
        """
        if not self.has_location():
            return "unknown location"
        
        if self.line_end and self.line_end != self.line_start:
            return f"{self.file_path}:{self.line_start}-{self.line_end}"
        return f"{self.file_path}:{self.line_start}"
