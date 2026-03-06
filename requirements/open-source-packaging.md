---
guid: 3C2D77DC-8AB5-439C-B1C8-FB6BB636A83F
date: 2026-03-06
feature: open-source-packaging
---

#### Feature: Open Source Packaging

Enable anyone to self-host feedmail by separating personal deployment config from the public repo, providing a curl-installable bootstrap script that clones the repo and guides new deployers through interactive setup, and updating the README to reflect the new install and update paths. Written assuming db-backed-configuration is implemented first — channel config lives in D1, not wrangler.toml.

#### Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Sanitise `wrangler.toml` | `CHANNELS`, `VERIFY_MAX_ATTEMPTS`, and `VERIFY_WINDOW_HOURS` are absent (db-backed). `account_id` removed entirely. `database_id`, worker name, routes, and `DOMAIN` replaced with labelled placeholders. | No real IDs, domains, or channel config in the file. `account_id` absent. `DOMAIN` has a `YOUR_DOMAIN` placeholder. No `CHANNELS` or `VERIFY_` vars. | — |
| 2 | Gitignore `wrangler.prod.toml` | Add `wrangler.prod.toml` to `.gitignore`. | `git check-ignore -v wrangler.prod.toml` exits 0. Existing `.gitignore` otherwise unchanged. | — |
| 3 | Update deploy scripts | `pnpm run deploy` and `pnpm run build:check` pass `--config wrangler.prod.toml` to wrangler. | Both commands pass the flag. Missing file produces a wrangler error. | — |
| 4 | `install.sh` prerequisite checks | Verify `git`, `node` (v18+), `pnpm`, `wrangler` installed; verify `wrangler whoami` authenticated. | Each check prints its result. Any failure prints tool name and a one-line install hint, exits 1. | `wrangler` not authenticated: exit directing user to `wrangler login`. `node` below v18: exit with version requirement. |
| 5 | `install.sh` clone repository | Prompt for target directory (default: `./feedmail`). Clone repo into that path, run `pnpm install`. | Cloned repo exists at chosen path. `pnpm install` completes without error. | Target directory already exists: exit 1, no modifications. `pnpm install` failure: exit 1. |
| 6 | `install.sh` hand off to `setup.sh` | After `pnpm install`, execute `scripts/setup.sh` from within the cloned repo directory. | `setup.sh` executes with working directory set to repo root. | — |
| 7 | `setup.sh` existing config guard | If `wrangler.prod.toml` already exists, prompt: `"wrangler.prod.toml already exists. Overwrite? [y/N]"`. Default N. | N exits cleanly with no file changes. Y continues setup. | — |
| 8 | `setup.sh` collect infrastructure config | Prompt for worker name (default: `feedmail`) and domain. Domain must be a bare hostname — no protocol, no path, no trailing slash. | Both prompted with descriptions. Worker name defaults to `feedmail`. Domain re-prompts if blank. | Domain containing `://` or a trailing slash: reject and re-prompt with explanation. |
| 9 | `setup.sh` create D1 database | Run `wrangler d1 create <worker-name>` and parse output to extract `database_id`. | `database_id` extracted and available for TOML generation. | Name already exists: print error, exit 1 with instruction to delete or choose a different worker name. |
| 10 | `setup.sh` write `wrangler.prod.toml` | Generate `wrangler.prod.toml` with: worker name, `DOMAIN` env var, D1 binding (`database_name` + `database_id`). Include a commented-out `[[routes]]` example section. No `CHANNELS` or `VERIFY_` vars. | Syntactically valid TOML. All required fields present. Routes section commented out. | — |
| 11 | `setup.sh` set secrets | Prompt for `RESEND_API_KEY` and `ADMIN_API_KEY` with echo disabled. Set both via `wrangler secret put --config wrangler.prod.toml`. Retain the `ADMIN_API_KEY` value in memory for the later API call — user is not prompted again. | Both secrets set via wrangler. `ADMIN_API_KEY` available in memory without re-prompting. | Either `wrangler secret put` failing: exit 1 with error message. |
| 12 | `setup.sh` run migrations | Run D1 migrations with `--config wrangler.prod.toml`. | Migrations complete without error. | Failure: print wrangler error output, exit 1. |
| 13 | `setup.sh` deploy worker | Run `wrangler deploy --config wrangler.prod.toml`. Deployment is mandatory. Parse workers.dev URL from output and store it. Print the deployment URL. | Worker deployed. workers.dev URL extracted from output. | Deploy failure: print wrangler output, exit 1. If workers.dev URL cannot be parsed from output: proceed to URL prompt with no pre-filled default. |
| 14 | `setup.sh` confirm API URL | Prompt: `"API base URL for channel setup [<workers.dev-url>]: "` with the parsed workers.dev URL as default. Empty input uses the default. | The entered or accepted URL is used for all subsequent API calls. | — |
| 15 | `setup.sh` collect required channel config | Prompt for: channel ID, site name, site URL, from-user (email local part), from-name, feed name, feed URL. | All fields prompted with a brief description. Empty input re-prompts. | `from-user` containing `@` or whitespace: reject and re-prompt with explanation. |
| 16 | `setup.sh` collect optional channel config | Prompt for reply-to email, company name, and company address — each marked optional. Enter skips. | Skipped fields are absent from the API payload (not sent as empty strings). | — |
| 17 | `setup.sh` derive CORS origin | Default `corsOrigins` to the origin of `siteUrl` (scheme + host, no path). User can accept or override. | `https://example.com/writing` → default prompt value is `https://example.com`. | Malformed `siteUrl` with no scheme: warn and re-prompt for `siteUrl`. |
| 18 | `setup.sh` create channel via API | POST collected channel + feed config to `<api-url>/api/admin/channels` with `ADMIN_API_KEY` bearer token. | 201 response: print confirmation. | Non-2xx response: print response body and exit 1. |
| 19 | README: curl install as primary path | Quick Start opens with curl command as recommended path, pointing to raw GitHub URL of `scripts/install.sh`. | Curl command is first actionable instruction. URL is accurate. | — |
| 20 | README: manual setup as secondary path | Manual steps moved to "Advanced / Manual Setup". Updated to reflect `wrangler.prod.toml` workflow and API-based channel creation (curl example to POST to admin API). | References `wrangler.prod.toml`. Includes channel creation via admin API. No references to `CHANNELS` env var. | — |
| 21 | README: Resend domain verification note | Prerequisites notes Resend requires domain verification before sending from a custom domain. | Note present with Resend docs reference. | — |
| 22 | README: updating feedmail section | `git pull origin master` → `pnpm install` → `pnpm run deploy`. Notes `wrangler.prod.toml` is gitignored. | Section present with exact commands. | — |

#### Out of scope

- Multi-channel configuration in `setup.sh` — user adds additional channels via the admin API directly
- Multiple feeds per channel in `setup.sh` — one feed collected; user adds more via the admin API
- Windows / PowerShell support
- Automatic `[[routes]]` configuration
- GitHub Actions or CI/CD pipeline integration
- GitHub Template Repository configuration
- Upgrade path for existing deployers (covered by the db-backed-config migration script)
