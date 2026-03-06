import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, accessSync, constants } from "fs";
import { execSync } from "child_process";
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

  it("file exists", () => {
    expect(fileExists("wrangler.toml")).toBe(true);
    toml = readFile("wrangler.toml");
  });

  it("does not contain account_id", () => {
    toml = readFile("wrangler.toml");
    expect(toml).not.toMatch(/account_id/);
  });

  it("has database_id set to YOUR_DATABASE_ID placeholder", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/database_id\s*=\s*"YOUR_DATABASE_ID"/);
  });

  it("has worker name set to feedmail", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/^name\s*=\s*"feedmail"/m);
  });

  it("has DOMAIN set to YOUR_DOMAIN placeholder", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/DOMAIN\s*=\s*"YOUR_DOMAIN"/);
  });

  it("has route pattern using YOUR_DOMAIN placeholder", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/pattern\s*=\s*"YOUR_DOMAIN\/api\/\*"/);
  });

  it("does not contain CHANNELS env var", () => {
    toml = readFile("wrangler.toml");
    expect(toml).not.toMatch(/CHANNELS\s*=/);
  });

  it("does not contain VERIFY_ env vars", () => {
    toml = readFile("wrangler.toml");
    expect(toml).not.toMatch(/VERIFY_/);
  });

  it("retains main entry point", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/main\s*=\s*"src\/index\.js"/);
  });

  it("retains [build] section", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/\[build\]/);
  });

  it("retains [triggers] section with cron", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/\[triggers\]/);
    expect(toml).toMatch(/crons/);
  });

  it("retains [[d1_databases]] section", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/\[\[d1_databases\]\]/);
  });

  it("retains [observability.logs] section", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/\[observability\.logs\]/);
  });

  it("retains compatibility_date", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/compatibility_date/);
  });

  it("retains compatibility_flags", () => {
    toml = readFile("wrangler.toml");
    expect(toml).toMatch(/compatibility_flags/);
  });

  it("does not contain any real Cloudflare account or database IDs", () => {
    toml = readFile("wrangler.toml");
    // Real IDs are hex strings of 32+ characters or UUID format
    expect(toml).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(toml).not.toMatch(/[0-9a-f]{32}/i);
  });

  it("does not contain real domain names", () => {
    toml = readFile("wrangler.toml");
    // Should not reference any personal domains
    expect(toml).not.toMatch(/alxm\.me/);
    expect(toml).not.toMatch(/feedmail\.cc/);
    expect(toml).not.toMatch(/newsletter\./);
  });
});

// ─── Requirement 2: Gitignore wrangler.prod.toml ────────────────────────────

describe(".gitignore includes wrangler.prod.toml", () => {
  it("wrangler.prod.toml is listed in .gitignore", () => {
    const gitignore = readFile(".gitignore");
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

  it("package.json exists and has scripts", () => {
    const pkg = JSON.parse(readFile("package.json"));
    scripts = pkg.scripts;
    expect(scripts).toBeDefined();
  });

  it("deploy script includes --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts.deploy).toContain("--config wrangler.prod.toml");
  });

  it("build:check script includes --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts["build:check"]).toContain("--config wrangler.prod.toml");
  });

  it("db:migrate script includes --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts["db:migrate"]).toContain("--config wrangler.prod.toml");
  });

  it("dev script does NOT include --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts.dev).not.toContain("--config wrangler.prod.toml");
  });

  it("dev:test script does NOT include --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts["dev:test"]).not.toContain("--config wrangler.prod.toml");
  });

  it("db:migrate:local script does NOT include --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts["db:migrate:local"]).not.toContain("--config wrangler.prod.toml");
  });

  it("db:reset:local script does NOT include --config wrangler.prod.toml", () => {
    const pkg = JSON.parse(readFile("package.json"));
    expect(pkg.scripts["db:reset:local"]).not.toContain("--config wrangler.prod.toml");
  });
});

// ─── Requirement 4-6: install.sh structure ──────────────────────────────────

