# Design Document: Additional Security Scanner Integration

## Executive Summary

This document outlines a strategic plan for expanding the `sec-audit-repos` security scanning capabilities by integrating additional industry-leading security scanners. The recommendations are based on comprehensive research of industry tools (including CodeRabbit AI's tool stack, OWASP recommendations, and 2024-2025 SAST/DAST tool comparisons) to ensure comprehensive security coverage.

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

## Proposed Scanner Additions (Prioritized)

### Priority 1: Critical - Immediate Value

#### 1.1 Gitleaks - Secret Detection ⭐ HIGHEST PRIORITY

**Rationale**: 
- #1 most requested security scanning capability
- Catches leaked credentials before they become breaches
- Lightweight, fast, CI/CD friendly
- Used by CodeRabbit and thousands of organizations

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

---

#### 1.2 OSV-Scanner - Universal SCA ⭐ HIGH PRIORITY

**Rationale**:
- Google's open-source vulnerability database
- Language-agnostic dependency scanning
- Complements existing language-specific scanners
- Fills gaps in Python, Java, .NET coverage

**Implementation Details**:
```yaml
Scanner: OSV-Scanner
Version: v1.x (latest)
Audit Type: sca
Detection Capabilities:
  - Python (requirements.txt, Pipfile, poetry.lock)
  - Java (pom.xml, gradle)
  - .NET (packages.lock.json)
  - Go (go.mod - alternative to govulncheck)
  - Rust (Cargo.lock - alternative to cargo-audit)
  - Node.js (package-lock.json - alternative to npm audit)
Integration Points:
  - Lockfile-based scanning
  - SBOM support (SPDX, CycloneDX)
Output Formats: JSON, table, SARIF
```

**Effort**: Low-Medium (single binary, supports multiple lockfiles)

---

### Priority 2: High Value - Expanded Coverage

#### 2.1 OWASP ZAP - DAST Scanning

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

**Note**: May require architecture changes to support dynamic testing

---

#### 2.2 Python-specific Security Scanner (Bandit)

**Rationale**:
- Most popular language not fully covered
- Bandit is the de facto Python security linter
- AST-based analysis for Python-specific issues

**Implementation Details**:
```yaml
Scanner: Bandit
Version: 1.7.x (latest)
Audit Type: python
Detection Capabilities:
  - Hardcoded passwords
  - SQL injection (Python-specific)
  - Unsafe eval/exec
  - Weak crypto usage
  - Flask/Django-specific issues
Integration Points:
  - Python file detection
  - Config file support (pyproject.toml)
Output Formats: JSON, CSV, SARIF, text
```

**Effort**: Low (pip installable, JSON output)

---

#### 2.3 Hadolint - Dockerfile Linting

**Rationale**:
- Complements Trivy's vulnerability scanning
- Best practices for Dockerfile construction
- Catches misconfigurations, not just CVEs
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
  - Runs alongside Trivy
Output Formats: JSON, TTY, checkstyle
```

**Effort**: Low (single binary, JSON output)

---

### Priority 3: Medium Value - Specialized Use Cases

#### 3.1 TruffleHog - Enhanced Secret Detection

**Rationale**:
- More comprehensive than Gitleaks
- 800+ built-in detectors
- Entropy analysis reduces false positives
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
  - Can complement or replace Gitleaks
  - More resource intensive
Output Formats: JSON
```

**Effort**: Low (single binary)

**Decision**: Start with Gitleaks, add TruffleHog as optional/enhanced mode

---

#### 3.2 Trivy Config - General Misconfiguration

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
  - Kubernetes YAML/JSON
  - Docker Compose
  - Terraform (complement to existing)
  - CloudFormation
  - Helm charts
Integration Points:
  - Reuse existing Trivy binary
  - Single command change
Output Formats: JSON, SARIF (same as current)
```

**Effort**: Very Low (use existing Trivy installation)

---

#### 3.3 kube-bench - Kubernetes CIS Benchmarks

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

---

### Priority 4: Future Considerations

| Scanner | Category | Use Case | Complexity |
|---------|----------|----------|------------|
| **Snyk CLI** | SCA/SAST | Commercial alternative with great UX | Low (but requires API key) |
| **SonarQube** | SAST/Quality | Code quality + security (popular) | High (requires server) |
| **Falco** | Runtime | Container runtime security | Very High (kernel module) |
| **OpenSCAP** | Compliance | Security compliance scanning | Medium |
| **Nikto** | DAST | Web server vulnerability scanner | Low |

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

# Priority 3: Enhanced secrets (alternative to gitleaks)
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

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goal**: Implement Priority 1 scanners (highest impact, lowest effort)

**Tasks**:
1. Add Gitleaks secret detection
   - Installation in Dockerfile
   - Detection logic (`has_git_history()`)
   - Execution wrapper (`run_gitleaks()`)
   - Output parser
   - Worker integration

2. Add OSV-Scanner for universal SCA
   - Installation in Dockerfile
   - Lockfile detection enhancement
   - Execution wrapper
   - Output parser
   - Worker integration

**Deliverables**:
- Secret detection working for all repositories
- Python/Java/.NET dependency scanning
- Updated documentation

---

### Phase 2: Language & Config Expansion (Week 2)

**Goal**: Implement Priority 2 scanners

**Tasks**:
1. Add Bandit for Python-specific security
2. Add Hadolint for Dockerfile best practices
3. Enable Trivy config scanning for K8s/Compose

**Deliverables**:
- Python security linting
- Dockerfile linting + vulnerability scanning
- Kubernetes manifest scanning

---

### Phase 3: Advanced Features (Week 3-4)

**Goal**: Implement Priority 3 and DAST

**Tasks**:
1. Add TruffleHog as enhanced secret option
2. Design DAST architecture for OWASP ZAP
3. Research kube-bench integration approach

**Deliverables**:
- Enhanced secret detection option
- DAST design document
- K8s scanning proof of concept

---

### Phase 4: Polish & Documentation (Week 5)

**Goal**: Documentation, testing, optimization

**Tasks**:
1. Comprehensive test coverage for new scanners
2. Performance benchmarking
3. User documentation updates
4. Configuration guide for new audit types

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
    "secrets",        # Gitleaks
    "sca",            # OSV-Scanner
    
    # NEW - Phase 2
    "python",         # Bandit
    "dockerfile_lint", # Hadolint
    "misconfig",      # Trivy config
    
    # NEW - Phase 3
    "secrets_deep",   # TruffleHog
    "dast",           # OWASP ZAP
    "kubernetes",     # kube-bench
})
```

### Audit Selection UX

Update frontend to show scanner categories:

```
Audit Types:
☑️ Static Analysis (SAST)
   ├─ Semgrep (Multi-language)
   ├─ Bandit (Python) [NEW]
   └─ ...

☑️ Dependencies (SCA)
   ├─ OSV-Scanner [NEW]
   ├─ npm audit (Node.js)
   ├─ govulncheck (Go)
   └─ cargo-audit (Rust)

☑️ Secrets Detection [NEW]
   └─ Gitleaks

☑️ Infrastructure
   ├─ Terraform (tfsec, checkov, tflint)
   ├─ Dockerfile (Trivy, Hadolint) [UPDATED]
   └─ Kubernetes (Trivy config) [NEW]

☑️ Dynamic Testing (DAST) [NEW]
   └─ OWASP ZAP
```

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scan time increase | Medium | Make new scanners opt-in initially |
| False positives | Medium | Tune rules, provide suppression config |
| Resource usage | Low | New scanners are lightweight |
| Docker image size | Low | Use multi-stage builds |

### Security Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Secret scanners find live creds | High | Document disclosure procedures |
| DAST causes side effects | High | Run in isolated environments |
| Scanner vulnerabilities | Low | Pin versions, automated updates |

---

## Success Metrics

1. **Coverage**: Increase from 7 to 12+ scanner categories
2. **Findings**: 20%+ increase in valid security findings
3. **False Positives**: Maintain <10% FP rate
4. **Performance**: <20% scan time increase
5. **Adoption**: 80%+ of repos use new scanners within 3 months

---

## Appendix A: Scanner Comparison Matrix

| Scanner | Priority | Effort | Coverage | FP Rate | Maintenance |
|---------|----------|--------|----------|---------|-------------|
| Gitleaks | P1 | Low | High | Low | Active OSS |
| OSV-Scanner | P1 | Low | High | Low | Google backed |
| Bandit | P2 | Low | Medium | Medium | OWASP backed |
| Hadolint | P2 | Low | Medium | Low | Active OSS |
| Trivy Config | P2 | Very Low | Medium | Low | Aqua Security |
| TruffleHog | P3 | Low | Very High | Medium | Truffle Security |
| OWASP ZAP | P2 | High | High | Medium | OWASP backed |
| kube-bench | P3 | Medium | High | Low | Aqua Security |

---

## Appendix B: Alternative Scanners Considered

### Rejected: SonarQube
- **Reason**: Requires dedicated server/database
- **Alternative**: Use SonarQube integration as separate feature

### Rejected: Snyk
- **Reason**: Requires API key, rate limits on free tier
- **Alternative**: Offer as optional premium integration

### Rejected: Checkmarx
- **Reason**: Commercial-only, enterprise pricing
- **Alternative**: Not planned for open-source offering

---

**Document Version**: 1.0  
**Last Updated**: 2026-02-04  
**Author**: Architecture Team
