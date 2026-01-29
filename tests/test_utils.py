"""Tests for sec_audit.utils (validation, normalization, audit selection)."""
import pytest
from pathlib import Path

from sec_audit.utils import (
    normalize_cell,
    parse_audit_selection,
    read_csv_safely,
    sanitize_repo_slug,
    safe_repo_slug,
    should_run_audit,
    validate_branch,
    validate_repo_url,
)


class TestValidateRepoUrl:
    def test_allows_https(self):
        assert validate_repo_url("https://github.com/user/repo.git") is True
        assert validate_repo_url("https://gitlab.com/org/proj") is True

    def test_allows_http(self):
        assert validate_repo_url("http://example.com/repo.git") is True

    def test_allows_git_ssh(self):
        assert validate_repo_url("git@github.com:user/repo.git") is True
        assert validate_repo_url("ssh://git@github.com/user/repo") is True

    def test_rejects_file(self):
        assert validate_repo_url("file:///etc/passwd") is False
        assert validate_repo_url("file:///tmp/repo") is False

    def test_rejects_empty_or_invalid(self):
        assert validate_repo_url("") is False
        assert validate_repo_url("   ") is False
        assert validate_repo_url("not-a-url") is False
        assert validate_repo_url("ftp://example.com/repo") is False

    def test_rejects_too_long(self):
        long_url = "https://example.com/" + "a" * 2500
        assert len(long_url) > 2048
        assert validate_repo_url(long_url) is False


class TestNormalizeCell:
    def test_strips_whitespace(self):
        assert normalize_cell("  foo  ") == "foo"

    def test_removes_control_characters(self):
        assert normalize_cell("foo\x00bar") == "foobar"
        assert normalize_cell("a\nb\tc") == "abc"
        assert "\x01" not in normalize_cell("x\x01y")

    def test_empty(self):
        assert normalize_cell("") == ""
        assert normalize_cell("   ") == ""


class TestParseAuditSelection:
    def test_empty_returns_all(self):
        assert parse_audit_selection([]) == ["all"]

    def test_only_allowed_values(self):
        assert parse_audit_selection(["sast", "node"]) == ["sast", "node"]
        assert parse_audit_selection(["all"]) == ["all"]
        assert parse_audit_selection(["terraform", "dockerfile", "go", "rust"]) == [
            "terraform",
            "dockerfile",
            "go",
            "rust",
        ]

    def test_ignores_invalid_values(self):
        assert parse_audit_selection(["sast", "invalid", "node"]) == ["sast", "node"]
        assert parse_audit_selection(["sast; rm -rf"]) == []  # invalid not in allowed
        assert parse_audit_selection(["sast", "sast"]) == ["sast", "sast"]

    def test_comma_separated(self):
        assert set(parse_audit_selection(["sast, node, go"])) == {"sast", "node", "go"}

    def test_no_valid_returns_all(self):
        assert parse_audit_selection(["foo", "bar"]) == ["all"]


class TestShouldRunAudit:
    def test_all_runs_everything(self):
        assert should_run_audit(["all"], "sast") is True
        assert should_run_audit(["all"], "node") is True

    def test_specific(self):
        assert should_run_audit(["sast", "node"], "sast") is True
        assert should_run_audit(["sast", "node"], "node") is True
        assert should_run_audit(["sast", "node"], "go") is False


class TestValidateBranch:
    def test_none_empty_returns_none(self):
        assert validate_branch(None) is None
        assert validate_branch("") is None
        assert validate_branch("   ") is None

    def test_valid_branch(self):
        assert validate_branch("main") == "main"
        assert validate_branch("feature/foo-bar") == "feature/foo-bar"
        assert validate_branch("v1.2.3") == "v1.2.3"

    def test_invalid_raises(self):
        with pytest.raises(ValueError, match="Invalid branch name"):
            validate_branch("main; rm -rf")
        with pytest.raises(ValueError, match="Invalid branch name"):
            validate_branch("a" * 300)


class TestSanitizeRepoSlug:
    def test_safe_chars_kept(self):
        assert sanitize_repo_slug("my-repo_123") == "my-repo_123"
        assert sanitize_repo_slug("repo.name") == "repo.name"

    def test_removes_unsafe(self):
        assert ".." not in sanitize_repo_slug("..")
        assert "/" not in sanitize_repo_slug("foo/bar")
        assert sanitize_repo_slug("") == "repo"
        assert sanitize_repo_slug("...") == ""

    def test_max_length(self):
        long_name = "a" * 150
        assert len(sanitize_repo_slug(long_name)) == 100


class TestSafeRepoSlug:
    def test_strips_git_suffix(self):
        assert safe_repo_slug("https://github.com/user/repo.git") == "repo"

    def test_sanitizes_path_like(self):
        slug = safe_repo_slug("https://github.com/user/foo/bar/../../../etc")
        assert ".." not in slug
        assert slug != "etc"


class TestReadCsvSafely:
    def test_reads_valid_csv(self, tmp_path):
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("url,branch\nhttps://github.com/a/b.git,main\n", encoding="utf-8")
        rows = read_csv_safely(csv_path)
        assert len(rows) == 2
        assert rows[0] == ["url", "branch"]
        assert rows[1] == ["https://github.com/a/b.git", "main"]

    def test_max_rows(self, tmp_path):
        csv_path = tmp_path / "test.csv"
        with csv_path.open("w", encoding="utf-8", newline="") as f:
            import csv as csv_module
            w = csv_module.writer(f)
            w.writerow(["url"])
            for i in range(15_000):
                w.writerow([f"https://github.com/u/r{i}.git"])
        with pytest.raises(ValueError, match="too many rows"):
            read_csv_safely(csv_path)

    def test_max_size(self, tmp_path):
        csv_path = tmp_path / "test.csv"
        csv_path.write_text("x" * (11 * 1024 * 1024), encoding="utf-8")
        with pytest.raises(ValueError, match="too large"):
            read_csv_safely(csv_path)
