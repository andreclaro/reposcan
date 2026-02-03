"""Database storage operations for findings and AI analysis."""
import json
import os
import asyncio
import logging
from typing import List, Dict, Any, Optional, Tuple, Awaitable, Callable, TypeVar

import asyncpg

T = TypeVar("T")

from .models import Finding

logger = logging.getLogger(__name__)


async def ensure_scan_record(
    conn: asyncpg.Connection,
    scan_id: str,
    repo_url: str,
    branch: Optional[str] = None,
    audit_types: Optional[List[str]] = None,
    status: str = "running"
) -> None:
    """
    Ensure a scan record exists in the database. Creates it if it doesn't exist.
    
    This is needed because scans created via the FastAPI service directly
    (not through the webapp) may not have a database record yet.
    
    Args:
        conn: PostgreSQL connection
        scan_id: Unique scan identifier
        repo_url: Repository URL
        branch: Branch name (None means will be auto-detected during clone)
        audit_types: List of audit types (optional)
        status: Scan status (default: "running")
    """
    # #region agent log
    import json as json_lib
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"storage.py:33","message":"ensure_scan_record called","data":{"scan_id":scan_id},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    # Check if scan exists
    existing = await conn.fetchval(
        "SELECT scan_id FROM scan WHERE scan_id = $1",
        scan_id
    )
    # #region agent log
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"storage.py:37","message":"Scan existence check result","data":{"scan_id":scan_id,"existing":existing is not None},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    
    if existing:
        # #region agent log
        try:
            with open('/work/debug.log', 'a') as f:
                f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"storage.py:40","message":"Scan exists, updating status","data":{"scan_id":scan_id,"status":status},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        # Update status if needed
        await conn.execute(
            """
            UPDATE scan
            SET status = $1, updated_at = NOW()
            WHERE scan_id = $2
            """,
            status,
            scan_id
        )
        # #region agent log
        try:
            with open('/work/debug.log', 'a') as f:
                f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"G","location":"storage.py:49","message":"Status update query executed","data":{"scan_id":scan_id},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        return
    
    # Get or create system user for worker-created scans
    # System user email is a special value that identifies automated scans
    # #region agent log
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:54","message":"Looking for system user","data":{"scan_id":scan_id},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    system_user_id = await conn.fetchval(
        """
        SELECT id FROM app_user 
        WHERE email = 'system@sec-audit.local'
        LIMIT 1
        """
    )
    # #region agent log
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:60","message":"System user lookup result","data":{"scan_id":scan_id,"system_user_id":system_user_id},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    
    if not system_user_id:
        # Create system user if it doesn't exist
        # ON CONFLICT handles race condition if multiple workers try to create simultaneously
        # Generate UUID in SQL since the database doesn't have a DEFAULT constraint
        system_user_id = await conn.fetchval(
            """
            INSERT INTO app_user (id, email, name)
            VALUES (gen_random_uuid(), 'system@sec-audit.local', 'System User')
            ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
            RETURNING id
            """
        )
        # If still None (shouldn't happen, but be safe), try to fetch again
        if not system_user_id:
            system_user_id = await conn.fetchval(
                """
                SELECT id FROM app_user 
                WHERE email = 'system@sec-audit.local'
                LIMIT 1
                """
            )
    
    if not system_user_id:
        raise RuntimeError(
            "Failed to get or create system user for scan record. "
            "This indicates a database configuration issue."
        )
    
    # Create scan record
    # #region agent log
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:90","message":"Creating new scan record","data":{"scan_id":scan_id,"system_user_id":system_user_id,"status":status,"repo_url":repo_url,"branch":branch},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except Exception as log_err:
        try:
            with open('/work/debug.log', 'a') as f:
                f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:90","message":"Log write failed","data":{"error":str(log_err)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
    # #endregion
    try:
        result = await conn.execute(
            """
            INSERT INTO scan (
                scan_id, user_id, repo_url, branch, audit_types, status, progress
            ) VALUES ($1, $2, $3, $4, $5, $6, 0)
            ON CONFLICT (scan_id) DO UPDATE SET
                status = EXCLUDED.status,
                updated_at = NOW()
            """,
            scan_id,
            system_user_id,
            repo_url,
            branch,
            json.dumps(audit_types) if audit_types else None,
            status
        )
        # #region agent log
        try:
            with open('/work/debug.log', 'a') as f:
                f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:105","message":"Scan record INSERT completed","data":{"scan_id":scan_id,"result":result},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        # Verify the record was created
        verify_scan = await conn.fetchval(
            "SELECT scan_id FROM scan WHERE scan_id = $1",
            scan_id
        )
        # #region agent log
        try:
            with open('/work/debug.log', 'a') as f:
                f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:115","message":"Verification: scan record exists after INSERT","data":{"scan_id":scan_id,"exists":verify_scan is not None},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        if not verify_scan:
            raise RuntimeError(f"Failed to create scan record: INSERT executed but record not found for scan_id={scan_id}")
    except Exception as insert_err:
        # #region agent log
        try:
            with open('/work/debug.log', 'a') as f:
                f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"D","location":"storage.py:108","message":"Scan record INSERT failed","data":{"scan_id":scan_id,"error":str(insert_err),"error_type":type(insert_err).__name__},"timestamp":int(__import__('time').time()*1000)}) + '\n')
        except: pass
        # #endregion
        raise


