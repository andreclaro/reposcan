"""FastAPI service for security audit API."""
import os
import uuid
from fastapi import FastAPI, HTTPException
from celery import Celery
from celery.result import AsyncResult

from .models import ScanRequest, ScanResponse, ScanStatusResponse, HealthResponse

app = FastAPI(
    title="Security Audit API",
    description="Simple API for running security scans on repositories",
    version="0.1.0"
)

# Celery configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

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
)


@app.post("/scan", response_model=ScanResponse)
async def create_scan(request: ScanRequest):
    """Queue a new security scan job."""
    scan_id = str(uuid.uuid4())
    
    # Send task to Celery
    task = celery_app.send_task(
        'tasks.scan_worker.run_scan',
        args=[scan_id, request.dict()],
        task_id=scan_id  # Use scan_id as task_id for easy tracking
    )
    
    return ScanResponse(scan_id=scan_id, status="queued")


@app.get("/scan/{scan_id}/status", response_model=ScanStatusResponse)
async def get_scan_status(scan_id: str):
    """Get the status of a scan job."""
    task = AsyncResult(scan_id, app=celery_app)
    
    if task.state == 'PENDING':
        return ScanStatusResponse(
            scan_id=scan_id,
            status="queued",
            progress=0
        )
    elif task.state == 'PROGRESS':
        return ScanStatusResponse(
            scan_id=scan_id,
            status="running",
            progress=task.info.get('progress', 0)
        )
    elif task.state == 'SUCCESS':
        result = task.result
        return ScanStatusResponse(
            scan_id=scan_id,
            status="completed",
            progress=100,
            results_path=result.get('results_path'),
            result=result
        )
    elif task.state == 'FAILURE':
        return ScanStatusResponse(
            scan_id=scan_id,
            status="failed",
            error=str(task.info)
        )
    else:
        return ScanStatusResponse(
            scan_id=scan_id,
            status=task.state.lower()
        )


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    return HealthResponse(status="ok")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
