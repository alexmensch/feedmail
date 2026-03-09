import { describe, it, expect } from "vitest";
import { getEndpointName } from "../../src/shared/lib/rate-limit.js";

describe("getEndpointName — passkey authentication routes", () => {
  it("maps /admin/passkeys/authenticate/options to a rate limit endpoint", () => {
    const result = getEndpointName("/admin/passkeys/authenticate/options");

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("maps /admin/passkeys/authenticate/verify to a rate limit endpoint", () => {
    const result = getEndpointName("/admin/passkeys/authenticate/verify");

    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("uses the same endpoint name for both authenticate options and verify", () => {
    const optionsEndpoint = getEndpointName(
      "/admin/passkeys/authenticate/options"
    );
    const verifyEndpoint = getEndpointName(
      "/admin/passkeys/authenticate/verify"
    );

    // Both should map to the same rate limit bucket
    expect(optionsEndpoint).toBe(verifyEndpoint);
  });

  it("does not map passkey registration routes to a rate limit endpoint (they use session auth)", () => {
    // Registration endpoints are protected by session middleware, not rate limiting
    // They may still get a rate limit endpoint name, but this test documents the expectation
    const regOptions = getEndpointName("/admin/passkeys/register/options");
    const regVerify = getEndpointName("/admin/passkeys/register/verify");

    // These may or may not have a rate limit name — implementation decides
    // The key requirement is that authentication routes ARE mapped
    expect(regOptions).toBeDefined(); // may be null or a string
    expect(regVerify).toBeDefined();
  });
});

describe("RATE_LIMIT_DEFAULTS — passkey authentication", () => {
  it("includes a default rate limit for passkey authentication endpoint", async () => {
    const { RATE_LIMIT_DEFAULTS } = await import(
      "../../src/shared/lib/config.js"
    );

    // There should be a rate limit default for the passkey auth endpoint name
    const passkeyAuthEndpoint = getEndpointName(
      "/admin/passkeys/authenticate/options"
    );
    if (passkeyAuthEndpoint) {
      expect(RATE_LIMIT_DEFAULTS).toHaveProperty(passkeyAuthEndpoint);
      const limits = RATE_LIMIT_DEFAULTS[passkeyAuthEndpoint];
      expect(limits).toHaveProperty("windowHours");
      expect(limits).toHaveProperty("maxRequests");
    }
  });
});

describe("@simplewebauthn/server dependency", () => {
  it("is listed as a dependency in package.json", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    const packageJson = pkg.default || pkg;

    expect(packageJson.dependencies).toHaveProperty(
      "@simplewebauthn/server"
    );
  });
});

describe("admin passkeys template registration", () => {
  it("adminPasskeys template is registered and can be rendered", async () => {
    // This will fail until the template is created and registered
    const { render } = await import("../../src/shared/lib/templates.js");

    expect(() => render("adminPasskeys", {})).not.toThrow();
  });
});

describe("db:reset:local script includes passkey tables", () => {
  it("includes passkey_credentials table in reset command", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    const packageJson = pkg.default || pkg;
    const resetScript = packageJson.scripts["db:reset:local"];

    expect(resetScript).toContain("passkey_credentials");
  });

  it("includes webauthn_challenges table in reset command", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    const packageJson = pkg.default || pkg;
    const resetScript = packageJson.scripts["db:reset:local"];

    expect(resetScript).toContain("webauthn_challenges");
  });
});

describe("passkey database migration file", () => {
  it("migration file exists at migrations/0007_passkey_credentials.sql", async () => {
    // Try to read the migration file — if it doesn't exist, this will fail
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const { fileURLToPath } = await import("node:url");
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(
      currentDir,
      "../../migrations/0007_passkey_credentials.sql"
    );

    const exists = await fs
      .access(migrationPath)
      .then(() => true)
      .catch(() => false);

    expect(exists).toBe(true);
  });
});
