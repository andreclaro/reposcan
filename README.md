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

## Screenshots

Landing page:
<img width="1282" height="630" alt="image" src="https://github.com/user-attachments/assets/1a3df43e-860f-43a3-ba83-517faf1bb7dd" />

Dashboard:
<img width="1266" height="1122" alt="image" src="https://github.com/user-attachments/assets/931f378b-1031-46be-9d2c-5ca882985a47" />

Scanning results:
<img width="1243" height="591" alt="image" src="https://github.com/user-attachments/assets/bee37a68-7fe5-4494-b138-7c7567a0571b" />

<img width="1279" height="423" alt="image" src="https://github.com/user-attachments/assets/ada1def6-6f54-40b2-b41f-e173aae12aa8" />

![Uploading image.png…]()


## Documentation

See **[docs/](docs/)** for full documentation:

- [docs/README.md](docs/README.md) – Documentation index
- [docs/internal-guides/](docs/internal-guides/) – CLI, API, Docker, configuration
- [docs/operations/](docs/operations/) – Troubleshooting, deployment
- [docs/architecture/](docs/architecture/) – Design and architecture

## License

[MIT](LICENSE)
