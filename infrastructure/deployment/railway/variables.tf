variable "project_name" {
  description = "Name of the Railway project"
  type        = string
  default     = "securitykit"
}

variable "environment" {
  description = "Environment name (production, staging)"
  type        = string
  default     = "production"
}

variable "railway_token" {
  description = "Railway API token (set via RAILWAY_TOKEN env var)"
  type        = string
  sensitive   = true
}

# GitHub Repository
variable "github_repo" {
  description = "GitHub repository URL"
  type        = string
  default     = "https://github.com/yourorg/sec-audit-repos"
}

variable "github_branch" {
  description = "GitHub branch to deploy"
  type        = string
  default     = "main"
}

# Domain Configuration
variable "custom_domain" {
  description = "Custom domain for the frontend (optional)"
  type        = string
  default     = ""
}

variable "api_domain" {
  description = "Custom domain for the API (optional)"
  type        = string
  default     = ""
}
