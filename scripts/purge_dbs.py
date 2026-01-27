#!/usr/bin/env python3
"""
Purge all data from PostgreSQL database and Redis.

This script will:
1. Truncate all tables in the PostgreSQL database (respecting foreign key constraints)
2. Reset all sequences to start from 1
3. Flush all data from Redis

Usage:
  python3 scripts/purge_dbs.py
  python3 scripts/purge_dbs.py --confirm
  python3 scripts/purge_dbs.py --drop-recreate-db  # Drop and recreate database (requires migrations after)
  python3 scripts/purge_dbs.py --database-url postgresql://... --redis-url redis://...
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Optional
from urllib.parse import urlparse

import asyncpg
import redis


async def purge_database(database_url: str, drop_recreate: bool = False) -> None:
    """Truncate all tables in the database and reset sequences."""
    print("Connecting to PostgreSQL database...")
    conn = await asyncpg.connect(database_url)

    try:
        # Get database name from URL
        parsed = urlparse(database_url)
        db_name = parsed.path.lstrip('/')

        if drop_recreate:
            # Drop and recreate database (requires connection to postgres database)
            print(f"\n⚠ DROP/RECREATE mode: Dropping database '{db_name}'...")
            # Need to connect to postgres database to drop the target database
            admin_url = database_url.rsplit('/', 1)[0] + '/postgres'
            admin_conn = await asyncpg.connect(admin_url)
            try:
                # Terminate all connections to the target database
                await admin_conn.execute(
                    f"""
                    SELECT pg_terminate_backend(pg_stat_activity.pid)
                    FROM pg_stat_activity
                    WHERE pg_stat_activity.datname = $1
                    AND pid <> pg_backend_pid();
                    """,
                    db_name
                )
                # Drop database
                await admin_conn.execute(f'DROP DATABASE IF EXISTS "{db_name}";')
                print(f"  ✓ Dropped database: {db_name}")
                # Recreate database
                await admin_conn.execute(f'CREATE DATABASE "{db_name}";')
                print(f"  ✓ Recreated database: {db_name}")
            finally:
                await admin_conn.close()
            print("\n✓ Database drop/recreate completed successfully")
            return

        # Get all table names
        tables = await conn.fetch(
            """
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
            ORDER BY tablename;
            """
        )

        if not tables:
            print("No tables found in the database.")
            return

        table_names = [row["tablename"] for row in tables]
        print(f"Found {len(table_names)} tables: {', '.join(table_names)}")

        # Truncate all tables with CASCADE (respects foreign key constraints)
        # Use a single TRUNCATE statement for all tables - more efficient and handles FK constraints
        print("\nTruncating all tables...")
        try:
            # Build comma-separated list of table names
            table_list = ', '.join(f'"{name}"' for name in table_names)
            # RESTART IDENTITY must come before CASCADE
            await conn.execute(f'TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE;')
            print(f"  ✓ Truncated {len(table_names)} tables: {', '.join(table_names)}")
        except Exception as e:
            print(f"  ✗ Failed to truncate tables: {e}")
            # Fallback: try truncating tables individually
            print("  Attempting individual table truncation...")
            for table_name in table_names:
                try:
                    await conn.execute(f'TRUNCATE TABLE "{table_name}" RESTART IDENTITY CASCADE;')
                    print(f"  ✓ Truncated: {table_name}")
                except Exception as e2:
                    print(f"  ✗ Failed to truncate {table_name}: {e2}")

        # Reset all sequences (in case RESTART IDENTITY didn't work for all)
        print("\nResetting sequences...")
        sequences = await conn.fetch(
            """
            SELECT sequencename 
            FROM pg_sequences 
            WHERE schemaname = 'public'
            ORDER BY sequencename;
            """
        )
        if sequences:
            for seq in sequences:
                seq_name = seq["sequencename"]
                try:
                    await conn.execute(f'ALTER SEQUENCE "{seq_name}" RESTART WITH 1;')
                    print(f"  ✓ Reset sequence: {seq_name}")
                except Exception as e:
                    print(f"  ✗ Failed to reset sequence {seq_name}: {e}")

        # Verify tables are empty
        print("\nVerifying tables are empty...")
        for table_name in table_names:
            count = await conn.fetchval(f'SELECT COUNT(*) FROM "{table_name}";')
            if count > 0:
                print(f"  ⚠ Warning: {table_name} still has {count} rows")
            else:
                print(f"  ✓ {table_name} is empty")

        print("\n✓ Database purge completed successfully")

    finally:
        await conn.close()


def purge_redis(redis_url: str) -> None:
    """Flush all data from Redis."""
    print("\nConnecting to Redis...")
    try:
        # Parse Redis URL
        # Format: redis://[password@]host:port/db
        # or: redis://host:port/db
        client = redis.from_url(redis_url, decode_responses=False)

        # Test connection
        client.ping()
        print("✓ Connected to Redis")

        # Get info before flush
        info = client.info("keyspace")
        db_info = info.get("db0", {})
        key_count = db_info.get("keys", 0) if db_info else 0

        if key_count > 0:
            print(f"Found {key_count} keys in Redis")
        else:
            print("Redis is already empty")

        # Flush all data
        print("Flushing all data from Redis...")
        client.flushdb()
        print("✓ Redis flush completed successfully")

        # Verify
        info_after = client.info("keyspace")
        db_info_after = info_after.get("db0", {})
        key_count_after = db_info_after.get("keys", 0) if db_info_after else 0

        if key_count_after > 0:
            print(f"  ⚠ Warning: Redis still has {key_count_after} keys")
        else:
            print("  ✓ Redis is now empty")

        client.close()

    except redis.ConnectionError as e:
        print(f"✗ Failed to connect to Redis: {e}")
        raise
    except Exception as e:
        print(f"✗ Failed to flush Redis: {e}")
        raise


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Purge all data from PostgreSQL database and Redis"
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Skip confirmation prompt (use with caution)",
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL connection URL (default: postgresql://postgres:postgres@localhost:5432/sec_audit)",
    )
    parser.add_argument(
        "--redis-url",
        default=None,
        help="Redis connection URL (default: redis://localhost:6379/0)",
    )
    parser.add_argument(
        "--drop-recreate-db",
        action="store_true",
        help="Drop and recreate the database (more thorough, requires re-running migrations)",
    )
    args = parser.parse_args()

    # Get connection URLs (with defaults for localhost)
    database_url = (
        args.database_url
        or os.getenv("DATABASE_URL")
        or "postgresql://postgres:postgres@localhost:5432/sec_audit"
    )
    redis_url = (
        args.redis_url
        or os.getenv("REDIS_URL")
        or "redis://localhost:6379/0"
    )

    # Confirmation prompt
    if not args.confirm:
        print("⚠ WARNING: This will delete ALL data from:")
        print(f"  - PostgreSQL database: {database_url.split('@')[-1] if '@' in database_url else database_url}")
        if args.drop_recreate_db:
            print("    ⚠ DROP/RECREATE mode: Database will be dropped and recreated (migrations needed after)")
        print(f"  - Redis: {redis_url}")
        print("\nThis action cannot be undone!")
        response = input("\nAre you sure you want to continue? (type 'yes' to confirm): ")
        if response.lower() != "yes":
            print("Aborted.")
            return 0

    try:
        # Purge database
        asyncio.run(purge_database(database_url, drop_recreate=args.drop_recreate_db))

        # Purge Redis
        purge_redis(redis_url)

        print("\n" + "=" * 60)
        print("✓ Purge completed successfully!")
        print("=" * 60)
        return 0

    except KeyboardInterrupt:
        print("\n\nAborted by user.")
        return 130
    except Exception as e:
        print(f"\n✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
