import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("wrangler.admin.toml static assets configuration", () => {
  const tomlPath = resolve(import.meta.dirname, "../../wrangler.admin.toml");
  let tomlContent;

  try {
    tomlContent = readFileSync(tomlPath, "utf-8");
  } catch {
    tomlContent = null;
  }

  it("contains an [assets] configuration block", () => {
    expect(tomlContent).not.toBeNull();
    expect(tomlContent).toContain("[assets]");
  });

  it("specifies a directory for static assets", () => {
    expect(tomlContent).not.toBeNull();
    // The assets block should have a directory configuration
    // Match [assets] followed by a directory or binding property
    expect(tomlContent).toMatch(/\[assets\][\s\S]*?directory\s*=/);
  });
});
