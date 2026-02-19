#!/usr/bin/env python3
"""CLI entry point for the audit tool. Run with PYTHONPATH=backend-worker/src or pip install -e . from backend-worker."""
from audit.__main__ import main


if __name__ == "__main__":
    raise SystemExit(main())
