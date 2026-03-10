output "d1_database_id" {
  description = "D1 database ID"
  value       = local.d1_database_id
}

output "d1_database_name" {
  description = "D1 database name"
  value       = var.worker_name
}

output "resend_domain_id" {
  description = "Resend domain ID"
  value       = resend_domain.staging.id
}

output "resend_domain_status" {
  description = "Resend domain verification status"
  value       = resend_domain.staging.status
}

output "resend_api_key_id" {
  description = "Resend scoped API key ID"
  value       = resend_api_key.staging.id
}

output "resend_api_key_token" {
  description = "Resend scoped API key token (only available at creation)"
  value       = resend_api_key.staging.token
  sensitive   = true
}

output "admin_api_key" {
  description = "Generated admin API key"
  value       = random_password.admin_api_key.result
  sensitive   = true
}

output "seed_credentials_command" {
  description = "Run this wrangler command to seed credentials into D1 after first deploy"
  sensitive   = true
  value       = <<-CMD
    pnpm exec wrangler d1 execute ${var.worker_name} --remote --config wrangler.prod.toml --command \
      "INSERT OR REPLACE INTO credentials (key, value) VALUES
        ('admin_email', '${var.admin_email}'),
        ('admin_api_key', '${random_password.admin_api_key.result}'),
        ('resend_api_key', '${resend_api_key.staging.token}');"
  CMD
}

output "next_steps" {
  description = "Steps to complete after terraform apply (run from repo root)"
  value       = <<-STEPS
    1. Deploy and seed:   cd .. && pnpm run upgrade && terraform -chdir=terraform output -raw seed_credentials_command | bash
    2. Verify Resend domain (DNS propagation may take a few minutes): https://resend.com/domains/${resend_domain.staging.id}
  STEPS
}
