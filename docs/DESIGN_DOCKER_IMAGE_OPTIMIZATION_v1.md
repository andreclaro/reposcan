# Docker Worker Image Optimization Guide

**Current Size:** ~3.5GB  
**Target Size:** <1GB (70% reduction)  
**Status:** Draft

---

## Current Image Breakdown

```
Total: ~3.5GB

┌─────────────────────────────────────────────────────────┐
│ Ubuntu 22.04 base with updates              ~150 MB     │
│ build-essential + dev tools                 ~300 MB     │
│ Python 3.10 + pip + setuptools              ~150 MB     │
│ Go 1.22.6 toolchain                         ~400 MB     │
│ Rust 1.80.0 toolchain                       ~600 MB     │
│ Node.js 20                                  ~100 MB     │
│ Python packages (semgrep, checkov, etc.)    ~800 MB     │
│ Scanner binaries (trivy, tfsec, etc.)       ~200 MB     │
│ App code + results                          ~50 MB      │
└─────────────────────────────────────────────────────────┘
```

### Size by Category

| Component | Size | % of Total |
|-----------|------|------------|
| Rust toolchain | 600MB | 17% |
| Python packages | 800MB | 23% |
| Go toolchain | 400MB | 11% |
| Build tools | 300MB | 9% |
| Ubuntu base | 150MB | 4% |
| Other | 1250MB | 36% |

---

## Optimization Strategies

### 1. Multi-Stage Build (Biggest Impact)

**Current:** Single stage, everything in final image  
**Optimized:** Build tools in separate stage, only binaries copied

```dockerfile
# ===========================================
# Stage 1: Builder (has all build tools)
# ===========================================
FROM ubuntu:22.04 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl git \
    && rm -rf /var/lib/apt/lists/*

# Install Go (only needed for build)
RUN curl -fsSL https://go.dev/dl/go1.22.6.linux-amd64.tar.gz | tar -C /usr/local -xzf -
ENV PATH="/usr/local/go/bin:${PATH}"
RUN go install golang.org/x/vuln/cmd/govulncheck@latest

# Install Rust (only needed for build)
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.80.0
ENV PATH="/root/.cargo/bin:${PATH}"
RUN cargo install cargo-audit --locked --version 0.21.1

# Download scanner binaries
RUN curl -fsSL -o /tmp/tfsec https://github.com/aquasecurity/tfsec/releases/download/v1.28.14/tfsec-linux-amd64 \
    && chmod +x /tmp/tfsec
# ... other binaries

# ===========================================
# Stage 2: Final (minimal runtime)
# ===========================================
FROM ubuntu:22.04 AS final

# Only copy compiled binaries from builder
COPY --from=builder /root/go/bin/govulncheck /usr/local/bin/
COPY --from=builder /root/.cargo/bin/cargo-audit /usr/local/bin/
COPY --from=builder /tmp/tfsec /usr/local/bin/
# ... other binaries

# No build tools installed!
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip git \
    && rm -rf /var/lib/apt/lists/*

# Install only runtime Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY src/ /work/
```

**Estimated Savings:** 1.3GB (Rust + Go toolchains removed)

---

### 2. Use Python Slim Base Image

**Current:** Ubuntu 22.04 + manual Python install  
**Optimized:** Official Python slim image

```dockerfile
# Instead of Ubuntu + apt install python3
FROM python:3.11-slim-bookworm

# Python is pre-installed, smaller base
# Includes: Python 3.11, pip, standard library
# Excludes: Build tools, dev headers, docs
```

**Comparison:**

| Base Image | Size | Python |
|------------|------|--------|
| ubuntu:22.04 | 80MB | Manual install |
| python:3.11 | 1.02GB | Included (full) |
| python:3.11-slim | 130MB | Included (minimal) |
| python:3.11-alpine | 60MB | Included (musl) |

**Recommended:** `python:3.11-slim-bookworm` (Debian 12)

---

### 3. Remove Python Package Bloat

**Current:** Installing heavy packages with all dependencies

```bash
# Current - heavy packages
semgrep      # ~500MB (includes OCaml binaries)
checkov      # ~300MB (many dependencies)
bandit[sarif] # ~50MB
```

**Optimized:** Selective installation + cleanup

```dockerfile
# Install only what you need
RUN pip install --no-cache-dir \
    --no-compile \              # Don't compile .pyc files
    semgrep==1.90.0 \
    checkov==3.2.0 \
    bandit==1.7.8

# Aggressive cleanup
RUN find /usr/local/lib/python3.11 \
    -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true \
    && find /usr/local/lib/python3.11 \
    -type f -name "*.pyc" -delete \
    && find /usr/local/lib/python3.11 \
    -type f -name "*.pyo" -delete \
    && rm -rf /root/.cache/pip \
    && rm -rf /tmp/*
```

