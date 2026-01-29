"""Tests for sec_audit.repos (path traversal, allowed_base)."""
import pytest
from pathlib import Path

from sec_audit.repos import ensure_audit_dirs, repo_name


class TestEnsureAuditDirs:
    def test_sanitizes_repo_slug(self, tmp_path):
        audit_root = tmp_path / "audit"
        dir1 = ensure_audit_dirs(audit_root, "normal-repo")
        assert dir1 == audit_root / "normal-repo"
        assert dir1.exists()

    def test_path_traversal_sanitized(self, tmp_path):
        audit_root = tmp_path / "audit"
        dir1 = ensure_audit_dirs(audit_root, "../../../etc")
        # Should not create etc under tmp_path; slug sanitized to safe name
        assert dir1.exists()
        try:
            dir1.resolve().relative_to(audit_root.resolve())
        except ValueError:
            pytest.fail("repo_audit_dir should be under audit_root")
        assert ".." not in str(dir1)

    def test_empty_slug_gets_default(self, tmp_path):
        audit_root = tmp_path / "audit"
        dir1 = ensure_audit_dirs(audit_root, "")
        assert dir1 == audit_root / "repo"
        assert dir1.exists()


class TestRepoName:
    def test_strips_git(self):
        name = repo_name("https://github.com/user/repo.git")
        assert name == "repo"

    def test_no_git_suffix(self):
        assert repo_name("https://github.com/user/repo") == "repo"
