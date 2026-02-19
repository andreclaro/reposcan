import os
import shutil
import subprocess
from pathlib import Path

from .version_manager import get_version_env_shell, ensure_rust_toolchain

# Timeouts (seconds); override via env if needed
ECOSYSTEM_INSTALL_TIMEOUT = int(os.getenv("SEC_AUDIT_ECOSYSTEM_INSTALL_TIMEOUT", "300"))
ECOSYSTEM_AUDIT_TIMEOUT = int(os.getenv("SEC_AUDIT_ECOSYSTEM_AUDIT_TIMEOUT", "300"))


def has_node_project(repo_dir: Path) -> bool:
    return (repo_dir / "package.json").is_file()


def detect_node_package_manager(repo_dir: Path) -> str:
    if (repo_dir / "pnpm-lock.yaml").is_file():
        return "pnpm"
    if (repo_dir / "package-lock.json").is_file():
        return "npm"
    return ""


def run_node_audit(
    repo_dir: Path,
    repo_slug: str,
    output_text: Path,
) -> None:
    if not has_node_project(repo_dir):
        return

    package_manager = detect_node_package_manager(repo_dir)
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not package_manager:
        output_text.write_text(
            "Skipping Node audit; missing pnpm-lock.yaml or package-lock.json.\n",
            encoding="utf-8",
        )
        return

    pm_bin = shutil.which(package_manager)
    if not pm_bin:
        output_text.write_text(
            f"Skipping Node audit; missing binary: {package_manager}\n",
            encoding="utf-8",
        )
        return

    install_cmd = (
        [pm_bin, "install", "--frozen-lockfile"]
        if package_manager == "pnpm"
        else [pm_bin, "ci"]
    )
    audit_cmd = [pm_bin, "audit"]

    # Version info for report only; run without shell (no version switching for Node)
    version_info = get_version_env_shell(repo_dir)
    node_version = version_info.get("node_version")
    env = os.environ.copy()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write(f"Package manager: {package_manager}\n")
        handle.write(f"Repository: {repo_slug}\n")
        if node_version:
            handle.write(f"Node.js version: {node_version}\n")
        handle.write("=" * 80 + "\n\n")

        try:
            install_result = subprocess.run(
                install_cmd,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
                env=env,
                timeout=ECOSYSTEM_INSTALL_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            install_result = None
            handle.write("\nInstall timed out.\n\n")
        handle.write(
            f"\nInstall exit code: {install_result.returncode if install_result is not None else -1}\n\n"
        )

        try:
            audit_result = subprocess.run(
                audit_cmd,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
                env=env,
                timeout=ECOSYSTEM_AUDIT_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            audit_result = None
            handle.write("\nAudit timed out.\n")
        handle.write(f"\nAudit exit code: {audit_result.returncode if audit_result is not None else -1}\n")


def has_go_project(repo_dir: Path) -> bool:
    return (repo_dir / "go.mod").is_file()


def run_go_vulncheck(
    repo_dir: Path,
    repo_slug: str,
    output_text: Path,
) -> None:
    if not has_go_project(repo_dir):
        return

    govulncheck_bin = shutil.which("govulncheck")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not govulncheck_bin:
        output_text.write_text(
            "Skipping govulncheck; missing binary: govulncheck\n",
            encoding="utf-8",
        )
        return

    # Version info for report only; run without shell (no version switching for Go)
    version_info = get_version_env_shell(repo_dir)
    go_version = version_info.get("go_version")
    env = os.environ.copy()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: govulncheck\n")
        handle.write(f"Repository: {repo_slug}\n")
        if go_version:
            handle.write(f"Go version: {go_version}\n")
        handle.write("=" * 80 + "\n\n")

        try:
            result = subprocess.run(
                [govulncheck_bin, "./..."],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
                env=env,
                timeout=ECOSYSTEM_AUDIT_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            result = None
            handle.write("\nGovulncheck timed out.\n")
        handle.write(f"\nExit code: {result.returncode if result is not None else -1}\n")


def has_rust_project(repo_dir: Path) -> bool:
    return (repo_dir / "Cargo.toml").is_file()


def run_cargo_audit(
    repo_dir: Path,
    repo_slug: str,
    output_text: Path,
) -> None:
    if not has_rust_project(repo_dir):
        return

    cargo_bin = shutil.which("cargo")
    cargo_audit_bin = shutil.which("cargo-audit")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not cargo_bin:
        output_text.write_text(
            "Skipping cargo audit; missing binary: cargo\n",
            encoding="utf-8",
        )
        return
    if not cargo_audit_bin:
        output_text.write_text(
            "Skipping cargo audit; missing binary: cargo-audit (install via `cargo install cargo-audit`).\n",
            encoding="utf-8",
        )
        return

    # Set Rust toolchain without shell, then run cargo audit
    ensure_rust_toolchain(repo_dir)
    version_info = get_version_env_shell(repo_dir)
    rust_version = version_info.get("rust_version")
    env = os.environ.copy()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: cargo audit\n")
        handle.write(f"Repository: {repo_slug}\n")
        if rust_version:
            handle.write(f"Rust version: {rust_version}\n")
        handle.write("=" * 80 + "\n\n")

        try:
            result = subprocess.run(
                [cargo_bin, "audit"],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
                env=env,
                timeout=ECOSYSTEM_AUDIT_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            result = None
            handle.write("\nCargo audit timed out.\n")
        handle.write(f"\nExit code: {result.returncode if result is not None else -1}\n")
