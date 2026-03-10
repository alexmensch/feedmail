import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/api.js", () => ({
  callApi: vi.fn(),
  API_UNREACHABLE_ERROR: "Unable to reach the API"
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
  handleChannelNew,
  handleChannelCreate,
  handleChannelDetail,
  handleChannelUpdate,
  parseFeedRows
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

const FEED_1 = { id: 1, name: "Main Feed", url: "https://example.com/feed.xml" };
const FEED_2 = { id: 2, name: "Blog Feed", url: "https://example.com/blog.xml" };

function makeFormBody(fields) {
  return Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

function makeFormRequest(url, fields) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: makeFormBody(fields)
  });
}

// ─── parseFeedRows ──────────────────────────────────────────────────────────

describe("parseFeedRows", () => {
  it("parses indexed feed fields from form data", () => {
    const formData = new FormData();
    formData.append("feeds[0][name]", "Feed One");
    formData.append("feeds[0][url]", "https://example.com/one.xml");
    formData.append("feeds[1][name]", "Feed Two");
    formData.append("feeds[1][url]", "https://example.com/two.xml");

    const feeds = parseFeedRows(formData);

    expect(feeds).toHaveLength(2);
    expect(feeds[0]).toEqual(
      expect.objectContaining({
        name: "Feed One",
        url: "https://example.com/one.xml"
      })
    );
    expect(feeds[1]).toEqual(
      expect.objectContaining({
        name: "Feed Two",
        url: "https://example.com/two.xml"
      })
    );
  });

  it("includes feedId for existing feeds", () => {
    const formData = new FormData();
    formData.append("feeds[0][name]", "Existing Feed");
    formData.append("feeds[0][url]", "https://example.com/feed.xml");
    formData.append("feeds[0][id]", "5");

    const feeds = parseFeedRows(formData);

    expect(feeds).toHaveLength(1);
    expect(feeds[0].id).toBe(5);
  });

  it("returns empty array when no feed fields present", () => {
    const formData = new FormData();
    formData.append("siteName", "Test Site");

    const feeds = parseFeedRows(formData);

    expect(feeds).toEqual([]);
  });

  it("omits feedId when not present (new feed)", () => {
    const formData = new FormData();
    formData.append("feeds[0][name]", "New Feed");
    formData.append("feeds[0][url]", "https://example.com/new.xml");

    const feeds = parseFeedRows(formData);

    expect(feeds).toHaveLength(1);
    expect(feeds[0].id).toBeUndefined();
  });

  it("handles non-sequential indices", () => {
    const formData = new FormData();
    formData.append("feeds[0][name]", "Feed Zero");
    formData.append("feeds[0][url]", "https://example.com/zero.xml");
    formData.append("feeds[2][name]", "Feed Two");
    formData.append("feeds[2][url]", "https://example.com/two.xml");

    const feeds = parseFeedRows(formData);

    expect(feeds).toHaveLength(2);
  });

  it("trims whitespace from feed name and URL values", () => {
    const formData = new FormData();
    formData.append("feeds[0][name]", "  Feed One  ");
    formData.append("feeds[0][url]", "  https://example.com/one.xml  ");

    const feeds = parseFeedRows(formData);

    expect(feeds[0].name).toBe("Feed One");
    expect(feeds[0].url).toBe("https://example.com/one.xml");
  });
});

// ─── handleChannelNew — domain passed to template ──────────────────────────

describe("handleChannelNew — domain context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes domain to the template for from-user suffix display", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/channels/new"
    );
    await handleChannelNew(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        domain: "feedmail.example.com"
      })
    );
  });
});

// ─── handleChannelCreate — unified form with feeds ──────────────────────────

