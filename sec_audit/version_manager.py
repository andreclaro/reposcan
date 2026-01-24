"""Version manager for detecting and switching runtime versions per repository."""

import re
from pathlib import Path
from typing import Optional

# Try to import tomllib (Python 3.11+) or fall back to tomli
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        tomllib = None


def detect_node_version(repo_dir: Path) -> Optional[str]:
    """
    Detect Node.js version from project files.

    Checks in order:
    1. .nvmrc
    2. .node-version
    3. package.json engines.node

    Returns:
        Version string (e.g., "18.17.0", "20", "lts/*") or None if not found
    """
    # Check .nvmrc
    nvmrc = repo_dir / ".nvmrc"
    if nvmrc.is_file():
        version = nvmrc.read_text(encoding="utf-8").strip()
        if version:
            return version

    # Check .node-version
    node_version = repo_dir / ".node-version"
    if node_version.is_file():
        version = node_version.read_text(encoding="utf-8").strip()
        if version:
            return version

    # Check package.json engines.node
    package_json = repo_dir / "package.json"
    if package_json.is_file():
        try:
            import json

            data = json.loads(package_json.read_text(encoding="utf-8"))
            engines = data.get("engines", {})
            node_version_spec = engines.get("node")
            if node_version_spec:
                # Extract version from semver range (e.g., ">=18.0.0" -> "18")
                match = re.search(r"(\d+)", str(node_version_spec))
                if match:
                    major = match.group(1)
                    return major
        except (json.JSONDecodeError, KeyError, AttributeError):
            pass

    return None


def detect_go_version(repo_dir: Path) -> Optional[str]:
    """
    Detect Go version from go.mod file.

    Returns:
        Version string (e.g., "1.21", "1.22.6") or None if not found
    """
    go_mod = repo_dir / "go.mod"
    if not go_mod.is_file():
        return None

    try:
        content = go_mod.read_text(encoding="utf-8")
        # Look for "go 1.21" or "go 1.22.6" directive
        match = re.search(r"^go\s+(\d+\.\d+(?:\.\d+)?)", content, re.MULTILINE)
        if match:
            return match.group(1)
    except (IOError, UnicodeDecodeError):
        pass

    return None


def detect_rust_version(repo_dir: Path) -> Optional[str]:
    """
    Detect Rust version from rust-toolchain.toml or rust-toolchain file.

    Returns:
        Version string (e.g., "1.75.0", "stable") or None if not found
    """
    # Check rust-toolchain.toml (preferred)
    rust_toolchain_toml = repo_dir / "rust-toolchain.toml"
    if rust_toolchain_toml.is_file():
        if tomllib is not None:
            try:
                content = rust_toolchain_toml.read_bytes()
                data = tomllib.loads(content)
                toolchain = data.get("toolchain", {})
                channel = toolchain.get("channel")
                if channel:
                    return str(channel)
            except (Exception, KeyError, AttributeError):
                pass
        else:
            # Fallback: parse TOML as text with regex
            try:
                content = rust_toolchain_toml.read_text(encoding="utf-8")
                # Look for channel = "version" in [toolchain] section
                match = re.search(
                    r'\[toolchain\]\s*channel\s*=\s*"([^"]+)"', content, re.DOTALL
                )
                if match:
                    return match.group(1)
            except (IOError, UnicodeDecodeError):
                pass

    # Check rust-toolchain (plain text file)
    rust_toolchain = repo_dir / "rust-toolchain"
    if rust_toolchain.is_file():
        try:
            content = rust_toolchain.read_text(encoding="utf-8").strip()
            # Handle both plain version and TOML format
            if content.startswith("[toolchain]"):
                # TOML format in plain file
                match = re.search(r'channel\s*=\s*"([^"]+)"', content)
                if match:
                    return match.group(1)
            else:
                # Plain version string
                version = content.splitlines()[0].strip()
                if version:
                    return version
        except (IOError, UnicodeDecodeError):
            pass

    return None


def get_node_version_shell(repo_dir: Path) -> str:
    """
    Get shell commands to switch to the correct Node.js version using nvm.

    Returns:
        Shell command string to source nvm and use the detected version
    """
    version = detect_node_version(repo_dir)
    if not version:
        # Use default Node.js if no version specified
        return ""

    # nvm is installed at /root/.nvm
    # We need to source nvm.sh and then use the version
    # Handle version aliases like "lts/*", "node", etc.
    version_escaped = version.replace('"', '\\"').replace("'", "\\'")
    return f"""
export NVM_DIR="/root/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \\. "$NVM_DIR/nvm.sh"
nvm use "{version_escaped}" 2>/dev/null || (nvm install "{version_escaped}" && nvm use "{version_escaped}") || echo "Node {version_escaped} not available, using default"
"""


def get_go_version_shell(repo_dir: Path) -> str:
    """
    Get shell commands to switch to the correct Go version using gvm.

    Returns:
        Shell command string to use the detected Go version
    """
    version = detect_go_version(repo_dir)
    if not version:
        # Use default Go if no version specified
        return ""

    # Normalize version (e.g., "1.21" -> "go1.21.0", "1.22.6" -> "go1.22.6")
    if version.count(".") == 1:
        # Add patch version if missing
        version = f"{version}.0"
    go_version_str = f"go{version}"

    # gvm is installed at /root/.gvm
    # We need to source gvm and then use the version
    return f"""
export GVM_ROOT="/root/.gvm"
[ -s "$GVM_ROOT/scripts/gvm" ] && source "$GVM_ROOT/scripts/gvm"
gvm use {go_version_str} --default 2>/dev/null || (gvm install {go_version_str} -B && gvm use {go_version_str} --default) || echo "Go {go_version_str} not available, using default"
"""


def get_rust_version_shell(repo_dir: Path) -> str:
    """
    Get shell commands to switch to the correct Rust version using rustup.

    Returns:
        Shell command string to use the detected Rust version
    """
    version = detect_rust_version(repo_dir)
    if not version:
        # Use default Rust if no version specified
        return ""

    # rustup is already in PATH, just need to override toolchain
    return f"""
export PATH="/root/.cargo/bin:$PATH"
rustup override set {version} 2>/dev/null || rustup toolchain install {version} && rustup override set {version}
"""


def get_version_env_shell(repo_dir: Path) -> dict[str, str]:
    """
    Get environment variables and shell commands needed for version switching.

    Returns:
        Dictionary with 'shell_prefix' containing commands to run before executing tools
    """
    node_cmd = get_node_version_shell(repo_dir)
    go_cmd = get_go_version_shell(repo_dir)
    rust_cmd = get_rust_version_shell(repo_dir)

    # Combine all commands
    commands = []
    if node_cmd.strip():
        commands.append(node_cmd.strip())
    if go_cmd.strip():
        commands.append(go_cmd.strip())
    if rust_cmd.strip():
        commands.append(rust_cmd.strip())

    shell_prefix = " && ".join(commands) if commands else ""

    return {
        "shell_prefix": shell_prefix,
        "node_version": detect_node_version(repo_dir),
        "go_version": detect_go_version(repo_dir),
        "rust_version": detect_rust_version(repo_dir),
    }
