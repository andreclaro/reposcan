# Worker image (scanner tools) - OPTIMIZED
# Build context: repo root (..)
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Create non-root user early
RUN groupadd -r appgroup && useradd -r -g appgroup -m -s /bin/bash appuser

# Single versions (not multiple)
ARG NODE_VERSION=20
ARG GO_VERSION=1.22.6
ARG RUST_VERSION=1.80.0

# Security scanner versions
ARG CARGO_AUDIT_VERSION=0.22.0
ARG TFSEC_VERSION=1.28.14
ARG TFLINT_VERSION=0.60.0
ARG TRIVY_VERSION=0.68.2
ARG GITLEAKS_VERSION=8.23.3
ARG OSV_SCANNER_VERSION=2.3.2
ARG HADOLINT_VERSION=2.12.0
ARG TRUFFLEHOG_VERSION=3.93.0

# Install only essential packages (no build-essential, no default-jre)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        git-lfs \
        gnupg \
        lsb-release \
        openssh-client \
        python3 \
        python3-pip \
        python3-venv \
        unzip \
        xz-utils \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Configure git to rewrite SSH URLs to HTTPS
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" \
    && git config --global url."https://".insteadOf "ssh://"

# Install Node.js (single version via NodeSource, not nvm)
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g pnpm \
    && rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*

# Install Go (single version, direct download)
ENV GOROOT=/usr/local/go
ENV PATH="${GOROOT}/bin:${PATH}"
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) GO_ARCH="amd64" ;; \
        arm64) GO_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL https://go.dev/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz \
        | tar -C /usr/local -xzf - \
    && go install golang.org/x/vuln/cmd/govulncheck@latest

# Install Rust (single stable toolchain)
ENV CARGO_HOME="/usr/local/cargo"
ENV RUSTUP_HOME="/usr/local/rustup"
ENV PATH="${CARGO_HOME}/bin:${PATH}"
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) RUST_ARCH="x86_64" ;; \
        arm64) RUST_ARCH="aarch64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL https://sh.rustup.rs | sh -s -- -y \
        --default-toolchain ${RUST_VERSION} \
        --component rustfmt \
    && cargo install cargo-audit --locked --version ${CARGO_AUDIT_VERSION} \
    && rustup self uninstall -y || true

# Install security scanners (single layer to reduce layers)
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) TRIVY_ARCH="64bit"; TFSEC_ARCH="amd64"; TFLINT_ARCH="amd64"; \
                GITLEAKS_ARCH="x64"; OSV_ARCH="amd64"; HADOLINT_ARCH="x86_64"; \
                TRUFFLEHOG_ARCH="linux_amd64" ;; \
        arm64) TRIVY_ARCH="ARM64"; TFSEC_ARCH="arm64"; TFLINT_ARCH="arm64"; \
                GITLEAKS_ARCH="arm64"; OSV_ARCH="arm64"; HADOLINT_ARCH="arm64"; \
                TRUFFLEHOG_ARCH="linux_arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    # tfsec
    && curl -fsSL https://github.com/aquasecurity/tfsec/releases/download/v${TFSEC_VERSION}/tfsec-linux-${TFSEC_ARCH} \
        -o /usr/local/bin/tfsec && chmod +x /usr/local/bin/tfsec \
    # tflint
    && curl -fsSL https://github.com/terraform-linters/tflint/releases/download/v${TFLINT_VERSION}/tflint_linux_${TFLINT_ARCH}.zip \
        -o /tmp/tflint.zip && unzip -q /tmp/tflint.zip -d /usr/local/bin && rm /tmp/tflint.zip \
    # trivy
    && curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TRIVY_ARCH}.tar.gz \
        | tar -xzf - -C /usr/local/bin trivy \
    # gitleaks
    && curl -fsSL https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_${GITLEAKS_ARCH}.tar.gz \
        | tar -xzf - -C /usr/local/bin gitleaks \
    # osv-scanner
    && curl -fsSL https://github.com/google/osv-scanner/releases/download/v${OSV_SCANNER_VERSION}/osv-scanner_linux_${OSV_ARCH} \
        -o /usr/local/bin/osv-scanner && chmod +x /usr/local/bin/osv-scanner \
    # hadolint
    && curl -fsSL https://github.com/hadolint/hadolint/releases/download/v${HADOLINT_VERSION}/hadolint-Linux-${HADOLINT_ARCH} \
        -o /usr/local/bin/hadolint && chmod +x /usr/local/bin/hadolint \
    # trufflehog
    && curl -fsSL https://github.com/trufflesecurity/trufflehog/releases/download/v${TRUFFLEHOG_VERSION}/trufflehog_${TRUFFLEHOG_VERSION}_${TRUFFLEHOG_ARCH}.tar.gz \
        | tar -xzf - -C /usr/local/bin trufflehog

# Python scanners (no cache)
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir semgrep checkov bandit[sarif] \
    && rm -rf ~/.cache/pip /tmp/pip-*

# Install Python dependencies for API and workers
COPY backend/requirements.txt /work/
RUN python3 -m pip install --no-cache-dir -r /work/requirements.txt \
    && rm -rf ~/.cache/pip /tmp/pip-*

# Set up work directory
WORKDIR /work
RUN chown -R appuser:appgroup /work

# Copy application code
COPY --chown=appuser:appgroup backend/src/ /work/

# Create results directory
RUN mkdir -p /work/results && chown -R appuser:appgroup /work/results

# Switch to non-root user
USER appuser

ENTRYPOINT ["python3", "-m", "audit"]
