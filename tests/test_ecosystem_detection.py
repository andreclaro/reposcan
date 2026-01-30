"""Tests for ecosystem and filesystem detection (has_*_project, has_terraform, find_dockerfiles)."""
import pytest
from pathlib import Path

from sec_audit.ecosystem import (
    detect_node_package_manager,
    has_go_project,
    has_node_project,
    has_rust_project,
)
from sec_audit.fs import find_dockerfiles, has_terraform


class TestHasNodeProject:
    def test_true_when_package_json_exists(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        assert has_node_project(tmp_path) is True

    def test_false_without_package_json(self, tmp_path):
        assert has_node_project(tmp_path) is False

    def test_false_when_only_in_subdir(self, tmp_path):
        (tmp_path / "sub").mkdir(parents=True)
        (tmp_path / "sub" / "package.json").write_text("{}", encoding="utf-8")
        assert has_node_project(tmp_path) is False


class TestDetectNodePackageManager:
    def test_returns_pnpm_when_lockfile_present(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        (tmp_path / "pnpm-lock.yaml").write_text("lockfile_version: 5.4\n", encoding="utf-8")
        assert detect_node_package_manager(tmp_path) == "pnpm"

    def test_returns_npm_when_package_lock_present(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
        assert detect_node_package_manager(tmp_path) == "npm"

    def test_prefers_pnpm_over_npm(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        (tmp_path / "pnpm-lock.yaml").write_text("", encoding="utf-8")
        (tmp_path / "package-lock.json").write_text("{}", encoding="utf-8")
        assert detect_node_package_manager(tmp_path) == "pnpm"

    def test_returns_empty_when_no_lockfile(self, tmp_path):
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        assert detect_node_package_manager(tmp_path) == ""


class TestHasGoProject:
    def test_true_when_go_mod_exists(self, tmp_path):
        (tmp_path / "go.mod").write_text("module foo\n\ngo 1.21\n", encoding="utf-8")
        assert has_go_project(tmp_path) is True

    def test_false_without_go_mod(self, tmp_path):
        assert has_go_project(tmp_path) is False

    def test_false_when_only_go_files_no_go_mod(self, tmp_path):
        (tmp_path / "main.go").write_text("package main\n", encoding="utf-8")
        assert has_go_project(tmp_path) is False


class TestHasRustProject:
    def test_true_when_cargo_toml_exists(self, tmp_path):
        (tmp_path / "Cargo.toml").write_text("[package]\nname = \"foo\"\n", encoding="utf-8")
        assert has_rust_project(tmp_path) is True

    def test_false_without_cargo_toml(self, tmp_path):
        assert has_rust_project(tmp_path) is False

    def test_false_when_only_rs_files_no_cargo_toml(self, tmp_path):
        (tmp_path / "lib.rs").write_text("", encoding="utf-8")
        assert has_rust_project(tmp_path) is False


class TestHasTerraform:
    def test_true_when_tf_file_in_root(self, tmp_path):
        (tmp_path / "main.tf").write_text('resource "null_resource" "x" {}', encoding="utf-8")
        assert has_terraform(tmp_path) is True

    def test_true_when_tf_file_in_subdir(self, tmp_path):
        (tmp_path / "terraform").mkdir(parents=True)
        (tmp_path / "terraform" / "main.tf").write_text('resource "null_resource" "x" {}', encoding="utf-8")
        assert has_terraform(tmp_path) is True

    def test_false_without_tf_files(self, tmp_path):
        (tmp_path / "main.txt").write_text("", encoding="utf-8")
        assert has_terraform(tmp_path) is False

    def test_ignores_node_modules(self, tmp_path):
        (tmp_path / "node_modules" / "pkg").mkdir(parents=True)
        (tmp_path / "node_modules" / "pkg" / "x.tf").write_text("", encoding="utf-8")
        assert has_terraform(tmp_path) is False


class TestFindDockerfiles:
    def test_finds_dockerfile_in_root(self, tmp_path):
        (tmp_path / "Dockerfile").write_text("FROM alpine\n", encoding="utf-8")
        found = find_dockerfiles(tmp_path)
        assert len(found) == 1
        assert found[0].name == "Dockerfile"

    def test_finds_dockerfile_in_subdir(self, tmp_path):
        (tmp_path / "docker").mkdir(parents=True)
        (tmp_path / "docker" / "Dockerfile").write_text("FROM alpine\n", encoding="utf-8")
        found = find_dockerfiles(tmp_path)
        assert len(found) == 1
        assert found[0].name == "Dockerfile"
        assert "docker" in str(found[0])

    def test_finds_multiple_dockerfiles(self, tmp_path):
        (tmp_path / "Dockerfile").write_text("FROM alpine\n", encoding="utf-8")
        (tmp_path / "app").mkdir(parents=True)
        (tmp_path / "app" / "Dockerfile").write_text("FROM node\n", encoding="utf-8")
        found = find_dockerfiles(tmp_path)
        assert len(found) == 2

    def test_empty_when_no_dockerfile(self, tmp_path):
        (tmp_path / "Dockerfile.txt").write_text("", encoding="utf-8")
        assert find_dockerfiles(tmp_path) == []

    def test_ignores_dockerfile_inside_node_modules(self, tmp_path):
        (tmp_path / "node_modules" / "x").mkdir(parents=True)
        (tmp_path / "node_modules" / "x" / "Dockerfile").write_text("FROM x\n", encoding="utf-8")
        assert find_dockerfiles(tmp_path) == []
