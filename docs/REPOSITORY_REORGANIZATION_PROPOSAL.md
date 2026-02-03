# Repository Reorganization Proposal

## Current Issues

### 1. Mixed Concerns at Root Level
The repository root contains a mix of:
- Python backend files (`sec_audit.py`, `requirements.txt`)
- Docker files (`Dockerfile`, `docker-compose.yml`)
- Documentation files (scattered between `README.md`, `docs/`, `design/`)
- Configuration files (`.env.example`, etc.)

**Problem**: It's unclear what's what for new contributors.

### 2. Split Python Codebase
Python code is scattered across:
- `sec_audit/` - Core scanning logic
- `api/` - FastAPI service
- `tasks/` - Celery worker
- `tests/` - Test suite (only covers Python)

**Problem**: The backend isn't cohesive. API and workers are separate top-level modules.

### 3. Duplicate/Confusing Scripts
- `scripts/` - Contains deployment and utility scripts
- `webapp/scripts/` - Contains Next.js specific scripts

**Problem**: Naming collision and unclear purpose boundaries.

### 4. Documentation Fragmentation
- `README.md` - Main project readme
- `docs/` - User documentation
- `design/` - Architecture design docs
- `docs/designs/` - (exists but unclear purpose)
- `docs/security/` - Security audit reports
- `AGENTS.md` - AI agent instructions

**Problem**: Design docs and user docs are separate. Hard to find what you need.

### 5. Webapp Structure
The Next.js app is nested under `webapp/` which is good, but it has its own:
- `README.md` (redundant with main)
- `package.json` (correct)
- Node modules (correct)

**Problem**: The webapp README duplicates project info.

### 6. Test Organization
- `tests/` - Only Python tests
- No clear location for webapp tests
- No integration tests between backend and frontend

### 7. Docker Strategy
- `Dockerfile` - Full scanner image
- `Dockerfile.api` - API only (but unused?)
- `docker-compose.yml` - At root

**Problem**: Unclear which Dockerfile to use when.

---

## Proposed Structure

```
sec-audit-repos/
├── README.md                      # Project overview with quick start
├── LICENSE                        # (add if missing)
├── Makefile                       # Common commands (build, test, dev)
├── docker-compose.yml             # Main orchestration (keep at root)
├── .env.example                   # Environment template
│
├── backend/                       # All Python code
│   ├── README.md                  # Backend-specific docs
│   ├── pyproject.toml             # Modern Python packaging
│   ├── requirements.txt           # (or move to pyproject.toml)
│   ├── Dockerfile                 # Backend/scanner image
│   │
│   ├── src/
│   │   ├── sec_audit/             # Core scanning (rename to scanner?)
│   │   │   ├── __init__.py
│   │   │   ├── cli.py
│   │   │   ├── scanners.py
│   │   │   ├── ecosystem.py
│   │   │   ├── repos.py
│   │   │   ├── fs.py
│   │   │   ├── utils.py
│   │   │   ├── version_manager.py
│   │   │   └── ai/                # AI analysis modules
│   │   │       ├── __init__.py
│   │   │       ├── normalizer.py
│   │   │       ├── summarizer.py
│   │   │       ├── storage.py
│   │   │       └── parsers/
│   │   │
│   │   ├── api/                   # FastAPI service
│   │   │   ├── __init__.py
│   │   │   ├── main.py
│   │   │   ├── models.py
│   │   │   └── dependencies.py    # (add auth, db deps)
│   │   │
│   │   └── worker/                # Celery worker (rename from tasks)
│   │       ├── __init__.py
│   │       ├── scan_worker.py
│   │       └── config.py          # Celery configuration
│   │
│   └── tests/
│       ├── unit/                  # Unit tests
│       │   ├── test_scanner.py
│       │   ├── test_ecosystem.py
│       │   └── ...
│       ├── integration/           # Integration tests
│       │   └── test_github_repos.py
│       └── conftest.py
│
├── frontend/                      # Rename from webapp
│   ├── README.md                  # Frontend-specific docs
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── Dockerfile                 # Frontend image (if needed)
│   │
│   ├── src/
│   │   ├── app/                   # Next.js app router
│   │   ├── components/
│   │   ├── lib/
│   │   ├── db/
│   │   └── types/
│   │
│   └── tests/                     # Frontend tests
│       ├── unit/
│       └── e2e/
│
├── infrastructure/                # Rename from scripts
│   ├── deploy/
│   │   ├── build.sh
│   │   ├── docker/
│   │   └── k8s/                   # (if adding Kubernetes)
│   │
│   ├── maintenance/
│   │   ├── fix_disk_space.sh
│   │   └── purge_dbs.py
│   │
│   └── monitoring/
│       └── redis_check.py
│
└── docs/                          # All documentation
    ├── README.md                  # Docs index
    ├── architecture/              # Merge design/ into here
    │   ├── overview.md
    │   ├── backend.md
    │   ├── frontend.md
    │   ├── ai-integration.md
    │   └── decisions/             # ADRs (Architecture Decision Records)
    │
    ├── user-guides/
    │   ├── quickstart.md
    │   ├── cli.md
    │   ├── api.md
    │   ├── docker.md
    │   └── configuration.md
    │
    ├── development/
    │   ├── setup.md
    │   ├── testing.md
    │   ├── contributing.md
    │   └── agents.md              # Move AGENTS.md here
    │
    └── operations/
        ├── deployment.md
        ├── troubleshooting.md
        └── security/
            └── audit-report.md
```

