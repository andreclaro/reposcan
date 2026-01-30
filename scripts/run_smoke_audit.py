#!/usr/bin/env python3
"""
Run sec-audit with the smoke-test CSV and verify expected output files exist.

Usage:
  python scripts/run_smoke_audit.py [--csv PATH] [--repos DIR]
  python scripts/run_smoke_audit.py --verify-only --audit DIR

Without --verify-only: runs sec-audit (audit output is cwd/audit), then verifies.
With --verify-only: only checks the given audit directory for expected files.
"""
import argparse
import subprocess
import sys
from pathlib import Path

# Expected output files per repo slug (from scripts/repositories_smoke_test.csv).
SMOKE_REPOS = {
    "go": ["languages.csv", "semgrep.txt", "trivy_fs_scan.txt", "go_vulncheck.txt"],
    "cargo": ["languages.csv", "semgrep.txt", "trivy_fs_scan.txt", "rust_audit.txt"],
    "react": ["languages.csv", "semgrep.txt", "trivy_fs_scan.txt", "node_audit.txt"],
    "terraform-hello-world": [
        "languages.csv",
        "semgrep.txt",
        "trivy_fs_scan.txt",
        "tfsec.txt",
        "checkov.txt",
        "tflint.txt",
    ],
}


def run_sec_audit(csv_path: Path, repos_dir: Path) -> int:
    """Run sec-audit with the given CSV and repos dir. Audit output is cwd/audit. Returns exit code."""
    cmd = [
        sys.executable,
        "-m",
        "sec_audit",
        str(csv_path.resolve()),
        str(repos_dir.resolve()),
        "--audit",
        "all",
    ]
    return subprocess.run(cmd, cwd=Path.cwd()).returncode


def verify_audit_dir(audit_dir: Path) -> bool:
    """Check that each smoke repo slug has the expected output files. Returns True if all pass."""
    audit_dir = audit_dir.resolve()
    ok = True
    for slug, required_files in SMOKE_REPOS.items():
        repo_audit = audit_dir / slug
        if not repo_audit.is_dir():
            print(f"Missing audit dir: {repo_audit}")
            ok = False
            continue
        for f in required_files:
            path = repo_audit / f
            if not path.exists():
                print(f"Missing: {path}")
                ok = False
            elif path.stat().st_size == 0 and f != "languages.csv":
                print(f"Empty: {path}")
                ok = False
    return ok


def main() -> int:
    root = Path.cwd().resolve()
    parser = argparse.ArgumentParser(description="Run smoke-test audit and verify output.")
    parser.add_argument(
        "--csv",
        type=Path,
        default=root / "scripts" / "repositories_smoke_test.csv",
        help="Path to repositories CSV (default: scripts/repositories_smoke_test.csv)",
    )
    parser.add_argument(
        "--repos",
        type=Path,
        default=root / "repos_smoke",
        help="Directory to clone repos into (default: repos_smoke)",
    )
    parser.add_argument(
        "--audit",
        type=Path,
        default=root / "audit",
        help="Audit output directory to verify (default: cwd/audit)",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Only verify existing audit dir; do not run sec-audit",
    )
    args = parser.parse_args()

    if not args.verify_only:
        if not args.csv.exists():
            print(f"CSV not found: {args.csv}", file=sys.stderr)
            return 1
        code = run_sec_audit(args.csv, args.repos)
        if code != 0:
            print("sec-audit failed", file=sys.stderr)
            return code
        audit_dir = root / "audit"
    else:
        audit_dir = args.audit.resolve()

    if not audit_dir.is_dir():
        print(f"Audit dir not found: {audit_dir}", file=sys.stderr)
        return 1
    if not verify_audit_dir(audit_dir):
        return 1
    print("All expected output files present.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
