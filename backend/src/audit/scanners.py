import os
import re
import shutil
import subprocess
from pathlib import Path

from .fs import find_dockerfiles

# Timeouts (seconds); override via env if needed
SEMGREP_TIMEOUT = int(os.getenv("SEC_AUDIT_SEMGREP_TIMEOUT", "600"))
TRIVY_TIMEOUT = int(os.getenv("SEC_AUDIT_TRIVY_TIMEOUT", "300"))
DOCKER_BUILD_TIMEOUT = int(os.getenv("SEC_AUDIT_DOCKER_BUILD_TIMEOUT", "600"))
TERRAFORM_SCAN_TIMEOUT = int(os.getenv("SEC_AUDIT_TERRAFORM_SCAN_TIMEOUT", "300"))
GITLEAKS_TIMEOUT = int(os.getenv("SEC_AUDIT_GITLEAKS_TIMEOUT", "300"))
OSV_SCANNER_TIMEOUT = int(os.getenv("SEC_AUDIT_OSV_SCANNER_TIMEOUT", "300"))
BANDIT_TIMEOUT = int(os.getenv("SEC_AUDIT_BANDIT_TIMEOUT", "300"))
HADOLINT_TIMEOUT = int(os.getenv("SEC_AUDIT_HADOLINT_TIMEOUT", "60"))
TRIVY_CONFIG_TIMEOUT = int(os.getenv("SEC_AUDIT_TRIVY_CONFIG_TIMEOUT", "300"))
ZAP_TIMEOUT = int(os.getenv("SEC_AUDIT_ZAP_TIMEOUT", "1800"))  # 30 min default for DAST
TRUFFLEHOG_TIMEOUT = int(os.getenv("SEC_AUDIT_TRUFFLEHOG_TIMEOUT", "600"))


def _filter_semgrep_login_messages(text: str) -> str:
    """Filter out login-related promotional messages from Semgrep output."""
    if not text:
        return text
    
    lines = text.splitlines()
    filtered_lines = []
    
    # Patterns to filter out login-related messages (case-insensitive)
    login_patterns = [
        r"💎.*login",
        r"✨.*learn more at.*sg\.run",
        r"✘.*semgrep code.*sast",
        r"✘.*semgrep supply chain.*sca",
        r"💎.*missed out.*pro rules.*logged in",
        r"⚡.*supercharge.*free account",
        r"get started with all semgrep products via.*login",
        r"requires login",
        r"since you aren't logged in",
        r"when you create a free account",
        r"learn more at https://sg\.run",
        r"missed out on.*pro rules",
        r"supercharge semgrep oss",
    ]
    
    i = 0
    while i < len(lines):
        line = lines[i]
        line_lower = line.lower()
        
        # Check if line matches any login pattern
        should_filter = False
        for pattern in login_patterns:
            if re.search(pattern, line_lower):
                should_filter = True
                break
        
        # Filter ASCII art banners (Semgrep CLI header)
        if not should_filter:
            if re.match(r"^[┌│└─○\s]+$", line) or re.match(r"^[⠙⠹⠸⠼⠴⠦⠧⠇⠏⠋⠉\s]+", line):
                # Check if this is part of the promotional banner section
                # Look ahead/behind for login-related content
                context_lines = []
                if i > 0:
                    context_lines.append(lines[i - 1].lower())
                if i < len(lines) - 1:
                    context_lines.append(lines[i + 1].lower())
                if any(any(p in ctx for p in ["semgrep cli", "login", "sg.run", "semgrep code", "semgrep supply"]) for ctx in context_lines):
                    should_filter = True
        
        # Filter separator lines that are near promotional content
        if not should_filter and re.match(r"^[\s━─]+$", line):
            # Check surrounding context
            context_start = max(0, i - 3)
            context_end = min(len(lines), i + 4)
            context = " ".join(lines[context_start:context_end]).lower()
            if any(p in context for p in ["login", "semgrep code", "semgrep supply", "sg.run", "missed out", "supercharge"]):
                should_filter = True
        
        if not should_filter:
            filtered_lines.append(line)
        
        i += 1
    
    return "\n".join(filtered_lines)


