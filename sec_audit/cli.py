import argparse
import csv
import shutil
from pathlib import Path

from .ecosystem import (
    has_go_project,
    has_node_project,
    has_rust_project,
    run_cargo_audit,
    run_go_vulncheck,
    run_node_audit,
)
from .fs import detect_languages, has_terraform
from .repos import clone_repo, ensure_audit_dirs, repo_name, update_submodules_if_present
from .scanners import (
    run_semgrep,
    run_tfsec_checkov_tflint_scan,
    run_trivy_dockerfile_scan,
)
from .utils import normalize_cell, parse_audit_selection, should_run_audit


def main() -> int:
    root_dir = Path.cwd().resolve()
    parser = argparse.ArgumentParser(
        description="Source Code Security Audit Tool"
    )
    parser.add_argument(
        "list_file",
        nargs="?",
        default=root_dir / "repositories.csv",
        type=Path,
        help="Path to repositories.csv CSV (default: current working dir)",
    )
    parser.add_argument(
        "target_dir",
        nargs="?",
        default=root_dir / "repos",
        type=Path,
        help="Directory to clone into (default: cwd / repos)",
    )
    lfs_group = parser.add_mutually_exclusive_group()
    lfs_group.add_argument(
        "--skip-lfs",
        action="store_true",
        help="Disable git-lfs filters during clone",
    )
    lfs_group.add_argument(
        "--use-lfs",
        action="store_true",
        help="Force git-lfs filters during clone",
    )
    parser.add_argument(
        "--audit",
        action="append",
        default=[],
        help=(
            "Audits to run (comma-separated or repeatable). "
            "Options: all, sast, terraform, dockerfile, node, go, rust"
        ),
    )
    args = parser.parse_args()

    git_lfs_available = shutil.which("git-lfs") is not None
    if args.use_lfs:
        skip_lfs = False
    elif args.skip_lfs:
        skip_lfs = True
    else:
        skip_lfs = not git_lfs_available
        if skip_lfs:
            print("git-lfs not found; cloning with LFS filters disabled.")

    if not args.list_file.is_file():
        print(f"Repositories list not found: {args.list_file}")
        return 1

    args.target_dir.mkdir(parents=True, exist_ok=True)
    audit_root = root_dir / "audit"
    selected_audits = parse_audit_selection(args.audit)

    with args.list_file.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        for row in reader:
            if not row or all(not cell.strip() for cell in row):
                continue
            if row[0].lstrip().startswith("#"):
                continue

            first_cell = normalize_cell(row[0])
            if not first_cell:
                continue
            if "repository" in first_cell.lower() and "url" in first_cell.lower():
                continue

            repo = first_cell
            branch = normalize_cell(row[1]) if len(row) > 1 else "main"
            if not branch:
                branch = "main"

            name = repo_name(repo)
            dest = args.target_dir / name
            clone_repo(repo, dest, branch, skip_lfs)
            update_submodules_if_present(dest)
            repo_audit_dir = ensure_audit_dirs(audit_root, name)

            language_counts = detect_languages(dest)
            languages_csv = repo_audit_dir / "languages.csv"
            with languages_csv.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["language", "files"])
                for language, files_count in sorted(language_counts.items()):
                    writer.writerow([language, files_count])
            print(f"Wrote language summary: {languages_csv}")

            if should_run_audit(selected_audits, "sast"):
                semgrep_configs = ["p/ci", "p/security-audit", "p/secrets"]
                for config in semgrep_configs:
                    config_slug = config.replace("/", "-")
                    semgrep_json = repo_audit_dir / f"semgrep-{config_slug}.json"
                    semgrep_text = repo_audit_dir / f"semgrep-{config_slug}.txt"
                    run_semgrep(dest, config, semgrep_json, semgrep_text)
                    print(f"Wrote Semgrep report: {semgrep_json}")
                    print(f"Wrote Semgrep report: {semgrep_text}")

            if should_run_audit(selected_audits, "dockerfile"):
                trivy_report = repo_audit_dir / "trivy_dockerfile_scan.txt"
                run_trivy_dockerfile_scan(dest, name, trivy_report)
                if trivy_report.exists():
                    print(f"Wrote Trivy Dockerfile report: {trivy_report}")

            if should_run_audit(selected_audits, "node"):
                if (
                    "JavaScript" in language_counts
                    or "TypeScript" in language_counts
                    or has_node_project(dest)
                ):
                    node_report = repo_audit_dir / "node_audit.txt"
                    run_node_audit(dest, name, node_report)
                    if node_report.exists():
                        print(f"Wrote Node audit report: {node_report}")

            if should_run_audit(selected_audits, "go"):
                if "Go" in language_counts or has_go_project(dest):
                    go_report = repo_audit_dir / "go_vulncheck.txt"
                    run_go_vulncheck(dest, name, go_report)
                    if go_report.exists():
                        print(f"Wrote Go vulncheck report: {go_report}")

            if should_run_audit(selected_audits, "rust"):
                if "Rust" in language_counts or has_rust_project(dest):
                    rust_report = repo_audit_dir / "rust_audit.txt"
                    run_cargo_audit(dest, name, rust_report)
                    if rust_report.exists():
                        print(f"Wrote Rust audit report: {rust_report}")

            if should_run_audit(selected_audits, "terraform") and has_terraform(dest):
                tfsec_report = repo_audit_dir / "tfsec.txt"
                checkov_report = repo_audit_dir / "checkov.txt"
                tflint_report = repo_audit_dir / "tflint.txt"
                run_tfsec_checkov_tflint_scan(
                    dest,
                    tfsec_report,
                    checkov_report,
                    tflint_report,
                )
                if tfsec_report.exists():
                    print(f"Wrote tfsec report: {tfsec_report}")
                if checkov_report.exists():
                    print(f"Wrote checkov report: {checkov_report}")
                if tflint_report.exists():
                    print(f"Wrote tflint report: {tflint_report}")

    return 0
