# =============================================================================
# Railway Infrastructure for SecurityKit
# =============================================================================
# This Terraform configuration provisions the entire SecurityKit infrastructure
# on Railway. It creates the project, databases, and services.
#
# Usage:
#   1. Set RAILWAY_API_TOKEN environment variable
#   2. terraform init
#   3. terraform plan
#   4. terraform apply
#
# Note: Build and deploy configuration is handled by railway.toml files
# committed to the repository, not by Terraform.
# =============================================================================

# -----------------------------------------------------------------------------
# Railway Project
# -----------------------------------------------------------------------------
resource "railway_project" "securitykit" {
  name = var.project_name
}

# -----------------------------------------------------------------------------
# Managed Databases
# -----------------------------------------------------------------------------
resource "railway_database" "postgres" {
  project_id = railway_project.securitykit.id
  name       = "postgres"
  type       = "postgresql"
}

resource "railway_database" "redis" {
  project_id = railway_project.securitykit.id
  name       = "redis"
  type       = "redis"
}

# -----------------------------------------------------------------------------
# Services
# -----------------------------------------------------------------------------

# Frontend Service (Next.js)
resource "railway_service" "frontend" {
  project_id = railway_project.securitykit.id
  name       = "frontend"

  source_repo   = var.github_repo
  source_branch = var.github_branch

  # Build and deploy settings are managed by frontend/railway.toml
  # This Terraform only creates the service infrastructure

  environment_variables = {
    NODE_ENV = "production"
    # Database and API URLs will be injected via Railway's automatic
    # service discovery or manually in dashboard after initial deploy
  }
}

# API Service (FastAPI)
resource "railway_service" "api" {
  project_id = railway_project.securitykit.id
  name       = "api"

  source_repo   = var.github_repo
  source_branch = var.github_branch

  # Build and deploy settings are managed by railway.toml at repo root
  # Configure the service to use the API-specific config file

  environment_variables = {
    # These reference the Railway-managed databases
    DATABASE_URL = railway_database.postgres.connection_string
    REDIS_URL    = railway_database.redis.connection_string
    RESULTS_DIR  = "/work/results"
    LOG_LEVEL    = "info"
  }
}

# Worker Service (Celery)
resource "railway_service" "worker" {
  project_id = railway_project.securitykit.id
  name       = "worker"

  source_repo   = var.github_repo
  source_branch = var.github_branch

  # Build and deploy settings are managed by railway.worker.toml at repo root

  environment_variables = {
    DATABASE_URL = railway_database.postgres.connection_string
    REDIS_URL    = railway_database.redis.connection_string
    RESULTS_DIR  = "/work/results"
    LOG_LEVEL    = "info"
  }
}

# -----------------------------------------------------------------------------
# Custom Domains (Optional)
# -----------------------------------------------------------------------------
resource "railway_custom_domain" "frontend" {
  count = var.custom_domain != "" ? 1 : 0

  project_id = railway_project.securitykit.id
  service_id = railway_service.frontend.id
  domain     = var.custom_domain
}

resource "railway_custom_domain" "api" {
  count = var.api_domain != "" ? 1 : 0

  project_id = railway_project.securitykit.id
  service_id = railway_service.api.id
  domain     = var.api_domain
}
