import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/api.js", () => ({
  callApi: vi.fn()
}));
vi.mock("../../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialCount: vi.fn().mockResolvedValue(0)
}));
vi.mock("../../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>mock template</html>")
}));
vi.mock("../../../src/shared/lib/response.js", () => ({
  htmlResponse: vi.fn().mockImplementation(
    (html, status = 200) =>
      new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));

import { handleDashboard } from "../../../src/admin/routes/dashboard.js";
import { callApi } from "../../../src/admin/lib/api.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("dashboard empty state link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the template with data that the empty state can use to link to /admin/channels/new", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = new Request("https://feedmail.example.com/admin");
    const response = await handleDashboard(request, env);

    expect(response.status).toBe(200);

    // The template (admin-dashboard.hbs) should link to /admin/channels/new
    // in the empty state. We verify the handler passes the correct data
    // that enables this. The actual link text/URL is in the template.
    // Since we mock render(), we verify the template receives channels: []
    // and hasChannels: false (or channels is empty), which triggers the
    // empty state block in the template.
    const { render } = await import("../../../src/shared/lib/templates.js");
    expect(render).toHaveBeenCalledWith(
      "adminDashboard",
      expect.objectContaining({
        channels: []
      })
    );
  });
});

describe("dashboard empty state link — template content", () => {
  // This test verifies the actual template content contains the correct link.
  // It reads the raw template file to check the href value.
  it("admin-dashboard.hbs empty state links to /admin/channels/new", async () => {
    const fs = await import("fs");
    const templatePath = new URL(
      "../../../src/templates/admin-dashboard.hbs",
      import.meta.url
    ).pathname;
    const template = fs.readFileSync(templatePath, "utf-8");

    // The empty state block (inside {{else}} of {{#if hasChannels}})
    // should contain a link to /admin/channels/new, not /admin/channels
    const elseBlock = template.split("{{else}}").pop().split("{{/if}}")[0];
    expect(elseBlock).toContain("/admin/channels/new");
  });

  it("empty state link text says 'Create your first channel'", async () => {
    const fs = await import("fs");
    const templatePath = new URL(
      "../../../src/templates/admin-dashboard.hbs",
      import.meta.url
    ).pathname;
    const template = fs.readFileSync(templatePath, "utf-8");

    const elseBlock = template.split("{{else}}").pop().split("{{/if}}")[0];
    expect(elseBlock).toContain("Create your first channel");
  });
});