async def store_findings(
    conn: asyncpg.Connection,
    scan_id: str,
    findings: List[Finding]
) -> Dict[str, Any]:
    """
    Store findings in PostgreSQL and return summary statistics.
    
    Args:
        conn: PostgreSQL connection
        scan_id: Unique scan identifier
        findings: List of normalized findings
    
    Returns:
        Dictionary with findings count and breakdown by severity
    """
    if not findings:
        # Update scan with zero counts
        await conn.execute(
            """
            UPDATE scan
            SET findings_count = 0,
                critical_count = 0,
                high_count = 0,
                medium_count = 0,
                low_count = 0,
                info_count = 0,
                updated_at = NOW()
            WHERE scan_id = $1
            """,
            scan_id
        )
        return {
            'findings_count': 0,
            'by_severity': {
                'critical': 0,
                'high': 0,
                'medium': 0,
                'low': 0,
                'info': 0
            }
        }
    
    # Bulk insert findings
    inserted_ids = []
    for finding in findings:
        finding_dict = finding.to_dict()
        result = await conn.fetchrow(
            """
            INSERT INTO finding (
                scan_id, scanner, severity, category, title, description,
                file_path, line_start, line_end, code_snippet,
                cwe, cve, remediation, confidence, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id
            """,
            finding_dict['scan_id'],
            finding_dict['scanner'],
            finding_dict['severity'],
            finding_dict['category'],
            finding_dict['title'],
            finding_dict['description'],
            finding_dict['file_path'],
            finding_dict['line_start'],
            finding_dict['line_end'],
            finding_dict['code_snippet'],
            finding_dict['cwe'],
            finding_dict['cve'],
            finding_dict['remediation'],
            finding_dict['confidence'],
            json.dumps(finding_dict['metadata'])
        )
        inserted_ids.append(result['id'])
    
    # Calculate summary statistics
    stats = await conn.fetchrow(
        """
        SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE severity = 'critical') as critical,
            COUNT(*) FILTER (WHERE severity = 'high') as high,
            COUNT(*) FILTER (WHERE severity = 'medium') as medium,
            COUNT(*) FILTER (WHERE severity = 'low') as low,
            COUNT(*) FILTER (WHERE severity = 'info') as info
        FROM finding
        WHERE scan_id = $1
        """,
        scan_id
    )
    
    # Update scan record
    await conn.execute(
        """
        UPDATE scan
        SET findings_count = $1,
            critical_count = $2,
            high_count = $3,
            medium_count = $4,
            low_count = $5,
            info_count = $6,
            updated_at = NOW()
        WHERE scan_id = $7
        """,
        stats['total'],
        stats['critical'],
        stats['high'],
        stats['medium'],
        stats['low'],
        stats['info'],
        scan_id
    )
    
    return {
        'findings_count': stats['total'],
        'by_severity': {
            'critical': stats['critical'],
            'high': stats['high'],
            'medium': stats['medium'],
            'low': stats['low'],
            'info': stats['info']
        },
        'inserted_ids': inserted_ids  # Return database IDs for mapping
    }


