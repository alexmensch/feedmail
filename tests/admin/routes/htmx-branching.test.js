import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/api.js", () => ({
  callApi: vi.fn(),
  API_UNREACHABLE_ERROR: "Unable to reach the API. Check your configuration."
}));
vi.mock("../../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialCount: vi.fn().mockResolvedValue(0),
  getPasskeyCredentials: vi.fn().mockResolvedValue([]),
  getPasskeyCredentialById: vi.fn(),
  updatePasskeyCredentialName: vi.fn().mockResolvedValue({}),
  deletePasskeyCredential: vi.fn().mockResolvedValue({})
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
vi.mock("../../../src/admin/lib/htmx.js", () => ({
  isHtmxRequest: vi.fn(),
  fragmentResponse: vi.fn().mockImplementation(
    (html) =>
      new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));

import { handleSendTrigger } from "../../../src/admin/routes/dashboard.js";
import {
  handleChannelCreate,
  handleChannelUpdate
} from "../../../src/admin/routes/channels.js";
import { handleSubscriberList } from "../../../src/admin/routes/subscribers.js";
import {
  handlePasskeyRename,
  handlePasskeyDelete
} from "../../../src/admin/routes/passkeys.js";
import { callApi } from "../../../src/admin/lib/api.js";
import {
  getPasskeyCredentialById,
  getPasskeyCredentials,
  updatePasskeyCredentialName,
  deletePasskeyCredential
} from "../../../src/admin/lib/db.js";
import { render } from "../../../src/shared/lib/templates.js";
import { isHtmxRequest } from "../../../src/admin/lib/htmx.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("HTMX branching — dashboard send trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { message: "ok" }
    });
  });

  it("returns a redirect for standard (non-HTMX) requests", async () => {
    isHtmxRequest.mockReturnValue(false);

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://feedmail.example.com/admin"
      },
      body: ""
    });

    const response = await handleSendTrigger(request, env);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin");
  });

  it("returns an HTML fragment (not a redirect) for HTMX requests on success", async () => {
    isHtmxRequest.mockReturnValue(true);

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "HX-Request": "true",
        Referer: "https://feedmail.example.com/admin"
      },
      body: ""
    });

    const response = await handleSendTrigger(request, env);

    // HTMX requests should return a fragment, not a 302 redirect
    expect(response.status).not.toBe(302);
    const body = await response.text();
    expect(body).toBeTruthy();
  });

  it("returns an HTML fragment with error feedback for HTMX requests on failure", async () => {
    isHtmxRequest.mockReturnValue(true);
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Send failed" }
    });

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "HX-Request": "true",
        Referer: "https://feedmail.example.com/admin"
      },
      body: ""
    });

    const response = await handleSendTrigger(request, env);

    expect(response.status).not.toBe(302);
  });
});

describe("HTMX branching — channel update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockChannelUpdateSuccess() {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "blog" }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { feeds: [] }
      });
  }

  it("returns a redirect for standard requests on success", async () => {
    isHtmxRequest.mockReturnValue(false);
    mockChannelUpdateSuccess();

    const request = new Request(
      "https://feedmail.example.com/admin/channels/blog",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "siteName=Blog&siteUrl=https://blog.example.com&fromUser=blog&fromName=Blog&feeds[0][name]=Main&feeds[0][url]=https://blog.example.com/feed.xml&feeds[0][id]=1"
      }
    );

    const response = await handleChannelUpdate(request, env, "blog");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin/channels/blog");
  });

  it("returns an HTML fragment (not a redirect) for HTMX requests on success", async () => {
    isHtmxRequest.mockReturnValue(true);
    mockChannelUpdateSuccess();
    // Re-fetch after successful update
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        id: "blog",
        siteName: "Blog",
        siteUrl: "https://blog.example.com",
        fromUser: "blog",
        fromName: "Blog",
        feeds: [
          {
            id: 1,
            name: "Main",
            url: "https://blog.example.com/feed.xml"
          }
        ]
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/blog",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "siteName=Blog&siteUrl=https://blog.example.com&fromUser=blog&fromName=Blog&feeds[0][name]=Main&feeds[0][url]=https://blog.example.com/feed.xml&feeds[0][id]=1"
      }
    );

    const response = await handleChannelUpdate(request, env, "blog");

    expect(response.status).not.toBe(302);
    expect(render).toHaveBeenCalledWith(
      "adminChannelFormResult",
      expect.objectContaining({ success: expect.any(String) })
    );
  });

  it("returns an HTML fragment with error for HTMX requests when channel update fails", async () => {
    isHtmxRequest.mockReturnValue(true);
    // Channel PUT fails
    callApi
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        data: { error: "Invalid channel data" }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/blog",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "siteName=Blog&siteUrl=https://blog.example.com&fromUser=blog&fromName=Blog&feeds[0][name]=Main&feeds[0][url]=https://blog.example.com/feed.xml&feeds[0][id]=1"
      }
    );

    const response = await handleChannelUpdate(request, env, "blog");

    expect(response.status).not.toBe(302);
  });

  it("returns an HTML fragment with error for HTMX requests when feed operations partially fail", async () => {
    isHtmxRequest.mockReturnValue(true);
    // Channel PUT succeeds
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { id: "blog" }
      })
      // Feed list returns existing feeds for diff
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          feeds: [{ id: 1, name: "Main", url: "https://blog.example.com/old-feed.xml" }]
        }
      })
      // Feed update fails
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        data: { error: "Feed URL invalid" }
      })
      // Re-fetch channel for re-render
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          id: "blog",
          siteName: "Blog",
          siteUrl: "https://blog.example.com",
          fromUser: "blog",
          fromName: "Blog",
          feeds: [
            {
              id: 1,
              name: "Main",
              url: "https://blog.example.com/old-feed.xml"
            }
          ]
        }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/blog",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "siteName=Blog&siteUrl=https://blog.example.com&fromUser=blog&fromName=Blog&feeds[0][name]=Main&feeds[0][url]=https://blog.example.com/new-feed.xml&feeds[0][id]=1"
      }
    );

    const response = await handleChannelUpdate(request, env, "blog");

    expect(response.status).not.toBe(302);
  });
});

