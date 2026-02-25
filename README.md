# RepoScan

Security audit tool for repositories. Runs SAST (Semgrep), Dockerfile scans (Trivy), and language/infrastructure audits (Node, Go, Rust, Terraform). Provides CLI, API, and web interfaces.

## Quick Start

```bash
# CLI: batch scan from CSV
make audit
# Or: make audit CSV=repos.csv OUT=./output

# API + Worker: start backend stack
make docker-up
# Queue scan: curl -X POST http://localhost:8000/scan -H "Content-Type: application/json" -d '{"repo_url":"https://github.com/user/repo.git","audit_types":["sast"]}'

# Web: frontend (requires backend running)
cd frontend && pnpm install && pnpm dev
```

Run `make help` from the repo root for all targets.

## Documentation

See **[docs/](docs/)** for full documentation:

- [docs/README.md](docs/README.md) – Documentation index
- [docs/internal-guides/](docs/internal-guides/) – CLI, API, Docker, configuration
- [docs/operations/](docs/operations/) – Troubleshooting, deployment
- [docs/architecture/](docs/architecture/) – Design and architecture

## License

[MIT](LICENSE)
