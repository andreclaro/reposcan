# =============================================================================
# Railway Infrastructure for SecurityKit
# =============================================================================
# This Terraform configuration provisions the SecurityKit infrastructure on Railway.
# 
# IMPORTANT LIMITATIONS:
# - Databases must be created manually in Railway dashboard (no railway_database resource)
# - Environment variables are set via railway_variable resources
# - Build/deploy settings are handled by railway.toml files
#
# Usage:
#   1. Set RAILWAY_TOKEN environment variable
#   2. terraform init
#   3. terraform plan
#   4. terraform apply
#   5. Create PostgreSQL and Redis databases in Railway dashboard
#   6. Set DATABASE_URL and REDIS_URL variables manually or via dashboard
# =============================================================================

# -----------------------------------------------------------------------------
# Railway Project
# -----------------------------------------------------------------------------
resource "railway_project" "securitykit" {
  name = var.project_name
}

# -----------------------------------------------------------------------------
# Railway Environment (optional - for staging/production separation)
# -----------------------------------------------------------------------------
# resource "railway_environment" "production" {
#   name       = "production"
#   project_id = railway_project.securitykit.id
# }

# -----------------------------------------------------------------------------
# Services
# -----------------------------------------------------------------------------

# Frontend Service (Next.js)
resource "railway_service" "frontend" {
  name       = "frontend"
  project_id = railway_project.securitykit.id

  source_repo        = var.github_repo
  source_repo_branch = var.github_branch
  config_path        = "/frontend/railway.toml"
  root_directory     = "/frontend"
}

# API Service (FastAPI)
resource "railway_service" "api" {
  name       = "api"
  project_id = railway_project.securitykit.id

  source_repo        = var.github_repo
  source_repo_branch = var.github_branch
  config_path        = "/railway.toml"
}

# Worker Service (Celery)
resource "railway_service" "worker" {
  name       = "worker"
  project_id = railway_project.securitykit.id

  source_repo        = var.github_repo
  source_repo_branch = var.github_branch
  config_path        = "/railway.worker.toml"
}

# -----------------------------------------------------------------------------
# Environment Variables
# -----------------------------------------------------------------------------
# Note: Sensitive values like DATABASE_URL should be set via Railway dashboard
# or using terraform import after creating them in the UI

# Example: Set non-sensitive variables via Terraform
# resource "railway_variable" "api_log_level" {
#   name       = "LOG_LEVEL"
#   value      = "info"
#   service_id = railway_service.api.id
# }

# resource "railway_variable" "worker_log_level" {
#   name       = "LOG_LEVEL"
#   value      = "info"
#   service_id = railway_service.worker.id
# }

# Shared variables (available to all services in project)
# resource "railway_shared_variable" "node_env" {
#   name       = "NODE_ENV"
#   value      = "production"
#   project_id = railway_project.securitykit.id
# }

# -----------------------------------------------------------------------------
# Custom Domains (Optional)
# -----------------------------------------------------------------------------
resource "railway_custom_domain" "frontend" {
  count = var.custom_domain != "" ? 1 : 0

  service_id = railway_service.frontend.id
  domain     = var.custom_domain
}

resource "railway_custom_domain" "api" {
  count = var.api_domain != "" ? 1 : 0

  service_id = railway_service.api.id
  domain     = var.api_domain
}