**Alternative:** Use `pip install --user` and copy only needed packages

---

### 4. Distroless Final Stage

**For maximum size reduction:**

```dockerfile
# ===========================================
# Stage 1: Build environment
# ===========================================
FROM python:3.11-slim AS builder

# Install all build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages in virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Download all scanner binaries
COPY scripts/download-scanners.sh /tmp/
RUN /tmp/download-scanners.sh /opt/scanners

# ===========================================
# Stage 2: Distroless runtime
# ===========================================
FROM gcr.io/distroless/python3-debian12

# Copy virtual environment
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy scanner binaries
COPY --from=builder /opt/scanners/* /usr/local/bin/

# Copy app code
COPY src/ /work/

# Python paths
ENV PYTHONPATH=/opt/venv/lib/python3.11/site-packages

ENTRYPOINT ["python", "-m", "audit"]
```

**Distroless Benefits:**
- No shell, no package manager, no OS utilities
- Only Python runtime + your app
- Smaller attack surface
- ~100MB final image

**Trade-offs:**
- Harder to debug (no shell)
- Need to copy CA certificates manually
- Some scanners may need glibc libraries

---

### 5. Alpine Linux Alternative

**Even smaller than distroless:**

```dockerfile
FROM python:3.11-alpine

# Install build deps temporarily
RUN apk add --no-cache --virtual .build-deps \
    gcc musl-dev libffi-dev openssl-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && apk del .build-deps  # Remove build deps after install

# Runtime deps only
RUN apk add --no-cache git ca-certificates

# Download scanner binaries (static musl binaries preferred)
RUN wget -O /usr/local/bin/tfsec https://github.com/aquasecurity/tfsec/releases/download/v1.28.14/tfsec-linux-amd64 \
    && chmod +x /usr/local/bin/tfsec

COPY src/ /work/
```

**Alpine Pros:**
- Very small (~60MB base)
- Package manager available
- Easy to customize

**Alpine Cons:**
- musl libc instead of glibc (some scanners may not work)
- Slower Python builds (no wheel support for some packages)
- DNS issues in some Kubernetes environments

---

### 6. Scanner Binary Optimization

**Current:** Download all scanners regardless of need

**Optimized:** Only include scanners you actually use

```dockerfile
# Use build args to conditionally include scanners
ARG INCLUDE_TRIVY=true
ARG INCLUDE_SEMGREP=true
ARG INCLUDE_TERRAFORM=false  # Skip if not needed

# Conditional download
RUN if [ "$INCLUDE_TRIVY" = "true" ]; then \
    curl -fsSL ... | tar -xzf - -C /usr/local/bin trivy; \
    fi

RUN if [ "$INCLUDE_TERRAFORM" = "true" ]; then \
    curl -fsSL ... -o /usr/local/bin/tfsec \
    && chmod +x /usr/local/bin/tfsec; \
    fi
```

**Build for specific use case:**
```bash
# Minimal image (SAST + Secrets only)
docker build \
  --build-arg INCLUDE_TRIVY=false \
  --build-arg INCLUDE_TERRAFORM=false \
  --build-arg INCLUDE_NODE=false \
  -t worker:minimal .
```

---

### 7. Layer Consolidation

**Current:** Many RUN commands create many layers

**Optimized:** Combine related operations

```dockerfile
# BAD: Multiple layers
RUN apt-get update
RUN apt-get install -y python3
RUN apt-get install -y git
RUN rm -rf /var/lib/apt/lists/*

# GOOD: Single layer
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 git \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*
```

---

## Recommended Optimized Dockerfile

