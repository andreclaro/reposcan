#!/usr/bin/env python3
"""
Prune old rows from database tables to free space.

Deletes scan-related data older than a retention window. Findings, ai_analysis,
and scan_share are pruned as a consequence of deleting scans (or explicitly for
ai_analysis, which is referenced by scan). Does not remove users, plans, or
accounts.

Usage:
  python3 infrastructure/scripts/maintenance/prune_db_tables.py --older-than-days 90
  python3 infrastructure/scripts/maintenance/prune_db_tables.py --older-than-days 90 --confirm
  python3 infrastructure/scripts/maintenance/prune_db_tables.py --older-than-days 90 --dry-run
  python3 infrastructure/scripts/maintenance/prune_db_tables.py --database-url postgresql://...
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
import asyncpg


async def prune_scans_and_related(
    conn: asyncpg.Connection,
    older_than_days: int,
    dry_run: bool,
) -> dict[str, int]:
    """
    Prune scans (and cascade: findings, scan_share) and ai_analysis older than cutoff.
    Returns dict of table name -> number of rows deleted (or would be in dry-run).
    """
    # Use naive UTC for DB comparison (PostgreSQL timestamp columns are often stored without TZ)
    now_utc = datetime.now(timezone.utc)
    cutoff = (now_utc.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=older_than_days)).replace(tzinfo=None)

    deleted: dict[str, int] = {}

    # Scans to prune
    scan_ids_result = await conn.fetch(
        """
        SELECT scan_id FROM scan
        WHERE created_at < $1
        ORDER BY created_at
        """,
        cutoff,
    )
    scan_ids = [row["scan_id"] for row in scan_ids_result]

    if not scan_ids:
        return deleted

    # Count rows that would be affected (for report and for dry-run)
    deleted["finding"] = await conn.fetchval(
        "SELECT COUNT(*) FROM finding WHERE scan_id = ANY($1::text[])",
        scan_ids,
    ) or 0
    deleted["scan_share"] = await conn.fetchval(
        "SELECT COUNT(*) FROM scan_share WHERE scan_id = ANY($1::text[])",
        scan_ids,
    ) or 0
    deleted["ai_analysis"] = await conn.fetchval(
        "SELECT COUNT(*) FROM ai_analysis WHERE scan_id = ANY($1::text[])",
        scan_ids,
    ) or 0
    deleted["scan"] = len(scan_ids)

    if dry_run:
        return deleted

    # Delete ai_analysis first (scan references ai_analysis.id)
    await conn.execute(
        """
        DELETE FROM ai_analysis
        WHERE scan_id = ANY($1::text[])
        """,
        scan_ids,
    )

    # Delete scans; CASCADE will remove finding and scan_share rows
    await conn.execute(
        """
        DELETE FROM scan
        WHERE scan_id = ANY($1::text[])
        """,
        scan_ids,
    )

    return deleted


async def prune_expired_sessions(
    conn: asyncpg.Connection, dry_run: bool
) -> int:
    """Delete expired session rows. Returns number deleted."""
    now_utc_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if dry_run:
        return await conn.fetchval(
            "SELECT COUNT(*) FROM session WHERE expires < $1",
            now_utc_naive,
        ) or 0
    r = await conn.execute(
        "DELETE FROM session WHERE expires < $1",
        now_utc_naive,
    )
    return int(r.split()[-1]) if r else 0


async def prune_expired_verification_tokens(
    conn: asyncpg.Connection, dry_run: bool
) -> int:
    """Delete expired verification_token rows. Returns number deleted."""
    now_utc_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    if dry_run:
        return await conn.fetchval(
            "SELECT COUNT(*) FROM verification_token WHERE expires < $1",
            now_utc_naive,
        ) or 0
    r = await conn.execute(
        "DELETE FROM verification_token WHERE expires < $1",
        now_utc_naive,
    )
    return int(r.split()[-1]) if r else 0


async def prune_old_stripe_events(
    conn: asyncpg.Connection, older_than_days: int, dry_run: bool
) -> int:
    """Delete old stripe_event rows (idempotency). Returns number deleted."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=older_than_days)).replace(tzinfo=None)
    if dry_run:
        return await conn.fetchval(
            "SELECT COUNT(*) FROM stripe_event WHERE created_at < $1",
            cutoff,
        ) or 0
    r = await conn.execute(
        "DELETE FROM stripe_event WHERE created_at < $1",
        cutoff,
    )
    return int(r.split()[-1]) if r else 0


