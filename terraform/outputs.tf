output "d1_database_id" {
  description = "D1 database ID"
  value       = cloudflare_d1_database.feedmail.id
}

output "d1_database_name" {
  description = "D1 database name"
  value       = cloudflare_d1_database.feedmail.name
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
  value       = <<-CMD
    pnpm exec wrangler d1 execute ${var.worker_name} --remote --config wrangler.prod.toml --command \
      "INSERT OR REPLACE INTO credentials (key, value) VALUES
        ('admin_email', '${var.admin_email}'),
        ('admin_api_key', '${random_password.admin_api_key.result}'),
        ('resend_api_key', '${resend_api_key.staging.token}');"
  CMD
}

output "next_steps" {
  description = "Steps to complete after terraform apply"
  value       = <<-STEPS
    1. Deploy workers:    pnpm run upgrade
    2. Seed credentials:  terraform output -raw seed_credentials_command | bash
    3. Verify Resend domain in Resend dashboard (DNS propagation may take a few minutes)
  STEPS
}