async def store_ai_analysis(
    conn: asyncpg.Connection,
    scan_id: str,
    summary: str,
    recommendations: List[Dict[str, Any]],
    risk_score: int,
    top_findings: List[int],
    model: str,
    model_version: str,
    tokens_used: int
) -> int:
    """
    Store AI analysis in database.
    
    Args:
        conn: PostgreSQL connection
        scan_id: Unique scan identifier
        summary: Executive summary text
        recommendations: List of recommendation objects
        risk_score: Overall risk score (0-100)
        top_findings: List of finding IDs for top critical issues
        model: LLM model name
        model_version: Model version/API version
        tokens_used: Number of tokens used
    
    Returns:
        AI analysis record ID
    """
    ai_analysis_id = await conn.fetchval(
        """
        INSERT INTO ai_analysis (
            scan_id, summary, recommendations,
            risk_score, top_findings, model, model_version, tokens_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (scan_id) DO UPDATE SET
            summary = EXCLUDED.summary,
            recommendations = EXCLUDED.recommendations,
            risk_score = EXCLUDED.risk_score,
            top_findings = EXCLUDED.top_findings,
            model = EXCLUDED.model,
            model_version = EXCLUDED.model_version,
            tokens_used = EXCLUDED.tokens_used,
            created_at = NOW()
        RETURNING id
        """,
        scan_id,
        summary,
        json.dumps(recommendations),
        risk_score,
        json.dumps(top_findings),
        model,
        model_version,
        tokens_used
    )
    
    # Link to scan
    await conn.execute(
        """
        UPDATE scan
        SET ai_analysis_id = $1, updated_at = NOW()
        WHERE scan_id = $2
        """,
        ai_analysis_id,
        scan_id
    )
    
    return ai_analysis_id


async def fetch_findings_for_scan(
    conn: asyncpg.Connection,
    scan_id: str,
) -> Tuple[List[Finding], List[int]]:
    """
    Load all findings for a scan from the database, in stable order by id.

    Returns:
        (findings, finding_db_ids) so that finding_db_ids[i] is the DB id of findings[i].
    """
    rows = await conn.fetch(
        """
        SELECT id, scan_id, scanner, severity, category, title, description,
               file_path, line_start, line_end, code_snippet, cwe, cve,
               remediation, confidence, metadata
        FROM finding
        WHERE scan_id = $1
        ORDER BY id
        """,
        scan_id,
    )
    findings = []
    finding_db_ids = []
    for row in rows:
        metadata = row["metadata"] if row["metadata"] is not None else {}
        if not isinstance(metadata, dict):
            metadata = {}
        findings.append(
            Finding(
                scan_id=row["scan_id"],
                scanner=row["scanner"],
                severity=row["severity"],
                category=row["category"],
                title=row["title"] or "",
                description=row["description"],
                file_path=row["file_path"],
                line_start=row["line_start"],
                line_end=row["line_end"],
                code_snippet=row["code_snippet"],
                cwe=row["cwe"],
                cve=row["cve"],
                remediation=row["remediation"],
                confidence=row["confidence"],
                metadata=metadata,
            )
        )
        finding_db_ids.append(row["id"])
    return findings, finding_db_ids


async def get_scan_repo_info(
    conn: asyncpg.Connection,
    scan_id: str,
) -> Optional[Dict[str, Any]]:
    """Return scan row fields needed for AI summary: repo_url, branch, status."""
    row = await conn.fetchrow(
        "SELECT repo_url, branch, status FROM scan WHERE scan_id = $1",
        scan_id,
    )
    if row is None:
        return None
    return {
        "repo_url": row["repo_url"],
        "branch": row["branch"] or "main",
        "status": row["status"],
    }


