# Docker

Docker Compose and Dockerfiles for the Security Audit stack. All Dockerfiles live in this directory; build context is the **repository root** (`..`).

## Layout

- **docker-compose.yml** – Compose file for postgres, redis, api, and worker. Paths are relative to this directory (e.g. `../backend`, `../frontend/.env.local`). Build context for api/worker is `..` (repo root).
- **Dockerfile** – Worker image (scanner tools). Used by Compose and for standalone: `docker build -f docker/Dockerfile -t sec-audit-worker .`
- **Dockerfile.api** – API-only image. Used by Compose and for standalone: `docker build -f docker/Dockerfile.api -t reposcan-api .`

## Usage

From the **repository root**:

```bash
docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f
docker compose -f docker/docker-compose.yml down
```

See [docs/user-guides/DOCKER.md](../docs/user-guides/DOCKER.md) for full Docker setup and troubleshooting.
