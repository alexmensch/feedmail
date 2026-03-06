---
guid: 678B5107-4D52-4613-8409-14234E078BD8
date: 2026-03-06
feature: open-source-packaging
---

#### Feature: Open Source Packaging

Enable anyone to self-host feedmail by separating personal deployment config from the public repo, providing a curl-installable bootstrap script that clones the repo and guides new deployers through interactive setup, and updating the README to reflect the new install and update paths.

#### Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Sanitise `wrangler.toml` | Remove all personal values (`account_id`, `database_id`, worker name, routes, `DOMAIN`, `CHANNELS`). Replace with placeholder strings and comments that make intent clear. | `wrangler.toml` contains no real account IDs, database IDs, or personal domains. Placeholders are clearly labelled (e.g. `YOUR_DATABASE_ID`). `account_id` is removed entirely. | |
| 2 | Gitignore `wrangler.prod.toml` | Add `wrangler.prod.toml` to `.gitignore` so personal config is never committed. | `git check-ignore -v wrangler.prod.toml` exits 0. Existing `.gitignore` is otherwise unchanged. | |
| 3 | Update deploy scripts | `pnpm run deploy` and `pnpm run build:check` pass `--config wrangler.prod.toml` to wrangler. | Both commands pass `--config wrangler.prod.toml` to wrangler. If `wrangler.prod.toml` is missing, wrangler exits with a clear error. | |
| 4 | `install.sh` prerequisite checks | Verify `git`, `node` (v18+), `pnpm`, and `wrangler` are installed; verify the user is authenticated via `wrangler whoami`. | Each check prints a result. Any failure prints the tool name and a one-line install hint, then exits 1. | `wrangler` not authenticated: exit with message directing user to run `wrangler login`. `node` below v18: exit with version requirement message. |
| 5 | `install.sh` clone repository | Prompt for a target directory (default: `./feedmail`). Clone the feedmail repo into that directory and run `pnpm install`. | Cloned repo exists at the chosen path. `pnpm install` completes without error. | Target directory already exists: exit 1 with error, no modifications. `pnpm install` failure: exit 1 with error. |
| 6 | `install.sh` hand off to `setup.sh` | After `pnpm install`, execute `scripts/setup.sh` from within the cloned repo directory. | `setup.sh` executes with the working directory set to the cloned repo root. | |
| 7 | `setup.sh` existing config guard | If `wrangler.prod.toml` already exists, prompt: `"wrangler.prod.toml already exists. Overwrite? [y/N]"`. Default is N. | Responding N exits cleanly with no file changes. Responding Y continues setup. | |
| 8 | `setup.sh` collect required config | Prompt for: worker name (default: `feedmail`), domain, channel ID, site name, site URL, from-user (email local part, no `@` or whitespace), from-name, feed name, feed URL. | All fields prompted with a brief description. Empty input for required fields re-prompts. Worker name defaults to `feedmail` on empty input. | `from-user` containing `@` or whitespace: reject and re-prompt with explanation. |
| 9 | `setup.sh` collect optional config | Prompt for reply-to email, company name, and company address — each clearly marked as optional. Pressing Enter skips. | Skipped optional fields are omitted from the generated CHANNELS JSON (not written as empty strings). | |
| 10 | `setup.sh` derive CORS origin | Default `corsOrigins` to the origin of `siteUrl` (scheme + host, no path). User can accept the default or enter a different value. | If `siteUrl` is `https://example.com/writing`, the prompt defaults to `https://example.com`. | Malformed `siteUrl` with no scheme: warn and re-prompt for `siteUrl`. |
| 11 | `setup.sh` create D1 database | Run `wrangler d1 create <worker-name>` and parse the output to extract `database_id`. | `database_id` is extracted and available for `wrangler.prod.toml` generation. | Database name already exists: print error explaining the conflict, exit 1 with instruction to delete the existing database or choose a different worker name. |
| 12 | `setup.sh` write `wrangler.prod.toml` | Generate `wrangler.prod.toml` from all collected values. Include a commented-out `[[routes]]` example section. | File is syntactically valid TOML. All required fields are present. Optional fields are only written if provided. The `[[routes]]` section is commented out by default. | |
| 13 | `setup.sh` set secrets | Run `wrangler secret put RESEND_API_KEY` and `wrangler secret put ADMIN_API_KEY` with `--config wrangler.prod.toml`. | Both secrets are set successfully. Either failing exits 1 with an error message. | |
| 14 | `setup.sh` run migrations | Run D1 migrations against the production database using `--config wrangler.prod.toml`. | Migrations complete without error. | Failure: print wrangler error output and exit 1. |
| 15 | `setup.sh` optional deploy | Prompt: `"Deploy now? [Y/n]"` (default Y). If Y, run `wrangler deploy --config wrangler.prod.toml` and print the deployment URL from output. | Responding N exits cleanly with a reminder of the deploy command. Responding Y deploys and prints a success message with the URL. | Deploy failure: print wrangler error output and exit 1. |
| 16 | README: curl install as primary path | Quick Start section opens with the curl install command as the recommended path. Command is the raw GitHub URL to `scripts/install.sh`. | The curl command is the first actionable instruction in Quick Start. It is accurate and points to the correct raw file URL. | |
| 17 | README: manual setup as secondary path | The existing manual step-by-step setup is retained but moved to an "Advanced / Manual Setup" section. Steps are updated to reflect the `wrangler.prod.toml` workflow. | Manual steps are accurate and reference `wrangler.prod.toml`, not the old direct `wrangler.toml` edit flow. | |
| 18 | README: Resend domain verification note | Prerequisites section notes that Resend requires domain verification before emails can be sent from a custom domain. | Note is present in Prerequisites with a reference to Resend documentation. | |
| 19 | README: updating feedmail section | A short section explains how to pull upstream updates: `git pull origin master` → `pnpm install` → `pnpm run deploy`. Notes that `wrangler.prod.toml` is gitignored so personal config is never affected by updates. | Section is present with the exact commands needed to update. | |

#### Out of scope

- Multi-channel configuration in the setup script — user edits `wrangler.prod.toml` manually for additional channels
- Multiple feeds per channel during setup — one feed collected; user adds more manually
- Windows / PowerShell support — `install.sh` and `setup.sh` are bash scripts targeting macOS and Linux only
- Automatic `[[routes]]` configuration — complex and domain-setup-specific; left as a documented manual step
- GitHub Actions or CI/CD pipeline integration
- GitHub Template Repository configuration — a manual step the repo owner performs in GitHub settings; not a code change