async def update_scan_status(
    conn: asyncpg.Connection,
    scan_id: str,
    status: str,
    progress: Optional[int] = None,
    commit_hash: Optional[str] = None,
    results_path: Optional[str] = None,
    branch: Optional[str] = None
) -> None:
    """
    Update scan status and optional metadata in the database.
    
    Args:
        conn: PostgreSQL connection
        scan_id: Unique scan identifier
        status: New status ('queued', 'running', 'completed', 'failed')
        progress: Optional progress percentage (0-100)
        commit_hash: Optional commit hash
        results_path: Optional results path
        branch: Optional branch name (useful when auto-detected)
    """
    # #region agent log
    import json as json_lib
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"E","location":"storage.py:302","message":"update_scan_status called","data":{"scan_id":scan_id,"status":status,"progress":progress},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    updates = ["status = $1"]
    params = [status]
    param_idx = 2
    
    if progress is not None:
        updates.append(f"progress = ${param_idx}")
        params.append(progress)
        param_idx += 1
    
    if commit_hash is not None:
        updates.append(f"commit_hash = ${param_idx}")
        params.append(commit_hash)
        param_idx += 1
    
    if results_path is not None:
        updates.append(f"results_path = ${param_idx}")
        params.append(results_path)
        param_idx += 1
    
    if branch is not None:
        updates.append(f"branch = ${param_idx}")
        params.append(branch)
        param_idx += 1
    
    # Always update updated_at
    updates.append("updated_at = NOW()")
    
    # Add scan_id as the last parameter for WHERE clause
    params.append(scan_id)
    where_param = param_idx
    
    query = f"""
        UPDATE scan
        SET {', '.join(updates)}
        WHERE scan_id = ${where_param}
    """
    # #region agent log
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"E","location":"storage.py:340","message":"Executing UPDATE query","data":{"scan_id":scan_id,"query":query,"params_count":len(params)},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion
    await conn.execute(query, *params)
    # #region agent log
    try:
        with open('/work/debug.log', 'a') as f:
            f.write(json_lib.dumps({"sessionId":"debug-session","runId":"run1","hypothesisId":"E","location":"storage.py:345","message":"UPDATE query executed successfully","data":{"scan_id":scan_id},"timestamp":int(__import__('time').time()*1000)}) + '\n')
    except: pass
    # #endregion


async def create_db_pool(database_url: str, max_retries: int = 5, retry_delay: float = 2.0) -> asyncpg.Pool:
    """
    Create a database connection pool with retry logic.
    Use run_with_db() when possible so the pool is closed after use and connections are released.
    
    Args:
        database_url: PostgreSQL connection string
        max_retries: Maximum number of connection retry attempts
        retry_delay: Delay in seconds between retries
        
    Returns:
        asyncpg.Pool instance (caller must close it when done to avoid exhausting Postgres connections)
        
    Raises:
        Exception: If connection fails after all retries
    """
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            # Keep pool small to avoid "too many clients" when many workers/tasks run
            pool = await asyncpg.create_pool(database_url, min_size=0, max_size=2)
            logger.debug(f"Successfully created database connection pool (attempt {attempt})")
            return pool
        except (asyncpg.exceptions.InvalidPasswordError,
                asyncpg.exceptions.InvalidCatalogNameError) as e:
            # Don't retry on authentication/database errors
            logger.error(f"Database authentication/configuration error: {e}")
            raise
        except Exception as e:
            last_error = e
            if attempt < max_retries:
                logger.warning(
                    f"Failed to create database pool (attempt {attempt}/{max_retries}): {e}. "
                    f"Retrying in {retry_delay}s..."
                )
                await asyncio.sleep(retry_delay)
            else:
                logger.error(f"Failed to create database pool after {max_retries} attempts: {e}")

    # If we get here, all retries failed
    raise Exception(f"Failed to create database connection pool after {max_retries} attempts: {last_error}")


async def run_with_db(
    database_url: str,
    fn: Callable[[asyncpg.Connection], Awaitable[T]],
) -> T:
    """
    Create a pool, run the given async function with a connection, then close the pool.
    Use this for one-off DB work so connections are always released and Postgres is not exhausted.
    """
    pool = await create_db_pool(database_url)
    try:
        async with pool.acquire() as conn:
            return await fn(conn)
    finally:
        await pool.close()