describe("install.sh structure and content", () => {
  const scriptPath = "scripts/install.sh";

  it("file exists", () => {
    expect(fileExists(scriptPath)).toBe(true);
  });

  it("has a bash shebang", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/^#!\/.*bash/);
  });

  it("has set -euo pipefail", () => {
    const content = readFile(scriptPath);
    expect(content).toContain("set -euo pipefail");
  });

  it("passes bash -n syntax check", () => {
    expect(() => {
      execSync(`bash -n ${resolve(ROOT, scriptPath)}`, {
        encoding: "utf-8",
        stdio: "pipe",
      });
    }).not.toThrow();
  });

  it("contains the GitHub clone URL", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/github\.com\/alexmensch\/feedmail/);
  });

  it("references setup.sh", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/setup\.sh/);
  });

  it("checks for git prerequisite", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/git/);
    // Should check if git is installed (command -v or which or type)
    expect(content).toMatch(/command\s+-v\s+git|which\s+git|type\s+git/);
  });

  it("checks for node prerequisite", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/command\s+-v\s+node|which\s+node|type\s+node/);
  });

  it("checks for pnpm prerequisite", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/command\s+-v\s+pnpm|which\s+pnpm|type\s+pnpm/);
  });

  it("checks for wrangler prerequisite", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/command\s+-v\s+wrangler|which\s+wrangler|type\s+wrangler/);
  });

  it("checks wrangler authentication with wrangler whoami", () => {
    const content = readFile(scriptPath);
    expect(content).toContain("wrangler whoami");
  });

  it("checks node version is v18+", () => {
    const content = readFile(scriptPath);
    // Should contain some version check for node 18
    expect(content).toMatch(/18/);
  });

  it("runs pnpm install", () => {
    const content = readFile(scriptPath);
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

  it("file exists", () => {
    expect(fileExists(scriptPath)).toBe(true);
  });

  it("has a bash shebang", () => {
    const content = readFile(scriptPath);
    expect(content).toMatch(/^#!\/.*bash/);
  });

  it("has set -euo pipefail", () => {
    const content = readFile(scriptPath);
    expect(content).toContain("set -euo pipefail");
  });

  it("passes bash -n syntax check", () => {
    expect(() => {
      execSync(`bash -n ${resolve(ROOT, scriptPath)}`, {
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

  describe("existing config guard", () => {
    it("checks for existing wrangler.prod.toml", () => {
      const content = readFile(scriptPath);
      expect(content).toContain("wrangler.prod.toml");
    });

    it("prompts for overwrite confirmation", () => {
      const content = readFile(scriptPath);
      // Should contain an overwrite prompt
      expect(content).toMatch(/[Oo]verwrite/);
    });
  });

  describe("infrastructure config collection", () => {
    it("prompts for worker name with feedmail default", () => {
      const content = readFile(scriptPath);
      // Should reference worker name and feedmail default
      expect(content).toMatch(/feedmail/);
    });

    it("prompts for domain", () => {
      const content = readFile(scriptPath);
      // Should reference domain input
      expect(content).toMatch(/[Dd]omain/);
    });

    it("validates domain has no protocol", () => {
      const content = readFile(scriptPath);
      // Should reject :// in domain
      expect(content).toMatch(/:\/\//);
    });

    it("validates domain has no trailing slash", () => {
      const content = readFile(scriptPath);
      // Should check for trailing slash in domain input
      // This could be a regex or string check for /$ or ends with /
      expect(content).toMatch(/\/\s*\)/);
    });
  });

  describe("D1 database creation", () => {
    it("runs wrangler d1 create", () => {
      const content = readFile(scriptPath);
      expect(content).toContain("wrangler d1 create");
    });

    it("extracts database_id from output", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/database_id/);
    });
  });

  describe("TOML generation", () => {
    it("generates wrangler.prod.toml content", () => {
      const content = readFile(scriptPath);
      expect(content).toContain("wrangler.prod.toml");
    });

    it("includes main entry point in generated TOML", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/main\s*=.*src\/index\.js/);
    });

    it("includes compatibility_date in generated TOML", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/compatibility_date/);
    });

    it("includes compatibility_flags in generated TOML", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/compatibility_flags/);
    });

    it("includes [build] section in generated TOML", () => {
      const content = readFile(scriptPath);
      // The heredoc or template should include [build]
      expect(content).toMatch(/\[build\]/);
    });

    it("includes [triggers] section in generated TOML", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/\[triggers\]/);
    });

    it("includes [[d1_databases]] section in generated TOML", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/\[\[d1_databases\]\]/);
    });

    it("includes [observability.logs] section in generated TOML", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/\[observability\.logs\]/);
    });

    it("includes commented routes section in generated TOML", () => {
      const content = readFile(scriptPath);
      // Routes should be commented out
      expect(content).toMatch(/#.*\[\[routes\]\]|#.*routes/);
    });
  });

  describe("secret setting", () => {
    it("sets RESEND_API_KEY via wrangler secret put", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/wrangler\s+secret\s+put\s+RESEND_API_KEY/);
    });

    it("sets ADMIN_API_KEY via wrangler secret put", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/wrangler\s+secret\s+put\s+ADMIN_API_KEY/);
    });

    it("uses echo-disabled input for secret prompting", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/read\s+-rs/);
    });

    it("passes --config wrangler.prod.toml to secret put", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/secret\s+put.*--config\s+wrangler\.prod\.toml/);
    });
  });

  describe("migrations", () => {
    it("runs D1 migrations with prod config", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/wrangler\s+d1\s+migrations\s+apply/);
    });

    it("passes --config wrangler.prod.toml to migrations", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/migrations\s+apply.*--config\s+wrangler\.prod\.toml/);
    });
  });

  describe("deployment", () => {
    it("runs wrangler deploy", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/wrangler\s+deploy/);
    });

    it("passes --config wrangler.prod.toml to deploy", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/wrangler\s+deploy.*--config\s+wrangler\.prod\.toml|--config\s+wrangler\.prod\.toml.*wrangler\s+deploy/);
    });
  });

  describe("channel creation via API", () => {
    it("uses curl to call the admin channels API", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/curl/);
      expect(content).toMatch(/\/api\/admin\/channels/);
    });

    it("sends Authorization bearer header", () => {
      const content = readFile(scriptPath);
      expect(content).toMatch(/Authorization.*Bearer/i);
    });
  });

  describe("input validation", () => {
    it("validates from-user has no @ character", () => {
      const content = readFile(scriptPath);
      // Should check for @ in from-user input
      expect(content).toMatch(/@/);
    });

    it("validates from-user has no whitespace", () => {
      const content = readFile(scriptPath);
      // Should check for whitespace in from-user
      expect(content).toMatch(/[Ww]hitespace|\s+/);
    });
  });
});

