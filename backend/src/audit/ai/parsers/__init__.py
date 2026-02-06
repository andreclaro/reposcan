"""Parsers for converting scanner outputs to normalized findings."""
from .semgrep import parse_semgrep
from .trivy import parse_trivy
from .npm import parse_npm_audit
from .go import parse_govulncheck
from .rust import parse_cargo_audit
from .terraform import parse_tfsec, parse_checkov, parse_tflint
from .gitleaks import parse_gitleaks
from .osv import parse_osv_scanner
from .bandit import parse_bandit
from .hadolint import parse_hadolint
from .trivy_config import parse_trivy_config
from .zap import parse_zap
from .trufflehog import parse_trufflehog

__all__ = [
    'parse_semgrep',
    'parse_trivy',
    'parse_npm_audit',
    'parse_govulncheck',
    'parse_cargo_audit',
    'parse_tfsec',
    'parse_checkov',
    'parse_tflint',
    'parse_gitleaks',
    'parse_osv_scanner',
    'parse_bandit',
    'parse_hadolint',
    'parse_trivy_config',
    'parse_zap',
    'parse_trufflehog',
]
