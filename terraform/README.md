# feedmail Terraform

Provisions feedmail infrastructure on Cloudflare and Resend. Worker deployment is handled separately via `pnpm run upgrade`.

## What it creates

- **Cloudflare D1 database**
- **Resend sending domain** with a scoped (sending-only) API key
- **Cloudflare DNS records** for Resend domain verification (DKIM, SPF TXT, SPF MX)
- **Random admin API key** (32-char alphanumeric)
- **Wrangler config files** (`wrangler.prod.toml` and `wrangler.admin.prod.toml`) with all IDs and bindings populated

## Prerequisites

- Terraform >= 1.5
- A Cloudflare API token with Workers, D1, and DNS edit permissions
- A Resend API key with `full_access` permission (needed to create domains and API keys)
- The Cloudflare zone must already exist

## Usage

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
# Fill in terraform.tfvars with your values

terraform init
terraform apply
```

## After apply

```bash
# 1. Deploy workers and run migrations
cd ..
pnpm run upgrade

# 2. Seed credentials into D1
terraform -chdir=terraform output -raw seed_credentials_command | bash

# 3. Wait for Resend domain DNS verification to propagate
```

The `seed_credentials_command` output inserts `admin_email`, `admin_api_key`, and `resend_api_key` into the D1 `credentials` table. To view the generated secrets:

```bash
terraform -chdir=terraform output resend_api_key_token
terraform -chdir=terraform output admin_api_key
```
