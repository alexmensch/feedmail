# ---------------------------------------------------------------------------
# Data sources
# ---------------------------------------------------------------------------

data "cloudflare_zone" "feedmail" {
  filter = {
    name = var.zone_name
  }
}

# ---------------------------------------------------------------------------
# D1 Database
# ---------------------------------------------------------------------------
# Created via wrangler CLI due to Cloudflare provider v5 bug:
# https://github.com/cloudflare/terraform-provider-cloudflare/issues/6309

resource "terraform_data" "d1_database" {
  input = {
    worker_name = var.worker_name
    module_path = abspath(path.module)
    repo_root   = abspath(var.repo_root)
  }

  provisioner "local-exec" {
    command = "${abspath(path.module)}/create-d1.sh ${var.worker_name} ${abspath(path.module)}/d1_output.txt ${abspath(var.repo_root)}"
  }

  provisioner "local-exec" {
    when    = destroy
    command = "${self.input.module_path}/delete-d1.sh ${self.input.worker_name} ${self.input.module_path}/d1_output.txt ${self.input.repo_root}"
  }
}

data "local_file" "d1_output" {
  filename   = "${path.module}/d1_output.txt"
  depends_on = [terraform_data.d1_database]
}

locals {
  d1_database_id  = trimspace(data.local_file.d1_output.content)
  domain_is_zone  = var.domain == var.zone_name
  domain_is_child = endswith(var.domain, ".${var.zone_name}")
  subdomain       = local.domain_is_zone ? "" : trimsuffix(var.domain, ".${var.zone_name}")
}

check "domain_zone_match" {
  assert {
    condition     = local.domain_is_zone || local.domain_is_child
    error_message = "var.domain (${var.domain}) must equal or be a subdomain of var.zone_name (${var.zone_name})"
  }
}

# ---------------------------------------------------------------------------
# Resend — sending domain + scoped API key
# ---------------------------------------------------------------------------

resource "resend_domain" "staging" {
  name   = var.domain
  region = var.resend_region
}

resource "resend_api_key" "staging" {
  name       = "${var.worker_name}-sending"
  permission = "sending_access"
  domain_id  = resend_domain.staging.id
}

# ---------------------------------------------------------------------------
# Cloudflare DNS — Resend verification records
# ---------------------------------------------------------------------------

# DKIM record (Resend returns 1 DKIM record per domain)
resource "cloudflare_dns_record" "resend_dkim" {
  zone_id = data.cloudflare_zone.feedmail.zone_id
  type    = resend_domain.staging.dkim_records[0].type
  name    = resend_domain.staging.dkim_records[0].name
  content = resend_domain.staging.dkim_records[0].value
  ttl     = resend_domain.staging.dkim_records[0].ttl == "Auto" ? 1 : tonumber(resend_domain.staging.dkim_records[0].ttl)
  proxied = false
}

# SPF TXT record
resource "cloudflare_dns_record" "resend_spf_txt" {
  zone_id = data.cloudflare_zone.feedmail.zone_id
  type    = resend_domain.staging.spf_txt_record.type
  name    = resend_domain.staging.spf_txt_record.name
  content = resend_domain.staging.spf_txt_record.value
  ttl     = resend_domain.staging.spf_txt_record.ttl == "Auto" ? 1 : tonumber(resend_domain.staging.spf_txt_record.ttl)
  proxied = false
}

# SPF MX record
resource "cloudflare_dns_record" "resend_spf_mx" {
  zone_id  = data.cloudflare_zone.feedmail.zone_id
  type     = resend_domain.staging.spf_mx_record.type
  name     = resend_domain.staging.spf_mx_record.name
  content  = resend_domain.staging.spf_mx_record.value
  priority = resend_domain.staging.spf_mx_record.priority == "" ? null : tonumber(resend_domain.staging.spf_mx_record.priority)
  ttl      = resend_domain.staging.spf_mx_record.ttl == "Auto" ? 1 : tonumber(resend_domain.staging.spf_mx_record.ttl)
  proxied  = false
}

# ---------------------------------------------------------------------------
# Cloudflare DNS — Worker proxy records (subdomain deployments only)
# ---------------------------------------------------------------------------

resource "cloudflare_dns_record" "worker_a" {
  count   = local.subdomain != "" ? 1 : 0
  zone_id = data.cloudflare_zone.feedmail.zone_id
  type    = "A"
  name    = local.subdomain
  content = "192.0.2.1"
  ttl     = 1
  proxied = true
}

resource "cloudflare_dns_record" "worker_aaaa" {
  count   = local.subdomain != "" ? 1 : 0
  zone_id = data.cloudflare_zone.feedmail.zone_id
  type    = "AAAA"
  name    = local.subdomain
  content = "100::"
  ttl     = 1
  proxied = true
}

# ---------------------------------------------------------------------------
# Admin API key (random, stored in D1 via seed script)
# ---------------------------------------------------------------------------

resource "random_password" "admin_api_key" {
  length  = 32
  special = false
}

# ---------------------------------------------------------------------------
# Wrangler config files
# ---------------------------------------------------------------------------

resource "local_file" "wrangler_prod" {
  filename = "${var.repo_root}/wrangler.prod.toml"
  content  = <<-TOML
    name = "${var.worker_name}"
    main = "src/api/worker.js"
    compatibility_date = "2026-02-27"
    compatibility_flags = ["nodejs_compat"]
    upload_source_maps = true
    workers_dev = true
    preview_urls = false

    [build]
    command = "node scripts/precompile-templates.mjs"

    [triggers]
    crons = ["0 */6 * * *"]

    [[d1_databases]]
    binding = "DB"
    database_name = "${var.worker_name}"
    database_id = "${local.d1_database_id}"

    [[routes]]
    pattern = "${var.domain}/api/*"
    zone_name = "${var.zone_name}"

    [vars]
    DOMAIN = "${var.domain}"

    [observability.logs]
    enabled = true
  TOML
}

resource "local_file" "wrangler_admin_prod" {
  filename = "${var.repo_root}/wrangler.admin.prod.toml"
  content  = <<-TOML
    name = "${var.worker_name}-admin"
    main = "src/admin/worker.js"
    compatibility_date = "2026-02-27"
    compatibility_flags = ["nodejs_compat"]
    upload_source_maps = true
    workers_dev = true
    preview_urls = false

    [build]
    command = "node scripts/precompile-templates.mjs"

    [[d1_databases]]
    binding = "DB"
    database_name = "${var.worker_name}"
    database_id = "${local.d1_database_id}"

    [[routes]]
    pattern = "${var.domain}/admin*"
    zone_name = "${var.zone_name}"

    [[services]]
    binding = "API_SERVICE"
    service = "${var.worker_name}"

    [vars]
    DOMAIN = "${var.domain}"

    [observability.logs]
    enabled = true
  TOML
}