describe("handleChannelCreate — with feed rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends channel fields and feeds array in a single API call", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: "new-ch" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(response.status).toBe(302);
    const apiCallBody = callApi.mock.calls[0][3];
    expect(apiCallBody.feeds).toBeDefined();
    expect(apiCallBody.feeds).toHaveLength(1);
    expect(apiCallBody.feeds[0]).toEqual(
      expect.objectContaining({
        name: "Main Feed",
        url: "https://example.com/feed.xml"
      })
    );
  });

  it("sends multiple feeds in the create API call", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: "new-ch" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Feed One",
        "feeds[0][url]": "https://example.com/one.xml",
        "feeds[1][name]": "Feed Two",
        "feeds[1][url]": "https://example.com/two.xml"
      }
    );

    await handleChannelCreate(request, env);

    const apiCallBody = callApi.mock.calls[0][3];
    expect(apiCallBody.feeds).toHaveLength(2);
  });

  it("rejects creation with zero feeds via local validation (no API call)", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com"
      }
    );

    const response = await handleChannelCreate(request, env);

    // Should re-render form with error, not call API
    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: false,
        error: expect.stringContaining("feed")
      })
    );
  });

  it("preserves feed rows in form re-render on validation error", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: "Invalid site URL" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "bad-url",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "My Feed",
        "feeds[0][url]": "https://example.com/feed.xml"
      }
    );

    await handleChannelCreate(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        feeds: expect.arrayContaining([
          expect.objectContaining({
            name: "My Feed",
            url: "https://example.com/feed.xml"
          })
        ])
      })
    );
  });
});

// ─── handleChannelCreate — noscript fallback actions ────────────────────────

describe("handleChannelCreate — noscript actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-renders form with additional empty feed row when action is add-feed", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        action: "add-feed",
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Existing Feed",
        "feeds[0][url]": "https://example.com/feed.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    // Should re-render the form, not call the API
    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: false,
        feeds: expect.arrayContaining([
          expect.objectContaining({ name: "Existing Feed" }),
          expect.objectContaining({ name: "", url: "" })
        ])
      })
    );
  });

  it("re-renders form with feed row removed when action is remove-feed", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        action: "remove-feed",
        removeIndex: "1",
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Feed One",
        "feeds[0][url]": "https://example.com/one.xml",
        "feeds[1][name]": "Feed Two",
        "feeds[1][url]": "https://example.com/two.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        feeds: expect.arrayContaining([
          expect.objectContaining({ name: "Feed One" })
        ])
      })
    );
    // Feed Two (index 1) should be removed
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(1);
    expect(templateData.feeds[0].name).toBe("Feed One");
  });

  it("rejects remove-feed when it would leave zero feeds", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        action: "remove-feed",
        removeIndex: "0",
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Only Feed",
        "feeds[0][url]": "https://example.com/feed.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    // Should still have the one feed row and show error or keep it
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(1);
  });
});

// ─── handleChannelUpdate — unified form with feed diffing ───────────────────

describe("handleChannelUpdate — feed diffing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls PUT for channel fields and detects no feed changes", async () => {
    // First call: PUT channel update
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // Second call: GET current channel (for feed diffing)
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1] }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Updated Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("creates new feeds that lack a feedId", async () => {
    // PUT channel
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1] }
    });
    // POST new feed
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: { id: 3, name: "New Feed", url: "https://example.com/new.xml" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1",
        "feeds[1][name]": "New Feed",
        "feeds[1][url]": "https://example.com/new.xml"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(302);
    // Should have called POST for the new feed
    const postCalls = callApi.mock.calls.filter(
      (c) => c[1] === "POST" && c[2].includes("/feeds")
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("updates existing feeds that have changed", async () => {
    // PUT channel
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1] }
    });
    // PUT feed update
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { id: 1, name: "Renamed Feed", url: "https://example.com/feed.xml" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Renamed Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(302);
    // Should have called PUT for the updated feed
    const putFeedCalls = callApi.mock.calls.filter(
      (c) => c[1] === "PUT" && c[2].includes("/feeds/")
    );
    expect(putFeedCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("deletes feeds absent from submission", async () => {
    // PUT channel
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff (has two feeds)
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1, FEED_2] }
    });
    // DELETE removed feed
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 204,
      data: null
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        // Only feed 1 submitted; feed 2 should be deleted
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(302);
    // Should have called DELETE for the missing feed
    const deleteCalls = callApi.mock.calls.filter(
      (c) => c[1] === "DELETE" && c[2].includes("/feeds/")
    );
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("handles combined add, update, and delete in a single save", async () => {
    // PUT channel
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel (has feeds 1 and 2)
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1, FEED_2] }
    });
    // PUT feed 1 (renamed)
    callApi.mockResolvedValueOnce({ ok: true, status: 200, data: {} });
    // POST new feed
    callApi.mockResolvedValueOnce({ ok: true, status: 201, data: { id: 3 } });
    // DELETE feed 2
    callApi.mockResolvedValueOnce({ ok: true, status: 204, data: null });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        // Feed 1 renamed, feed 2 removed, new feed added
        "feeds[0][name]": "Renamed Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1",
        "feeds[1][name]": "Brand New Feed",
        "feeds[1][url]": "https://example.com/brand-new.xml"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("success=");
  });
});

