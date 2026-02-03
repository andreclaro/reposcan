"""
Integration tests using real GitHub repositories.

These tests clone small public repos and verify ecosystem detection and scanner triggers.
Requires network access. Run with: pytest tests/test_integration_github.py -v -m integration
Skip by default: pytest (excludes -m integration)
"""
import pytest
from pathlib import Path

from audit.ecosystem import (
    detect_node_package_manager,
    has_go_project,
    has_node_project,
    has_rust_project,
)
from audit.fs import detect_languages, find_dockerfiles, has_terraform
from audit.repos import clone_repo


# Small real GitHub repos (one per ecosystem) to keep clone time reasonable.
# Branch None = auto-detect default.
REAL_REPOS = {
    "go": ("https://github.com/golang/example.git", None),
    "rust": ("https://github.com/rust-num/num-traits.git", None),
    "node": ("https://github.com/sindresorhus/is-odd.git", None),
    "terraform": ("https://github.com/thecodesmith/terraform-hello-world.git", None),
}


@pytest.fixture(scope="module")
def cloned_repos(tmp_path_factory):
    """Clone real GitHub repos once per test module. Repos that fail to clone are omitted."""
    root = tmp_path_factory.mktemp("integration_repos")
    allowed_base = root.resolve()
    results = {}
    for slug, (url, branch) in REAL_REPOS.items():
        dest = root / slug
        dest.mkdir(parents=True, exist_ok=True)
        try:
            clone_repo(url, dest, branch, skip_lfs=True, allowed_base=allowed_base)
            results[slug] = dest
        except Exception:
            # Skip this repo; tests will skip if their repo is missing
            pass
    if not results:
        pytest.skip("Could not clone any real GitHub repo (network or git unavailable)")
    return results


@pytest.mark.integration
class TestRealRepoGo:
    """Integration tests against a real Go repo (golang/example)."""

    def test_clone_has_go_mod(self, cloned_repos):
        if "go" not in cloned_repos:
            pytest.skip("Go repo not cloned")
        repo_dir = cloned_repos["go"]
        assert has_go_project(repo_dir)
        assert (repo_dir / "go.mod").is_file()

    def test_detect_languages_includes_go(self, cloned_repos):
        if "go" not in cloned_repos:
            pytest.skip("Go repo not cloned")
        repo_dir = cloned_repos["go"]
        languages = detect_languages(repo_dir)
        assert "Go" in languages
        assert languages["Go"] >= 1


@pytest.mark.integration
class TestRealRepoRust:
    """Integration tests against a real Rust repo (rust-num/num-traits)."""

    def test_clone_has_cargo_toml(self, cloned_repos):
        if "rust" not in cloned_repos:
            pytest.skip("Rust repo not cloned")
        repo_dir = cloned_repos["rust"]
        assert has_rust_project(repo_dir)
        assert (repo_dir / "Cargo.toml").is_file()

    def test_detect_languages_includes_rust(self, cloned_repos):
        if "rust" not in cloned_repos:
            pytest.skip("Rust repo not cloned")
        repo_dir = cloned_repos["rust"]
        languages = detect_languages(repo_dir)
        assert "Rust" in languages
        assert languages["Rust"] >= 1


@pytest.mark.integration
class TestRealRepoNode:
    """Integration tests against a real Node repo (sindresorhus/is-odd)."""

    def test_clone_has_package_json(self, cloned_repos):
        if "node" not in cloned_repos:
            pytest.skip("Node repo not cloned")
        repo_dir = cloned_repos["node"]
        assert has_node_project(repo_dir)
        assert (repo_dir / "package.json").is_file()

    def test_detect_node_package_manager(self, cloned_repos):
        if "node" not in cloned_repos:
            pytest.skip("Node repo not cloned")
        repo_dir = cloned_repos["node"]
        pm = detect_node_package_manager(repo_dir)
        assert pm in ("npm", "pnpm")

    def test_detect_languages_includes_js_or_json(self, cloned_repos):
        if "node" not in cloned_repos:
            pytest.skip("Node repo not cloned")
        repo_dir = cloned_repos["node"]
        languages = detect_languages(repo_dir)
        assert "JavaScript" in languages or "JSON" in languages or "Markdown" in languages


@pytest.mark.integration
class TestRealRepoTerraform:
    """Integration tests against a real Terraform repo (terraform-hello-world)."""

    def test_clone_has_terraform_files(self, cloned_repos):
        if "terraform" not in cloned_repos:
            pytest.skip("Terraform repo not cloned")
        repo_dir = cloned_repos["terraform"]
        assert has_terraform(repo_dir)

    def test_detect_languages_includes_terraform(self, cloned_repos):
        if "terraform" not in cloned_repos:
            pytest.skip("Terraform repo not cloned")
        repo_dir = cloned_repos["terraform"]
        languages = detect_languages(repo_dir)
        assert "Terraform" in languages
        assert languages["Terraform"] >= 1

    def test_find_dockerfiles_or_none(self, cloned_repos):
        if "terraform" not in cloned_repos:
            pytest.skip("Terraform repo not cloned")
        repo_dir = cloned_repos["terraform"]
        dockerfiles = find_dockerfiles(repo_dir)
        # This repo may or may not have a Dockerfile; we just assert the function runs
        assert isinstance(dockerfiles, list)