```dockerfile
# ===========================================
# RepoScan Worker - Optimized
# Target: <1GB (from 3.5GB)
# ===========================================

# -------------------------------------------
# Stage 1: Scanner Builder
# -------------------------------------------
FROM golang:1.22-alpine AS go-builder
RUN go install golang.org/x/vuln/cmd/govulncheck@latest

FROM rust:1.80-alpine AS rust-builder
RUN cargo install cargo-audit --locked --version 0.21.1

# -------------------------------------------
# Stage 2: Python Dependencies
# -------------------------------------------
FROM python:3.11-slim-bookworm AS py-builder

# Install build deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Create virtual environment
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install only required packages
COPY backend-worker/requirements.txt .
RUN pip install --no-cache-dir --no-compile -r requirements.txt

# Cleanup Python bloat
RUN find /opt/venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true \
    && find /opt/venv -type f -name "*.pyc" -delete \
    && find /opt/venv -type f -name "*.pyo" -delete \
    && find /opt/venv -type f -name "*.so" -exec strip {} \; 2>/dev/null || true

# -------------------------------------------
# Stage 3: Scanner Binaries
# -------------------------------------------
FROM alpine:3.19 AS scanner-builder

ARG TARGETARCH
WORKDIR /scanners

# Download all scanners in one layer
RUN \
    # Trivy
    wget -q -O - https://github.com/aquasecurity/trivy/releases/download/v0.68.2/trivy_0.68.2_Linux-${TARGETARCH}.tar.gz | tar -xzf - \
    && mv trivy /scanners/ \
    # tfsec
    && wget -q -O tfsec https://github.com/aquasecurity/tfsec/releases/download/v1.28.14/tfsec-linux-${TARGETARCH} \
    && chmod +x tfsec \
    # tflint
    && wget -q -O tflint.zip https://github.com/terraform-linters/tflint/releases/download/v0.60.0/tflint_linux_${TARGETARCH}.zip \
    && unzip -q tflint.zip && rm tflint.zip \
    # gitleaks
    && wget -q -O - https://github.com/gitleaks/gitleaks/releases/download/v8.23.3/gitleaks_8.23.3_linux_x64.tar.gz | tar -xzf - \
    # osv-scanner
    && wget -q -O osv-scanner https://github.com/google/osv-scanner/releases/download/v2.3.2/osv-scanner_linux_${TARGETARCH} \
    && chmod +x osv-scanner \
    # hadolint
    && wget -q -O hadolint https://github.com/hadolint/hadolint/releases/download/v2.12.0/hadolint-Linux-x86_64 \
    && chmod +x hadolint \
    # trufflehog
    && wget -q -O - https://github.com/trufflesecurity/trufflehog/releases/download/v3.93.0/trufflehog_3.93.0_linux_amd64.tar.gz | tar -xzf -

# -------------------------------------------
# Stage 4: Final Runtime
# -------------------------------------------
FROM python:3.11-slim-bookworm

# Install runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    git git-lfs ca-certificates openssh-client \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g pnpm \
    && rm -rf ~/.npm

# Copy Python environment
COPY --from=py-builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONPATH=/opt/venv/lib/python3.11/site-packages

# Copy Go/Rust binaries
COPY --from=go-builder /go/bin/govulncheck /usr/local/bin/
COPY --from=rust-builder /usr/local/cargo/bin/cargo-audit /usr/local/bin/

# Copy scanner binaries
COPY --from=scanner-builder /scanners/* /usr/local/bin/

# Copy app code
WORKDIR /work
COPY backend-worker/src/ /work/

# Create non-root user
RUN groupadd -r appgroup && useradd -r -g appgroup appuser \
    && chown -R appuser:appgroup /work

USER appuser

ENTRYPOINT ["python", "-m", "audit"]
```

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Image Size** | 3.5GB | ~800MB | **77% smaller** |
| **Build Time** | 15min | 10min | 33% faster |
| **Pull Time** | 60s | 15s | 75% faster |
| **Memory Usage** | 800MB | 600MB | 25% less |
| **Attack Surface** | Large | Minimal | Much better |

---

## Additional Tips

### 1. Use .dockerignore

```
# .dockerignore
.git
.github
frontend/
docs/
*.md
.coverage
.pytest_cache
__pycache__
*.pyc
*.pyo
*.pyd
.Python
.env
.venv
pip-log.txt
pip-delete-this-directory.txt
.tox
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
*.log
.gitignore
.DS_Store
```

### 2. Enable BuildKit Features

```bash
# Build with BuildKit for better caching and parallelization
DOCKER_BUILDKIT=1 docker build --build-arg BUILDKIT_INLINE_CACHE=1 .
```

### 3. Use Registry Cache

```dockerfile
# In Dockerfile
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt
```

### 4. Squash Layers (experimental)

```bash
docker build --squash -t worker:squashed .
```

---

## Validation

After optimization, verify:

```bash
# Check image size
docker images | grep worker

# Check layer sizes
docker history worker:latest

# Test functionality
docker run --rm worker:latest python -m audit --help

# Check for unnecessary files
docker run --rm worker:latest sh -c "find /usr -type f -size +10M"
```

---

## Conclusion

**Quick Wins (Do First):**
1. Multi-stage build - Remove build tools from final image
2. Use python:3.11-slim base
3. Clean up pip cache and .pyc files

**Medium Effort:**
4. Consolidate RUN commands
5. Remove unused scanners
6. Strip debug symbols from binaries

**Maximum Optimization:**
7. Distroless or Alpine base
8. Custom minimal Python build

**Expected ROI:** 70% size reduction with ~2 days of work
