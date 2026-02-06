"""Scanner configuration - enable/disable individual scanners.

This module provides a centralized way to configure which scanners are enabled
or disabled via environment variables. This is useful for:

1. Performance tuning - disable slow scanners
2. Troubleshooting - disable problematic scanners
3. Compliance - only run approved scanners
4. Resource constraints - skip resource-intensive scanners

Environment variable format:
    SCANNER_<AUDIT_TYPE>_ENABLED=true|false

Examples:
    SCANNER_SECRETS_ENABLED=false      # Disable Gitleaks
    SCANNER_SCA_ENABLED=false          # Disable OSV-Scanner
    SCANNER_DAST_ENABLED=true          # Enable ZAP (requires DAST_TARGET_URL)
    SCANNER_SECRETS_DEEP_ENABLED=true  # Enable TruffleHog (slower but thorough)

Default behavior:
    - All scanners are ENABLED by default
    - DAST is special: disabled by default (requires DAST_TARGET_URL)
    - secrets_deep is special: disabled by default (slower than Gitleaks)
"""
import os
from dataclasses import dataclass, asdict
from typing import Dict, List, Set


@dataclass(frozen=True)
class ScannerDefinition:
    """Full metadata for a single scanner, used as the single source of truth."""
    key: str
    name: str
    tool: str
    description: str
    default_enabled: bool
    order: int


# Authoritative scanner registry — add new scanners here only.
# `order` uses gaps (10, 20, ...) so new scanners can be inserted without renumbering.
SCANNER_REGISTRY: List[ScannerDefinition] = [
    ScannerDefinition("sast",           "SAST",            "Semgrep",              "Static application security testing",         True,  10),
    ScannerDefinition("sca",            "SCA",             "OSV-Scanner",          "Software composition analysis",               True,  20),
    ScannerDefinition("secrets",        "Secrets",         "Gitleaks",             "Secret and credential detection",             True,  30),
    ScannerDefinition("secrets_deep",   "Deep Secrets",    "TruffleHog",           "Deep secret scanning (thorough)",             False, 40),
    ScannerDefinition("node",           "Node.js",         "npm/pnpm audit",       "JavaScript dependency vulnerabilities",       True,  50),
    ScannerDefinition("go",             "Go",              "govulncheck",          "Go module vulnerability scanning",            True,  60),
    ScannerDefinition("rust",           "Rust",            "cargo-audit",          "Rust dependency vulnerability scanning",      True,  70),
    ScannerDefinition("python",         "Python",          "Bandit",               "Python security linting",                     True,  80),
    ScannerDefinition("dockerfile",     "Dockerfile",      "Trivy",                "Container image vulnerability scanning",      True,  90),
    ScannerDefinition("dockerfile_lint","Dockerfile Lint",  "Hadolint",             "Dockerfile best practices",                   True, 100),
    ScannerDefinition("misconfig",      "Misconfiguration","Trivy Config",         "K8s/Docker Compose config scanning",          True, 110),
    ScannerDefinition("terraform",      "Terraform",       "tfsec/checkov/tflint", "Infrastructure-as-code scanning",             True, 120),
    ScannerDefinition("dast",           "DAST",            "OWASP ZAP",            "Dynamic application security testing",        False, 130),
]

# Derived from registry — used by the rest of the codebase (backward-compatible).
SCANNER_DEFAULTS: Dict[str, bool] = {
    s.key: s.default_enabled for s in SCANNER_REGISTRY
}

# Environment variable prefix
ENV_PREFIX = "SCANNER_"
ENV_SUFFIX = "_ENABLED"


def is_scanner_enabled(audit_type: str) -> bool:
    """Check if a scanner is enabled.
    
    Reads from environment variable first, falls back to default.
    
    Args:
        audit_type: The audit type identifier (e.g., 'secrets', 'sca', 'dast')
    
    Returns:
        True if the scanner is enabled, False otherwise
    """
    # Build environment variable name
    # Convert audit_type to uppercase, replace non-alphanumeric with underscore
    env_var = f"{ENV_PREFIX}{audit_type.upper().replace('-', '_').replace(' ', '_')}{ENV_SUFFIX}"
    
    # Check environment variable
    env_value = os.getenv(env_var)
    if env_value is not None:
        return env_value.lower() in ("true", "1", "yes", "on")
    
    # Fall back to default
    return SCANNER_DEFAULTS.get(audit_type, True)


def get_disabled_scanners() -> Set[str]:
    """Get the set of disabled scanners.
    
    Returns:
        Set of audit types that are currently disabled
    """
    disabled = set()
    for audit_type in SCANNER_DEFAULTS.keys():
        if not is_scanner_enabled(audit_type):
            disabled.add(audit_type)
    return disabled


def get_enabled_scanners() -> Set[str]:
    """Get the set of enabled scanners.
    
    Returns:
        Set of audit types that are currently enabled
    """
    enabled = set()
    for audit_type in SCANNER_DEFAULTS.keys():
        if is_scanner_enabled(audit_type):
            enabled.add(audit_type)
    return enabled