---

## Migration Plan

### Phase 1: Backend Consolidation
1. Create `backend/` directory
2. Move `sec_audit/` → `backend/src/scanner/`
3. Move `api/` → `backend/src/api/`
4. Move `tasks/` → `backend/src/worker/`
5. Move `tests/` → `backend/tests/`
6. Update all import paths
7. Update `docker-compose.yml` paths
8. Update `Dockerfile` paths

### Phase 2: Frontend Rename
1. Rename `webapp/` → `frontend/`
2. Update `docker-compose.yml` paths
3. Update documentation references

### Phase 3: Scripts Reorganization
1. Create `infrastructure/` directory
2. Categorize scripts into:
   - `deploy/` - Build and deployment
   - `maintenance/` - Cleanup and fixes
   - `monitoring/` - Health checks

### Phase 4: Documentation Consolidation
1. Create `docs/architecture/` from `design/`
2. Move user guides to `docs/user-guides/`
3. Move `AGENTS.md` to `docs/development/`
4. Update all README links

### Phase 5: Root Cleanup
1. Move `sec_audit.py` → `backend/src/cli.py` or keep as entry point
2. Create `Makefile` for common commands
3. Update root `README.md` to be minimal landing page

---

## Benefits

### For Contributors
- **Clear boundaries**: Frontend vs Backend is obvious
- **Easier navigation**: Find what you need quickly
- **Consistent patterns**: Each module has similar structure

### For DevOps
- **Better Docker builds**: Clearer Dockerfile locations
- **Deployment clarity**: Infrastructure scripts organized
- **Environment management**: Easier to manage env vars

### For Documentation
- **Single source of truth**: All docs in one place
- **Clear hierarchy**: User vs Developer vs Operations docs
- **Easier maintenance**: Update docs in one location

---

## Alternative Minimal Approach

If the full reorg is too disruptive, consider these smaller wins:

1. **Just rename `webapp/` → `frontend/`** - Makes purpose clearer
2. **Move `design/` → `docs/architecture/`** - Consolidate docs
3. **Create `backend/` and move `api/` and `tasks/` into it**
4. **Keep `sec_audit/` at root** as the core library
5. **Add a `Makefile`** for common commands

This gives 80% of the benefit with 20% of the effort.

---

## Recommended Next Steps

1. **Discuss this proposal** with the team
2. **Decide on full vs minimal approach**
3. **Create a migration branch** if proceeding
4. **Update documentation** as the first step
5. **Migrate code** in small, reviewable PRs
6. **Update CI/CD** to match new structure
