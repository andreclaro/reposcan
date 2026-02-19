# CLI Usage Guide

The `securefast` CLI tool allows you to batch scan multiple repositories from a CSV file.

## Quick Start

From the repository root:

```sh
PYTHONPATH=backend-worker/src python backend-worker/audit.py path/to/repositories.csv /path/to/clone/dir
```

## CSV Format

Create a `repositories.csv` file:

```csv
repository_url,branch
https://github.com/user/repo1.git,main
https://github.com/user/repo2.git,develop
https://github.com/user/repo3.git,
```

- `repository_url`: Git repository URL (https, git@, or ssh)
- `branch`: Branch to clone (optional, defaults to repository default branch)

## Run Specific Audits

```sh
PYTHONPATH=backend-worker/src python backend-worker/audit.py repositories.csv ./repos \
  --audit sast,terraform,dockerfile
```

### Available Audit Types

| Type | Description |
|------|-------------|
| `sast` | Semgrep static analysis |
| `dockerfile` | Trivy container scanning |
| `terraform` | tfsec, checkov, tflint |
| `node` | npm/pnpm audit |
| `go` | govulncheck |
| `rust` | cargo-audit |
| `all` | Run all audits (default) |

## Docker Usage

### Build the Image

```sh
docker build -f docker/Dockerfile -t securefast .
```

### Run with CSV

```sh
docker run --rm \
  -v /absolute/path/to/repositories.csv:/work/repositories.csv \
  -v /absolute/path/to/clone/dir:/work/output \
  securefast \
  /work/repositories.csv /work/output
```

Or if your CSV is in the current directory:

```sh
docker run --rm \
  -v "$(pwd)/repositories.csv:/work/repositories.csv" \
  -v "$(pwd)/output:/work/output" \
  securefast \
  /work/repositories.csv /work/output
```

## Output Format

Reports are written under `audit/<RepoName>/`:

| File | Description |
|------|-------------|
| `semgrep.json` / `semgrep.txt` | SAST findings |
| `trivy_dockerfile_scan.txt` | Dockerfile vulnerabilities |
| `tfsec.txt`, `checkov.txt`, `tflint.txt` | Terraform issues |
| `node_audit.txt` | Node.js dependency vulnerabilities |
| `go_vulncheck.txt` | Go vulnerabilities |
| `rust_audit.txt` | Rust crate vulnerabilities |
| `languages.csv` | Detected languages summary |

## System Requirements

### Required Tools

The following tools must be installed and available in PATH:

- **Git** (with optional git-lfs)
- **Semgrep** - `pip install semgrep`
- **Trivy** - Container scanner
- **tfsec** - Terraform security scanner
- **checkov** - Infrastructure as Code scanner
- **tflint** - Terraform linter
- **Node.js** (npm/pnpm) - For Node.js audits
- **Go** (govulncheck) - For Go audits
- **Rust** (cargo-audit) - For Rust audits
- **Docker CLI** - For Dockerfile scanning

### Python Requirements

- Python 3.11+

## Notes

- If `git-lfs` is not available, clones run with LFS filters disabled
- CLI reports are written under `audit/<RepoName>/`
- Output directories are gitignored
