# Design Document: Additional Security Scanner Integration

## Executive Summary

This document outlines a strategic plan for expanding the `securefast` security scanning capabilities by integrating additional industry-leading security scanners. The recommendations are based on comprehensive research of industry tools (including CodeRabbit AI's tool stack, OWASP recommendations, and 2024-2025 SAST/DAST tool comparisons) to ensure comprehensive security coverage.

## Current Scanner Inventory

### Existing Scanners (7 Categories)

| Category | Scanner(s) | Purpose | Languages/Targets |
|----------|-----------|---------|-------------------|
| **SAST** | Semgrep | Static Application Security Testing | Multi-language (Python, JS, TS, Go, Java, etc.) |
| **Dockerfile** | Trivy | Container image vulnerability scanning | Dockerfile, built images |
| **Terraform/IaC** | tfsec, checkov, tflint | Infrastructure as Code security | Terraform, CloudFormation, K8s |
| **Filesystem** | Trivy fs | General filesystem vulnerability scan | Dependencies, OS packages |
| **Node.js** | npm audit / pnpm audit | Dependency vulnerability scanning | JavaScript/Node.js projects |
| **Go** | govulncheck | Go vulnerability database check | Go projects |
| **Rust** | cargo-audit | Rust crate vulnerability audit | Rust projects |

### Current Coverage Gaps

1. **Secret Detection**: No dedicated scanner for API keys, credentials, tokens
2. **DAST**: No dynamic/runtime application security testing
3. **Additional Languages**: Missing Python (dedicated), Java, .NET, PHP scanners
4. **Supply Chain**: Limited SCA (Software Composition Analysis) beyond language-specific audits
5. **Container Runtime**: Only image scanning, no runtime configuration analysis
6. **Misconfiguration**: Limited to Terraform; missing general configuration scanning

---

## Research Findings

### Source 1: CodeRabbit AI Tool Stack Analysis

CodeRabbit (a popular AI code review platform) uses the following security-focused tools:

| Tool | Category | Use Case |
|------|----------|----------|
| Gitleaks | Secret Detection | Detect secrets in git history |
| OSV-Scanner | SCA/Vulnerability | Google OSV database scanning |
| Semgrep | SAST | Static analysis (already integrated) |
| Checkov | IaC Security | Multi-cloud IaC scanning (already integrated) |
| Brakeman | SAST | Ruby on Rails security |

### Source 2: SAST Tools Comparison (2025)

Top recommended SAST tools based on Plexicus, SpectralOps, and Gartner reviews:

| Rank | Tool | Type | Best For |
|------|------|------|----------|
| 1 | Semgrep | OSS | Fast, customizable rules (✅ Already integrated) |
| 2 | SonarQube | OSS/Commercial | Code quality + security |
| 3 | Checkmarx One | Commercial | Enterprise compliance |
| 4 | Snyk Code | Commercial | Developer-first, AI-assisted |
| 5 | GitLab SAST | Commercial | CI/CD integration |

### Source 3: Secret Scanning Tools Comparison

| Tool | Detection Rate | False Positives | Best Feature |
|------|---------------|-----------------|--------------|
| **TruffleHog** | High | Medium | Entropy + regex, 800+ detectors |
| **Gitleaks** | Medium | Low | Fast, configurable, CI-friendly |
| **GitGuardian** | Very High | Low | Enterprise dashboards, policies |
| **detect-secrets** | Medium | Medium | Yelp's pre-commit focused tool |

### Source 4: DAST Tools Comparison (2025)

| Tool | Type | Best For |
|------|------|----------|
| **OWASP ZAP** | OSS | Open-source web app scanning |
| **Burp Suite** | Commercial | Professional penetration testing |
| **StackHawk** | Commercial | CI/CD native DAST |

---

## Scanner Overlap Analysis

### Critical Overlaps to Consider

#### 1. SCA/Dependency Scanning Overlap ⚠️

| Tool | Node.js | Go | Rust | Python | Java | .NET |
|------|---------|-----|------|--------|------|------|
| npm audit | ✅ | - | - | - | - | - |
| govulncheck | - | ✅ | - | - | - | - |
| cargo-audit | - | - | ✅ | - | - | - |
| OSV-Scanner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Recommendation**: 
- OSV-Scanner should **complement, not replace** existing language-specific scanners
- Use OSV-Scanner for **Python, Java, .NET** (gaps) and as a fallback
- Keep dedicated scanners for Node.js, Go, Rust (more specialized/accurate)
- Avoid double-scanning the same lockfiles to reduce noise

#### 2. Secret Detection Overlap ⚠️

| Feature | Gitleaks | TruffleHog |
|---------|----------|------------|
| Speed | Fast | Medium |
| Detectors | 150+ | 800+ |
| Verified Secrets | No | Yes (live check) |
| Git History | Yes | Yes |
| Resource Usage | Low | Medium |

**Recommendation**: 
- Start with **Gitleaks** as the default (faster, lower FP rate)
- Offer **TruffleHog** as optional "deep scan" mode (for high-security repos)
- Consider running both with deduplication logic for maximum coverage

#### 3. IaC Scanning Overlap ⚠️

| Tool | Terraform | K8s YAML | Docker Compose | CloudFormation |
|------|-----------|----------|----------------|----------------|
| tfsec | ✅ | - | - | - |
| checkov | ✅ | ✅ | - | ✅ |
| tflint | ✅ (lint) | - | - | - |
| Trivy config | ✅ | ✅ | ✅ | ✅ |

**Recommendation**:
- Trivy config overlaps significantly with Checkov for Terraform
- Use Trivy config primarily for **K8s YAML and Docker Compose** (gaps)
- Keep existing Terraform toolchain (tfsec, checkov, tflint) - proven and specialized
- Trivy config can be optional/alternative for users preferring unified output

#### 4. SAST Overlap ⚠️

| Tool | Multi-lang | Python-Specific |
|------|------------|-----------------|
| Semgrep | ✅ | Good coverage |
| Bandit | - | ✅ Specialized |

**Recommendation**:
- Bandit catches Python-specific AST patterns that Semgrep may miss
- Run Bandit as **supplemental** Python scan, not replacement
- Semgrep covers broader security patterns across languages

#### 5. Dockerfile Scanning Overlap

| Tool | CVE Detection | Best Practices | Linting |
|------|---------------|----------------|---------|
| Trivy | ✅ | Basic | - |
| Hadolint | - | ✅ | ✅ |

**Recommendation**:
- These are **complementary**, not overlapping
- Trivy = security vulnerabilities (CVEs)
- Hadolint = Dockerfile best practices and shell check
- Run both for comprehensive Dockerfile coverage

---

## Proposed Scanner Additions (Revised Priority)

### Priority 1: Critical - Immediate Value

#### 1.1 Gitleaks - Secret Detection ⭐ HIGHEST PRIORITY

**Rationale**: 
- #1 most requested security scanning capability
- Catches leaked credentials before they become breaches
- Lightweight, fast, CI/CD friendly
- Used by CodeRabbit and thousands of organizations
- **No overlap** with existing scanners

**Implementation Details**:
```yaml
Scanner: Gitleaks
Version: v8.x (latest)
Audit Type: secrets
Detection Capabilities:
  - API keys (AWS, Azure, GCP)
  - Database connection strings
  - Private keys (RSA, SSH, PEM)
  - OAuth tokens
  - JWT tokens
  - Passwords in code
Integration Points:
  - Full repo scan (default)
  - Commit history scan (optional)
  - Pre-commit hook capability
Output Formats: JSON, SARIF, plain text
```

**Effort**: Low (single binary, JSON output)
**Overlap**: None - first secret scanner

---

#### 1.2 OSV-Scanner - Universal SCA ⭐ HIGH PRIORITY

**Rationale**:
- Google's open-source vulnerability database
- Language-agnostic dependency scanning
- **Strategic use**: Fill gaps for Python, Java, .NET only
- Complements (doesn't replace) existing language-specific scanners

**Implementation Details**:
```yaml
Scanner: OSV-Scanner
Version: v1.x (latest)
Audit Type: sca
Detection Capabilities:
  - Python (requirements.txt, Pipfile, poetry.lock) ⭐ PRIORITY
  - Java (pom.xml, gradle) ⭐ PRIORITY
  - .NET (packages.lock.json) ⭐ PRIORITY
  - Go (go.mod) - skip if govulncheck available
  - Rust (Cargo.lock) - skip if cargo-audit available
  - Node.js (package-lock.json) - skip if npm audit available
Integration Points:
  - Lockfile-based scanning
  - Run ONLY for languages without dedicated scanner
  - SBOM support (SPDX, CycloneDX)
Output Formats: JSON, table, SARIF
```

**Effort**: Low-Medium (single binary, conditional execution logic)
**Overlap Strategy**: Conditional scanning - skip if language-specific scanner available

---

### Priority 2: High Value - Expanded Coverage

#### 2.1 Bandit - Python-SAST ⭐ HIGH PRIORITY

**Rationale**:
- Most popular language not fully covered
- Bandit is the de facto Python security linter
- AST-based analysis for Python-specific issues
- **Complements** Semgrep's pattern matching

**Implementation Details**:
```yaml
Scanner: Bandit
Version: 1.7.x (latest)
Audit Type: python
Detection Capabilities:
  - Hardcoded passwords
  - SQL injection (Python-specific AST)
  - Unsafe eval/exec
  - Weak crypto usage
  - Flask/Django-specific issues
Integration Points:
  - Python file detection (has_python_files())
  - Config file support (pyproject.toml)
  - Run alongside Semgrep (supplemental)
Output Formats: JSON, CSV, SARIF, text
```

**Effort**: Low (pip installable, JSON output)
**Overlap**: Complements Semgrep; catches Python-specific AST patterns

---

#### 2.2 Hadolint - Dockerfile Linting ⭐ MEDIUM PRIORITY

**Rationale**:
- **Complements** Trivy's vulnerability scanning
- Dockerfile best practices (not CVEs)
- Shell script analysis within RUN commands
- Used by CodeRabbit

**Implementation Details**:
```yaml
Scanner: Hadolint
Version: 2.12.x (latest)
Audit Type: dockerfile_lint
Detection Capabilities:
  - Dockerfile best practices
  - Shell script analysis within RUN
  - Base image pinning recommendations
  - Security misconfigurations
Integration Points:
  - Dockerfile discovery (already implemented)
  - Runs alongside Trivy (different purposes)
Output Formats: JSON, TTY, checkstyle
```

**Effort**: Low (single binary, JSON output)
**Overlap**: None - Trivy=security, Hadolint=best practices

---

#### 2.3 Trivy Config - General Misconfiguration ⭐ MEDIUM PRIORITY

**Rationale**:
- Expand Trivy usage beyond Docker
- Kubernetes manifest scanning
- Cloud config scanning (AWS, GCP, Azure)
- Already have Trivy installed

**Implementation Details**:
```yaml
Scanner: Trivy (config subcommand)
Version: Latest (already installed)
Audit Type: misconfig
Detection Capabilities:
  - Kubernetes YAML/JSON ⭐ PRIORITY
  - Docker Compose ⭐ PRIORITY
  - Terraform (skip - covered by tfsec/checkov)
  - CloudFormation
  - Helm charts
Integration Points:
  - Reuse existing Trivy binary
  - Exclude Terraform to avoid overlap
Output Formats: JSON, SARIF (same as current)
```

**Effort**: Very Low (use existing Trivy installation)
**Overlap Strategy**: Skip Terraform; focus on K8s and Docker Compose

---

#### 2.4 OWASP ZAP - DAST Scanning ⭐ MEDIUM PRIORITY (Complex)

**Rationale**:
- Only DAST scanner in the list (runtime testing)
- Catches vulnerabilities SAST misses
- OWASP backed, industry standard
- Free and open-source

**Implementation Details**:
```yaml
Scanner: OWASP ZAP
Version: 2.15+ (latest stable)
Audit Type: dast
Detection Capabilities:
  - SQL Injection
  - XSS (Cross-Site Scripting)
  - CSRF vulnerabilities
  - Authentication flaws
  - Information disclosure
Integration Challenges:
  - Requires running application (build + deploy)
  - Spider/crawl phase needed
  - Higher resource requirements
  - Longer scan times
Output Formats: JSON, HTML, XML, SARIF
```

**Effort**: High (requires infrastructure for running apps)
**Overlap**: None - unique DAST capability

**Note**: May require architecture changes to support dynamic testing

---

### Priority 3: Enhanced/Optional Scanners

#### 3.1 TruffleHog - Enhanced Secret Detection (Optional)

**Rationale**:
- More comprehensive than Gitleaks
- 800+ built-in detectors
- Entropy analysis reduces false positives
- **Verified secrets** (live credential checking)
- Enterprise-grade secret scanning

**Implementation Details**:
```yaml
Scanner: TruffleHog
Version: 3.x (latest)
Audit Type: secrets_deep
Detection Capabilities:
  - Verified secrets (live credential checking)
  - Historical git scanning
  - S3 bucket scanning
  - Docker layer scanning
Integration Points:
  - Optional "deep scan" mode
  - Can run alongside Gitleaks with deduplication
  - More resource intensive
Output Formats: JSON
```

**Effort**: Low (single binary)
**Overlap**: Enhances Gitleaks; run both for maximum coverage with dedup

---

#### 3.2 kube-bench - Kubernetes CIS Benchmarks (Future)

**Rationale**:
- Kubernetes-specific security
- CIS benchmark compliance
- Growing K8s deployment usage

**Implementation Details**:
```yaml
Scanner: kube-bench
Version: 0.6.x (latest)
Audit Type: kubernetes
Detection Capabilities:
  - CIS Kubernetes Benchmarks
  - Master node checks
  - Worker node checks
  - etcd security
Integration Challenges:
  - Requires cluster access
  - Different deployment model
  - May need separate runner type
Output Formats: JSON
```

**Effort**: Medium (requires cluster context)
**Overlap**: None - runtime K8s security (different from manifest scanning)

---

### Priority 4: Future Considerations

| Scanner | Category | Use Case | Complexity | Overlap Notes |
|---------|----------|----------|------------|---------------|
| **Snyk CLI** | SCA/SAST | Commercial alternative | Low | Replaces OSV-Scanner, requires API key |
| **SonarQube** | SAST/Quality | Code quality + security | High | Requires server; partial Semgrep overlap |
| **Falco** | Runtime | Container runtime security | Very High | No overlap - unique runtime detection |
| **OpenSCAP** | Compliance | Security compliance scanning | Medium | No overlap - compliance focused |
| **Nikto** | DAST | Web server vulnerability scanner | Low | Partial ZAP overlap |

---

## Implementation Architecture

### Scanner Integration Pattern

All new scanners follow the established pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    Scanner Integration                       │
│                                                              │
│  1. Detection (fs.py / ecosystem.py)                        │
│     └── detect_secrets(), has_python_files(), etc.          │
│                                                              │
│  2. Execution (scanners.py or new module)                   │
│     └── run_gitleaks(), run_bandit(), etc.                  │
│                                                              │
│  3. Normalization (ai/parsers/)                             │
│     └── gitleaks_parser.py, bandit_parser.py                │
│                                                              │
│  4. Registration (utils.py)                                 │
│     └── Add to ALLOWED_AUDITS                               │
│                                                              │
│  5. Orchestration (scan_worker.py)                          │
│     └── Add execution logic to worker pipeline              │
│                                                              │
│  6. API Models (api/models.py)                              │
│     └── Add to ALLOWED_AUDIT_TYPES                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Conditional Execution for Overlapping Scanners

```python
# Example: OSV-Scanner conditional logic
def should_run_osv_scanner(repo_dir: Path, language: str) -> bool:
    """Run OSV only for languages without dedicated scanners."""
    dedicated_scanners = {"node", "go", "rust"}
    return language not in dedicated_scanners

# Example: Trivy config with Terraform exclusion
def run_trivy_config(repo_dir: Path, output_path: Path) -> None:
    """Run Trivy config, excluding Terraform (covered by tfsec/checkov)."""
    # Scan K8s, Docker Compose, but skip .tf files
    pass
```

### Dockerfile Updates

Each new scanner requires installation in the scanner Docker image:

```dockerfile
# Priority 1: Secret Detection
RUN curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.18.2/gitleaks_8.18.2_linux_x64.tar.gz | \
    tar -xz -C /usr/local/bin gitleaks

# Priority 1: Universal SCA  
RUN curl -sSL https://github.com/google/osv-scanner/releases/download/v1.7.0/osv-scanner_1.7.0_linux_amd64.tar.gz | \
    tar -xz -C /usr/local/bin osv-scanner

# Priority 2: Python SAST
RUN pip install bandit[sarif]

# Priority 2: Dockerfile linting
RUN curl -sSL https://github.com/hadolint/hadolint/releases/download/v2.12.0/hadolint-Linux-x86_64 -o /usr/local/bin/hadolint && \
    chmod +x /usr/local/bin/hadolint

# Priority 3: Enhanced secrets (optional)
# TruffleHog v3 is a single binary
RUN curl -sSL https://github.com/trufflesecurity/trufflehog/releases/download/v3.78.0/trufflehog_3.78.0_linux_amd64.tar.gz | \
    tar -xz -C /usr/local/bin trufflehog
```

### Database Schema Changes

No schema changes required. New scanners use existing `finding` table structure.

May want to add new values to `scanner` enum:
- `gitleaks`
- `osv-scanner`
- `bandit`
- `hadolint`
- `trufflehog`
- `zap` (DAST)

---

## Implementation Roadmap (Revised)

### Phase 1: Foundation (Week 1-2)

**Goal**: Implement Priority 1 scanners (highest impact, lowest effort, no overlap)

**Tasks**:
1. Add Gitleaks secret detection
   - Installation in Dockerfile
   - Detection logic (`has_git_history()`)
   - Execution wrapper (`run_gitleaks()`)
   - Output parser
   - Worker integration

2. Add OSV-Scanner for universal SCA (with conditional logic)
   - Installation in Dockerfile
   - Lockfile detection for Python/Java/.NET only
   - Skip Node/Go/Rust (have dedicated scanners)
   - Execution wrapper
   - Output parser
   - Worker integration

**Deliverables**:
- Secret detection working for all repositories
- Python/Java/.NET dependency scanning
- Conditional execution to avoid double-scanning
- Updated documentation

---

### Phase 2: Language & Config Expansion (Week 3)

**Goal**: Implement Priority 2 scanners

**Tasks**:
1. Add Bandit for Python-specific security (complements Semgrep)
2. Add Hadolint for Dockerfile best practices (complements Trivy)
3. Enable Trivy config scanning for K8s/Compose (skip Terraform)

**Deliverables**:
- Python security linting (Bandit + Semgrep)
- Dockerfile linting + vulnerability scanning
- Kubernetes manifest scanning

---

### Phase 3: DAST & Advanced Features (Week 4-5)

**Goal**: Implement DAST and optional enhanced scanners

**Tasks**:
1. Design DAST architecture for OWASP ZAP
2. Add TruffleHog as optional "deep scan" mode
3. Implement deduplication logic for overlapping scanners

**Deliverables**:
- DAST design document and proof of concept
- Enhanced secret detection option
- Scanner deduplication logic

---

### Phase 4: Polish & Documentation (Week 6)

**Goal**: Documentation, testing, optimization

**Tasks**:
1. Comprehensive test coverage for new scanners
2. Performance benchmarking
3. User documentation updates
4. Configuration guide for new audit types
5. Overlap mitigation documentation

---

## Configuration Recommendations

### New Audit Types

```python
# Updated ALLOWED_AUDITS
ALLOWED_AUDITS = frozenset({
    "all",
    "sast",           # Existing: Semgrep
    "terraform",      # Existing: tfsec, checkov, tflint
    "dockerfile",     # Existing: Trivy
    "node",           # Existing: npm/pnpm audit
    "go",             # Existing: govulncheck
    "rust",           # Existing: cargo-audit
    
    # NEW - Phase 1
    "secrets",        # Gitleaks (default secret scanner)
    "sca",            # OSV-Scanner (conditional: Python/Java/.NET only)
    
    # NEW - Phase 2
    "python",         # Bandit (Python-specific SAST)
    "dockerfile_lint", # Hadolint (best practices)
    "misconfig",      # Trivy config (K8s/Compose, no Terraform)
    
    # NEW - Phase 3
    "secrets_deep",   # TruffleHog (optional enhanced secrets)
    "dast",           # OWASP ZAP (dynamic testing)
    "kubernetes",     # kube-bench (future)
})
```

### Audit Selection UX with Overlap Indicators

```
Audit Types:
☑️ Static Analysis (SAST)
   ├─ Semgrep (Multi-language)
   ├─ Bandit (Python-specific) [NEW] [Complements Semgrep]
   └─ ...

☑️ Dependencies (SCA)
   ├─ OSV-Scanner [NEW] [Python/Java/.NET only]
   ├─ npm audit (Node.js)
   ├─ govulncheck (Go)
   └─ cargo-audit (Rust)

☑️ Secrets Detection [NEW]
   ├─ Gitleaks (Default)
   └─ TruffleHog (Deep scan - Optional) [NEW]

☑️ Infrastructure
   ├─ Terraform (tfsec, checkov, tflint)
   ├─ Dockerfile (Trivy - Security, Hadolint - Best practices) [UPDATED]
   └─ Kubernetes (Trivy config) [NEW]

☑️ Dynamic Testing (DAST) [NEW]
   └─ OWASP ZAP [Requires running app]
```

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scan time increase | Medium | Conditional execution for overlapping scanners |
| False positives | Medium | Tune rules, provide suppression config |
| Resource usage | Low | New scanners are lightweight |
| Docker image size | Low | Use multi-stage builds |
| Duplicate findings | Medium | Implement deduplication for overlapping scanners |

### Security Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Secret scanners find live creds | High | Document disclosure procedures |
| DAST causes side effects | High | Run in isolated environments |
| Scanner vulnerabilities | Low | Pin versions, automated updates |
| Missed secrets due to FP reduction | Medium | Run both Gitleaks and TruffleHog for critical repos |

---

## Success Metrics

1. **Coverage**: Increase from 7 to 12+ scanner categories
2. **Findings**: 20%+ increase in valid security findings
3. **False Positives**: Maintain <10% FP rate
4. **Performance**: <20% scan time increase (with conditional execution)
5. **Overlap Penalty**: <5% duplicate findings between scanners
6. **Adoption**: 80%+ of repos use new scanners within 3 months

---

## Appendix A: Scanner Comparison Matrix

| Scanner | Priority | Effort | Coverage | FP Rate | Maintenance | Overlap |
|---------|----------|--------|----------|---------|-------------|---------|
| Gitleaks | P1 | Low | High | Low | Active OSS | None - unique |
| OSV-Scanner | P1 | Low | High | Low | Google backed | Node/Go/Rust (skip) |
| Bandit | P2 | Low | Medium | Medium | OWASP backed | Semgrep (complementary) |
| Hadolint | P2 | Low | Medium | Low | Active OSS | None - Trivy=sec, this=lint |
| Trivy Config | P2 | Very Low | Medium | Low | Aqua Security | Terraform (skip) |
| TruffleHog | P3 | Low | Very High | Medium | Truffle Security | Gitleaks (enhances) |
| OWASP ZAP | P2 | High | High | Medium | OWASP backed | None - unique DAST |
| kube-bench | P3 | Medium | High | Low | Aqua Security | None - runtime vs manifest |

---

## Appendix B: Overlap Resolution Summary

| Overlapping Area | Primary Scanner | Secondary/Optional | Resolution Strategy |
|------------------|-----------------|-------------------|---------------------|
| Node.js SCA | npm audit | OSV-Scanner | Use npm audit; skip OSV for Node.js |
| Go SCA | govulncheck | OSV-Scanner | Use govulncheck; skip OSV for Go |
| Rust SCA | cargo-audit | OSV-Scanner | Use cargo-audit; skip OSV for Rust |
| Python SCA | OSV-Scanner | - | OSV-Scanner is primary for Python |
| Secrets (default) | Gitleaks | - | Fast, low FP for all repos |
| Secrets (deep) | TruffleHog | Gitleaks | Optional for high-security repos |
| Terraform IaC | tfsec/checkov | Trivy config | Skip Trivy config for .tf files |
| K8s/Docker Compose | Trivy config | - | Primary use case for Trivy config |
| Python SAST | Semgrep | Bandit | Run both; complementary coverage |
| Dockerfile | Trivy | Hadolint | Trivy=security, Hadolint=best practices |

---

## Appendix C: Alternative Scanners Considered

### Rejected: SonarQube
- **Reason**: Requires dedicated server/database
- **Overlap**: Partial with Semgrep (both multi-language SAST)
- **Alternative**: Use SonarQube integration as separate feature

### Rejected: Snyk
- **Reason**: Requires API key, rate limits on free tier
- **Overlap**: Replaces OSV-Scanner entirely
- **Alternative**: Offer as optional premium integration

### Rejected: Checkmarx
- **Reason**: Commercial-only, enterprise pricing
- **Overlap**: High with Semgrep
- **Alternative**: Not planned for open-source offering

### Rejected: detect-secrets (Yelp)
- **Reason**: Lower detection rate than Gitleaks/TruffleHog
- **Overlap**: Full overlap with Gitleaks
- **Alternative**: Use Gitleaks as primary

---

**Document Version**: 1.1  
**Last Updated**: 2026-02-06  
**Author**: Architecture Team



Next Steps: Testing

  1. Build the Docker Image

  cd /Users/andreclaro/Code/Security/securefast
  docker build -f docker/Dockerfile -t sec-audit-scanner .

  2. Test Individual Scanners

  # Test Gitleaks
  docker run --rm sec-audit-scanner which gitleaks

  # Test OSV-Scanner
  docker run --rm sec-audit-scanner which osv-scanner

  # Test Bandit
  docker run --rm sec-audit-scanner which bandit

  # Test Hadolint
  docker run --rm sec-audit-scanner which hadolint

  # Test ZAP
  docker run --rm sec-audit-scanner which zap

  # Test TruffleHog
  docker run --rm sec-audit-scanner which trufflehog

  3. Run Integration Tests

  # Create a test repositories.csv
  echo "https://github.com/example/python-app.git" > /tmp/test-repos.csv

  # Run with all new scanners enabled
  docker run --rm \
    -v "/tmp/test-repos.csv:/work/repositories.csv" \
    -v "/tmp/output:/work/output" \
    -e SCANNER_SECRETS_ENABLED=true \
    -e SCANNER_SCA_ENABLED=true \
    -e SCANNER_PYTHON_ENABLED=true \
    -e SCANNER_DOCKERFILE_LINT_ENABLED=true \
    -e SCANNER_MISCONFIG_ENABLED=true \
    sec-audit-scanner \
    /work/repositories.csv /work/output \
    --audit secrets,sca,python,dockerfile_lint,misconfig

  4. Verify Output Files

  Check that output files are created:

  • gitleaks.json / gitleaks.txt
  • osv_scanner.json / osv_scanner.txt
  • bandit.json / bandit.txt
  • hadolint.txt
  • trivy_config_scan.txt

  5. Run Unit Tests (if they exist)

  cd /Users/andreclaro/Code/Security/securefast/backend
  pytest tests/ -v

please perform all the above steps in loop untill you confirm the scanners are working correctly...        
