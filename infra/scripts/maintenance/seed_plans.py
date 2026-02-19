#!/usr/bin/env python3
"""
Seed default subscription plans using frontend/drizzle/seed_plans.sql.

Runs the idempotent INSERT ... ON CONFLICT (codename) DO NOTHING from the
drizzle seed file. Safe to run multiple times or after a DB purge.

Usage:
  python3 infrastructure/scripts/maintenance/seed_plans.py
  python3 infrastructure/scripts/maintenance/seed_plans.py --confirm
  python3 infrastructure/scripts/maintenance/seed_plans.py --database-url postgresql://...
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

import asyncpg


def find_seed_sql() -> Path:
    """Resolve frontend/drizzle/seed_plans.sql relative to repo root."""
    # Script lives at infrastructure/scripts/maintenance/seed_plans.py -> 3 parents to repo root
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent.parent.parent
    seed_path = repo_root / "frontend" / "drizzle" / "seed_plans.sql"
    if not seed_path.is_file():
        raise FileNotFoundError(f"Seed file not found: {seed_path}")
    return seed_path


async def seed_plans(
    conn: asyncpg.Connection,
    seed_sql: str,
    dry_run: bool,
) -> bool:
    """Execute seed_plans.sql. Returns True if run (or would run in dry-run)."""
    if dry_run:
        print("  [would run] frontend/drizzle/seed_plans.sql (INSERT ... ON CONFLICT DO NOTHING)")
        return True
    await conn.execute(seed_sql)
    print("  Ran frontend/drizzle/seed_plans.sql")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed default subscription plans from frontend/drizzle/seed_plans.sql"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report what would be run (do not execute SQL)",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Skip confirmation prompt",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL connection URL (default: from DATABASE_URL env or localhost)",
    )
    parser.add_argument(
        "--seed-file",
        default=None,
        metavar="PATH",
        help="Path to seed_plans.sql (default: frontend/drizzle/seed_plans.sql from repo root)",
    )
    args = parser.parse_args()

    database_url = (
        args.database_url
        or os.getenv("DATABASE_URL")
        or "postgresql://postgres:postgres@localhost:5432/sec_audit"
    )

    try:
        seed_path = Path(args.seed_file) if args.seed_file else find_seed_sql()
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return 1

    if not args.confirm and not args.dry_run:
        print("This will run the plan seed SQL (INSERT ... ON CONFLICT DO NOTHING).")
        print(f"  Seed file: {seed_path}")
        print(f"  Database: {database_url.split('@')[-1] if '@' in database_url else database_url}")
        response = input("\nProceed? (type 'yes' to confirm): ")
        if response.lower() != "yes":
            print("Aborted.")
            return 0

    seed_sql = seed_path.read_text(encoding="utf-8")

    async def run() -> None:
        print("Connecting to PostgreSQL database...")
        conn = await asyncpg.connect(database_url)
        try:
            if args.dry_run:
                print("DRY RUN – no SQL will be executed.\n")
            await seed_plans(conn, seed_sql, args.dry_run)
        finally:
            await conn.close()

    try:
        asyncio.run(run())
        print()
        print("Done.")
        return 0
    except KeyboardInterrupt:
        print("\nAborted by user.")
        return 130
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
