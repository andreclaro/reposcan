"""Celery worker for running security scans."""
import os
import json
import csv
import tempfile
from pathlib import Path
from typing import Dict, Any
from celery import Celery
from celery.utils.log import get_task_logger

from sec_audit.repos import clone_repo, repo_name, update_submodules_if_present, get_commit_hash
from sec_audit.fs import detect_languages, has_terraform
from sec_audit.scanners import (
    run_semgrep,
    run_trivy_dockerfile_scan,
    run_tfsec_checkov_tflint_scan,
)
from sec_audit.ecosystem import (
    has_node_project,
    has_go_project,
    has_rust_project,
    run_node_audit,
    run_go_vulncheck,
    run_cargo_audit,
)
from sec_audit.utils import parse_audit_selection, should_run_audit

logger = get_task_logger(__name__)

# Celery configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
RESULTS_DIR = Path(os.getenv("RESULTS_DIR", "./results"))

celery_app = Celery(
    'sec_audit',
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
    branch = request_data.get('branch', 'main')
    audit_types = request_data.get('audit_types', [])
    skip_lfs = request_data.get('skip_lfs', False)
    
    logger.info(f"Starting scan {scan_id} for {repo_url} (branch: {branch})")
    
    # Create results directory
    results_dir = RESULTS_DIR / scan_id
    results_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        # Update progress
        self.update_state(state='PROGRESS', meta={'progress': 10, 'current_step': 'Cloning repository'})
        
        # Create temporary directory for cloning
        with tempfile.TemporaryDirectory(prefix=f"scan_{scan_id}_") as tmpdir:
            repo_path = Path(tmpdir) / repo_name(repo_url)
            
            # Step 1: Clone repository
            logger.info(f"Cloning {repo_url} to {repo_path}")
            clone_repo(repo_url, repo_path, branch, skip_lfs)
            update_submodules_if_present(repo_path)
            
            # Capture commit hash
            commit_hash = get_commit_hash(repo_path, branch)
            logger.info(f"Scanned commit: {commit_hash}")
            
            self.update_state(state='PROGRESS', meta={'progress': 20, 'current_step': 'Detecting languages'})
            
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
                self.update_state(
                    state='PROGRESS',
                    meta={'progress': int(current_progress), 'current_step': 'Running SAST scan (Semgrep)'}
                )
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
                self.update_state(
                    state='PROGRESS',
                    meta={'progress': int(current_progress), 'current_step': 'Scanning Dockerfiles (Trivy)'}
                )
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
            
            # Terraform scans
            if should_run_audit(selected_audits, 'terraform') and has_terraform(repo_path):
                self.update_state(
                    state='PROGRESS',
                    meta={'progress': int(current_progress), 'current_step': 'Scanning Terraform (tfsec, checkov, tflint)'}
                )
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
                    self.update_state(
                        state='PROGRESS',
                        meta={'progress': int(current_progress), 'current_step': 'Auditing Node.js dependencies'}
                    )
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
                    self.update_state(
                        state='PROGRESS',
                        meta={'progress': int(current_progress), 'current_step': 'Auditing Go dependencies (govulncheck)'}
                    )
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
                    self.update_state(
                        state='PROGRESS',
                        meta={'progress': int(current_progress), 'current_step': 'Auditing Rust dependencies (cargo-audit)'}
                    )
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
            
            # Step 5: Aggregate and save results
            self.update_state(state='PROGRESS', meta={'progress': 95, 'current_step': 'Saving results'})
            
            results['status'] = 'completed'
            results['results_path'] = str(results_dir)
            
            # Save aggregated results.json
            results_json = results_dir / "results.json"
            with results_json.open("w", encoding="utf-8") as f:
                json.dump(results, f, indent=2)
            
            logger.info(f"Scan {scan_id} completed successfully. Results saved to {results_dir}")
            
            return results
            
    except Exception as exc:
        logger.error(f"Scan {scan_id} failed: {exc}", exc_info=True)
        # Retry with exponential backoff
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
