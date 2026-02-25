# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RepoScan is a Python CLI tool that automates security auditing of multiple repositories. It clones repositories from a CSV file and runs various security scanners (Semgrep, Trivy, govulncheck, cargo-audit, tfsec, checkov, tflint), outputting structured audit reports.

## Running the Tool

```bash
# Basic usage (from repo root with PYTHONPATH=backend/src or pip install -e backend)
python -m audit path/to/repositories.csv /path/to/clone/dir

# Run specific audits only
python -m audit path/to/repositories.csv /path/to/clone/dir --audit sast,terraform,dockerfile

# Available audit types: all, sast, terraform, dockerfile, node, go, rust
```

**Docker usage:**
```bash
docker build -f backend/Dockerfile -t reposcan backend
docker run --rm \
  -v "$(pwd)/repositories.csv:/work/repositories.csv" \
  -v "$(pwd)/output:/work/output" \
  reposcan /work/repositories.csv /work/output
```

## Architecture

### Core Modules

- **`backend/src/audit/cli.py`**: Main CLI entry point, orchestrates the audit workflow
- **`backend/src/audit/scanners.py`**: Security scanner integrations (Semgrep, Trivy, tfsec, checkov, tflint)
- **`backend/src/audit/ecosystem.py`**: Language-specific audits (Node/npm/pnpm, Go/govulncheck, Rust/cargo-audit)
- **`backend/src/audit/repos.py`**: Repository cloning and Git operations
- **`backend/src/audit/fs.py`**: File system operations (language detection, Dockerfile finding)
- **`backend/src/audit/utils.py`**: Utility functions (CSV normalization, audit selection parsing)

### Workflow

1. Read `repositories.csv` (repo URL, optional branch)
2. Clone each repo to `target_dir/<RepoName>/`
3. Detect languages and write `audit/<RepoName>/languages.csv`
4. Run selected audits based on detected languages or `--audit` flags
5. Write reports to `audit/<RepoName>/<scanner>.txt` (and `.json` for Semgrep)

## Code Conventions

### Path Handling
Use `pathlib.Path` for all file operations, never `os.path`:
```python
repo_dir = Path("/path/to/repo")
output_file = repo_dir / "audit" / "report.txt"
output_file.parent.mkdir(parents=True, exist_ok=True)
```

### Scanner Pattern
All scanner functions follow this pattern:
1. Check for required binaries with `shutil.which()`
2. If missing, write skip message to output file and return
3. Ensure output directory exists
4. Run scanner, capturing stdout/stderr to file handle
5. Write exit code for debugging

### Error Handling
- Accept exit codes 0 and 1 as valid (scanners return 1 when findings detected)
- Write skip messages for missing binaries instead of raising exceptions
- Always specify `encoding="utf-8"` for text file operations

### Subprocess Calls
- Never use `shell=True`
- Use explicit command lists: `subprocess.run([git_bin, "clone", repo_url, str(dest_dir)])`

## Output Structure

```
audit/
  <RepoName>/
    languages.csv
    semgrep.json / semgrep.txt
    trivy_dockerfile_scan.txt
    node_audit.txt
    go_vulncheck.txt
    rust_audit.txt
    tfsec.txt / checkov.txt / tflint.txt
```

## Required External Tools

The Docker image includes all tools. For local development, install:
- **SAST**: semgrep (pip)
- **Dockerfile**: trivy, docker CLI
- **Node**: npm or pnpm
- **Go**: govulncheck (`go install golang.org/x/vuln/cmd/govulncheck@latest`)
- **Rust**: cargo-audit (`cargo install cargo-audit`)
- **Terraform**: tfsec, checkov (pip), tflint
