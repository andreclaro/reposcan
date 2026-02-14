output "project_id" {
  description = "Railway project ID"
  value       = railway_project.securitykit.id
}

output "project_url" {
  description = "Railway project dashboard URL"
  value       = "https://railway.app/project/${railway_project.securitykit.id}"
}

output "service_ids" {
  description = "Service IDs for reference"
  value = {
    frontend = railway_service.frontend.id
    api      = railway_service.api.id
    worker   = railway_service.worker.id
  }
}

output "service_urls" {
  description = "Default Railway URLs for each service"
  value = {
    frontend = "https://${railway_service.frontend.domain}"
    api      = "https://${railway_service.api.domain}"
    worker   = "https://${railway_service.worker.domain}"
  }
}

output "custom_domains" {
  description = "Configured custom domains"
  value = {
    frontend = var.custom_domain != "" ? var.custom_domain : null
    api      = var.api_domain != "" ? var.api_domain : null
  }
}

output "next_steps" {
  description = "Post-deployment instructions"
  value       = <<-EOT

    =========================================
    🚀 Railway Infrastructure Created!
    =========================================

    1. Create databases in Railway dashboard:
       - Go to: https://railway.app/project/${railway_project.securitykit.id}
       - Click "New" → "Database" → "Add PostgreSQL"
       - Click "New" → "Database" → "Add Redis"

    2. Configure environment variables for API service:
       - DATABASE_URL (from PostgreSQL)
       - REDIS_URL (from Redis)
       - RESULTS_DIR=/work/results

    3. Configure environment variables for Worker service:
       - DATABASE_URL (from PostgreSQL)
       - REDIS_URL (from Redis)
       - RESULTS_DIR=/work/results

    4. Configure environment variables for Frontend service:
       - NEXTAUTH_SECRET (generate: openssl rand -base64 32)
       - NEXTAUTH_URL (your frontend URL)
       - GITHUB_CLIENT_ID
       - GITHUB_CLIENT_SECRET
       - FASTAPI_BASE_URL (your API URL)
       - STRIPE_SECRET_KEY (if using billing)

    5. Verify config file paths in service settings:
       - API service: /railway.toml
       - Worker service: /railway.worker.toml
       - Frontend service: /frontend/railway.toml (auto-detected)

    6. Deploy by pushing to the ${var.github_branch} branch

    =========================================
  EOT
}
