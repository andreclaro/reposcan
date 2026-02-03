#!/usr/bin/env python3
"""CLI entry point for the audit tool. Run with PYTHONPATH=backend/src or pip install -e . from backend."""
from audit.__main__ import main


if __name__ == "__main__":
    raise SystemExit(main())
