"""Findings normalizer - orchestrates parsing of all scanner outputs."""
from pathlib import Path
from typing import List

from .models import Finding
from .parsers import (
    parse_semgrep,
    parse_trivy,
    parse_npm_audit,
    parse_govulncheck,
    parse_cargo_audit,
    parse_tfsec,
    parse_checkov,
    parse_tflint,
    parse_gitleaks,
    parse_osv_scanner,
    parse_bandit,
    parse_hadolint,
    parse_trivy_config,
    parse_zap,
    parse_trufflehog,
)


def normalize_findings(results_dir: Path, scan_id: str) -> List[Finding]:
    """
    Normalize all scanner outputs into structured findings.
    
    Args:
        results_dir: Directory containing scanner output files
        scan_id: Unique scan identifier
    
    Returns:
        List of normalized findings
    """
    findings = []
    
    # Parse Semgrep
    semgrep_json = results_dir / "semgrep.json"
    if semgrep_json.exists():
        findings.extend(parse_semgrep(semgrep_json, scan_id))
    
    # Parse Trivy Dockerfile scan
    trivy_txt = results_dir / "trivy_dockerfile_scan.txt"
    if trivy_txt.exists():
        findings.extend(parse_trivy(trivy_txt, scan_id))
    
    # Parse Trivy filesystem scan
    trivy_fs_txt = results_dir / "trivy_fs_scan.txt"
    if trivy_fs_txt.exists():
        findings.extend(parse_trivy(trivy_fs_txt, scan_id))
    
    # Parse npm/pnpm audit
    node_audit_txt = results_dir / "node_audit.txt"
    if node_audit_txt.exists():
        findings.extend(parse_npm_audit(node_audit_txt, scan_id))
    
    # Parse govulncheck
    go_vulncheck_txt = results_dir / "go_vulncheck.txt"
    if go_vulncheck_txt.exists():
        findings.extend(parse_govulncheck(go_vulncheck_txt, scan_id))
    
    # Parse cargo-audit
    rust_audit_txt = results_dir / "rust_audit.txt"
    if rust_audit_txt.exists():
        findings.extend(parse_cargo_audit(rust_audit_txt, scan_id))
    
    # Parse Terraform scanners
    tfsec_txt = results_dir / "tfsec.txt"
    if tfsec_txt.exists():
        findings.extend(parse_tfsec(tfsec_txt, scan_id))
    
    checkov_txt = results_dir / "checkov.txt"
    if checkov_txt.exists():
        findings.extend(parse_checkov(checkov_txt, scan_id))
    
    tflint_txt = results_dir / "tflint.txt"
    if tflint_txt.exists():
        findings.extend(parse_tflint(tflint_txt, scan_id))
    
    # Parse Gitleaks secrets
    gitleaks_json = results_dir / "gitleaks.json"
    if gitleaks_json.exists():
        findings.extend(parse_gitleaks(gitleaks_json, scan_id))
    
    # Parse OSV-Scanner results
    osv_json = results_dir / "osv_scanner.json"
    if osv_json.exists():
        findings.extend(parse_osv_scanner(osv_json, scan_id))
    
    # Parse Bandit results
    bandit_json = results_dir / "bandit.json"
    if bandit_json.exists():
        findings.extend(parse_bandit(bandit_json, scan_id))
    
    # Parse Hadolint results
    hadolint_txt = results_dir / "hadolint.txt"
    if hadolint_txt.exists():
        findings.extend(parse_hadolint(hadolint_txt, scan_id))
    
    # Parse Trivy config results (K8s/Docker Compose)
    trivy_config_txt = results_dir / "trivy_config_scan.txt"
    if trivy_config_txt.exists():
        findings.extend(parse_trivy_config(trivy_config_txt, scan_id))
    
    # Parse ZAP results (DAST)
    zap_txt = results_dir / "zap_scan.txt"
    if zap_txt.exists():
        findings.extend(parse_zap(zap_txt, scan_id))
    
    # Parse TruffleHog results (Enhanced secrets)
    trufflehog_json = results_dir / "trufflehog.json"
    if trufflehog_json.exists():
        findings.extend(parse_trufflehog(trufflehog_json, scan_id))
    
    return findings