// ─── handleChannelUpdate — partial failure ──────────────────────────────────

describe("handleChannelUpdate — partial failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects with error when channel update succeeds but feed add fails", async () => {
    // PUT channel - success
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1] }
    });
    // POST new feed - failure
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { error: "Invalid feed URL" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1",
        "feeds[1][name]": "Bad Feed",
        "feeds[1][url]": "not-a-url"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    // Partial failure: redirect with error query param
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("error=");
    expect(decodeURIComponent(location)).toMatch(/saved.*but.*failed/i);
  });

  it("redirects with error when channel update succeeds but feed delete fails", async () => {
    // PUT channel - success
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1, FEED_2] }
    });
    // DELETE feed 2 - failure
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: { error: "Internal error" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    // Partial failure: redirect with error query param
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("error=");
    expect(decodeURIComponent(location)).toMatch(/saved.*but.*failed/i);
  });

  it("reports error when channel PUT itself fails", async () => {
    // PUT channel - failure
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { error: "Invalid site URL" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "bad-url",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
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
          siteName: "Test Site"
        })
      })
    );
  });

  it("preserves submitted feed rows on channel update error", async () => {
    // PUT channel - failure
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { error: "Invalid site URL" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "bad-url",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1",
        "feeds[1][name]": "New Feed",
        "feeds[1][url]": "https://example.com/new.xml"
      }
    );

    await handleChannelUpdate(request, env, "test-channel");

    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        feeds: expect.arrayContaining([
          expect.objectContaining({ name: "Main Feed" }),
          expect.objectContaining({ name: "New Feed" })
        ])
      })
    );
  });

  it("shows API unreachable error when network fails", async () => {
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 0,
      data: { error: "Unable to reach the API" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: expect.stringContaining("Unable to reach the API")
      })
    );
  });
});

// ─── handleChannelUpdate — noscript actions ─────────────────────────────────

describe("handleChannelUpdate — noscript actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-renders with extra empty feed row when action is add-feed", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        action: "add-feed",
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(2);
    expect(templateData.feeds[1]).toEqual(
      expect.objectContaining({ name: "", url: "" })
    );
  });

  it("re-renders with feed removed when action is remove-feed", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        action: "remove-feed",
        removeIndex: "1",
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Feed One",
        "feeds[0][url]": "https://example.com/one.xml",
        "feeds[0][id]": "1",
        "feeds[1][name]": "Feed Two",
        "feeds[1][url]": "https://example.com/two.xml",
        "feeds[1][id]": "2"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(1);
    expect(templateData.feeds[0].name).toBe("Feed One");
  });

  it("rejects remove-feed when it would leave zero feeds on edit", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        action: "remove-feed",
        removeIndex: "0",
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Only Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(1);
  });
});

// ─── handleChannelDetail — domain and feeds in template ─────────────────────

describe("handleChannelDetail — edit form context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes domain to template on edit form", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel"
    );
    await handleChannelDetail(request, env, "test-channel");

    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        domain: "feedmail.example.com"
      })
    );
  });

  it("includes feeds as inline feed rows data for the template", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1, FEED_2] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel"
    );
    await handleChannelDetail(request, env, "test-channel");

    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        feeds: expect.arrayContaining([
          expect.objectContaining({ id: 1, name: "Main Feed" }),
          expect.objectContaining({ id: 2, name: "Blog Feed" })
        ])
      })
    );
  });
});

// ─── Coverage gap: handleChannelUpdate — zero feeds validation ──────────────

describe("handleChannelUpdate — zero feeds validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects update with zero feeds via local validation", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        isEdit: true,
        error: expect.stringContaining("feed")
      })
    );
  });

  it("rejects update when all feed rows have empty name and URL", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "",
        "feeds[0][url]": ""
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: expect.stringContaining("feed")
      })
    );
  });
});

// ─── Coverage gap: handleChannelUpdate — feed update failure ────────────────

