# feedmail Terraform

Provisions feedmail infrastructure on Cloudflare and Resend. Worker deployment is handled separately via `pnpm run upgrade`.

## What it creates

- **Cloudflare D1 database** (created via wrangler CLI — see [Known issues](#known-issues))
- **Resend sending domain** with a scoped (sending-only) API key
- **Cloudflare DNS records** for Resend domain verification (DKIM, SPF TXT, SPF MX) and Worker proxy routing (A/AAAA for subdomain deployments)
- **Random admin API key** (32-char alphanumeric)
- **Wrangler config files** (`wrangler.prod.toml` and `wrangler.admin.prod.toml`) with all IDs and bindings populated

## Prerequisites

- **Terraform >= 1.5** — install on macOS with `brew install hashicorp/tap/terraform`
- A Cloudflare API token (see below)
- A Resend API key with `full_access` permission (see below)
- The Cloudflare zone must already exist

### Cloudflare API token

Create the token in the Cloudflare dashboard: **My Profile > API Tokens > Create Token**

Minimum permissions:

- **Account / D1** — Edit
- **Account / Workers Scripts** — Edit (needed by wrangler, not TF, but same token is convenient)
- **Zone / DNS** — Edit
- **Zone scope** — Include your zone (e.g. `feedmail.cc`)

### Resend API key

Terraform creates a sending domain and a scoped API key in Resend, which requires a key with **`full_access`** permission. A `sending_access` key will fail. Create one at **resend.com/api-keys**.

## Usage

```bash
# Install Terraform (macOS)
brew install hashicorp/tap/terraform

cd terraform
cp terraform.tfvars.example terraform.tfvars
# Fill in terraform.tfvars with your values

terraform init
terraform plan     # Review what will be created
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

## Known issues

### D1 database created via wrangler CLI instead of Terraform provider

The `cloudflare_d1_database` resource in the Cloudflare Terraform provider v5 is broken — it sends `null` for `read_replication`, which the API rejects. This is tracked in [cloudflare/terraform-provider-cloudflare#6309](https://github.com/cloudflare/terraform-provider-cloudflare/issues/6309). The fix PR (#6508) was closed without merging because it's blocked on a D1 API-side change by Cloudflare.

As a workaround, D1 creation and deletion are handled by shell scripts (`create-d1.sh`, `delete-d1.sh`) that call `wrangler d1 create/delete` with retry logic. The database ID is written to `d1_output.txt` and read back by Terraform.

**TODO:** Periodically check issue #6309 and the [provider changelog](https://github.com/cloudflare/terraform-provider-cloudflare/releases). Once fixed, replace the `terraform_data` + shell script workaround with the native `cloudflare_d1_database` resource. Last checked: 2026-03-10 (broken through v5.18.0 and v5.19.0-beta.1).