def run_semgrep(
    repo_dir: Path,
    output_json: Path,
    output_text: Path,
) -> None:
    semgrep_bin = shutil.which("semgrep")
    if not semgrep_bin:
        raise RuntimeError("semgrep CLI not found in PATH")

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_json = output_json.resolve()
    output_text = output_text.resolve()
    
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_text.parent.mkdir(parents=True, exist_ok=True)
    
    # Set environment to suppress color codes and reduce promotional output
    env = os.environ.copy()
    env["NO_COLOR"] = "1"
    
    # Run semgrep with JSON output
    # Use --output with absolute path, and also capture stdout as backup
    try:
        json_result = subprocess.run(
            [
                semgrep_bin,
                "scan",
                "--json",
                "--output",
                str(output_json),
                str(repo_dir),
            ],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            env=env,
            timeout=SEMGREP_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_json.write_text('{"results": [], "errors": [{"message": "Semgrep timed out"}]}', encoding="utf-8")
        json_result = None
    if json_result is not None and json_result.returncode not in (0, 1):
        raise RuntimeError(
            f"semgrep JSON failed for {repo_dir} with exit code {json_result.returncode}: {json_result.stderr}"
        )
    
    # If file wasn't created, write the captured output manually
    if not output_json.exists() and json_result is not None:
        if json_result.stdout:
            output_json.write_text(json_result.stdout, encoding="utf-8")
        else:
            # Create empty JSON array if no output
            output_json.write_text("[]", encoding="utf-8")

    # Run semgrep with text output
    try:
        text_result = subprocess.run(
            [
                semgrep_bin,
                "scan",
                "--output",
                str(output_text),
                str(repo_dir),
            ],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            env=env,
            timeout=SEMGREP_TIMEOUT,
        )
    except subprocess.TimeoutExpired:
        text_result = None
        if not output_text.exists():
            output_text.parent.mkdir(parents=True, exist_ok=True)
            output_text.write_text("Semgrep timed out.\n", encoding="utf-8")
    if text_result is not None and text_result.returncode not in (0, 1):
        raise RuntimeError(
            f"semgrep text failed for {repo_dir} with exit code {text_result.returncode}: {text_result.stderr}"
        )
    
    # Read the output file if it was created, filter it, and write back
    if output_text.exists():
        content = output_text.read_text(encoding="utf-8")
        filtered_content = _filter_semgrep_login_messages(content)
        output_text.write_text(filtered_content, encoding="utf-8")
    elif text_result is not None:
        # If file wasn't created, write the captured output manually (filtered)
        if text_result.stdout:
            filtered_stdout = _filter_semgrep_login_messages(text_result.stdout)
            output_text.write_text(filtered_stdout, encoding="utf-8")
        else:
            # Create empty file if no output
            output_text.write_text("No issues found.\n", encoding="utf-8")


def run_trivy_dockerfile_scan(
    repo_dir: Path,
    repo_slug: str,
    output_text: Path,
) -> None:
    dockerfiles = find_dockerfiles(repo_dir)
    if not dockerfiles:
        return

    docker_bin = shutil.which("docker")
    trivy_bin = shutil.which("trivy")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not docker_bin or not trivy_bin:
        missing = []
        if not docker_bin:
            missing.append("docker")
        if not trivy_bin:
            missing.append("trivy")
        output_text.write_text(
            f"Skipping Dockerfile scan; missing binaries: {', '.join(missing)}\n",
            encoding="utf-8",
        )
        return

    with output_text.open("w", encoding="utf-8") as handle:
        for index, dockerfile in enumerate(dockerfiles, start=1):
            tag_suffix = f"-df{index}" if len(dockerfiles) > 1 else ""
            image_tag = f"{repo_slug.lower()}{tag_suffix}:latest"
            context_dir = dockerfile.parent

            handle.write("=" * 80 + "\n")
            handle.write(f"Dockerfile: {dockerfile}\n")
            handle.write(f"Image tag: {image_tag}\n")
            handle.write("=" * 80 + "\n\n")

            try:
                build_result = subprocess.run(
                    [
                        docker_bin,
                        "build",
                        "-f",
                        str(dockerfile),
                        "-t",
                        image_tag,
                        str(context_dir),
                    ],
                    cwd=repo_dir,
                    stdout=handle,
                    stderr=handle,
                    timeout=DOCKER_BUILD_TIMEOUT,
                )
            except subprocess.TimeoutExpired:
                handle.write("\nDocker build timed out; skipping trivy.\n\n")
                continue
            if build_result.returncode != 0:
                handle.write(
                    f"\nDocker build failed (exit {build_result.returncode}); skipping trivy.\n\n"
                )
                continue

            try:
                trivy_result = subprocess.run(
                    [trivy_bin, "image", image_tag],
                    cwd=repo_dir,
                    stdout=handle,
                    stderr=handle,
                    timeout=TRIVY_TIMEOUT,
                )
            except subprocess.TimeoutExpired:
                handle.write("\nTrivy scan timed out.\n\n")
                continue
            if trivy_result.returncode != 0:
                handle.write(
                    f"\nTrivy scan failed (exit {trivy_result.returncode}).\n\n"
                )
            else:
                handle.write("\n")


def run_trivy_fs_scan(
    repo_dir: Path,
    output_text: Path,
) -> None:
    """Run Trivy filesystem scan on repository directory."""
    trivy_bin = shutil.which("trivy")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not trivy_bin:
        output_text.write_text(
            "Skipping Trivy filesystem scan; missing binary: trivy\n",
            encoding="utf-8",
        )
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write(f"Tool: trivy fs\n")
        handle.write(f"Repository: {repo_dir}\n")
        handle.write("=" * 80 + "\n\n")

        try:
            trivy_result = subprocess.run(
                [trivy_bin, "fs", "."],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
                timeout=TRIVY_TIMEOUT,
            )
        except subprocess.TimeoutExpired:
            handle.write("\nTrivy filesystem scan timed out.\n")
            trivy_result = None
        if trivy_result is not None and trivy_result.returncode not in (0, 1):
            handle.write(
                f"\nTrivy filesystem scan failed (exit {trivy_result.returncode}).\n"
            )
        elif trivy_result is not None:
            handle.write(f"\nExit code: {trivy_result.returncode}\n")


def run_tfsec_checkov_tflint_scan(
    repo_dir: Path,
    tfsec_output: Path,
    checkov_output: Path,
    tflint_output: Path,
) -> None:
    tfsec_bin = shutil.which("tfsec")
    checkov_bin = shutil.which("checkov")
    tflint_bin = shutil.which("tflint")
    tfsec_output.parent.mkdir(parents=True, exist_ok=True)

    if not tfsec_bin:
        tfsec_output.write_text(
            "Skipping tfsec scan; missing binary: tfsec\n",
            encoding="utf-8",
        )
    else:
        with tfsec_output.open("w", encoding="utf-8") as handle:
            try:
                result = subprocess.run(
                    [tfsec_bin, str(repo_dir)],
                    cwd=repo_dir,
                    stdout=handle,
                    stderr=handle,
                    timeout=TERRAFORM_SCAN_TIMEOUT,
                )
            except subprocess.TimeoutExpired:
                handle.write("\ntfsec scan timed out.\n")
                result = None
            if result is not None and result.returncode != 0:
                handle.write(
                    f"\ntfsec scan failed (exit {result.returncode}).\n"
                )

    if not checkov_bin:
        checkov_output.write_text(
            "Skipping checkov scan; missing binary: checkov\n",
            encoding="utf-8",
        )
    else:
        with checkov_output.open("w", encoding="utf-8") as handle:
            try:
                result = subprocess.run(
                    [checkov_bin, "-d", str(repo_dir)],
                    cwd=repo_dir,
                    stdout=handle,
                    stderr=handle,
                    timeout=TERRAFORM_SCAN_TIMEOUT,
                )
            except subprocess.TimeoutExpired:
                handle.write("\ncheckov scan timed out.\n")
                result = None
            if result is not None and result.returncode != 0:
                handle.write(
                    f"\ncheckov scan failed (exit {result.returncode}).\n"
                )

    if not tflint_bin:
        tflint_output.write_text(
            "Skipping tflint scan; missing binary: tflint\n",
            encoding="utf-8",
        )
    else:
        with tflint_output.open("w", encoding="utf-8") as handle:
            try:
                result = subprocess.run(
                    [tflint_bin, "--recursive"],
                    cwd=repo_dir,
                    stdout=handle,
                    stderr=handle,
                    timeout=TERRAFORM_SCAN_TIMEOUT,
                )
            except subprocess.TimeoutExpired:
                handle.write("\ntflint scan timed out.\n")
                result = None
            if result is not None and result.returncode != 0:
                handle.write(
                    f"\ntflint scan failed (exit {result.returncode}).\n"
                )


def run_gitleaks(
    repo_dir: Path,
    output_json: Path,
    output_text: Path,
) -> None:
    """Run Gitleaks secret detection scan on repository.
    
    Args:
        repo_dir: Path to repository root
        output_json: Path for JSON output file
        output_text: Path for text output file
    """
    gitleaks_bin = shutil.which("gitleaks")
    if not gitleaks_bin:
        output_text.parent.mkdir(parents=True, exist_ok=True)
        output_json.parent.mkdir(parents=True, exist_ok=True)
        output_text.write_text(
            "Skipping Gitleaks scan; missing binary: gitleaks\n",
            encoding="utf-8",
        )
        output_json.write_text('{"findings": []}', encoding="utf-8")
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_json = output_json.resolve()
    output_text = output_text.resolve()
    
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_text.parent.mkdir(parents=True, exist_ok=True)

    # Run gitleaks detect with JSON output
    try:
        result = subprocess.run(
            [
                gitleaks_bin,
                "detect",
                "--source", str(repo_dir),
                "--report-format", "json",
                "--report-path", str(output_json),
                "--verbose",
            ],
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            timeout=GITLEAKS_TIMEOUT,
        )
        
        # Write text output (stdout contains findings in verbose mode)
        output_text.write_text(result.stdout or "No secrets found.\n", encoding="utf-8")
        
        # If JSON wasn't created, create empty one
        if not output_json.exists():
            output_json.write_text('{"findings": []}', encoding="utf-8")
            
    except subprocess.TimeoutExpired:
        output_text.write_text("Gitleaks scan timed out.\n", encoding="utf-8")
        output_json.write_text('{"findings": [], "error": "timed out"}', encoding="utf-8")
    except Exception as e:
        output_text.write_text(f"Gitleaks scan failed: {e}\n", encoding="utf-8")
        output_json.write_text(f'{{"findings": [], "error": "{e}"}}', encoding="utf-8")


def run_osv_scanner(
    repo_dir: Path,
    repo_slug: str,
    output_json: Path,
    output_text: Path,
) -> None:
    """Run OSV-Scanner for dependency vulnerability scanning.
    
    OSV-Scanner is used for languages WITHOUT dedicated scanners:
    - Python (requirements.txt, Pipfile.lock, poetry.lock)
    - Java (pom.xml, gradle.lockfile)
    - .NET (packages.lock.json)
    - PHP (composer.lock)
    
    Skips Node.js, Go, Rust (have dedicated scanners).
    
    Args:
        repo_dir: Path to repository root
        repo_slug: Repository slug for reporting
        output_json: Path for JSON output file
        output_text: Path for text output file
    """
    osv_bin = shutil.which("osv-scanner")
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not osv_bin:
        output_text.write_text(
            "Skipping OSV-Scanner; missing binary: osv-scanner\n",
            encoding="utf-8",
        )
        output_json.write_text('{"results": []}', encoding="utf-8")
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_json = output_json.resolve()
    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: OSV-Scanner\n")
        handle.write(f"Repository: {repo_slug}\n")
        handle.write("Note: Scans Python, Java, .NET, PHP (skips Node/Go/Rust)\n")
        handle.write("=" * 80 + "\n\n")

        try:
            # Run osv-scanner with JSON output
            result = subprocess.run(
                [
                    osv_bin,
                    "scan",
                    "--format", "json",
                    "--output", str(output_json),
                    str(repo_dir),
                ],
                cwd=str(repo_dir),
                stdout=handle,
                stderr=handle,
                timeout=OSV_SCANNER_TIMEOUT,
            )
            
            # OSV returns exit code 1 when vulnerabilities are found (not an error)
            handle.write(f"\nExit code: {result.returncode}\n")
            
            # If JSON wasn't created, create empty one
            if not output_json.exists():
                output_json.write_text('{"results": []}', encoding="utf-8")
                
        except subprocess.TimeoutExpired:
            handle.write("\nOSV-Scanner timed out.\n")
            output_json.write_text('{"results": [], "error": "timed out"}', encoding="utf-8")
        except Exception as e:
            handle.write(f"\nOSV-Scanner failed: {e}\n")
            output_json.write_text(f'{{"results": [], "error": "{e}"}}', encoding="utf-8")


def run_bandit(
    repo_dir: Path,
    repo_slug: str,
    output_json: Path,
    output_text: Path,
) -> None:
    """Run Bandit Python security linter.
    
    Bandit performs AST-based security analysis for Python-specific issues
    like hardcoded passwords, SQL injection, unsafe eval/exec, etc.
    Complements Semgrep's pattern matching.
    
    Args:
        repo_dir: Path to repository root
        repo_slug: Repository slug for reporting
        output_json: Path for JSON output file
        output_text: Path for text output file
    """
    bandit_bin = shutil.which("bandit")
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not bandit_bin:
        output_text.write_text(
            "Skipping Bandit scan; missing binary: bandit\n",
            encoding="utf-8",
        )
        output_json.write_text('{"results": []}', encoding="utf-8")
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_json = output_json.resolve()
    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: Bandit (Python SAST)\n")
        handle.write(f"Repository: {repo_slug}\n")
        handle.write("=" * 80 + "\n\n")

        try:
            # Run bandit with JSON output
            # -r: recursive
            # -f json: JSON format
            # -o: output file
            result = subprocess.run(
                [
                    bandit_bin,
                    "-r",
                    "-f", "json",
                    "-o", str(output_json),
                    str(repo_dir),
                ],
                cwd=str(repo_dir),
                stdout=handle,
                stderr=handle,
                timeout=BANDIT_TIMEOUT,
            )
            
            # Bandit returns exit code 1 when issues found (not an error)
            handle.write(f"\nExit code: {result.returncode}\n")
            
            # If JSON wasn't created, create empty one
            if not output_json.exists():
                output_json.write_text('{"results": []}', encoding="utf-8")
                
        except subprocess.TimeoutExpired:
            handle.write("\nBandit scan timed out.\n")
            output_json.write_text('{"results": [], "error": "timed out"}', encoding="utf-8")
        except Exception as e:
            handle.write(f"\nBandit scan failed: {e}\n")
            output_json.write_text(f'{{"results": [], "error": "{e}"}}', encoding="utf-8")


def run_hadolint(
    repo_dir: Path,
    output_text: Path,
) -> None:
    """Run Hadolint Dockerfile linter.
    
    Hadolint checks Dockerfile best practices and shell script issues.
    Complements Trivy's vulnerability scanning (Trivy=security CVEs, Hadolint=best practices).
    
    Args:
        repo_dir: Path to repository root
        output_text: Path for text output file
    """
    hadolint_bin = shutil.which("hadolint")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not hadolint_bin:
        output_text.write_text(
            "Skipping Hadolint scan; missing binary: hadolint\n",
            encoding="utf-8",
        )
        return

    # Find all Dockerfiles
    dockerfiles = find_dockerfiles(repo_dir)
    if not dockerfiles:
        output_text.write_text(
            "Skipping Hadolint scan; no Dockerfiles found\n",
            encoding="utf-8",
        )
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: Hadolint (Dockerfile Linter)\n")
        handle.write("=" * 80 + "\n\n")

        for dockerfile in dockerfiles:
            handle.write(f"\n--- Scanning: {dockerfile.relative_to(repo_dir)} ---\n\n")
            
            try:
                result = subprocess.run(
                    [
                        hadolint_bin,
                        "--no-color",
                        str(dockerfile),
                    ],
                    cwd=str(repo_dir),
                    stdout=handle,
                    stderr=handle,
                    timeout=HADOLINT_TIMEOUT,
                )
                
                # Hadolint returns non-zero when issues found (not necessarily an error)
                if result.returncode == 0:
                    handle.write("No issues found.\n")
                    
            except subprocess.TimeoutExpired:
                handle.write(f"\nHadolint timed out for {dockerfile}\n")
            except Exception as e:
                handle.write(f"\nHadolint failed for {dockerfile}: {e}\n")


def run_trivy_config_scan(
    repo_dir: Path,
    repo_slug: str,
    output_text: Path,
) -> None:
    """Run Trivy config scan for Kubernetes YAML and Docker Compose.
    
    Uses existing Trivy installation to scan:
    - Kubernetes manifests (skips Terraform to avoid overlap with tfsec/checkov)
    - Docker Compose files
    - Helm charts (basic support)
    
    Note: Intentionally skips .tf files as they're covered by dedicated scanners.
    
    Args:
        repo_dir: Path to repository root
        repo_slug: Repository slug for reporting
        output_text: Path for text output file
    """
    trivy_bin = shutil.which("trivy")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not trivy_bin:
        output_text.write_text(
            "Skipping Trivy config scan; missing binary: trivy\n",
            encoding="utf-8",
        )
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: Trivy Config (Kubernetes/Docker Compose)\n")
        handle.write(f"Repository: {repo_slug}\n")
        handle.write("Note: Scans K8s YAML and Docker Compose (skips Terraform)\n")
        handle.write("=" * 80 + "\n\n")

        try:
            # Run trivy config scan
            # --skip-files to skip Terraform files (already covered by tfsec/checkov)
            result = subprocess.run(
                [
                    trivy_bin,
                    "config",
                    "--skip-files", "*.tf",
                    "--skip-files", "*.tfvars",
                    ".",
                ],
                cwd=str(repo_dir),
                stdout=handle,
                stderr=handle,
                timeout=TRIVY_CONFIG_TIMEOUT,
            )
            
            # Trivy returns exit code 1 when issues found (not necessarily an error)
            handle.write(f"\nExit code: {result.returncode}\n")
            
        except subprocess.TimeoutExpired:
            handle.write("\nTrivy config scan timed out.\n")
        except Exception as e:
            handle.write(f"\nTrivy config scan failed: {e}\n")


def run_zap_baseline_scan(
    target_url: str,
    output_text: Path,
) -> None:
    """Run OWASP ZAP baseline scan against a target URL.
    
    DAST (Dynamic Application Security Testing) scans a running application
    for vulnerabilities like XSS, SQL injection, CSRF, etc.
    
    IMPORTANT: This scan requires:
    1. A running application accessible at target_url
    2. The ZAP tool installed (zap.sh or zap-cli)
    3. Significantly more time than static scans (default 30 min timeout)
    
    The baseline scan runs ZAP spider and active scanner against the target.
    
    Args:
        target_url: URL of the running application to scan (e.g., http://localhost:8080)
        output_text: Path for text output file
    """
    import os
    
    zap_bin = shutil.which("zap") or shutil.which("zap.sh")
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not zap_bin:
        output_text.write_text(
            "Skipping ZAP scan; missing binary: zap or zap.sh\n"
            "Install OWASP ZAP from: https://www.zaproxy.org/download/\n",
            encoding="utf-8",
        )
        return

    if not target_url or not target_url.startswith(("http://", "https://")):
        output_text.write_text(
            f"Skipping ZAP scan; invalid or missing target URL: {target_url}\n"
            "Set DAST_TARGET_URL environment variable to the running application URL.\n",
            encoding="utf-8",
        )
        return

    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: OWASP ZAP (DAST - Dynamic Application Security Testing)\n")
        handle.write(f"Target URL: {target_url}\n")
        handle.write("=" * 80 + "\n\n")
        handle.write("WARNING: DAST requires a running application to scan.\n")
        handle.write("Ensure the target application is accessible before scanning.\n\n")

        try:
            # Run ZAP baseline scan using the packaged scan script
            # This uses the ZAP Docker image approach but adapted for CLI
            result = subprocess.run(
                [
                    zap_bin,
                    "-cmd",
                    "-quickurl", target_url,
                    "-quickprogress",
                ],
                capture_output=True,
                text=True,
                timeout=ZAP_TIMEOUT,
            )
            
            handle.write(result.stdout or "")
            handle.write(result.stderr or "")
            handle.write(f"\nExit code: {result.returncode}\n")
            
        except subprocess.TimeoutExpired:
            handle.write("\nZAP scan timed out.\n")
            handle.write("Consider increasing SEC_AUDIT_ZAP_TIMEOUT or scanning a smaller scope.\n")
        except Exception as e:
            handle.write(f"\nZAP scan failed: {e}\n")


def run_trufflehog(
    repo_dir: Path,
    output_json: Path,
    output_text: Path,
) -> None:
    """Run TruffleHog enhanced secret detection scan.
    
    TruffleHog is a more comprehensive secret scanner than Gitleaks:
    - 800+ built-in detectors
    - Entropy analysis to reduce false positives
    - Optional verified secrets (live credential checking)
    - Historical git scanning
    
    Use case: Run as "deep scan" option for high-security repositories
    or when Gitleaks finds nothing but suspicion remains.
    
    Note: More resource-intensive than Gitleaks. Consider using Gitleaks
    as the default and TruffleHog for deep scanning.
    
    Args:
        repo_dir: Path to repository root
        output_json: Path for JSON output file
        output_text: Path for text output file
    """
    trufflehog_bin = shutil.which("trufflehog")
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_text.parent.mkdir(parents=True, exist_ok=True)

    if not trufflehog_bin:
        output_text.write_text(
            "Skipping TruffleHog scan; missing binary: trufflehog\n",
            encoding="utf-8",
        )
        output_json.write_text('{}', encoding="utf-8")
        return

    # Ensure absolute paths
    repo_dir = repo_dir.resolve()
    output_json = output_json.resolve()
    output_text = output_text.resolve()

    with output_text.open("w", encoding="utf-8") as handle:
        handle.write("=" * 80 + "\n")
        handle.write("Tool: TruffleHog (Enhanced Secret Detection)\n")
        handle.write("Note: Deep scan with 800+ detectors and entropy analysis\n")
        handle.write("=" * 80 + "\n\n")

        try:
            # Run trufflehog filesystem scan with JSON output
            # --only-verified: Only show verified secrets (optional, can be disabled)
            result = subprocess.run(
                [
                    trufflehog_bin,
                    "filesystem",
                    str(repo_dir),
                    "--json",
                ],
                cwd=str(repo_dir),
                stdout=subprocess.PIPE,
                stderr=handle,
                timeout=TRUFFLEHOG_TIMEOUT,
            )
            
            # Parse JSON output and write to file
            import json
            try:
                # TruffleHog outputs one JSON object per line
                findings = []
                for line in result.stdout.decode("utf-8", errors="ignore").strip().split("\n"):
                    if line.strip():
                        try:
                            finding = json.loads(line)
                            findings.append(finding)
                        except json.JSONDecodeError:
                            continue
                
                output_data = {
                    "tool": "trufflehog",
                    "version": "3.x",
                    "findings": findings,
                    "total_findings": len(findings),
                }
                output_json.write_text(json.dumps(output_data, indent=2), encoding="utf-8")
                
                handle.write(f"Found {len(findings)} potential secrets\n")
                handle.write(f"\nExit code: {result.returncode}\n")
                
            except Exception as e:
                handle.write(f"\nFailed to parse TruffleHog output: {e}\n")
                output_json.write_text(f'{{"error": "{e}", "raw_output": ""}}', encoding="utf-8")
                
        except subprocess.TimeoutExpired:
            handle.write("\nTruffleHog scan timed out.\n")
            output_json.write_text('{"error": "timed out"}', encoding="utf-8")
        except Exception as e:
            handle.write(f"\nTruffleHog scan failed: {e}\n")
            output_json.write_text(f'{{"error": "{e}"}}', encoding="utf-8")
