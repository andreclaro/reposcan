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

variable "railway_api_token" {
  description = "Railway API token (set via RAILWAY_API_TOKEN env var)"
  type        = string
  sensitive   = true
}

# Database Configuration
variable "postgres_plan" {
  description = "Railway plan for PostgreSQL"
  type        = string
  default     = "free" # Options: free, starter, pro
}

variable "redis_plan" {
  description = "Railway plan for Redis"
  type        = string
  default     = "free" # Options: free, starter, pro
}

# API Service Configuration
variable "api_memory" {
  description = "Memory allocation for API service (in MB)"
  type        = string
  default     = "1Gi"
}

variable "api_cpu" {
  description = "CPU allocation for API service"
  type        = number
  default     = 1
}

variable "api_replicas" {
  description = "Number of API replicas"
  type        = number
  default     = 1
}

# Worker Service Configuration
variable "worker_memory" {
  description = "Memory allocation for Worker service (in MB)"
  type        = string
  default     = "4Gi"
}

variable "worker_cpu" {
  description = "CPU allocation for Worker service"
  type        = number
  default     = 2
}

# Frontend Service Configuration
variable "frontend_memory" {
  description = "Memory allocation for Frontend service"
  type        = string
  default     = "1Gi"
}

variable "frontend_cpu" {
  description = "CPU allocation for Frontend service"
  type        = number
  default     = 1
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
