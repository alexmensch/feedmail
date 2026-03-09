# Feature Requirements

## Metadata

| Field   | Value                                  |
| ------- | -------------------------------------- |
| GUID    | `F4E2A891-6C3D-4B7F-A852-9D1E0F3C6B48` |
| Date    | 2026-03-09                             |
| Feature | one-line-deploy                        |
| Status  | Placeholder                            |

---

#### Feature: One-Line Deploy

Replace the current interactive shell-based install and setup scripts with a single-command deployment experience that reliably handles all Cloudflare infrastructure provisioning, secret management, worker interdependencies, and initial configuration.

---

## Context

The existing `install.sh` and `setup.sh` scripts are functional but brittle. They rely on interactive prompts, are not idempotent, and cannot gracefully recover from partial failures. For a product whose core pitch is "simpler than Listmonk to deploy," the deployment experience needs to match the promise. This feature is sequenced before subscribe widgets because reliable deployment is the foundation that makes distribution content compelling — a blog post walking someone through setup needs to work flawlessly.

---

## Approaches Under Consideration

This feature has not been through the define-feature process yet. The following approaches were discussed during roadmap planning and should be evaluated:

1. **Cloudflare Deploy Button** — One-click browser-based deploy from GitHub. No CLI required. Cloudflare supports "Deploy to Workers" buttons that can provision workers directly. Lowest friction option for new users.

2. **GitHub template repository with Actions deploys** — Users fork a template repo, fill in configuration, and GitHub Actions handles deployment. Common pattern in the SSG ecosystem. Worth investigating whether this pattern supports clean updates from the source repo (e.g., via upstream merges).

3. **Terraform module** — Declarative Cloudflare Terraform configuration. Users run `terraform apply`. Handles all dependencies, idempotent, rerunnable. Strong fit for users already using Terraform for Cloudflare configuration. Adds a toolchain dependency.

4. **Hardened setup script** — Make the existing approach idempotent, resumable, and less dependent on shell environment specifics. Less ambitious but potentially sufficient if the fundamental approach (CLI-based interactive setup) is acceptable.

---

## Next Step

Run this feature through `define-feature` to evaluate approaches, define requirements, and produce a full specification.
