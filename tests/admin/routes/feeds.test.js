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
  handleFeedNew,
  handleFeedCreate,
  handleFeedEdit,
  handleFeedUpdate,
  handleFeedDelete
} from "../../../src/admin/routes/feeds.js";
import { callApi } from "../../../src/admin/lib/api.js";
import { render } from "../../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

const FEED = {
  id: 1,
  name: "Main Feed",
  url: "https://example.com/feed.xml"
};

describe("handleFeedNew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders feed creation form for the given channel", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/new"
    );
    const response = await handleFeedNew(request, env, "test-ch");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminFeedForm",
      expect.objectContaining({
        channelId: "test-ch",
        isEdit: false,
        activePage: "channels"
      })
    );
  });
});

describe("handleFeedCreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses form data, calls POST, redirects on success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 201,
      data: { id: 2, name: "New Feed", url: "https://example.com/new.xml" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=New+Feed&url=https%3A%2F%2Fexample.com%2Fnew.xml"
      }
    );

    const response = await handleFeedCreate(request, env, "test-ch");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "POST",
      "/admin/channels/test-ch/feeds",
      expect.objectContaining({
        name: "New Feed",
        url: "https://example.com/new.xml"
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(
      "/admin/channels/test-ch"
    );
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("re-renders form with error on validation failure", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: "Invalid feed URL" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Bad+Feed&url=not-a-url"
      }
    );

    const response = await handleFeedCreate(request, env, "test-ch");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminFeedForm",
      expect.objectContaining({
        isEdit: false,
        channelId: "test-ch",
        error: expect.any(String),
        values: expect.objectContaining({
          name: "Bad Feed",
          url: "not-a-url"
        })
      })
    );
  });

  it("re-renders form with error on duplicate name or URL (409)", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: "Feed name already exists in this channel" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Main+Feed&url=https%3A%2F%2Fexample.com%2Ffeed.xml"
      }
    );

    const response = await handleFeedCreate(request, env, "test-ch");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminFeedForm",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });

  it("handles channel not found error", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: "Channel not found" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/nonexistent/feeds",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Feed&url=https%3A%2F%2Fexample.com%2Ffeed.xml"
      }
    );

    const response = await handleFeedCreate(request, env, "nonexistent");

    // Should show error (either re-render or error page)
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});

describe("handleFeedEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches feed and renders pre-filled edit form", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { feeds: [FEED, { id: 2, name: "Other", url: "https://other.com/feed.xml" }] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/1/edit"
    );
    const response = await handleFeedEdit(request, env, "test-ch", "1");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "GET",
      "/admin/channels/test-ch/feeds"
    );
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminFeedForm",
      expect.objectContaining({
        isEdit: true,
        channelId: "test-ch",
        feedId: "1",
        values: expect.objectContaining({
          name: "Main Feed",
          url: "https://example.com/feed.xml"
        })
      })
    );
  });

  it("renders error when feed not found", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { feeds: [FEED] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/999/edit"
    );
    const response = await handleFeedEdit(request, env, "test-ch", "999");

    // Feed 999 is not in the feeds list
    expect(response.status).not.toBe(200);
  });
});

describe("handleFeedUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses form data, calls PUT, redirects on success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { id: 1, name: "Updated Feed", url: "https://example.com/updated.xml" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/1",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Updated+Feed&url=https%3A%2F%2Fexample.com%2Fupdated.xml"
      }
    );

    const response = await handleFeedUpdate(request, env, "test-ch", "1");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "PUT",
      "/admin/channels/test-ch/feeds/1",
      expect.objectContaining({
        name: "Updated Feed",
        url: "https://example.com/updated.xml"
      })
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(
      "/admin/channels/test-ch"
    );
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("re-renders form with error on validation failure", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 400,
      data: { error: "Invalid feed URL" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/1",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Feed&url=not-valid"
      }
    );

    const response = await handleFeedUpdate(request, env, "test-ch", "1");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminFeedForm",
      expect.objectContaining({
        isEdit: true,
        error: expect.any(String),
        values: expect.objectContaining({
          name: "Feed",
          url: "not-valid"
        })
      })
    );
  });

  it("re-renders form with error on duplicate conflict (409)", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 409,
      data: { error: "Feed URL already exists in this channel" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/1",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Feed&url=https%3A%2F%2Fexample.com%2Fduplicate.xml"
      }
    );

    const response = await handleFeedUpdate(request, env, "test-ch", "1");

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminFeedForm",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });
});

describe("handleFeedDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls DELETE API and redirects to channel detail with success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 204,
      data: null
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/1/delete",
      { method: "POST" }
    );

    const response = await handleFeedDelete(request, env, "test-ch", "1");

    expect(callApi).toHaveBeenCalledWith(
      env,
      "DELETE",
      "/admin/channels/test-ch/feeds/1"
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain(
      "/admin/channels/test-ch"
    );
    expect(response.headers.get("Location")).toContain("success=");
  });

  it("redirects with error when feed not found", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 404,
      data: { error: "Feed not found" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/999/delete",
      { method: "POST" }
    );

    const response = await handleFeedDelete(request, env, "test-ch", "999");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
  });

  it("allows deleting last feed in a channel", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 204,
      data: null
    });

    const request = new Request(
      "https://feedmail.example.com/admin/channels/test-ch/feeds/1/delete",
      { method: "POST" }
    );

    const response = await handleFeedDelete(request, env, "test-ch", "1");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("success=");
  });
});
