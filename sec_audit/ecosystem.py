import shutil
import subprocess
from pathlib import Path

from .version_manager import get_version_env_shell


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

    # Get version switching commands
    version_info = get_version_env_shell(repo_dir)
    shell_prefix = version_info.get("shell_prefix", "")
    node_version = version_info.get("node_version")

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write(f"Package manager: {package_manager}\n")
        handle.write(f"Repository: {repo_slug}\n")
        if node_version:
            handle.write(f"Node.js version: {node_version}\n")
        handle.write("=" * 80 + "\n\n")

        # Build shell command with version switching
        if shell_prefix:
            install_shell_cmd = f"{shell_prefix} && cd {repo_dir} && {' '.join(install_cmd)}"
            audit_shell_cmd = f"{shell_prefix} && cd {repo_dir} && {' '.join(audit_cmd)}"
        else:
            install_shell_cmd = None
            audit_shell_cmd = None

        if install_shell_cmd:
            install_result = subprocess.run(
                install_shell_cmd,
                shell=True,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        else:
            install_result = subprocess.run(
                install_cmd,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        handle.write(
            f"\nInstall exit code: {install_result.returncode}\n\n"
        )

        if audit_shell_cmd:
            audit_result = subprocess.run(
                audit_shell_cmd,
                shell=True,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        else:
            audit_result = subprocess.run(
                audit_cmd,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        handle.write(f"\nAudit exit code: {audit_result.returncode}\n")


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

    # Get version switching commands
    version_info = get_version_env_shell(repo_dir)
    shell_prefix = version_info.get("shell_prefix", "")
    go_version = version_info.get("go_version")

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: govulncheck\n")
        handle.write(f"Repository: {repo_slug}\n")
        if go_version:
            handle.write(f"Go version: {go_version}\n")
        handle.write("=" * 80 + "\n\n")

        # Build shell command with version switching
        if shell_prefix:
            shell_cmd = f"{shell_prefix} && cd {repo_dir} && {govulncheck_bin} ./..."
            result = subprocess.run(
                shell_cmd,
                shell=True,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        else:
            result = subprocess.run(
                [govulncheck_bin, "./..."],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        handle.write(f"\nExit code: {result.returncode}\n")


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

    # Get version switching commands
    version_info = get_version_env_shell(repo_dir)
    shell_prefix = version_info.get("shell_prefix", "")
    rust_version = version_info.get("rust_version")

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: cargo audit\n")
        handle.write(f"Repository: {repo_slug}\n")
        if rust_version:
            handle.write(f"Rust version: {rust_version}\n")
        handle.write("=" * 80 + "\n\n")

        # Build shell command with version switching
        if shell_prefix:
            shell_cmd = f"{shell_prefix} && cd {repo_dir} && {cargo_bin} audit"
            result = subprocess.run(
                shell_cmd,
                shell=True,
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        else:
            result = subprocess.run(
                [cargo_bin, "audit"],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
        handle.write(f"\nExit code: {result.returncode}\n")
