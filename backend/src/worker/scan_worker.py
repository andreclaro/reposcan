"""Celery worker for running security scans."""
import os
import json
import csv
import tempfile
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
import traceback

from celery import Celery
from celery.utils.log import get_task_logger

from audit.repos import clone_repo, repo_name, update_submodules_if_present, get_commit_hash
from audit.utils import safe_repo_slug, validate_repo_url
from audit.fs import detect_languages, has_terraform
from audit.scanners import (
    run_semgrep,
    run_trivy_dockerfile_scan,
    run_trivy_fs_scan,
    run_tfsec_checkov_tflint_scan,
)
from audit.ecosystem import (
    has_node_project,
    has_go_project,
    has_rust_project,
    run_node_audit,
    run_go_vulncheck,
    run_cargo_audit,
)
from audit.utils import parse_audit_selection, should_run_audit
from audit.ai.normalizer import normalize_findings
from audit.ai.storage import (
    store_findings,
    store_ai_analysis,
    run_with_db,
    ensure_scan_record,
    update_scan_status,
    fetch_findings_for_scan,
    get_scan_repo_info,
)
from audit.ai.summarizer import AISummarizer
from audit.ai.storage_backend import create_storage_backend

logger = get_task_logger(__name__)

# Celery configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RESULTS_DIR = Path(os.getenv("RESULTS_DIR", "./results"))

celery_app = Celery(
    'audit',
    broker=REDIS_URL,
    backend=REDIS_URL
)

celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    task_soft_time_limit=3300,  # 55 min soft limit
)


