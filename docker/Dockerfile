# Worker image (scanner tools). Build context: repo root (..)
# Used by: docker-compose. Standalone: docker build -f docker/Dockerfile -t sec-audit-worker .
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Primary/default versions
ARG NODE_MAJOR=20
ARG GO_VERSION=1.22.6
ARG RUST_VERSION=1.93.0

# Additional Node.js versions to install
ARG NODE_VERSION_18=18
ARG NODE_VERSION_20=20
ARG NODE_VERSION_22=22

# Additional Go versions to install
ARG GO_VERSION_1_21=1.21.6
ARG GO_VERSION_1_22=1.22.6
ARG GO_VERSION_1_23=1.23.0

# Additional Rust toolchains to install
ARG RUST_VERSION_1_75=1.75.0
ARG RUST_VERSION_1_80=1.80.0
ARG RUST_VERSION_1_89=1.89.0

# Security scanner versions
ARG CARGO_AUDIT_VERSION=0.22.0
ARG TFSEC_VERSION=1.28.14
ARG TFLINT_VERSION=0.60.0
ARG TRIVY_VERSION=0.68.2

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        bison \
        bsdmainutils \
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
    && rm -rf /var/lib/apt/lists/*

# Configure git to rewrite SSH URLs to HTTPS for GitHub (works for public repos)
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" \
    && git config --global url."https://".insteadOf "ssh://"

# Install nvm (Node Version Manager) and multiple Node.js versions
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash \
    && export NVM_DIR="/root/.nvm" \
    && [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" \
    && nvm install ${NODE_VERSION_18} \
    && nvm install ${NODE_VERSION_20} \
    && nvm install ${NODE_VERSION_22} \
    && nvm alias default ${NODE_MAJOR} \
    && nvm use default \
    && corepack enable \
    && corepack prepare pnpm@latest --activate \
    && rm -rf /var/lib/apt/lists/*
ENV NVM_DIR="/root/.nvm"

# Install gvm (Go Version Manager) and multiple Go versions
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) GO_ARCH="amd64" ;; \
        arm64) GO_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -s -S -L https://raw.githubusercontent.com/moovweb/gvm/master/binscripts/gvm-installer | bash \
    && bash -c "export GVM_ROOT=\"/root/.gvm\" \
    && [ -s \"\$GVM_ROOT/scripts/gvm\" ] && source \"\$GVM_ROOT/scripts/gvm\" \
    && gvm install go${GO_VERSION_1_21} -B || true \
    && gvm install go${GO_VERSION_1_22} -B || true \
    && gvm install go${GO_VERSION_1_23} -B || true \
    && gvm use go${GO_VERSION} --default || (gvm install go${GO_VERSION} -B && gvm use go${GO_VERSION} --default)" \
    && rm -rf /var/lib/apt/lists/*
ENV GVM_ROOT="/root/.gvm"
ENV PATH="/root/.gvm/pkgsets/go${GO_VERSION}/global/bin:/root/.gvm/gos/go${GO_VERSION}/bin:$PATH"
RUN bash -c "export GVM_ROOT=\"/root/.gvm\" \
    && [ -s \"\$GVM_ROOT/scripts/gvm\" ] && source \"\$GVM_ROOT/scripts/gvm\" \
    && go install golang.org/x/vuln/cmd/govulncheck@latest"

# Rust + cargo-audit (rustup supports multiple toolchains)
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) RUST_ARCH="x86_64" ;; \
        arm64) RUST_ARCH="aarch64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL https://static.rust-lang.org/rustup/dist/${RUST_ARCH}-unknown-linux-gnu/rustup-init -o /tmp/rustup-init \
    && chmod +x /tmp/rustup-init \
    && /tmp/rustup-init -y --default-toolchain ${RUST_VERSION} \
    && rm /tmp/rustup-init
ENV PATH="/root/.cargo/bin:${PATH}"
# Install additional Rust toolchains for compatibility
RUN rustup toolchain install ${RUST_VERSION_1_75} \
    && rustup toolchain install ${RUST_VERSION_1_80} \
    && rustup toolchain install ${RUST_VERSION_1_89} \
    && rustup toolchain install stable \
    && rustup default ${RUST_VERSION}
RUN cargo install cargo-audit --locked --version ${CARGO_AUDIT_VERSION}

# Terraform security scanners
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) TFSEC_ARCH="amd64" ;; \
        arm64) TFSEC_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL https://github.com/aquasecurity/tfsec/releases/download/v${TFSEC_VERSION}/tfsec-linux-${TFSEC_ARCH} -o /usr/local/bin/tfsec \
    && chmod +x /usr/local/bin/tfsec

RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) TFLINT_ARCH="amd64" ;; \
        arm64) TFLINT_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL https://github.com/terraform-linters/tflint/releases/download/v${TFLINT_VERSION}/tflint_linux_${TFLINT_ARCH}.zip -o /tmp/tflint.zip \
    && unzip -q /tmp/tflint.zip -d /usr/local/bin \
    && rm /tmp/tflint.zip

# Trivy (Dockerfile/image scans)
RUN ARCH="$(dpkg --print-architecture)" \
    && case "${ARCH}" in \
        amd64) TRIVY_ARCH="64bit" ;; \
        arm64) TRIVY_ARCH="ARM64" ;; \
        *) echo "Unsupported architecture: ${ARCH}" >&2; exit 1 ;; \
    esac \
    && curl -fsSL https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-${TRIVY_ARCH}.tar.gz -o /tmp/trivy.tgz \
    && tar -xzf /tmp/trivy.tgz -C /usr/local/bin trivy \
    && rm /tmp/trivy.tgz

# Python-based scanners
RUN python3 -m pip install --no-cache-dir --upgrade pip \
    && python3 -m pip install --no-cache-dir semgrep checkov

# Docker CLI (required by Dockerfile scan in scanners.py)
RUN ARCH="$(dpkg --print-architecture)" \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=${ARCH} signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for API and workers
COPY backend/requirements.txt /work/
RUN python3 -m pip install --no-cache-dir -r /work/requirements.txt

WORKDIR /work

# Copy application code (will be overridden by volume mount in docker-compose for dev)
COPY backend/src/ /work/

# Default entrypoint (can be overridden in docker-compose)
ENTRYPOINT ["python3", "-m", "audit"]