async def run_prune(
    database_url: str,
    older_than_days: int,
    dry_run: bool,
    prune_sessions: bool,
    prune_verification_tokens: bool,
    prune_stripe_events: bool,
) -> bool:
    """Run all requested prune operations. Returns True on success."""
    print("Connecting to PostgreSQL database...")
    conn = await asyncpg.connect(database_url)
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        print(f"Retention cutoff: rows older than {cutoff.date()} (>{older_than_days} days)\n")

        if dry_run:
            print("DRY RUN – no rows will be deleted.\n")

        # Scan-related (always run)
        scan_deleted = await prune_scans_and_related(
            conn, older_than_days, dry_run
        )
        total_scan = sum(scan_deleted.values())
        if total_scan > 0:
            print("Scan-related tables (scan, finding, ai_analysis, scan_share):")
            for table, n in scan_deleted.items():
                if n:
                    print(f"  {table}: {n} rows {'(would be deleted)' if dry_run else 'deleted'}")
            print()
        else:
            print("No scan-related rows to prune.\n")

        # Optional: expired sessions
        if prune_sessions:
            n = await prune_expired_sessions(conn, dry_run)
            print(f"session: {n} expired rows {'(would be deleted)' if dry_run else 'deleted'}\n")

        # Optional: expired verification tokens
        if prune_verification_tokens:
            n = await prune_expired_verification_tokens(conn, dry_run)
            print(f"verification_token: {n} expired rows {'(would be deleted)' if dry_run else 'deleted'}\n")

        # Optional: old Stripe idempotency events
        if prune_stripe_events:
            n = await prune_old_stripe_events(
                conn, older_than_days, dry_run
            )
            print(f"stripe_event: {n} old rows {'(would be deleted)' if dry_run else 'deleted'}\n")

        if dry_run and (total_scan > 0 or prune_sessions or prune_verification_tokens or prune_stripe_events):
            print("Run without --dry-run to apply changes.")
        return True
    finally:
        await conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Prune old rows from database tables to free space"
    )
    parser.add_argument(
        "--older-than-days",
        type=int,
        default=90,
        metavar="N",
        help="Delete scan-related rows older than N days (default: 90)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only report what would be deleted; do not delete",
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
        "--prune-sessions",
        action="store_true",
        help="Also delete expired session rows",
    )
    parser.add_argument(
        "--prune-verification-tokens",
        action="store_true",
        help="Also delete expired verification_token rows",
    )
    parser.add_argument(
        "--prune-stripe-events",
        action="store_true",
        help="Also delete old stripe_event rows (idempotency) older than --older-than-days",
    )
    args = parser.parse_args()

    database_url = (
        args.database_url
        or os.getenv("DATABASE_URL")
        or "postgresql://postgres:postgres@localhost:5432/sec_audit"
    )

    if not args.confirm and not args.dry_run:
        print("This will permanently delete old data from the database.")
        print(f"  Database: {database_url.split('@')[-1] if '@' in database_url else database_url}")
        print(f"  Scans (and related) older than: {args.older_than_days} days")
        if args.prune_sessions:
            print("  Expired sessions will be deleted.")
        if args.prune_verification_tokens:
            print("  Expired verification tokens will be deleted.")
        if args.prune_stripe_events:
            print("  Old stripe_event rows will be deleted.")
        response = input("\nProceed? (type 'yes' to confirm): ")
        if response.lower() != "yes":
            print("Aborted.")
            return 0

    try:
        asyncio.run(
            run_prune(
                database_url,
                args.older_than_days,
                args.dry_run,
                args.prune_sessions,
                args.prune_verification_tokens,
                args.prune_stripe_events,
            )
        )
        print("Prune completed successfully.")
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