@celery_app.task(bind=True, name='tasks.scan_worker.run_scan', max_retries=3)
def run_scan(self, scan_id: str, request_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute complete security scan pipeline for a repository.
    
    Args:
        scan_id: Unique scan identifier
        request_data: Scan request data containing repo_url, branch, audit_types, etc.
    
    Returns:
        Dictionary with scan results and metadata
    """
    repo_url = request_data['repo_url']
    branch = request_data.get('branch')  # None means auto-detect default branch
    audit_types = request_data.get('audit_types', [])
    skip_lfs = request_data.get('skip_lfs', False)
    force_rescan = request_data.get('force_rescan', False)

    if not validate_repo_url(repo_url):
        raise ValueError("Invalid repo_url: only http, https, git, ssh URLs are allowed")
    
    logger.info(f"Starting scan {scan_id} for {repo_url} (branch: {branch or 'auto-detect'})")
    
    # Create results directory
    results_dir = RESULTS_DIR / scan_id
    results_dir.mkdir(parents=True, exist_ok=True)

    worker_log_path = results_dir / "worker.log"

    def log_step(message: str) -> None:
        """Append a timestamped log line to the per-scan worker log."""
        try:
            timestamp = datetime.utcnow().isoformat(timespec="seconds") + "Z"
            worker_log_path.parent.mkdir(parents=True, exist_ok=True)
            with worker_log_path.open("a", encoding="utf-8") as log_file:
                log_file.write(f"{timestamp} {message}\n")
        except Exception:
            # Never let logging failures break the scan
            logger.debug("Failed to write to worker.log", exc_info=True)
    
    # Get database URL for status updates
    db_url = os.getenv("DATABASE_URL")

    log_step(
        f"Starting scan {scan_id} for {repo_url} "
        f"(branch={branch or 'auto-detect'}, force_rescan={force_rescan}, "
        f"audit_types={audit_types or 'default'})"
    )
    
    # Helper function to update both Celery state and database progress
    def update_progress(progress: int, step: str):
        """Update both Celery task state and database progress."""
        self.update_state(state='PROGRESS', meta={'progress': progress, 'current_step': step})
        log_step(f"{progress}% - {step}")
        if db_url:
            try:
                asyncio.run(run_with_db(db_url, lambda conn: update_scan_status(conn, scan_id, "running", progress=progress)))
            except Exception as e:
                logger.debug(f"Failed to update database progress: {e}")
    
    # Update scan status to "running" in database
    if db_url:
        try:
            async def _init_status(conn):
                await ensure_scan_record(conn, scan_id, repo_url, branch, audit_types, status="running")
                await update_scan_status(conn, scan_id, "running", progress=0)
            asyncio.run(run_with_db(db_url, _init_status))
            logger.info(f"Updated scan {scan_id} status to 'running' in database")
        except Exception as e:
            logger.error(f"Failed to update scan status to 'running': {e}", exc_info=True)
            # Don't fail the scan, but log the error - the record will be created when storing findings
    
    try:
        # Update progress
        update_progress(10, 'Cloning repository')
        
        # Create temporary directory for cloning
        with tempfile.TemporaryDirectory(prefix=f"scan_{scan_id}_") as tmpdir:
            tmpdir_path = Path(tmpdir)
            repo_path = tmpdir_path / safe_repo_slug(repo_url)
            
            # Step 1: Test network connectivity to GitHub
            logger.info(f"Testing network connectivity before cloning...")
            try:
                import socket
                sock = socket.create_connection(("github.com", 443), timeout=10)
                sock.close()
                logger.info("Network connectivity to github.com:443 OK")
            except Exception as e:
                logger.warning(f"Network connectivity test failed: {e}")
            
            # Step 2: Clone repository
            logger.info(f"Cloning {repo_url} to {repo_path}")
            try:
                # Clone and capture the actual branch used (may be auto-detected)
                actual_branch = clone_repo(
                    repo_url, repo_path, branch, skip_lfs, allowed_base=tmpdir_path
                )
                # Use the actual branch for subsequent operations
                branch = actual_branch
                logger.info(f"Using branch: {branch}")
                
                # Update database with the detected branch
                if db_url:
                    try:
                        asyncio.run(run_with_db(db_url, lambda conn: update_scan_status(conn, scan_id, "running", branch=branch)))
                    except Exception as e:
                        logger.debug(f"Failed to update branch in database: {e}")
                
                # Best-effort submodule update; do not fail the scan if this step breaks,
                # since many environments (like containers without SSH configured) cannot
                # clone SSH-based submodules.
                try:
                    update_submodules_if_present(repo_path)
                except Exception as sub_e:
                    logger.warning(
                        f"Failed to update git submodules for {repo_url}; "
                        f"continuing scan without submodules. Error: {sub_e}"
                    )
            except RuntimeError as e:
                error_msg = str(e)
                # Check for common network errors
                if "Could not resolve host" in error_msg or "Name or service not known" in error_msg:
                    logger.error(f"DNS resolution failed for {repo_url}. Check network connectivity and DNS configuration.")
                    raise RuntimeError(
                        f"Network error: Unable to resolve hostname for {repo_url}. "
                        "This may indicate DNS configuration issues in the Docker container. "
                        "Check docker-compose.yml DNS settings and network connectivity."
                    ) from e
                elif "Connection refused" in error_msg or "Connection timed out" in error_msg:
                    logger.error(f"Connection failed for {repo_url}. Check network connectivity.")
                    raise RuntimeError(
                        f"Network error: Unable to connect to {repo_url}. "
                        "This may indicate network connectivity issues or firewall restrictions."
                    ) from e
                else:
                    # Re-raise other errors as-is
                    raise
            
            log_step(f"Repository cloned successfully to {repo_path}")

            # Capture commit hash
            commit_hash = get_commit_hash(repo_path, branch)
            logger.info(f"Scanned commit: {commit_hash}")
            log_step(f"Scanned commit {commit_hash}")

            # Check for cached scan with same repo_url + commit_hash
            if db_url and commit_hash and not force_rescan:
                try:
                    async def check_cache(conn):
                        return await conn.fetchrow(
                            """
                            SELECT scan_id, results_path, findings_count,
                                   critical_count, high_count, medium_count, low_count, info_count
                            FROM scan
                            WHERE repo_url = $1
                              AND commit_hash = $2
                              AND status = 'completed'
                            ORDER BY created_at DESC
                            LIMIT 1
                            """,
                            repo_url,
                            commit_hash,
                        )

                    cached_scan = asyncio.run(run_with_db(db_url, check_cache))

                    if cached_scan:
                        logger.info(f"Found cached scan {cached_scan['scan_id']} for {repo_url}@{commit_hash}")

                        async def update_to_cached(conn):
                            await ensure_scan_record(conn, scan_id, repo_url, branch, audit_types, status="completed")
                            await conn.execute(
                                """
                                UPDATE scan SET
                                    status = 'completed',
                                    progress = 100,
                                    commit_hash = $2,
                                    results_path = $3,
                                    findings_count = $4,
                                    critical_count = $5,
                                    high_count = $6,
                                    medium_count = $7,
                                    low_count = $8,
                                    info_count = $9,
                                    updated_at = NOW()
                                WHERE scan_id = $1
                                """,
                                scan_id,
                                commit_hash,
                                cached_scan["results_path"],
                                cached_scan["findings_count"],
                                cached_scan["critical_count"],
                                cached_scan["high_count"],
                                cached_scan["medium_count"],
                                cached_scan["low_count"],
                                cached_scan["info_count"],
                            )

                        asyncio.run(run_with_db(db_url, update_to_cached))

                        return {
                            'scan_id': scan_id,
                            'repo_url': repo_url,
                            'branch': branch,
                            'commit_hash': commit_hash,
                            'status': 'completed',
                            'cached': True,
                            'cached_from': cached_scan['scan_id'],
                            'results_path': cached_scan['results_path']
                        }
                except Exception as e:
                    logger.warning(f"Cache check failed, proceeding with full scan: {e}")

            update_progress(20, 'Detecting languages')
            log_step("Detecting languages in repository")

            # Step 2: Detect languages
            language_counts = detect_languages(repo_path)
            
            # Save languages.csv
            languages_csv = results_dir / "languages.csv"
            with languages_csv.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["language", "files"])
                for language, files_count in sorted(language_counts.items()):
                    writer.writerow([language, files_count])
            
            logger.info(f"Detected languages: {list(language_counts.keys())}")
            log_step(
                f"Detected languages: {', '.join(sorted(language_counts.keys())) or 'none detected'}"
            )
            
            # Step 3: Determine which scans to run
            selected_audits = parse_audit_selection(audit_types)
            
            # Prepare results structure
            results = {
                'scan_id': scan_id,
                'repo_url': repo_url,
                'branch': branch,
                'commit_hash': commit_hash,
                'languages': language_counts,
                'audits': {},
            }
            
            # Step 4: Run security scans
            progress_base = 30
            progress_step = 60 / max(len(selected_audits), 1)
            current_progress = progress_base
            
            # SAST scan
            if should_run_audit(selected_audits, 'sast'):
                update_progress(int(current_progress), 'Running SAST scan (Semgrep)')
                log_step("Running SAST scan (Semgrep)")
                try:
                    semgrep_json = results_dir / "semgrep.json"
                    semgrep_text = results_dir / "semgrep.txt"
                    run_semgrep(repo_path, semgrep_json, semgrep_text)
                    
                    # Verify files were created
                    if not semgrep_json.exists():
                        logger.warning(f"Semgrep JSON file not created: {semgrep_json}")
                    if not semgrep_text.exists():
                        logger.warning(f"Semgrep text file not created: {semgrep_text}")
                    
                    results['audits']['sast'] = {
                        'json_file': str(semgrep_json) if semgrep_json.exists() else None,
                        'text_file': str(semgrep_text) if semgrep_text.exists() else None,
                        'status': 'completed' if (semgrep_json.exists() or semgrep_text.exists()) else 'failed'
                    }
                    logger.info("SAST scan completed")
                except Exception as e:
                    logger.error(f"SAST scan failed: {e}")
                    results['audits']['sast'] = {'status': 'failed', 'error': str(e)}
                current_progress += progress_step
            
            # Dockerfile scan
            if should_run_audit(selected_audits, 'dockerfile'):
                update_progress(int(current_progress), 'Scanning Dockerfiles (Trivy)')
                log_step("Scanning Dockerfiles with Trivy")
                try:
                    trivy_report = results_dir / "trivy_dockerfile_scan.txt"
                    run_trivy_dockerfile_scan(repo_path, repo_name(repo_url), trivy_report)
                    if trivy_report.exists():
                        results['audits']['dockerfile'] = {
                            'file': str(trivy_report),
                            'status': 'completed'
                        }
                        logger.info("Dockerfile scan completed")
                    else:
                        results['audits']['dockerfile'] = {'status': 'skipped', 'reason': 'No Dockerfiles found'}
                except Exception as e:
                    logger.error(f"Dockerfile scan failed: {e}")
                    results['audits']['dockerfile'] = {'status': 'failed', 'error': str(e)}
                current_progress += progress_step
            
            # Trivy filesystem scan (runs for all audits)
            update_progress(int(current_progress), 'Running Trivy filesystem scan')
            log_step("Running Trivy filesystem scan")
            try:
                trivy_fs_report = results_dir / "trivy_fs_scan.txt"
                run_trivy_fs_scan(repo_path, trivy_fs_report)
                if trivy_fs_report.exists():
                    results['audits']['trivy_fs'] = {
                        'file': str(trivy_fs_report),
                        'status': 'completed'
                    }
                    logger.info("Trivy filesystem scan completed")
                else:
                    results['audits']['trivy_fs'] = {'status': 'skipped'}
            except Exception as e:
                logger.error(f"Trivy filesystem scan failed: {e}")
                results['audits']['trivy_fs'] = {'status': 'failed', 'error': str(e)}
            current_progress += progress_step
            
            # Terraform scans
            if should_run_audit(selected_audits, 'terraform') and has_terraform(repo_path):
                update_progress(int(current_progress), 'Scanning Terraform (tfsec, checkov, tflint)')
                log_step("Scanning Terraform with tfsec, checkov, and tflint")
                try:
                    tfsec_report = results_dir / "tfsec.txt"
                    checkov_report = results_dir / "checkov.txt"
                    tflint_report = results_dir / "tflint.txt"
                    run_tfsec_checkov_tflint_scan(repo_path, tfsec_report, checkov_report, tflint_report)
                    results['audits']['terraform'] = {
                        'tfsec': str(tfsec_report) if tfsec_report.exists() else None,
                        'checkov': str(checkov_report) if checkov_report.exists() else None,
                        'tflint': str(tflint_report) if tflint_report.exists() else None,
                        'status': 'completed'
                    }
                    logger.info("Terraform scan completed")
                except Exception as e:
                    logger.error(f"Terraform scan failed: {e}")
                    results['audits']['terraform'] = {'status': 'failed', 'error': str(e)}
                current_progress += progress_step
            
            # Node.js audit
            if should_run_audit(selected_audits, 'node'):
                if ('JavaScript' in language_counts or 'TypeScript' in language_counts or has_node_project(repo_path)):
                    update_progress(int(current_progress), 'Auditing Node.js dependencies')
                    log_step("Auditing Node.js dependencies")
                    try:
                        node_report = results_dir / "node_audit.txt"
                        run_node_audit(repo_path, repo_name(repo_url), node_report)
                        if node_report.exists():
                            results['audits']['node'] = {
                                'file': str(node_report),
                                'status': 'completed'
                            }
                            logger.info("Node.js audit completed")
                    except Exception as e:
                        logger.error(f"Node.js audit failed: {e}")
                        results['audits']['node'] = {'status': 'failed', 'error': str(e)}
                else:
                    results['audits']['node'] = {'status': 'skipped', 'reason': 'No Node.js project detected'}
                current_progress += progress_step
            
            # Go audit
            if should_run_audit(selected_audits, 'go'):
                if 'Go' in language_counts or has_go_project(repo_path):
                    update_progress(int(current_progress), 'Auditing Go dependencies (govulncheck)')
                    log_step("Auditing Go dependencies with govulncheck")
                    try:
                        go_report = results_dir / "go_vulncheck.txt"
                        run_go_vulncheck(repo_path, repo_name(repo_url), go_report)
                        if go_report.exists():
                            results['audits']['go'] = {
                                'file': str(go_report),
                                'status': 'completed'
                            }
                            logger.info("Go audit completed")
                    except Exception as e:
                        logger.error(f"Go audit failed: {e}")
                        results['audits']['go'] = {'status': 'failed', 'error': str(e)}
                else:
                    results['audits']['go'] = {'status': 'skipped', 'reason': 'No Go project detected'}
                current_progress += progress_step
            
            # Rust audit
            if should_run_audit(selected_audits, 'rust'):
                if 'Rust' in language_counts or has_rust_project(repo_path):
                    update_progress(int(current_progress), 'Auditing Rust dependencies (cargo-audit)')
                    log_step("Auditing Rust dependencies with cargo-audit")
                    try:
                        rust_report = results_dir / "rust_audit.txt"
                        run_cargo_audit(repo_path, repo_name(repo_url), rust_report)
                        if rust_report.exists():
                            results['audits']['rust'] = {
                                'file': str(rust_report),
                                'status': 'completed'
                            }
                            logger.info("Rust audit completed")
                    except Exception as e:
                        logger.error(f"Rust audit failed: {e}")
                        results['audits']['rust'] = {'status': 'failed', 'error': str(e)}
                else:
                    results['audits']['rust'] = {'status': 'skipped', 'reason': 'No Rust project detected'}
            
            # Step 5: Normalize findings and store in database
            update_progress(96, 'Normalizing findings')
            log_step("Normalizing findings")
            
            findings = []
            finding_db_ids = []  # Initialize for use in AI analysis
            if db_url:
                try:
                    findings = normalize_findings(results_dir, scan_id)
                    # Store findings in PostgreSQL
                    update_progress(97, 'Storing findings in database')
                    
                    async def store_findings_with_ensure(conn):
                        await ensure_scan_record(
                            conn,
                            scan_id,
                            repo_url,
                            branch,
                            audit_types,
                            status="running",
                        )
                        verify = await conn.fetchval(
                            "SELECT scan_id FROM scan WHERE scan_id = $1",
                            scan_id,
                        )
                        if not verify:
                            raise RuntimeError(
                                f"Scan record does not exist after ensure_scan_record for scan_id={scan_id}"
                            )
                        return await store_findings(conn, scan_id, findings)

                    try:
                        stats = asyncio.run(run_with_db(db_url, store_findings_with_ensure))
                    except Exception as ensure_err:
                        logger.error(f"Failed to ensure scan record: {ensure_err}", exc_info=True)
                        raise
                    finding_db_ids = stats.get('inserted_ids', [])  # Database IDs in same order as findings list
                    results['findings'] = stats
                    logger.info(f"Stored {stats['findings_count']} findings in database")
                except Exception as e:
                    logger.error(f"Failed to normalize/store findings: {e}", exc_info=True)
                    # Don't fail the scan if normalization fails
                    results['findings'] = {'error': str(e)}
            else:
                logger.warning("DATABASE_URL not set, skipping findings normalization")
            
            # Step 6: Upload raw outputs to storage (if configured)
            storage_backend_type = os.getenv("STORAGE_BACKEND", "local").lower()
            if storage_backend_type != "none":
                try:
                    update_progress(98, 'Uploading to storage')
                    log_step(f"Uploading results to storage backend '{storage_backend_type}'")
                    storage = create_storage_backend(storage_backend_type)
                    
                    # Upload raw scanner outputs
                    raw_files = [
                        "semgrep.json",
                        "semgrep.txt",
                        "trivy_dockerfile_scan.txt",
                        "node_audit.txt",
                        "go_vulncheck.txt",
                        "rust_audit.txt",
                        "tfsec.txt",
                        "checkov.txt",
                        "tflint.txt",
                    ]
                    
                    uploaded_paths = []
                    for filename in raw_files:
                        file_path = results_dir / filename
                        if file_path.exists():
                            remote_path = f"scans/{scan_id}/raw/{filename}"
                            storage.upload_file(file_path, remote_path)
                            uploaded_paths.append(remote_path)
                    
                    if storage_backend_type == "s3":
                        results['s3_results_path'] = f"s3://{os.getenv('S3_BUCKET')}/scans/{scan_id}/"
                    else:
                        results['storage_path'] = str(results_dir)
                    
                    logger.info(f"Uploaded {len(uploaded_paths)} files to {storage_backend_type} storage")
                except Exception as e:
                    logger.error(f"Failed to upload to storage: {e}", exc_info=True)
                    # Don't fail the scan if storage upload fails
            
            # Step 7: AI Analysis (optional, async)
            ai_enabled = os.getenv("AI_ANALYSIS_ENABLED", "false").lower() == "true"
            if ai_enabled and findings and db_url:
                try:
                    update_progress(99, 'Generating AI analysis')
                    log_step("Generating AI analysis")
                    
                    ai_api_key = (
                        os.getenv("ANTHROPIC_API_KEY")
                        or os.getenv("OPENAI_API_KEY")
                        or os.getenv("KIMI_API_KEY")
                        or os.getenv("MOONSHOT_API_KEY")
                    )
                    if not ai_api_key:
                        logger.warning("AI analysis enabled but no API key found")
                    else:
                        summarizer = AISummarizer()
                        ai_summary = asyncio.run(
                            summarizer.generate_summary(
                                scan_id, findings, repo_url, language_counts
                            )
                        )
                        
                        # Map 1-indexed finding positions from AI to database IDs
                        top_findings_db_ids = []
                        if finding_db_ids and ai_summary.get('topFindings'):
                            for idx in ai_summary['topFindings']:
                                # AI returns 1-indexed positions, convert to 0-indexed and get DB ID
                                if 1 <= idx <= len(finding_db_ids):
                                    top_findings_db_ids.append(finding_db_ids[idx - 1])
                        
                        # Map finding IDs in recommendations too
                        mapped_recommendations = []
                        if ai_summary.get('recommendations') and finding_db_ids:
                            for rec in ai_summary['recommendations']:
                                mapped_rec = rec.copy()
                                if 'findingIds' in mapped_rec:
                                    # Map 1-indexed positions to database IDs
                                    mapped_finding_ids = []
                                    for idx in mapped_rec['findingIds']:
                                        if 1 <= idx <= len(finding_db_ids):
                                            mapped_finding_ids.append(finding_db_ids[idx - 1])
                                    mapped_rec['findingIds'] = mapped_finding_ids
                                mapped_recommendations.append(mapped_rec)
                        else:
                            mapped_recommendations = ai_summary.get('recommendations', [])
                        
                        # Store AI summary in database
                        async def store_ai(conn):
                            return await store_ai_analysis(
                                conn,
                                scan_id,
                                ai_summary["summary"],
                                mapped_recommendations,
                                ai_summary["riskScore"],
                                top_findings_db_ids,
                                ai_summary.get("model", "unknown"),
                                ai_summary.get("modelVersion", "unknown"),
                                ai_summary["tokensUsed"],
                            )

                        ai_analysis_id = asyncio.run(run_with_db(db_url, store_ai))
                        results['ai_analysis'] = {
                            'id': ai_analysis_id,
                            'risk_score': ai_summary['riskScore'],
                            'tokens_used': ai_summary['tokensUsed']
                        }
                        logger.info("AI analysis completed")
                except Exception as e:
                    logger.error(f"AI analysis failed: {e}", exc_info=True)
                    # Don't fail the scan if AI analysis fails
                    results['ai_analysis'] = {'error': str(e)}
            
            # Step 8: Aggregate and save results
            update_progress(100, 'Saving results')
            log_step("Saving aggregated results and updating scan status to 'completed'")
            
            results['status'] = 'completed'
            results['results_path'] = str(results_dir)
            
            # Save aggregated results.json
            results_json = results_dir / "results.json"
            with results_json.open("w", encoding="utf-8") as f:
                json.dump(results, f, indent=2)
            
            # Update scan status to "completed" in database
            if db_url:
                try:
                    async def update_completed(conn):
                        await update_scan_status(
                            conn,
                            scan_id,
                            "completed",
                            progress=100,
                            commit_hash=commit_hash,
                            results_path=str(results_dir),
                        )

                    asyncio.run(run_with_db(db_url, update_completed))
                    logger.info(f"Updated scan {scan_id} status to 'completed' in database")
                except Exception as e:
                    logger.warning(f"Failed to update scan status to 'completed': {e}")
            
            logger.info(f"Scan {scan_id} completed successfully. Results saved to {results_dir}")
            log_step("Scan completed successfully")
            
            return results
            
    except Exception as exc:
        logger.error(f"Scan {scan_id} failed: {exc}", exc_info=True)
        log_step(f"Scan {scan_id} failed with exception: {exc!r}")
        try:
            log_step(traceback.format_exc())
        except Exception:
            logger.debug("Failed to write traceback to worker.log", exc_info=True)
        
        # Update scan status to "failed" in database
        # db_url is already defined at function start
        if db_url:
            try:
                async def update_failed(conn):
                    await ensure_scan_record(conn, scan_id, repo_url, branch, audit_types, status="failed")
                    await update_scan_status(conn, scan_id, "failed")

                asyncio.run(run_with_db(db_url, update_failed))
                logger.info(f"Updated scan {scan_id} status to 'failed' in database")
            except Exception as e:
                logger.warning(f"Failed to update scan status to 'failed': {e}")
        
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))


@celery_app.task(bind=True, name="tasks.scan_worker.generate_ai_analysis")
def generate_ai_analysis(self, scan_id: str) -> Dict[str, Any]:
    """
    Generate AI analysis for an existing completed scan that has findings but no ai_analysis.

    Loads findings from DB, runs AISummarizer, stores result. Requires AI_ANALYSIS_ENABLED=true
    and an API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, KIMI_API_KEY, or MOONSHOT_API_KEY).
    """
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.warning("generate_ai_analysis: DATABASE_URL not set")
        return {"ok": False, "error": "DATABASE_URL not set"}

    ai_enabled = os.getenv("AI_ANALYSIS_ENABLED", "false").lower() == "true"
    ai_api_key = (
        os.getenv("ANTHROPIC_API_KEY")
        or os.getenv("OPENAI_API_KEY")
        or os.getenv("KIMI_API_KEY")
        or os.getenv("MOONSHOT_API_KEY")
    )
    if not ai_enabled or not ai_api_key:
        logger.warning(
            "generate_ai_analysis: AI not enabled or no API key. "
            "Set AI_ANALYSIS_ENABLED=true and one of ANTHROPIC_API_KEY, OPENAI_API_KEY, KIMI_API_KEY, MOONSHOT_API_KEY"
        )
        return {
            "ok": False,
            "error": "AI analysis not enabled or no API key. Set AI_ANALYSIS_ENABLED=true and an API key.",
        }

    async def _load_scan_and_findings(conn):
        info = await get_scan_repo_info(conn, scan_id)
        if not info:
            return None, None, None
        if info["status"] != "completed":
            return None, None, f"Scan status is {info['status']}, must be completed"
        findings, finding_db_ids = await fetch_findings_for_scan(conn, scan_id)
        if not findings:
            return None, None, "No findings for this scan"
        return info, (findings, finding_db_ids), None

    async def _store_ai_result(conn):
        return await store_ai_analysis(
            conn,
            scan_id,
            ai_summary["summary"],
            mapped_recommendations,
            ai_summary["riskScore"],
            top_findings_db_ids,
            ai_summary.get("model", "unknown"),
            ai_summary.get("modelVersion", "unknown"),
            ai_summary["tokensUsed"],
        )

    try:
        info, findings_result, err = asyncio.run(run_with_db(db_url, _load_scan_and_findings))
        if err:
            return {"ok": False, "error": err}
        if not info or not findings_result:
            return {"ok": False, "error": "Scan not found"}
        findings, finding_db_ids = findings_result
        repo_url = info["repo_url"]
        language_counts = {}

        summarizer = AISummarizer()
        ai_summary = await summarizer.generate_summary(
            scan_id, findings, repo_url, language_counts
        )

        top_findings_db_ids = []
        if finding_db_ids and ai_summary.get("topFindings"):
            for idx in ai_summary["topFindings"]:
                if 1 <= idx <= len(finding_db_ids):
                    top_findings_db_ids.append(finding_db_ids[idx - 1])

        mapped_recommendations = []
        if ai_summary.get("recommendations") and finding_db_ids:
            for rec in ai_summary["recommendations"]:
                mapped_rec = rec.copy()
                if "findingIds" in mapped_rec:
                    mapped_finding_ids = [
                        finding_db_ids[i - 1]
                        for i in mapped_rec["findingIds"]
                        if 1 <= i <= len(finding_db_ids)
                    ]
                    mapped_rec["findingIds"] = mapped_finding_ids
                mapped_recommendations.append(mapped_rec)
        else:
            mapped_recommendations = ai_summary.get("recommendations", [])

        ai_analysis_id = asyncio.run(run_with_db(db_url, _store_ai_result))
        logger.info(f"AI analysis generated for scan {scan_id}, id={ai_analysis_id}")
        return {"ok": True, "ai_analysis_id": ai_analysis_id}
    except Exception as e:
        logger.error(f"generate_ai_analysis failed for {scan_id}: {e}", exc_info=True)
        return {"ok": False, "error": str(e)}
