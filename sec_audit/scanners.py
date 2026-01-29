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
                    [tflint_bin],
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
