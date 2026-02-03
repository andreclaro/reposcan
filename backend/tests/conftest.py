"""Pytest configuration and shared fixtures."""
import pytest


def pytest_configure(config):
    """Register custom markers."""
    config.addinivalue_line(
        "markers",
        "integration: mark test as integration test (clones real GitHub repos, needs network). "
        "Run with: pytest -m integration",
    )


def pytest_collection_modifyitems(config, items):
    """Add 'integration' marker to tests in test_integration_*.py if not already marked."""
    for item in items:
        if "test_integration" in item.nodeid and "integration" not in item.keywords:
            item.add_marker(pytest.mark.integration)