// ─── Requirement 19-22: README.md content ───────────────────────────────────

describe("README.md content", () => {
  let readme;

  it("file exists", () => {
    expect(fileExists("README.md")).toBe(true);
    readme = readFile("README.md");
  });

  describe("curl install command", () => {
    it("contains curl install command", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(/curl/);
    });

    it("curl command points to raw GitHub URL of install.sh", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(
        /raw\.githubusercontent\.com\/alexmensch\/feedmail\/.*\/scripts\/install\.sh/,
      );
    });

    it("curl install is the first actionable instruction in Quick Start", () => {
      readme = readFile("README.md");
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
      readme = readFile("README.md");
      expect(readme).toMatch(/[Mm]anual\s*[Ss]etup|[Aa]dvanced/);
    });

    it("references wrangler.prod.toml in manual setup", () => {
      readme = readFile("README.md");
      expect(readme).toContain("wrangler.prod.toml");
    });

    it("includes channel creation via admin API", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(/\/api\/admin\/channels/);
    });

    it("does not reference CHANNELS env var", () => {
      readme = readFile("README.md");
      // Should not have CHANNELS as an env var reference
      // (but may appear in text describing the old system)
      expect(readme).not.toMatch(/CHANNELS\s*=/);
      expect(readme).not.toMatch(/`CHANNELS`/);
    });
  });

  describe("Resend domain verification note", () => {
    it("mentions Resend domain verification", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(/[Rr]esend.*domain.*verif|domain.*verif.*[Rr]esend/i);
    });

    it("includes a link to Resend documentation", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(/resend\.com/);
    });
  });

  describe("updating feedmail section", () => {
    it("has an Updating section", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(/##[#]*\s*[Uu]pdat/);
    });

    it("includes git pull command", () => {
      readme = readFile("README.md");
      expect(readme).toMatch(/git\s+pull\s+origin\s+master/);
    });

    it("includes pnpm install command", () => {
      readme = readFile("README.md");
      const updateMatch = readme.match(/##[#]*\s*[Uu]pdat[\s\S]*?(?=\n##[^#]|\n$|$)/);
      expect(updateMatch).not.toBeNull();
      expect(updateMatch[0]).toContain("pnpm install");
    });

    it("includes pnpm run deploy command", () => {
      readme = readFile("README.md");
      const updateMatch = readme.match(/##[#]*\s*[Uu]pdat[\s\S]*?(?=\n##[^#]|\n$|$)/);
      expect(updateMatch).not.toBeNull();
      expect(updateMatch[0]).toMatch(/pnpm\s+run\s+deploy/);
    });

    it("notes that wrangler.prod.toml is gitignored", () => {
      readme = readFile("README.md");
      const updateMatch = readme.match(/##[#]*\s*[Uu]pdat[\s\S]*?(?=\n##[^#]|\n$|$)/);
      expect(updateMatch).not.toBeNull();
      expect(updateMatch[0]).toMatch(/wrangler\.prod\.toml.*gitignore|gitignore.*wrangler\.prod\.toml/i);
    });
  });
});
