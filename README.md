## sec-audit-repos

Minimal CLI to clone a list of repositories and run security scans.

### What it does
- Reads a `repositories.csv` (repo URL + optional branch)
- Clones each repo into a target directory
- Writes audit artifacts under `audit/<RepoName>/`
- Runs SAST (Semgrep), Dockerfile scan (Trivy), and language/infra audits
  (Node, Go, Rust, Terraform) based on repo contents or `--audit` flags

### Usage
```sh
python sec_audit.py path/to/repositories.csv /path/to/clone/dir
```

Run only specific audits:
```sh
python sec_audit.py path/to/repositories.csv /path/to/clone/dir \
  --audit sast,terraform,dockerfile
```

### Notes
- If `git-lfs` is not available, clones run with LFS filters disabled.
- Reports are written as `.txt` (and Semgrep `.json`) under `audit/<RepoName>/`.