describe("handleChannelUpdate — feed update failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects with error when feed update API call fails", async () => {
    // PUT channel - success
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL, feeds: [FEED_1] }
    });
    // PUT feed update - failure
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 400,
      data: { error: "Duplicate feed name" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Renamed Feed",
        "feeds[0][url]": "https://example.com/feed.xml",
        "feeds[0][id]": "1"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("error=");
    expect(decodeURIComponent(location)).toMatch(/saved.*but.*failed/i);
  });
});

// ─── Coverage gap: handleChannelUpdate — GET current channel fails ──────────

describe("handleChannelUpdate — current channel fetch failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to empty feeds when GET current channel fails", async () => {
    // PUT channel - success
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...CHANNEL }
    });
    // GET current channel for diff - fails
    callApi.mockResolvedValueOnce({
      ok: false,
      status: 500,
      data: { error: "Internal error" }
    });
    // POST new feed (since no current feeds to compare against)
    callApi.mockResolvedValueOnce({
      ok: true,
      status: 201,
      data: { id: 1, name: "Main Feed", url: "https://example.com/feed.xml" }
    });

    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels/test-channel",
      {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "https://example.com",
        "feeds[0][name]": "Main Feed",
        "feeds[0][url]": "https://example.com/feed.xml"
      }
    );

    const response = await handleChannelUpdate(request, env, "test-channel");

    // Should still succeed since feed create works
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("success=");
  });
});

// ─── Coverage gap: handleChannelCreate — noscript corsOrigins fallback ──────

describe("handleChannelCreate — noscript with empty corsOrigins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles add-feed action when corsOrigins is empty", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        action: "add-feed",
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "",
        "feeds[0][name]": "Feed One",
        "feeds[0][url]": "https://example.com/feed.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(2);
  });

  it("handles remove-feed action when corsOrigins is empty", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        action: "remove-feed",
        removeIndex: "1",
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: "",
        "feeds[0][name]": "Feed One",
        "feeds[0][url]": "https://example.com/one.xml",
        "feeds[1][name]": "Feed Two",
        "feeds[1][url]": "https://example.com/two.xml"
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    const templateData = render.mock.calls[0][1];
    expect(templateData.feeds).toHaveLength(1);
  });

  it("handles zero-feed validation when corsOrigins is empty", async () => {
    const request = makeFormRequest(
      "https://feedmail.example.com/admin/channels",
      {
        id: "new-ch",
        siteName: "New Channel",
        siteUrl: "https://example.com",
        fromUser: "hello",
        fromName: "Sender",
        corsOrigins: ""
      }
    );

    const response = await handleChannelCreate(request, env);

    expect(callApi).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: expect.stringContaining("feed")
      })
    );
  });
});

// ─── Coverage gap: handleChannelDetail — error branches ─────────────────────

describe("handleChannelDetail — error branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders error when API returns non-404 error with domain", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Server error" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-channel"
    );
    const response = await handleChannelDetail(request, env, "test-channel");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: "Server error",
        domain: "feedmail.example.com"
      })
    );
  });

  it("renders 404 error with domain", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: "Not found" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/missing"
    );
    const response = await handleChannelDetail(request, env, "missing");

    expect(response.status).toBe(404);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        error: "Channel not found",
        domain: "feedmail.example.com"
      })
    );
  });

  it("handles channel with missing corsOrigins gracefully", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: "test", siteName: "Test", siteUrl: "https://example.com", fromUser: "hello", fromName: "Sender" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test"
    );
    const response = await handleChannelDetail(request, env, "test");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminChannelForm",
      expect.objectContaining({
        channel: expect.objectContaining({
          corsOrigins: ""
        })
      })
    );
  });
});

// ─── Coverage gap: parseFeedRows — non-string value branch ──────────────────

describe("parseFeedRows — edge cases", () => {
  it("handles non-string form values", () => {
    const formData = new FormData();
    const blob = new Blob(["test"]);
    formData.append("feeds[0][name]", blob);
    formData.append("feeds[0][url]", "https://example.com/feed.xml");

    const feeds = parseFeedRows(formData);

    expect(feeds).toHaveLength(1);
    // Non-string value is preserved as-is
    expect(feeds[0].url).toBe("https://example.com/feed.xml");
  });
});
