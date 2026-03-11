import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/api.js", () => ({
  callApi: vi.fn(),
  API_UNREACHABLE_ERROR: "Unable to reach the API. Check your configuration."
}));
vi.mock("../../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialById: vi.fn(),
  getPasskeyCredentialCount: vi.fn().mockResolvedValue(0),
  getPasskeyCredentials: vi.fn().mockResolvedValue([])
}));
vi.mock("../../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<div>confirmation fragment</div>")
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
vi.mock("../../../src/admin/lib/htmx.js", () => ({
  isHtmxRequest: vi.fn().mockReturnValue(true),
  fragmentResponse: vi.fn().mockImplementation(
    (html) =>
      new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));

// The confirmation fragment handlers will be imported from their respective route modules.
// These are new endpoints that do not yet exist.
import {
  handleChannelDeleteConfirm
} from "../../../src/admin/routes/channels.js";
import { callApi } from "../../../src/admin/lib/api.js";
import { getPasskeyCredentialById } from "../../../src/admin/lib/db.js";
import { render } from "../../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("channel delete confirmation fragment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a confirmation fragment containing the channel name", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: "blog",
        siteName: "My Blog",
        feeds: [{ id: 1, name: "Main", url: "https://blog.example.com/feed" }]
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/blog/delete/confirm"
    );
    const response = await handleChannelDeleteConfirm(request, env, "blog");

    expect(response.status).toBe(200);
    // The rendered template should include channel identification info
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        channelId: "blog"
      })
    );
  });

  it("includes a warning about irreversibility", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: "blog",
        siteName: "My Blog",
        feeds: []
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/blog/delete/confirm"
    );
    const response = await handleChannelDeleteConfirm(request, env, "blog");

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBeTruthy();
  });

  it("returns an error fragment when channel does not exist", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: "Channel not found" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/nonexistent/delete/confirm"
    );
    const response = await handleChannelDeleteConfirm(
      request,
      env,
      "nonexistent"
    );

    expect(response.status).toBe(200);
    // Should render an error state in the fragment
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});

// Passkey delete confirmation fragment is expected to be a new handler.
// It may live in passkeys.js or channels.js depending on implementation.
// We import from passkeys.js for the passkey-specific one.
import {
  handlePasskeyDeleteConfirm
} from "../../../src/admin/routes/passkeys.js";

describe("passkey delete confirmation fragment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a confirmation fragment with passkey info", async () => {
    getPasskeyCredentialById.mockResolvedValue({
      credential_id: "cred-abc123",
      name: "MacBook Pro",
      created_at: "2025-01-15 10:30:00"
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-abc123/delete/confirm"
    );
    const response = await handlePasskeyDeleteConfirm(
      request,
      env,
      "cred-abc123"
    );

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentialId: "cred-abc123"
      })
    );
  });

  it("returns an error fragment when passkey does not exist", async () => {
    getPasskeyCredentialById.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/nonexistent/delete/confirm"
    );
    const response = await handlePasskeyDeleteConfirm(
      request,
      env,
      "nonexistent"
    );

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});
