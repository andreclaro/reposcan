import shutil
import subprocess
from pathlib import Path

from .fs import find_dockerfiles


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
    
    # Run semgrep with JSON output
    # Use --output with absolute path, and also capture stdout as backup
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
    )
    if json_result.returncode not in (0, 1):
        raise RuntimeError(
            f"semgrep JSON failed for {repo_dir} with exit code {json_result.returncode}: {json_result.stderr}"
        )
    
    # If file wasn't created, write the captured output manually
    if not output_json.exists():
        if json_result.stdout:
            output_json.write_text(json_result.stdout, encoding="utf-8")
        else:
            # Create empty JSON array if no output
            output_json.write_text("[]", encoding="utf-8")

    # Run semgrep with text output
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
    )
    if text_result.returncode not in (0, 1):
        raise RuntimeError(
            f"semgrep text failed for {repo_dir} with exit code {text_result.returncode}: {text_result.stderr}"
        )
    
    # If file wasn't created, write the captured output manually
    if not output_text.exists():
        if text_result.stdout:
            output_text.write_text(text_result.stdout, encoding="utf-8")
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
            )
            if build_result.returncode != 0:
                handle.write(
                    f"\nDocker build failed (exit {build_result.returncode}); skipping trivy.\n\n"
                )
                continue

            trivy_result = subprocess.run(
                [trivy_bin, "image", image_tag],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
            if trivy_result.returncode != 0:
                handle.write(
                    f"\nTrivy scan failed (exit {trivy_result.returncode}).\n\n"
                )
            else:
                handle.write("\n")


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
            result = subprocess.run(
                [tfsec_bin, str(repo_dir)],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
            if result.returncode != 0:
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
            result = subprocess.run(
                [checkov_bin, "-d", str(repo_dir)],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
            if result.returncode != 0:
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
            result = subprocess.run(
                [tflint_bin],
                cwd=repo_dir,
                stdout=handle,
                stderr=handle,
            )
            if result.returncode != 0:
                handle.write(
                    f"\ntflint scan failed (exit {result.returncode}).\n"
                )
