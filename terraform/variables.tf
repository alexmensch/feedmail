variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers, D1, and DNS permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "resend_api_key" {
  description = "Resend API key (with full_access permission to create domains and API keys)"
  type        = string
  sensitive   = true
}

variable "domain" {
  description = "Base domain for the deployment (e.g. stg.feedmail.cc)"
  type        = string
}

variable "zone_name" {
  description = "Cloudflare zone name (e.g. feedmail.cc)"
  type        = string
}

variable "worker_name" {
  description = "Name prefix for the Workers (e.g. feedmail-stg)"
  type        = string
}

variable "resend_region" {
  description = "AWS region for Resend domain (e.g. us-east-1)"
  type        = string
}

variable "admin_email" {
  description = "Admin email address for the admin console"
  type        = string
}

variable "repo_root" {
  description = "Path to the feedmail repository root, relative to the terraform directory"
  type        = string
}
