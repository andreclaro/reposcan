# Railway Infrastructure as Code

This directory contains Terraform configuration to provision the SecurityKit infrastructure on Railway.

## Architecture

```
┌─────────────────────────────────────────┐
│           Railway Project               │
│         (securitykit)                   │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend │ │ API  │ │   Worker   │  │
│  │ (Next.js)│ │(FastAPI)│ │ (Celery)  │  │
│  └──────────┘ └──────┘ └────────────┘  │
│                                         │
│  ┌──────────┐ ┌──────────────────────┐ │
│  │  Redis   │ │     PostgreSQL       │ │
│  │ (managed)│ │     (managed)        │ │
│  └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────┘
```

## Two-Layer Configuration

| Layer | Tool | Purpose |
|-------|------|---------|
| **Infrastructure** | Terraform | Creates project, services, databases |
| **Build & Deploy** | `railway.toml` | Configures build and runtime settings |

Terraform handles resources that rarely change (services, databases).  
`railway.toml` handles deployment settings that change more frequently (commands, healthchecks).

## Prerequisites

1. [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5.0
2. [Railway CLI](https://docs.railway.com/guides/cli) (optional, for local testing)
3. Railway API Token from https://railway.app/account/tokens

## Quick Start

```bash
# 1. Navigate to this directory
cd infrastructure/deployment/railway

# 2. Set your Railway API token
export RAILWAY_API_TOKEN="your_token_here"

# 3. Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings

# 4. Initialize Terraform
terraform init

# 5. Plan the deployment
terraform plan

# 6. Apply the configuration
terraform apply

# 7. Note the output values for next steps
```

## Service Configuration Files

After running Terraform, configure each service to use the appropriate `railway.toml`:

| Service | Config File Path | Location in Repo |
|---------|------------------|------------------|
| Frontend | Default (auto-detected) | `/frontend/railway.toml` |
| API | `/railway.toml` | Repo root |
| Worker | `/railway.worker.toml` | Repo root |

Set these paths in the Railway dashboard under each service's Settings → Build → Config File Path.

## Environment Variables

Terraform automatically sets:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

You must manually add (via Railway dashboard or CLI):
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` - GitHub OAuth credentials
- `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET` - For billing (optional)
- `AI_PROVIDER_API_KEY` - For AI analysis (optional)

## Updating Infrastructure

```bash
# Make changes to .tf files, then:
terraform plan   # Review changes
terraform apply  # Apply changes
```

## Destroying Infrastructure

⚠️ **WARNING**: This will delete all data!

```bash
terraform destroy
```

## Troubleshooting

### Error: "Invalid API token"
- Ensure `RAILWAY_API_TOKEN` is set correctly
- Verify token hasn't expired at https://railway.app/account/tokens

### Services not using railway.toml
- Check config file path is set correctly in service settings
- Ensure files are committed to the deployed branch

### Database connection issues
- Verify services are in the same Railway project (they share a private network)
- Check environment variables were applied after database creation

## Resources

- [Railway Terraform Provider](https://github.com/terraform-community-providers/terraform-provider-railway)
- [Railway Config as Code](https://docs.railway.com/reference/config-as-code)
- [Railway Schema JSON](https://railway.com/railway.schema.json)
