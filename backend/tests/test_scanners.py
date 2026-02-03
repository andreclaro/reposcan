"""Tests for scanner skip behavior when binaries are missing (mocked shutil.which)."""
import pytest
from pathlib import Path
from unittest.mock import patch

from audit.ecosystem import run_cargo_audit, run_go_vulncheck, run_node_audit
from audit.scanners import (
    run_semgrep,
    run_tfsec_checkov_tflint_scan,
    run_trivy_dockerfile_scan,
    run_trivy_fs_scan,
)


class TestRunSemgrepSkip:
    def test_raises_when_semgrep_missing(self, tmp_path):
        out_json = tmp_path / "out.json"
        out_txt = tmp_path / "out.txt"
        with patch("audit.scanners.shutil.which", return_value=None):
            with pytest.raises(RuntimeError, match="semgrep CLI not found"):
                run_semgrep(tmp_path, out_json, out_txt)


class TestRunTrivyFsScanSkip:
    def test_writes_skip_message_when_trivy_missing(self, tmp_path):
        out = tmp_path / "trivy_fs_scan.txt"
        with patch("audit.scanners.shutil.which", return_value=None):
            run_trivy_fs_scan(tmp_path, out)
        assert out.exists()
        assert "Skipping Trivy filesystem scan; missing binary: trivy" in out.read_text(encoding="utf-8")


class TestRunTrivyDockerfileScanSkip:
    def test_writes_skip_message_when_docker_missing(self, tmp_path):
        (tmp_path / "Dockerfile").write_text("FROM alpine\n", encoding="utf-8")
        out = tmp_path / "trivy_dockerfile_scan.txt"

        def which(cmd):
            return None if cmd == "docker" else "/usr/bin/trivy"

        with patch("audit.scanners.shutil.which", side_effect=which):
            run_trivy_dockerfile_scan(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping Dockerfile scan; missing binaries:" in out.read_text(encoding="utf-8")
        assert "docker" in out.read_text(encoding="utf-8")

    def test_writes_skip_message_when_trivy_missing(self, tmp_path):
        (tmp_path / "Dockerfile").write_text("FROM alpine\n", encoding="utf-8")
        out = tmp_path / "trivy_dockerfile_scan.txt"

        def which(cmd):
            return None if cmd == "trivy" else "/usr/bin/docker"

        with patch("audit.scanners.shutil.which", side_effect=which):
            run_trivy_dockerfile_scan(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping Dockerfile scan; missing binaries:" in out.read_text(encoding="utf-8")
        assert "trivy" in out.read_text(encoding="utf-8")


class TestRunGoVulncheckSkip:
    def test_writes_skip_message_when_govulncheck_missing(self, tmp_path):
        (tmp_path / "go.mod").write_text("module foo\n\ngo 1.21\n", encoding="utf-8")
        out = tmp_path / "go_vulncheck.txt"
        with patch("audit.ecosystem.shutil.which", return_value=None):
            run_go_vulncheck(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping govulncheck; missing binary: govulncheck" in out.read_text(encoding="utf-8")


class TestRunCargoAuditSkip:
    def test_writes_skip_message_when_cargo_missing(self, tmp_path):
        (tmp_path / "Cargo.toml").write_text('[package]\nname = "foo"\nversion = "0.1.0"\n', encoding="utf-8")
        out = tmp_path / "rust_audit.txt"
        with patch("audit.ecosystem.shutil.which", return_value=None):
            run_cargo_audit(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping cargo audit; missing binary: cargo" in out.read_text(encoding="utf-8")

    def test_writes_skip_message_when_cargo_audit_missing(self, tmp_path):
        (tmp_path / "Cargo.toml").write_text('[package]\nname = "foo"\nversion = "0.1.0"\n', encoding="utf-8")
        out = tmp_path / "rust_audit.txt"

        def which(cmd):
            return "/usr/bin/cargo" if cmd == "cargo" else None

        with patch("audit.ecosystem.shutil.which", side_effect=which):
            run_cargo_audit(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping cargo audit; missing binary: cargo-audit" in out.read_text(encoding="utf-8")


class TestRunNodeAuditSkip:
    def test_writes_skip_message_when_no_lockfile(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        out = tmp_path / "node_audit.txt"
        run_node_audit(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping Node audit; missing pnpm-lock.yaml or package-lock.json" in out.read_text(encoding="utf-8")

    def test_writes_skip_message_when_npm_binary_missing(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
        out = tmp_path / "node_audit.txt"
        with patch("audit.ecosystem.shutil.which", return_value=None):
            run_node_audit(tmp_path, "test-repo", out)
        assert out.exists()
        assert "Skipping Node audit; missing binary: npm" in out.read_text(encoding="utf-8")


class TestRunTfsecCheckovTflintSkip:
    def test_writes_skip_messages_when_all_binaries_missing(self, tmp_path):
        (tmp_path / "main.tf").write_text('resource "null_resource" "x" {}', encoding="utf-8")
        tfsec_out = tmp_path / "tfsec.txt"
        checkov_out = tmp_path / "checkov.txt"
        tflint_out = tmp_path / "tflint.txt"
        with patch("audit.scanners.shutil.which", return_value=None):
            run_tfsec_checkov_tflint_scan(tmp_path, tfsec_out, checkov_out, tflint_out)
        assert tfsec_out.exists()
        assert "Skipping tfsec scan; missing binary: tfsec" in tfsec_out.read_text(encoding="utf-8")
        assert checkov_out.exists()
        assert "Skipping checkov scan; missing binary: checkov" in checkov_out.read_text(encoding="utf-8")
        assert tflint_out.exists()
        assert "Skipping tflint scan; missing binary: tflint" in tflint_out.read_text(encoding="utf-8")
