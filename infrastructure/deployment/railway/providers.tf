terraform {
  required_version = ">= 1.5.0"

  required_providers {
    railway = {
      source  = "terraform-community-providers/railway"
      version = "~> 0.3"
    }
  }

  # Optional: Configure remote state backend
  # backend "s3" {
  #   bucket = "your-terraform-state-bucket"
  #   key    = "railway/sec-audit/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

provider "railway" {
  # Set RAILWAY_API_TOKEN environment variable
  # Or use: token = var.railway_api_token
}
