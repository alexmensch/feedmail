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

resource "cloudflare_d1_database" "feedmail" {
  account_id = var.cloudflare_account_id
  name       = var.worker_name
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

# DKIM CNAME records (Resend typically returns 3)
resource "cloudflare_dns_record" "resend_dkim" {
  count   = length(resend_domain.staging.dkim_records)
  zone_id = data.cloudflare_zone.feedmail.zone_id
  type    = resend_domain.staging.dkim_records[count.index].type
  name    = resend_domain.staging.dkim_records[count.index].name
  content = resend_domain.staging.dkim_records[count.index].value
  ttl     = tonumber(resend_domain.staging.dkim_records[count.index].ttl)
  proxied = false
}

# SPF TXT record
resource "cloudflare_dns_record" "resend_spf_txt" {
  zone_id = data.cloudflare_zone.feedmail.zone_id
  type    = resend_domain.staging.spf_txt_record.type
  name    = resend_domain.staging.spf_txt_record.name
  content = resend_domain.staging.spf_txt_record.value
  ttl     = tonumber(resend_domain.staging.spf_txt_record.ttl)
  proxied = false
}

# SPF MX record
resource "cloudflare_dns_record" "resend_spf_mx" {
  zone_id  = data.cloudflare_zone.feedmail.zone_id
  type     = resend_domain.staging.spf_mx_record.type
  name     = resend_domain.staging.spf_mx_record.name
  content  = resend_domain.staging.spf_mx_record.value
  priority = tonumber(resend_domain.staging.spf_mx_record.priority)
  ttl      = tonumber(resend_domain.staging.spf_mx_record.ttl)
  proxied  = false
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
    database_id = "${cloudflare_d1_database.feedmail.id}"

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
    database_id = "${cloudflare_d1_database.feedmail.id}"

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
