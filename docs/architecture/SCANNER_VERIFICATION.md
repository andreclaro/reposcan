# Scanner Verification

This document describes how to verify that all sec_audit scanners run correctly and how to use the smoke-test repository list.

## Scanner inventory and trigger conditions

| Scanner | Trigger | Project files | Required binary(ies) | Output file |
|--------|--------|----------------|----------------------|-------------|
| **Semgrep (SAST)** | `sast` or `all` in `--audit` | Any repo | `semgrep` | `semgrep.json`, `semgrep.txt` |
| **Trivy Dockerfile** | `dockerfile` or `all` | At least one file named `Dockerfile` | `docker`, `trivy` | `trivy_dockerfile_scan.txt` |
| **Trivy FS** | Always (no audit gate) | Any repo | `trivy` | `trivy_fs_scan.txt` |
| **Node** | `node` or `all` and (JS/TS in languages or `package.json` exists) | `package.json` + `pnpm-lock.yaml` or `package-lock.json` | `pnpm` or `npm` | `node_audit.txt` |
| **Go** | `go` or `all` and (Go in languages or `go.mod` exists) | `go.mod` | `govulncheck` | `go_vulncheck.txt` |
| **Rust** | `rust` or `all` and (Rust in languages or `Cargo.toml` exists) | `Cargo.toml` | `cargo`, `cargo-audit` | `rust_audit.txt` |
| **Terraform** | `terraform` or `all` and repo has `.tf` files | At least one `.tf` file | `tfsec`, `checkov`, `tflint` | `tfsec.txt`, `checkov.txt`, `tflint.txt` |

## Smoke-test CSV format

The smoke-test file [infrastructure/deploy/repositories_smoke_test.csv](../../infrastructure/deploy/repositories_smoke_test.csv) uses the same format as the main repositories list:

- **Column 1:** Repository URL (e.g. `https://github.com/owner/repo.git`)
- **Column 2:** Optional branch name (e.g. `main`). If empty or invalid, the default branch is used.

Suggested repos per ecosystem (included in the smoke CSV):

- **Go:** `golang/go` — has `go.mod` and Dockerfile
- **Rust:** `rust-lang/cargo` — has `Cargo.toml`
- **Node:** `facebook/react` — has `package.json` and lockfile, and Dockerfile
- **Terraform:** `thecodesmith/terraform-hello-world` — contains `.tf` files

## How to run the smoke test

1. Ensure scanner binaries are available (e.g. run inside the project Docker image, or install semgrep, trivy, docker, npm/pnpm, govulncheck, cargo, cargo-audit, tfsec, checkov, tflint locally).

2. Run sec-audit with the smoke-test CSV and `--audit all`:

   ```bash
   audit infrastructure/deploy/repositories_smoke_test.csv repos_smoke audit_smoke --audit all
   ```

3. Check that expected output files exist under `audit_smoke/<repo_slug>/`:

   - **Every repo:** `languages.csv`, `semgrep.txt`, `semgrep.json`, `trivy_fs_scan.txt`
   - **Repos with Dockerfile (e.g. go, react):** `trivy_dockerfile_scan.txt`
   - **Node repo (react):** `node_audit.txt` (or a skip message if npm/pnpm missing)
   - **Go repo (go):** `go_vulncheck.txt` (or skip message if govulncheck missing)
   - **Rust repo (cargo):** `rust_audit.txt` (or skip message if cargo/cargo-audit missing)
   - **Terraform repo (terraform-hello-world):** `tfsec.txt`, `checkov.txt`, `tflint.txt` (or skip messages if binaries missing)

If a binary is missing, the corresponding report file will contain a line like `Skipping ... missing binary: <name>`.

## Unit tests (no real binaries)

Detection and skip behavior are covered by tests that do not require scanner binaries:

- **Ecosystem and filesystem detection:** `tests/test_ecosystem_detection.py` — `has_node_project`, `has_go_project`, `has_rust_project`, `detect_node_package_manager`, `has_terraform`, `find_dockerfiles`
- **Scanner skip behavior:** `tests/test_scanners.py` — when `shutil.which` is mocked to return `None`, each scanner writes the expected skip message to its output file

Run all tests (excluding integration):

```bash
pytest tests/ -v -m "not integration"
```

Run integration tests (real GitHub repos; requires network and git):

```bash
pytest tests/test_integration_github.py -v -m integration
```

Integration tests clone small public repos (golang/example, rust-num/num-traits, sindresorhus/is-odd, thecodesmith/terraform-hello-world) and assert ecosystem detection (has_go_project, has_terraform, detect_languages, etc.). They are marked so CI can run fast unit tests by default and run integration only when needed.

## Optional: run_smoke_audit.py

The script [infrastructure/deploy/run_smoke_audit.py](../../infrastructure/deploy/run_smoke_audit.py) runs sec-audit with the smoke CSV and then checks that expected output files exist for each repo slug (go, cargo, react, terraform-hello-world).

- **Full run:** `python infrastructure/deploy/run_smoke_audit.py [--csv PATH] [--repos DIR]` — runs audit (repos cloned into `repos_smoke` by default; audit output is `cwd/audit`), then verifies `cwd/audit`.
- **Verify only:** `python infrastructure/deploy/run_smoke_audit.py --verify-only --audit DIR` — only checks that the given audit directory contains the expected files (useful after a manual audit run).

## Tflint recursion

Tflint is run with `--recursive` so that `.tf` files in subdirectories (e.g. `terraform/`) are scanned. The Dockerfile pins a tflint version that supports `--recursive`.
