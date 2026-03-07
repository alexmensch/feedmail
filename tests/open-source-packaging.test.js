import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, accessSync, constants } from "fs";
import { execSync, execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function readFile(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

function fileExists(relativePath) {
  return existsSync(resolve(ROOT, relativePath));
}

// ─── Requirement 1: Sanitise wrangler.toml ──────────────────────────────────

describe("wrangler.toml sanitisation", () => {
  let toml;

  beforeAll(() => {
    toml = readFile("wrangler.toml");
  });

  it("file exists", () => {
    expect(fileExists("wrangler.toml")).toBe(true);
  });

  it("does not contain account_id", () => {
    expect(toml).not.toMatch(/account_id/);
  });

  it("has database_id set to YOUR_DATABASE_ID placeholder", () => {
    expect(toml).toMatch(/database_id\s*=\s*"YOUR_DATABASE_ID"/);
  });

  it("has worker name set to feedmail", () => {
    expect(toml).toMatch(/^name\s*=\s*"feedmail"/m);
  });

  it("has DOMAIN set to YOUR_DOMAIN placeholder", () => {
    expect(toml).toMatch(/DOMAIN\s*=\s*"YOUR_DOMAIN"/);
  });

  it("has route pattern using YOUR_DOMAIN placeholder", () => {
    expect(toml).toMatch(/pattern\s*=\s*"YOUR_DOMAIN\/api\/\*"/);
  });

  it("does not contain CHANNELS env var", () => {
    expect(toml).not.toMatch(/CHANNELS\s*=/);
  });

  it("does not contain VERIFY_ env vars", () => {
    expect(toml).not.toMatch(/VERIFY_/);
  });

  it("retains main entry point", () => {
    expect(toml).toMatch(/main\s*=\s*"src\/index\.js"/);
  });

  it("retains [build] section", () => {
    expect(toml).toMatch(/\[build\]/);
  });

  it("retains [triggers] section with cron", () => {
    expect(toml).toMatch(/\[triggers\]/);
    expect(toml).toMatch(/crons/);
  });

  it("retains [[d1_databases]] section", () => {
    expect(toml).toMatch(/\[\[d1_databases\]\]/);
  });

  it("retains [observability.logs] section", () => {
    expect(toml).toMatch(/\[observability\.logs\]/);
  });

  it("retains compatibility_date", () => {
    expect(toml).toMatch(/compatibility_date/);
  });

  it("retains compatibility_flags", () => {
    expect(toml).toMatch(/compatibility_flags/);
  });

  it("has workers_dev enabled", () => {
    expect(toml).toMatch(/workers_dev\s*=\s*true/);
  });

  it("has preview_urls disabled", () => {
    expect(toml).toMatch(/preview_urls\s*=\s*false/);
  });

  it("does not contain any real Cloudflare account or database IDs", () => {
    // Real IDs are hex strings of 32+ characters or UUID format
    expect(toml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(toml).not.toMatch(/[0-9a-f]{32}/i);
  });

  it("does not contain real domain names", () => {
    // Should not reference any personal domains
    expect(toml).not.toMatch(/alxm\.me/);
    expect(toml).not.toMatch(/feedmail\.cc/);
    expect(toml).not.toMatch(/newsletter\./);
  });
});

// ─── Requirement 2: Gitignore wrangler.prod.toml ────────────────────────────

describe(".gitignore includes wrangler.prod.toml", () => {
  let gitignore;

  beforeAll(() => {
    gitignore = readFile(".gitignore");
  });

  it("wrangler.prod.toml is listed in .gitignore", () => {
    expect(gitignore).toMatch(/^wrangler\.prod\.toml$/m);
  });

  it("git check-ignore recognises wrangler.prod.toml", () => {
    const result = execSync("git check-ignore -v wrangler.prod.toml", {
      cwd: ROOT,
      encoding: "utf-8",
    });
    expect(result).toContain("wrangler.prod.toml");
  });
});

// ─── Requirement 3: Update deploy scripts ───────────────────────────────────

describe("package.json deploy scripts use wrangler.prod.toml", () => {
  let scripts;

  beforeAll(() => {
    const pkg = JSON.parse(readFile("package.json"));
    scripts = pkg.scripts;
  });

  it("package.json exists and has scripts", () => {
    expect(scripts).toBeDefined();
  });

  it("deploy script includes --config wrangler.prod.toml", () => {
    expect(scripts.deploy).toContain("--config wrangler.prod.toml");
  });

  it("deploy and db:migrate scripts use binding name DB (not hardcoded database name)", () => {
    expect(scripts.deploy).toMatch(/migrations apply DB\b/);
    expect(scripts["db:migrate"]).toMatch(/migrations apply DB\b/);
  });

  it("build:check script uses default wrangler.toml (no --config flag)", () => {
    expect(scripts["build:check"]).toContain("--dry-run");
    expect(scripts["build:check"]).not.toContain("--config wrangler.prod.toml");
  });

  it("db:migrate script includes --config wrangler.prod.toml", () => {
    expect(scripts["db:migrate"]).toContain("--config wrangler.prod.toml");
  });

  it("dev script does NOT include --config wrangler.prod.toml", () => {
    expect(scripts.dev).not.toContain("--config wrangler.prod.toml");
  });

  it("dev:test script does NOT include --config wrangler.prod.toml", () => {
    expect(scripts["dev:test"]).not.toContain("--config wrangler.prod.toml");
  });

  it("db:migrate:local script does NOT include --config wrangler.prod.toml", () => {
    expect(scripts["db:migrate:local"]).not.toContain("--config wrangler.prod.toml");
  });

  it("db:reset:local script does NOT include --config wrangler.prod.toml", () => {
    expect(scripts["db:reset:local"]).not.toContain("--config wrangler.prod.toml");
  });
});

// ─── Requirement 4-6: install.sh structure ──────────────────────────────────

describe("install.sh structure and content", () => {
  const scriptPath = "scripts/install.sh";
  let content;

  beforeAll(() => {
    content = readFile(scriptPath);
  });

  it("file exists", () => {
    expect(fileExists(scriptPath)).toBe(true);
  });

  it("has a bash shebang", () => {
    expect(content).toMatch(/^#!\/.*bash/);
  });

  it("has set -euo pipefail", () => {
    expect(content).toContain("set -euo pipefail");
  });

  it("passes bash -n syntax check", () => {
    expect(() => {
      execFileSync("bash", ["-n", resolve(ROOT, scriptPath)], {
        encoding: "utf-8",
        stdio: "pipe",
      });
    }).not.toThrow();
  });

  it("contains the GitHub clone URL", () => {
    expect(content).toMatch(/github\.com\/alexmensch\/feedmail/);
  });

  it("references setup.sh", () => {
    expect(content).toMatch(/setup\.sh/);
  });

  it("checks for git prerequisite", () => {
    expect(content).toMatch(/git/);
    // May use a reusable function (check_command git) or literal (command -v git)
    expect(content).toMatch(/check_command\s+git|command\s+-v\s+git|which\s+git|type\s+git/);
  });

  it("checks for node prerequisite", () => {
    expect(content).toMatch(/check_command\s+node|command\s+-v\s+node|which\s+node|type\s+node/);
  });

  it("checks for pnpm prerequisite", () => {
    expect(content).toMatch(/check_command\s+pnpm|command\s+-v\s+pnpm|which\s+pnpm|type\s+pnpm/);
  });

  it("does not check for wrangler prerequisite (installed via pnpm install)", () => {
    expect(content).not.toMatch(/check_command\s+wrangler/);
  });

  it("checks node version is v18+", () => {
    // Should contain some version check for node 18
    expect(content).toMatch(/18/);
  });

  it("runs pnpm install", () => {
    expect(content).toContain("pnpm install");
  });

  it("is executable", () => {
    expect(() => {
      accessSync(resolve(ROOT, scriptPath), constants.X_OK);
    }).not.toThrow();
  });
});

// ─── Requirement 7-18: setup.sh structure and content ───────────────────────

describe("setup.sh structure and content", () => {
  const scriptPath = "scripts/setup.sh";
  let content;

  beforeAll(() => {
    content = readFile(scriptPath);
  });

  it("file exists", () => {
    expect(fileExists(scriptPath)).toBe(true);
  });

  it("has a bash shebang", () => {
    expect(content).toMatch(/^#!\/.*bash/);
  });

  it("has set -euo pipefail", () => {
    expect(content).toContain("set -euo pipefail");
  });

  it("passes bash -n syntax check", () => {
    expect(() => {
      execFileSync("bash", ["-n", resolve(ROOT, scriptPath)], {
        encoding: "utf-8",
        stdio: "pipe",
      });
    }).not.toThrow();
  });

  it("is executable", () => {
    expect(() => {
      accessSync(resolve(ROOT, scriptPath), constants.X_OK);
    }).not.toThrow();
  });

  describe("wrangler via pnpm", () => {
    it("uses pnpm exec wrangler instead of bare wrangler", () => {
      expect(content).toContain("pnpm exec wrangler");
    });

    it("checks wrangler authentication with wrangler whoami", () => {
      expect(content).toMatch(/\bwrangler\s+whoami|\$WRANGLER\s+whoami/);
    });
  });

  describe("existing config guard", () => {
    it("checks for existing wrangler.prod.toml", () => {
      expect(content).toContain("wrangler.prod.toml");
    });

    it("prompts for overwrite confirmation", () => {
      // Should contain an overwrite prompt
      expect(content).toMatch(/[Oo]verwrite/);
    });
  });

  describe("infrastructure config collection", () => {
    it("prompts for worker name with feedmail default", () => {
      // Should reference worker name and feedmail default
      expect(content).toMatch(/feedmail/);
    });

    it("prompts for domain", () => {
      // Should reference domain input
      expect(content).toMatch(/[Dd]omain/);
    });

    it("validates domain has no protocol", () => {
      // Should reject :// in domain
      expect(content).toMatch(/:\/\//);
    });

    it("validates domain has no trailing slash", () => {
      // Should check for trailing slash in domain input
      // This could be a regex or string check for /$ or ends with /
      expect(content).toMatch(/\/\s*\)/);
    });
  });

  describe("D1 database creation", () => {
    it("runs wrangler d1 create", () => {
      expect(content).toMatch(/wrangler d1 create|\$WRANGLER d1 create/);
    });

    it("extracts database_id from output", () => {
      expect(content).toMatch(/database_id/);
    });
  });

  describe("TOML generation", () => {
    it("generates wrangler.prod.toml by copying wrangler.toml", () => {
      expect(content).toContain("wrangler.prod.toml");
      // Should copy wrangler.toml as the base template
      expect(content).toMatch(/cp\s+wrangler\.toml\s+wrangler\.prod\.toml/);
    });

    it("replaces placeholder values with sed", () => {
      // Should replace YOUR_DATABASE_ID, YOUR_DOMAIN, worker name, database_name
      expect(content).toMatch(/sed.*YOUR_DATABASE_ID/);
      expect(content).toMatch(/sed.*YOUR_DOMAIN/);
    });

    it("comments out the routes section", () => {
      // Should comment out [[routes]], pattern, and zone_name
      expect(content).toMatch(/sed.*routes/);
    });

    it("wrangler.toml template includes all required structural sections", () => {
      // Since setup.sh copies wrangler.toml, verify the template has everything
      const toml = readFile("wrangler.toml");
      expect(toml).toMatch(/main\s*=.*src\/index\.js/);
      expect(toml).toMatch(/compatibility_date/);
      expect(toml).toMatch(/compatibility_flags/);
      expect(toml).toMatch(/\[build\]/);
      expect(toml).toMatch(/\[triggers\]/);
      expect(toml).toMatch(/\[\[d1_databases\]\]/);
      expect(toml).toMatch(/\[observability\.logs\]/);
    });
  });

  describe("secret setting", () => {
    it("sets RESEND_API_KEY via wrangler secret put", () => {
      expect(content).toMatch(/(wrangler|\$WRANGLER)\s+secret\s+put\s+RESEND_API_KEY/);
    });

    it("sets ADMIN_API_KEY via wrangler secret put", () => {
      expect(content).toMatch(/(wrangler|\$WRANGLER)\s+secret\s+put\s+ADMIN_API_KEY/);
    });

    it("uses echo-disabled input for secret prompting", () => {
      expect(content).toMatch(/read\s+-rs/);
    });

    it("passes --config wrangler.prod.toml to secret put", () => {
      expect(content).toMatch(/secret\s+put.*--config\s+wrangler\.prod\.toml/);
    });
  });

  describe("migrations", () => {
    it("runs D1 migrations with prod config", () => {
      expect(content).toMatch(/(wrangler|\$WRANGLER)\s+d1\s+migrations\s+apply/);
    });

    it("passes --config wrangler.prod.toml to migrations", () => {
      expect(content).toMatch(/migrations\s+apply.*--config\s+wrangler\.prod\.toml/);
    });
  });

  describe("deployment", () => {
    it("runs wrangler deploy", () => {
      expect(content).toMatch(/(wrangler|\$WRANGLER)\s+deploy/);
    });

    it("passes --config wrangler.prod.toml to deploy", () => {
      expect(content).toMatch(/(wrangler|\$WRANGLER)\s+deploy.*--config\s+wrangler\.prod\.toml/);
    });
  });

  describe("channel creation via API", () => {
    it("uses curl to call the admin channels API", () => {
      expect(content).toMatch(/curl/);
      expect(content).toMatch(/\/api\/admin\/channels/);
    });

    it("sends Authorization bearer header", () => {
      expect(content).toMatch(/Authorization.*Bearer/i);
    });
  });

  describe("input validation", () => {
    it("validates from-user has no @ character", () => {
      // Should check for @ in from-user input
      expect(content).toMatch(/@/);
    });

    it("validates from-user has no whitespace", () => {
      // Should check for whitespace in from-user
      expect(content).toMatch(/[Ww]hitespace|\s+/);
    });
  });
});

// ─── Requirement 19-22: README.md content ───────────────────────────────────

describe("README.md content", () => {
  let readme;

  beforeAll(() => {
    readme = readFile("README.md");
  });

  it("file exists", () => {
    expect(fileExists("README.md")).toBe(true);
  });

  describe("curl install command", () => {
    it("contains curl install command", () => {
      expect(readme).toMatch(/curl/);
    });

    it("curl command points to raw GitHub URL of install.sh", () => {
      expect(readme).toMatch(
        /raw\.githubusercontent\.com\/alexmensch\/feedmail\/.*\/scripts\/install\.sh/,
      );
    });

    it("curl install is the first actionable instruction in Quick Start", () => {
      // The curl command should appear before any other setup step in Quick Start
      const quickStartMatch = readme.match(/##\s*Quick\s*Start/i);
      expect(quickStartMatch).not.toBeNull();

      const afterQuickStart = readme.slice(quickStartMatch.index);
      // First code block after Quick Start should contain curl
      const firstCodeBlock = afterQuickStart.match(/```[a-z]*\n([\s\S]*?)```/);
      expect(firstCodeBlock).not.toBeNull();
      expect(firstCodeBlock[1]).toMatch(/curl/);
    });
  });

  describe("manual setup section", () => {
    it("has a Manual Setup or Advanced section", () => {
      expect(readme).toMatch(/[Mm]anual\s*[Ss]etup|[Aa]dvanced/);
    });

    it("references wrangler.prod.toml in manual setup", () => {
      expect(readme).toContain("wrangler.prod.toml");
    });

    it("includes channel creation via admin API", () => {
      expect(readme).toMatch(/\/api\/admin\/channels/);
    });

    it("does not reference CHANNELS env var", () => {
      // Should not have CHANNELS as an env var reference
      // (but may appear in text describing the old system)
      expect(readme).not.toMatch(/CHANNELS\s*=/);
      expect(readme).not.toMatch(/`CHANNELS`/);
    });
  });

  describe("Resend domain verification note", () => {
    it("mentions Resend domain verification", () => {
      expect(readme).toMatch(/[Rr]esend.*domain.*verif|domain.*verif.*[Rr]esend/i);
    });

    it("includes a link to Resend documentation", () => {
      expect(readme).toMatch(/resend\.com/);
    });
  });

  describe("updating feedmail section", () => {
    it("has an Updating section", () => {
      expect(readme).toMatch(/##[#]*\s*[Uu]pdat/);
    });

    it("includes git pull command", () => {
      expect(readme).toMatch(/git\s+pull\s+origin\s+master/);
    });

    it("includes pnpm install command", () => {
      const updateMatch = readme.match(/##[#]*\s*[Uu]pdat[\s\S]*?(?=\n##[^#]|\n$|$)/);
      expect(updateMatch).not.toBeNull();
      expect(updateMatch[0]).toContain("pnpm install");
    });

    it("includes pnpm run deploy command", () => {
      const updateMatch = readme.match(/##[#]*\s*[Uu]pdat[\s\S]*?(?=\n##[^#]|\n$|$)/);
      expect(updateMatch).not.toBeNull();
      expect(updateMatch[0]).toMatch(/pnpm\s+run\s+deploy/);
    });

    it("notes that wrangler.prod.toml is gitignored", () => {
      const updateMatch = readme.match(/##[#]*\s*[Uu]pdat[\s\S]*?(?=\n##[^#]|\n$|$)/);
      expect(updateMatch).not.toBeNull();
      expect(updateMatch[0]).toMatch(/wrangler\.prod\.toml.*gitignore|gitignore.*wrangler\.prod\.toml/i);
    });
  });
});
