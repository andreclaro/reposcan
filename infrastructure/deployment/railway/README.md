# Railway Infrastructure as Code

This directory contains Terraform configuration to provision the SecurityKit infrastructure on Railway.

## ⚠️ Important Limitations

The Railway Terraform provider has significant limitations:

| Feature | Supported | Notes |
|---------|-----------|-------|
| **Create project** | ✅ Yes | `railway_project` resource |
| **Create services** | ✅ Yes | `railway_service` resource |
| **Create databases** | ❌ No | Must create via Railway dashboard |
| **Set environment variables** | ⚠️ Partial | Use `railway_variable` resource or dashboard |
| **Custom domains** | ✅ Yes | `railway_custom_domain` resource |

**Bottom line:** Terraform creates the project and services. You must manually create PostgreSQL and Redis databases via Railway dashboard and set environment variables.

## Architecture

```
┌─────────────────────────────────────────┐
│         Railway Project                 │
│       (securitykit)                     │
│                                         │
│  ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │ Frontend │ │ API  │ │   Worker   │  │
│  │ (Next.js)│ │(FastAPI)│ │ (Celery)  │  │
│  └──────────┘ └──────┘ └────────────┘  │
│                                         │
│  ┌──────────┐ ┌──────────────────────┐ │  ← Created manually
│  │  Redis   │ │     PostgreSQL       │ │     in dashboard
│  │ (managed)│ │     (managed)        │ │
│  └──────────┘ └──────────────────────┘ │
└─────────────────────────────────────────┘
```

## Prerequisites

1. [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5.0
2. Railway API Token from https://railway.app/account/tokens

## Quick Start

```bash
# 1. Navigate to this directory
cd infrastructure/deployment/railway

# 2. Set your Railway API token
export RAILWAY_TOKEN="your_token_here"

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

## Post-Deployment Steps (Required)

After `terraform apply`, you **must** complete these steps in Railway dashboard:

### 1. Create Databases
1. Go to your project: https://railway.app/project/{project_id}
2. Click **New** → **Database** → **Add PostgreSQL**
3. Click **New** → **Database** → **Add Redis**

### 2. Configure Environment Variables

**API Service:**
- `DATABASE_URL` - Copy from PostgreSQL service
- `REDIS_URL` - Copy from Redis service
- `RESULTS_DIR=/work/results`
- `LOG_LEVEL=info`

**Worker Service:**
- `DATABASE_URL` - Copy from PostgreSQL service
- `REDIS_URL` - Copy from Redis service
- `RESULTS_DIR=/work/results`
- `LOG_LEVEL=info`

**Frontend Service:**
- `NEXTAUTH_SECRET` - Generate: `openssl rand -base64 32`
- `NEXTAUTH_URL` - Your frontend URL
- `GITHUB_CLIENT_ID` - From GitHub OAuth app
- `GITHUB_CLIENT_SECRET` - From GitHub OAuth app
- `FASTAPI_BASE_URL` - Your API URL
- `STRIPE_SECRET_KEY` - If using billing

### 3. Verify Config File Paths

In Railway dashboard, under each service's **Settings** → **Build**:

| Service | Config File Path |
|---------|------------------|
| Frontend | `/frontend/railway.toml` (or leave empty if in root) |
| API | `/railway.toml` |
| Worker | `/railway.worker.toml` |

### 4. Deploy

Push to your configured branch to trigger deployment.

## Service Configuration Files

Each service has a `railway.toml` file that configures build and deploy settings:

| Service | Config File | Docker Image |
|---------|-------------|--------------|
| Frontend | `/frontend/railway.toml` | `frontend/Dockerfile` |
| API | `/railway.toml` | `docker/Dockerfile.api` |
| Worker | `/railway.worker.toml` | `docker/Dockerfile` |

## Updating Infrastructure

```bash
# Make changes to .tf files, then:
terraform plan   # Review changes
terraform apply  # Apply changes
```

## Destroying Infrastructure

⚠️ **WARNING**: This will delete all services but NOT databases. Delete databases manually.

```bash
terraform destroy
```

## Troubleshooting

### Error: "Invalid API token"
- Ensure `RAILWAY_TOKEN` is set (not `RAILWAY_API_TOKEN`)
- Verify token hasn't expired at https://railway.app/account/tokens

### Services not using railway.toml
- Check config file path is set correctly in service settings
- Ensure files are committed to the deployed branch
- Path should be relative to repository root (e.g., `/railway.toml`)

### Database connection issues
- Verify databases were created manually in dashboard
- Check environment variables were copied correctly
- Ensure services are in the same project (share private network)

### Worker service crashes
- Check that `RESULTS_DIR=/work/results` is set
- Verify worker has sufficient resources (4GB RAM minimum)

## Resources

- [Railway Terraform Provider](https://github.com/terraform-community-providers/terraform-provider-railway)
- [Railway Config as Code](https://docs.railway.com/reference/config-as-code)
- [Railway Schema JSON](https://railway.com/railway.schema.json)
