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

import {
  handleDashboard,
  handleSendTrigger
} from "../../../src/admin/routes/dashboard.js";
import { callApi } from "../../../src/admin/lib/api.js";
import { render } from "../../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

function makeRequest(method, path, headers = {}) {
  return new Request(`https://feedmail.example.com${path}`, {
    method,
    headers: new Headers(headers)
  });
}

describe("handleDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches channels and stats, renders dashboard template", async () => {
    callApi
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          channels: [
            { id: "ch1", siteName: "Site One" },
            { id: "ch2", siteName: "Site Two" }
          ]
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          total: 10,
          verified: 5,
          pending: 3,
          unsubscribed: 2,
          sentItems: 100
        }
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: {
          total: 20,
          verified: 15,
          pending: 4,
          unsubscribed: 1,
          sentItems: 200
        }
      });

    const request = makeRequest("GET", "/admin");
    const response = await handleDashboard(request, env);

    expect(response.status).toBe(200);
    expect(callApi).toHaveBeenCalledWith(env, "GET", "/admin/channels");
    expect(callApi).toHaveBeenCalledWith(
      env,
      "GET",
      expect.stringContaining("/admin/stats?channelId=ch1")
    );
    expect(callApi).toHaveBeenCalledWith(
      env,
      "GET",
      expect.stringContaining("/admin/stats?channelId=ch2")
    );
    expect(render).toHaveBeenCalledWith(
      "adminDashboard",
      expect.objectContaining({
        activePage: "dashboard"
      })
    );
  });

  it("handles API error gracefully and displays error message", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Internal error" }
    });

    const request = makeRequest("GET", "/admin");
    const response = await handleDashboard(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminDashboard",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });

  it("handles no channels with empty state", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = makeRequest("GET", "/admin");
    const response = await handleDashboard(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminDashboard",
      expect.objectContaining({
        channels: []
      })
    );
  });

  it("displays success query param as feedback message", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = makeRequest("GET", "/admin?success=Feed+check+completed");
    const response = await handleDashboard(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminDashboard",
      expect.objectContaining({
        success: "Feed check completed"
      })
    );
  });

  it("displays error query param as feedback message", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { channels: [] }
    });

    const request = makeRequest("GET", "/admin?error=Something+went+wrong");
    const response = await handleDashboard(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminDashboard",
      expect.objectContaining({
        error: "Something went wrong"
      })
    );
  });
});

describe("handleSendTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls POST /api/send and redirects with success", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { message: "ok" }
    });

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://feedmail.example.com/admin"
      },
      body: ""
    });

    const response = await handleSendTrigger(request, env);

    expect(callApi).toHaveBeenCalledWith(env, "POST", "/send", undefined);
    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("/admin");
    expect(location).toContain("success=");
  });

  it("includes channelId in API call when provided in form data", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { message: "ok" }
    });

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://feedmail.example.com/admin/channels/test-ch"
      },
      body: "channelId=test-ch"
    });

    const response = await handleSendTrigger(request, env);

    expect(callApi).toHaveBeenCalledWith(
      env,
      "POST",
      "/send",
      expect.objectContaining({ channelId: "test-ch" })
    );
    expect(response.status).toBe(302);
  });

  it("redirects with error when API call fails", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 500,
      data: { error: "Send failed" }
    });

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
    expect(response.headers.get("Location")).toContain("error=");
  });

  it("validates referer to start with /admin, falls back to /admin", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { message: "ok" }
    });

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: "https://evil.com/phishing"
      },
      body: ""
    });

    const response = await handleSendTrigger(request, env);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("/admin");
    expect(location).not.toContain("/phishing");
  });

  it("falls back to /admin when no referer header", async () => {
    callApi.mockResolvedValue({
      ok: true,
      status: 200,
      data: { message: "ok" }
    });

    const request = new Request("https://feedmail.example.com/admin/send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: ""
    });

    const response = await handleSendTrigger(request, env);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("/admin");
  });

  it("redirects with rate limit error when API returns 429", async () => {
    callApi.mockResolvedValue({
      ok: false,
      status: 429,
      data: { error: "Too Many Requests" }
    });

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
    expect(response.headers.get("Location")).toContain("error=");
  });
});
