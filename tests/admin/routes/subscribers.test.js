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

import { handleSubscriberList } from "../../../src/admin/routes/subscribers.js";
import { callApi } from "../../../src/admin/lib/api.js";
import { render } from "../../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("handleSubscriberList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches channels for dropdown and renders subscriber page", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        channels: [
          { id: "ch1", siteName: "Site One" },
          { id: "ch2", siteName: "Site Two" }
        ]
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(callApi).toHaveBeenCalledWith(env, "GET", "/admin/channels");
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        channels: expect.arrayContaining([
          expect.objectContaining({ id: "ch1" })
        ]),
        activePage: "subscribers"
      })
    );
  });

  it("fetches subscribers when channelId is provided", async () => {
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
              status: "verified",
              created_at: "2025-01-01 12:00:00"
            }
          ]
        }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(callApi).toHaveBeenCalledWith(
      env,
      "GET",
      expect.stringContaining("/admin/subscribers?channelId=ch1")
    );
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        subscribers: expect.arrayContaining([
          expect.objectContaining({ email: "user@example.com" })
        ])
      })
    );
  });

  it("passes status filter to API when provided", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { subscribers: [] }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1&status=verified"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(callApi).toHaveBeenCalledWith(
      env,
      "GET",
      expect.stringContaining("status=verified")
    );
  });

  it("preserves filter selections in form state", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { subscribers: [] }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1&status=pending"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        selectedStatus: "pending"
      })
    );
  });

  it("fetches subscribers on initial page load with no params", async () => {
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
            { email: "user@test.com", channel_id: "ch1", status: "verified" }
          ]
        }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    // Should fetch subscribers even without channelId
    expect(callApi).toHaveBeenCalledTimes(2);
    const templateData = render.mock.calls[0][1];
    expect(templateData.showTable).toBe(true);
    expect(templateData.subscribers).toBeDefined();
  });

  it("sets allSelected to true when no channelId param", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { subscribers: [] }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers"
    );
    await handleSubscriberList(request, env);

    const templateData = render.mock.calls[0][1];
    expect(templateData.allSelected).toBe(true);
  });

  it("sets allSelected to false when channelId is provided", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { subscribers: [] }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1"
    );
    await handleSubscriberList(request, env);

    const templateData = render.mock.calls[0][1];
    expect(templateData.allSelected).toBe(false);
  });

  it("does not include selectedChannelId in template data", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { subscribers: [] }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1"
    );
    await handleSubscriberList(request, env);

    const templateData = render.mock.calls[0][1];
    expect(templateData).not.toHaveProperty("selectedChannelId");
  });

  it("returns HTMX fragment with subscriber data on initial load", async () => {
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
            { email: "user@test.com", channel_id: "ch1", status: "verified" }
          ]
        }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers",
      { headers: { "HX-Request": "true" } }
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscriberTable",
      expect.objectContaining({
        showTable: true,
        subscribers: expect.arrayContaining([
          expect.objectContaining({ email: "user@test.com" })
        ])
      })
    );
  });

  it("shows empty message when no subscribers match filter", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { channels: [{ id: "ch1", siteName: "Site One" }] }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: { subscribers: [] }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1&status=unsubscribed"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        subscribers: []
      })
    );
  });

  it("handles no channels exist", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        channels: []
      })
    );
  });

  it("handles API error for channels fetch", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Internal error" }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });

  it("displays error when subscriber fetch fails for selected channel", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        data: { channels: [{ id: "ch1", siteName: "Site 1" }] }
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: { error: "Failed to load subscribers" }
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1"
    );

    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        error: "Failed to load subscribers"
      })
    );
  });

  it("uses fallback error message when subscriber fetch fails with null data", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        data: { channels: [{ id: "ch1", siteName: "Site 1" }] }
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        data: null
      });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers?channelId=ch1"
    );

    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        error: "Failed to load subscribers"
      })
    );
  });
});
