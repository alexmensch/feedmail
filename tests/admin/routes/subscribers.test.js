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
        selectedChannelId: "ch1",
        selectedStatus: "pending"
      })
    );
  });

  it("shows empty state when no channelId is selected", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [{ id: "ch1", siteName: "Site One" }] }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/subscribers"
    );
    const response = await handleSubscriberList(request, env);

    expect(response.status).toBe(200);
    // Should not fetch subscribers when no channelId
    expect(callApi).toHaveBeenCalledTimes(1); // Only channels call
    expect(render).toHaveBeenCalledWith(
      "adminSubscribers",
      expect.objectContaining({
        subscribers: undefined
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
});
