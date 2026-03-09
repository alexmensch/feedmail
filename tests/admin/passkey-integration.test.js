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

  it("maps both authenticate endpoints to admin_login rate limit bucket", () => {
    const optionsEndpoint = getEndpointName(
      "/admin/passkeys/authenticate/options"
    );
    const verifyEndpoint = getEndpointName(
      "/admin/passkeys/authenticate/verify"
    );

    expect(optionsEndpoint).toBe("admin_login");
    expect(verifyEndpoint).toBe("admin_login");
  });
});

describe("@simplewebauthn/server dependency", () => {
  it("is listed as a dependency in package.json", async () => {
    const pkg = await import("../../package.json", { with: { type: "json" } });
    const packageJson = pkg.default || pkg;

    expect(packageJson.dependencies).toHaveProperty("@simplewebauthn/server");
  });
});

describe("admin settings template registration", () => {
  it("adminSettings template is registered and can be rendered", async () => {
    const { render } = await import("../../src/shared/lib/templates.js");

    expect(() => render("adminSettings", {})).not.toThrow();
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
