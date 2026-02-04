"""FastAPI service for security audit API."""
import os
import uuid
from fastapi import FastAPI, HTTPException, Request
from celery import Celery
from celery.result import AsyncResult
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .models import ScanRequest, ScanResponse, ScanStatusResponse, HealthResponse

# Rate limiting configuration
# Use Redis as storage for rate limits if available, otherwise in-memory
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=REDIS_URL if REDIS_URL else None,
)

app = FastAPI(
    title="Security Audit API",
    description="Simple API for running security scans on repositories",
    version="0.1.0"
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Celery configuration
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
)


@app.post("/scan", response_model=ScanResponse)
@limiter.limit("10/minute")  # Rate limit: 10 scans per minute per IP
async def create_scan(request: Request, scan_request: ScanRequest):
    """Queue a new security scan job."""
    scan_id = str(uuid.uuid4())
    
    # Send task to Celery
    task = celery_app.send_task(
        'tasks.scan_worker.run_scan',
        args=[scan_id, scan_request.dict()],
        task_id=scan_id  # Use scan_id as task_id for easy tracking
    )
    
    return ScanResponse(scan_id=scan_id, status="queued")


@app.post("/scan/{scan_id}/retry", response_model=ScanResponse)
@limiter.limit("5/minute")  # Rate limit: 5 retries per minute per IP
async def retry_scan(request: Request, scan_id: str, scan_request: ScanRequest):
    """Queue a retry for an existing scan, reusing the same scan_id."""
    # Validate scan_id is a valid UUID to prevent abuse
    try:
        scan_uuid = uuid.UUID(scan_id)
        scan_id_str = str(scan_uuid)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan_id")

    # Send task to Celery using the existing scan_id as task_id
    celery_app.send_task(
        "tasks.scan_worker.run_scan",
        args=[scan_id_str, scan_request.dict()],
        task_id=scan_id_str,
    )

    return ScanResponse(scan_id=scan_id_str, status="queued")

@app.get("/scan/{scan_id}/status", response_model=ScanStatusResponse)
@limiter.limit("30/minute")  # Rate limit: 30 status checks per minute per IP
async def get_scan_status(request: Request, scan_id: str):
    """Get the status of a scan job."""
    task = AsyncResult(scan_id, app=celery_app)
    
    if task.state == 'PENDING':
        return ScanStatusResponse(
            scan_id=scan_id,
            status="queued",
            progress=0
        )
    elif task.state == 'PROGRESS':
        meta = task.info if isinstance(task.info, dict) else {}
        return ScanStatusResponse(
            scan_id=scan_id,
            status="running",
            progress=meta.get('progress', 0),
            error=meta.get('current_step')  # Show current step as info
        )
    elif task.state == 'SUCCESS':
        result = task.result
        return ScanStatusResponse(
            scan_id=scan_id,
            status="completed",
            progress=100,
            results_path=result.get('results_path'),
            commit_hash=result.get('commit_hash'),
            result=result
        )
    elif task.state == 'FAILURE':
        error_info = task.info
        if isinstance(error_info, Exception):
            error_msg = str(error_info)
        elif isinstance(error_info, dict):
            error_msg = error_info.get('error', str(error_info))
        else:
            error_msg = str(error_info)
        return ScanStatusResponse(
            scan_id=scan_id,
            status="failed",
            error=error_msg
        )
    elif task.state == 'RETRY':
        # Task is retrying - show the error that caused the retry
        error_info = task.info
        if isinstance(error_info, Exception):
            error_msg = f"Retrying after error: {str(error_info)}"
        elif isinstance(error_info, dict):
            error_msg = error_info.get('error', f"Retrying: {str(error_info)}")
        else:
            error_msg = f"Retrying: {str(error_info)}"
        return ScanStatusResponse(
            scan_id=scan_id,
            status="retrying",
            error=error_msg
        )
    else:
        # Handle other states (REVOKED, etc.)
        return ScanStatusResponse(
            scan_id=scan_id,
            status=task.state.lower(),
            error=str(task.info) if task.info else None
        )


@app.post("/scan/{scan_id}/generate-ai")
@limiter.limit("5/minute")  # Rate limit: 5 AI generations per minute per IP
async def generate_ai_for_scan(request: Request, scan_id: str):
    """
    Queue generation of AI analysis for an existing completed scan.

    The scan must exist, be completed, and have findings. Requires the worker
    to have AI_ANALYSIS_ENABLED=true and an API key set. Returns 202 when queued.
    """
    try:
        uuid.UUID(scan_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scan_id")

    task_id = f"generate-ai-{scan_id}"
    celery_app.send_task(
        "tasks.scan_worker.generate_ai_analysis",
        args=[scan_id],
        task_id=task_id,
    )
    return {"scan_id": scan_id, "status": "queued", "message": "AI analysis generation queued"}


@app.get("/health", response_model=HealthResponse)
@limiter.limit("60/minute")  # Rate limit: 60 health checks per minute per IP
async def health(request: Request):
    """Health check endpoint."""
    return HealthResponse(status="ok")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
