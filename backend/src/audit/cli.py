import argparse
import csv
import logging
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
    run_trivy_fs_scan,
)
from .utils import (
    normalize_cell,
    parse_audit_selection,
    read_csv_safely,
    safe_repo_slug,
    should_run_audit,
    validate_branch,
    validate_repo_url,
)

logger = logging.getLogger(__name__)


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
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Increase log verbosity (DEBUG)",
    )
    parser.add_argument(
        "--quiet", "-q",
        action="store_true",
        help="Reduce log verbosity (WARNING only)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else (logging.WARNING if args.quiet else logging.INFO),
        format="%(message)s",
    )

    git_lfs_available = shutil.which("git-lfs") is not None
    if args.use_lfs:
        skip_lfs = False
    elif args.skip_lfs:
        skip_lfs = True
    else:
        skip_lfs = not git_lfs_available
        if skip_lfs:
            logger.warning("git-lfs not found; cloning with LFS filters disabled.")

    if not args.list_file.is_file():
        logger.error("Repositories list not found: %s", args.list_file)
        return 1

    args.target_dir.mkdir(parents=True, exist_ok=True)
    audit_root = root_dir / "audit"
    selected_audits = parse_audit_selection(args.audit)

    try:
        rows = read_csv_safely(args.list_file)
    except ValueError as e:
        logger.error("Repositories list error: %s", e)
        return 1

    for row in rows:
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
            if not validate_repo_url(repo):
                logger.warning("Skipping invalid repository URL (row ignored)")
                continue
            # Use None to auto-detect default branch if not specified
            branch_raw = normalize_cell(row[1]) if len(row) > 1 else ""
            branch = None
            if branch_raw:
                try:
                    branch = validate_branch(branch_raw)
                except ValueError:
                    branch = None  # use default branch

            name = safe_repo_slug(repo)
            dest = args.target_dir / name
            actual_branch = clone_repo(
                repo, dest, branch, skip_lfs, allowed_base=args.target_dir
            )
            # Use the detected branch for subsequent operations
            branch = actual_branch
            update_submodules_if_present(dest)
            repo_audit_dir = ensure_audit_dirs(audit_root, name)

            language_counts = detect_languages(dest)
            languages_csv = repo_audit_dir / "languages.csv"
            with languages_csv.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["language", "files"])
                for language, files_count in sorted(language_counts.items()):
                    writer.writerow([language, files_count])
            logger.info("Wrote language summary: %s", languages_csv)

            if should_run_audit(selected_audits, "sast"):
                semgrep_json = repo_audit_dir / "semgrep.json"
                semgrep_text = repo_audit_dir / "semgrep.txt"
                run_semgrep(dest, semgrep_json, semgrep_text)
                logger.info("Wrote Semgrep report: %s", semgrep_json)
                logger.info("Wrote Semgrep report: %s", semgrep_text)

            if should_run_audit(selected_audits, "dockerfile"):
                trivy_report = repo_audit_dir / "trivy_dockerfile_scan.txt"
                run_trivy_dockerfile_scan(dest, name, trivy_report)  # name is safe slug
                if trivy_report.exists():
                    logger.info("Wrote Trivy Dockerfile report: %s", trivy_report)

            # Trivy filesystem scan runs for all audits (general filesystem vulnerability scan)
            trivy_fs_report = repo_audit_dir / "trivy_fs_scan.txt"
            run_trivy_fs_scan(dest, trivy_fs_report)
            if trivy_fs_report.exists():
                logger.info("Wrote Trivy filesystem scan report: %s", trivy_fs_report)

            if should_run_audit(selected_audits, "node"):
                if (
                    "JavaScript" in language_counts
                    or "TypeScript" in language_counts
                    or has_node_project(dest)
                ):
                    node_report = repo_audit_dir / "node_audit.txt"
                    run_node_audit(dest, name, node_report)  # name is safe slug
                    if node_report.exists():
                        logger.info("Wrote Node audit report: %s", node_report)

            if should_run_audit(selected_audits, "go"):
                if "Go" in language_counts or has_go_project(dest):
                    go_report = repo_audit_dir / "go_vulncheck.txt"
                    run_go_vulncheck(dest, name, go_report)  # name is safe slug
                    if go_report.exists():
                        logger.info("Wrote Go vulncheck report: %s", go_report)

            if should_run_audit(selected_audits, "rust"):
                if "Rust" in language_counts or has_rust_project(dest):
                    rust_report = repo_audit_dir / "rust_audit.txt"
                    run_cargo_audit(dest, name, rust_report)  # name is safe slug
                    if rust_report.exists():
                        logger.info("Wrote Rust audit report: %s", rust_report)

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
                    logger.info("Wrote tfsec report: %s", tfsec_report)
                if checkov_report.exists():
                    logger.info("Wrote checkov report: %s", checkov_report)
                if tflint_report.exists():
                    logger.info("Wrote tflint report: %s", tflint_report)

    return 0
