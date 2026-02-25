# Backend Worker (RepoScan)

Python backend: audit CLI, FastAPI service, and Celery worker.

## Layout

- `src/audit/` – Core scanning logic (CLI, scanners, ecosystem, AI)
- `src/api/` – FastAPI service
- `src/worker/` – Celery worker (`worker.scan_worker`)
- `tests/` – Pytest suite

## Run locally

From repo root:

```bash
# Install editable
pip install -e backend-worker/

# CLI
python -m audit path/to/repos.csv ./output
# or from repo root: PYTHONPATH=backend-worker/src python backend-worker/audit.py path/to/repos.csv ./output

# API
uvicorn api.main:app --reload --port 8000
# or: ./infrastructure/deploy/start_api.sh

# Worker
celery -A worker.scan_worker worker --loglevel=info
# or: ./infrastructure/deploy/start_worker.sh
```

## Tests

```bash
PYTHONPATH=backend-worker/src pytest backend-worker/tests/ -v -m "not integration"
```

Or from `backend-worker/` after `pip install -e .`: `pytest tests/ -v -m "not integration"`.