describe("HTMX branching — channel create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a redirect for standard requests on success", async () => {
    isHtmxRequest.mockReturnValue(false);
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: "new-channel" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=new-channel&siteName=New+Channel&siteUrl=https://example.com&fromUser=news&fromName=News&feeds[0][name]=Main&feeds[0][url]=https://example.com/feed.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(
      "/admin/channels/new-channel"
    );
  });

  it("returns HX-Redirect header for HTMX requests on success", async () => {
    isHtmxRequest.mockReturnValue(true);
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: "new-channel" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "id=new-channel&siteName=New+Channel&siteUrl=https://example.com&fromUser=news&fromName=News&feeds[0][name]=Main&feeds[0][url]=https://example.com/feed.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    // HTMX success should use HX-Redirect header instead of 302
    expect(response.headers.get("HX-Redirect")).toContain(
      "/admin/channels/new-channel"
    );
  });
});

describe("HTMX branching — subscriber list filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a full page for standard requests", async () => {
    isHtmxRequest.mockReturnValue(false);
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          subscribers: [
            {
              email: "user@example.com",
              channel_id: "ch1",
              status: "verified"
            }
          ]
        }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    // Standard requests render the full page template
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        activePage: "subscribers"
      })
    );
  });

  it("returns a subscriber table fragment with error for HTMX requests when API fails", async () => {
    isHtmxRequest.mockReturnValue(true);
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: { error: "API error" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers",
      {
        headers: { "HX-Request": "true" }
      }
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain("<!DOCTYPE");
  });

  it("returns a subscriber table fragment for HTMX requests", async () => {
    isHtmxRequest.mockReturnValue(true);
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          subscribers: [
            {
              email: "user@example.com",
              channel_id: "ch1",
              status: "verified"
            }
          ]
        }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1",
      {
        headers: { "HX-Request": "true" }
      }
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    // HTMX requests should render a fragment template, not the full page
    // The render call should use a different template name (e.g., a subscriber table fragment)
    // or the response should not contain full document structure
    const body = await response.text();
    expect(body).not.toContain("<!DOCTYPE");
  });
});

describe("HTMX branching — passkey rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentialById.mockResolvedValue({
      credential_id: "cred-1",
      name: "Old Name"
    });
    updatePasskeyCredentialName.mockResolvedValue({});
  });

  it("returns a redirect for standard requests", async () => {
    isHtmxRequest.mockReturnValue(false);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=New+Name"
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin/settings");
  });

  it("returns a passkey list fragment for HTMX requests", async () => {
    isHtmxRequest.mockReturnValue(true);
    getPasskeyCredentials.mockResolvedValue([
      { credential_id: "cred-1", name: "New Name", created_at: "2025-01-01" }
    ]);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "name=New+Name"
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(response.status).not.toBe(302);
  });

  it("returns a fragment with error for HTMX requests when passkey not found", async () => {
    isHtmxRequest.mockReturnValue(true);
    getPasskeyCredentialById.mockResolvedValue(null);
    getPasskeyCredentials.mockResolvedValue([]);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "name=New+Name"
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(response.status).not.toBe(302);
  });

  it("returns a fragment with error for HTMX requests when name is empty", async () => {
    isHtmxRequest.mockReturnValue(true);
    getPasskeyCredentials.mockResolvedValue([
      { credential_id: "cred-1", name: "Old Name", created_at: "2025-01-01" }
    ]);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: "name="
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(response.status).not.toBe(302);
  });

  it("returns a fragment with error for HTMX requests when name exceeds 100 chars", async () => {
    isHtmxRequest.mockReturnValue(true);
    getPasskeyCredentials.mockResolvedValue([
      { credential_id: "cred-1", name: "Old Name", created_at: "2025-01-01" }
    ]);

    const longName = "a".repeat(101);
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "HX-Request": "true"
        },
        body: `name=${longName}`
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(response.status).not.toBe(302);
  });
});

describe("HTMX branching — passkey delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletePasskeyCredential.mockResolvedValue({});
  });

  it("returns a redirect for standard requests", async () => {
    isHtmxRequest.mockReturnValue(false);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/delete",
      { method: "POST" }
    );

    const response = await handlePasskeyDelete(request, env, "cred-1");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin/settings");
  });

  it("returns a passkey list fragment for HTMX requests", async () => {
    isHtmxRequest.mockReturnValue(true);
    getPasskeyCredentials.mockResolvedValue([]);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/delete",
      {
        method: "POST",
        headers: { "HX-Request": "true" }
      }
    );

    const response = await handlePasskeyDelete(request, env, "cred-1");

    // HTMX requests should return a fragment, not a redirect
    expect(response.status).not.toBe(302);
  });
});