def get_scanner_status() -> Dict[str, Dict[str, bool]]:
    """Get the status of all scanners.
    
    Returns:
        Dictionary mapping audit type to status dict with:
        - enabled: current enabled state
        - default: default enabled state
        - env_var: environment variable name
    """
    status = {}
    for audit_type, default in SCANNER_DEFAULTS.items():
        env_var = f"{ENV_PREFIX}{audit_type.upper().replace('-', '_').replace(' ', '_')}{ENV_SUFFIX}"
        status[audit_type] = {
            "enabled": is_scanner_enabled(audit_type),
            "default": default,
            "env_var": env_var,
        }
    return status


def should_run_scanner(audit_type: str, selected_audits: list) -> bool:
    """Determine if a scanner should run based on configuration and selection.
    
    This combines the scanner enable/disable configuration with the user's
    selected audit types.
    
    Args:
        audit_type: The audit type to check
        selected_audits: List of audit types selected by the user
    
    Returns:
        True if the scanner should run, False otherwise
    """
    # Check if scanner is enabled in configuration
    if not is_scanner_enabled(audit_type):
        return False
    
    # Check if audit type is in selected audits
    from .utils import should_run_audit
    return should_run_audit(selected_audits, audit_type)


def log_scanner_status(logger=None):
    """Log the current scanner configuration status.
    
    Args:
        logger: Optional logger instance. If None, uses print.
    """
    def log(msg):
        if logger:
            logger.info(msg)
        else:
            print(msg)
    
    log("Scanner Configuration:")
    log("-" * 60)
    
    enabled = get_enabled_scanners()
    disabled = get_disabled_scanners()
    
    if enabled:
        log(f"Enabled scanners ({len(enabled)}): {', '.join(sorted(enabled))}")
    
    if disabled:
        log(f"Disabled scanners ({len(disabled)}): {', '.join(sorted(disabled))}")
        for audit_type in sorted(disabled):
            env_var = f"{ENV_PREFIX}{audit_type.upper().replace('-', '_').replace(' ', '_')}{ENV_SUFFIX}"
            log(f"  - To enable {audit_type}: export {env_var}=true")
    
    if not disabled:
        log("All scanners are enabled")
    
    log("-" * 60)


def apply_cli_overrides(enable: list[str] | None, disable: list[str] | None) -> None:
    """Apply --enable/--disable CLI flags by setting environment variables.

    This lets CLI flags take precedence over defaults without touching
    the rest of the config logic.

    Args:
        enable:  list of audit types to force-enable  (e.g. ["secrets_deep", "dast"])
        disable: list of audit types to force-disable (e.g. ["sast", "terraform"])
    """
    for audit_type in (enable or []):
        key = audit_type.strip().lower()
        if key in SCANNER_DEFAULTS:
            env_var = f"{ENV_PREFIX}{key.upper().replace('-', '_').replace(' ', '_')}{ENV_SUFFIX}"
            os.environ[env_var] = "true"

    for audit_type in (disable or []):
        key = audit_type.strip().lower()
        if key in SCANNER_DEFAULTS:
            env_var = f"{ENV_PREFIX}{key.upper().replace('-', '_').replace(' ', '_')}{ENV_SUFFIX}"
            os.environ[env_var] = "false"


def get_scanner_registry() -> List[dict]:
    """Return the full scanner registry as JSON-serializable dicts.

    Each dict includes the static metadata from ``SCANNER_REGISTRY`` plus the
    current ``enabled`` state (which accounts for environment overrides).
    """
    result: List[dict] = []
    for scanner in SCANNER_REGISTRY:
        d = asdict(scanner)
        # camelCase keys for the frontend
        d["defaultEnabled"] = d.pop("default_enabled")
        d["enabled"] = is_scanner_enabled(scanner.key)
        result.append(d)
    return result


# Convenience functions for specific scanners
def is_gitleaks_enabled() -> bool:
    """Check if Gitleaks (secrets) scanner is enabled."""
    return is_scanner_enabled("secrets")


def is_osv_scanner_enabled() -> bool:
    """Check if OSV-Scanner (sca) is enabled."""
    return is_scanner_enabled("sca")


def is_bandit_enabled() -> bool:
    """Check if Bandit (python) scanner is enabled."""
    return is_scanner_enabled("python")


def is_hadolint_enabled() -> bool:
    """Check if Hadolint (dockerfile_lint) scanner is enabled."""
    return is_scanner_enabled("dockerfile_lint")


def is_trivy_config_enabled() -> bool:
    """Check if Trivy Config (misconfig) scanner is enabled."""
    return is_scanner_enabled("misconfig")


def is_zap_enabled() -> bool:
    """Check if ZAP (dast) scanner is enabled."""
    return is_scanner_enabled("dast")


def is_trufflehog_enabled() -> bool:
    """Check if TruffleHog (secrets_deep) scanner is enabled."""
    return is_scanner_enabled("secrets_deep")
