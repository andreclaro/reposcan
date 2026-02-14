output "project_id" {
  description = "Railway project ID"
  value       = railway_project.securitykit.id
}

output "project_url" {
  description = "Railway project dashboard URL"
  value       = "https://railway.app/project/${railway_project.securitykit.id}"
}

output "database_connection_strings" {
  description = "Database connection strings (sensitive)"
  value = {
    postgres = railway_database.postgres.connection_string
    redis    = railway_database.redis.connection_string
  }
  sensitive = true
}

output "service_urls" {
  description = "Default Railway URLs for each service"
  value = {
    frontend = "https://${railway_service.frontend.default_domain}"
    api      = "https://${railway_service.api.default_domain}"
    worker   = "https://${railway_service.worker.default_domain}"
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

    1. Configure service config file paths in Railway dashboard:
       - API service: Set config file to "/railway.toml"
       - Worker service: Set config file to "/railway.worker.toml"
       - Frontend service: Uses "/frontend/railway.toml" (default)

    2. Add required environment variables in Railway dashboard:
       - NEXTAUTH_SECRET (generate with: openssl rand -base64 32)
       - GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET
       - STRIPE_SECRET_KEY & STRIPE_WEBHOOK_SECRET (if using billing)
       - AI_PROVIDER_API_KEY (if using AI analysis)

    3. Deploy by pushing to the ${var.github_branch} branch

    4. View logs: https://railway.app/project/${railway_project.securitykit.id}

    =========================================
  EOT
}
