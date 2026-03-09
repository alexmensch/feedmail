import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/api.js", () => ({
  callApi: vi.fn()
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

import {
  handleChannelList,
  handleChannelNew,
  handleChannelCreate,
  handleChannelDetail,
  handleChannelUpdate,
  handleChannelDelete
} from "../../../src/admin/routes/channels.js";
import { callApi } from "../../../src/admin/lib/api.js";
import { render } from "../../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

const CHANNEL = {
  id: "test-channel",
  siteName: "Test Site",
  siteUrl: "https://example.com",
  fromUser: "hello",
  fromName: "Test Sender",
  corsOrigins: ["https://example.com"]
};

const FEED = { id: 1, name: "Main Feed", url: "https://example.com/feed.xml" };

describe("handleChannelList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and renders channels list", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [CHANNEL] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels"
    );
    const response = await handleChannelList(request, env);

    expect(response.status).toBe(200);
    expect(callApi).toHaveBeenCalledWith(env, "GET", "/admin/channels");
    expect(render).toHaveBeenCalledWith(
      "adminChannels",
      expect.objectContaining({
        channels: [CHANNEL],
        activePage: "channels"
      })
    );
  });

  it("handles empty channel list with empty state", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels"
    );
    const response = await handleChannelList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannels",
      expect.objectContaining({
        channels: []
      })
    );
  });

  it("handles API error", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Internal error" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels"
    );
    const response = await handleChannelList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannels",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });

  it("displays success query param as feedback", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels?success=Channel+deleted"
    );
    const response = await handleChannelList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannels",
      expect.objectContaining({
        success: "Channel deleted"
      })
    );
  });

  it("displays error query param as feedback", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels?error=Something+failed"
    );
    const response = await handleChannelList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannels",
      expect.objectContaining({
        error: "Something failed"
      })
    );
  });
});

describe("handleChannelNew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the channel creation form in create mode", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/channels/new"
    );
    const response = await handleChannelNew(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: false,
        activePage: "channels"
      })
    );
  });
});

describe("handleChannelCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses form data, calls API, and redirects on success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: "new-ch", siteName: "New Channel" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=new-ch&siteName=New+Channel&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(callApi).toHaveBeenCalledWith(
      env,
      "POST",
      "/admin/channels",
      expect.objectContaining({
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender"
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(
      "/admin/channels/new-ch"
    );
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("converts corsOrigins textarea to JSON array", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: "ch" }
    });

    const corsText =
      "https://example.com\nhttps://other.com\n\nhttps://third.com";
    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `id=ch&siteName=Test&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender&corsOrigins=${encodeURIComponent(corsText)}`
      }
    );

    await handleChannelCreate(request, env);

    const apiCall = callApi.mock.calls[0];
    const body = apiCall[3];
    expect(body.corsOrigins).toEqual([
      "https://example.com",
      "https://other.com",
      "https://third.com"
    ]);
  });

  it("filters empty lines from corsOrigins", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: "ch" }
    });

    const corsText = "\n\nhttps://example.com\n  \n";
    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `id=ch&siteName=Test&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender&corsOrigins=${encodeURIComponent(corsText)}`
      }
    );

    await handleChannelCreate(request, env);

    const apiCall = callApi.mock.calls[0];
    const body = apiCall[3];
    expect(body.corsOrigins).toEqual(["https://example.com"]);
  });

  it("omits empty optional fields from API request", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: "ch" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=ch&siteName=Test&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender&replyTo=&companyName=&companyAddress=&corsOrigins="
      }
    );

    await handleChannelCreate(request, env);

    const apiCall = callApi.mock.calls[0];
    const body = apiCall[3];
    expect(body.replyTo).toBeUndefined();
    expect(body.companyName).toBeUndefined();
    expect(body.companyAddress).toBeUndefined();
  });

  it("re-renders form with errors on validation failure", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: "Invalid site URL" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=ch&siteName=Test&siteUrl=bad-url&fromUser=hello&fromName=Sender"
      }
    );

    const response = await handleChannelCreate(request, env);

    // Should re-render the form, not redirect
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: false,
        error: expect.any(String),
        channel: expect.objectContaining({
          id: "ch",
          siteName: "Test"
        })
      })
    );
  });

  it("re-renders form with error on duplicate channel ID (409)", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: "Channel ID already exists" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "id=existing-ch&siteName=Test&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: expect.stringContaining("already exists")
      })
    );
  });
});

describe("handleChannelDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches channel and feeds, renders edit form", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel"
    );
    const response = await handleChannelDetail(request, env, "test-channel");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "GET",
      "/admin/channels/test-channel"
    );
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: true,
        channel: expect.objectContaining({
          id: "test-channel",
          siteName: "Test Site"
        }),
        feeds: [FEED],
        activePage: "channels"
      })
    );
  });

  it("renders error page when channel not found (404)", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: "Channel not found" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/nonexistent"
    );
    const response = await handleChannelDetail(request, env, "nonexistent");

    expect(response.status).not.toBe(200);
  });

  it("displays success query param as feedback", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel?success=Channel+updated"
    );
    const response = await handleChannelDetail(request, env, "test-channel");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        success: "Channel updated"
      })
    );
  });

  it("displays corsOrigins as array for template rendering", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ...CHANNEL,
        corsOrigins: ["https://one.com", "https://two.com"],
        feeds: []
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel"
    );
    const response = await handleChannelDetail(request, env, "test-channel");

    expect(response.status).toBe(200);
    // The corsOrigins should be passed to the template in a form usable as textarea content
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        channel: expect.objectContaining({
          corsOrigins: expect.anything()
        })
      })
    );
  });
});

describe("handleChannelUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses form data, calls PUT, redirects with success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...CHANNEL, siteName: "Updated Site" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "siteName=Updated+Site&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "PUT",
      "/admin/channels/test-channel",
      expect.objectContaining({
        siteName: "Updated Site"
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(
      "/admin/channels/test-channel"
    );
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("re-renders form with errors on validation failure", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: "Invalid site URL" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "siteName=Test&siteUrl=bad-url&fromUser=hello&fromName=Sender"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: true,
        error: expect.any(String),
        channel: expect.objectContaining({
          siteName: "Test"
        })
      })
    );
  });

  it("handles API unreachable error", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 0,
      data: { error: "Unable to reach the API" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "siteName=Test&siteUrl=https%3A%2F%2Fexample.com&fromUser=hello&fromName=Sender"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});

describe("handleChannelDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls DELETE API and redirects to channel list with success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 204,
      data: null
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel/delete",
      { method: "POST" }
    );

    const response = await handleChannelDelete(request, env, "test-channel");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "DELETE",
      "/admin/channels/test-channel"
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin/channels");
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("redirects with error when channel not found", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: "Channel not found" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/nonexistent/delete",
      { method: "POST" }
    );

    const response = await handleChannelDelete(request, env, "nonexistent");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
  });

  it("redirects with error when API returns error", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Internal error" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel/delete",
      { method: "POST" }
    );

    const response = await handleChannelDelete(request, env, "test-channel");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
  });
});
