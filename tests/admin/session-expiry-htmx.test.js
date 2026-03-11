import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/admin/lib/db.js", () => ({
  getSession: vi.fn()
}));

import { requireSession } from "../../src/admin/lib/session.js";
import { getSession } from "../../src/admin/lib/db.js";

describe("session expiry during HTMX requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a 302 redirect for standard requests with expired session", async () => {
    const pastExpiry = new Date(Date.now() - 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getSession.mockResolvedValue({
      id: 1,
      token: "expired-token",
      expires_at: pastExpiry
    });

    const request = new Request("https://example.com/admin/channels", {
      headers: {
        Cookie: "feedmail_admin_session=expired-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("Location")).toContain("/admin/login");
  });

  it("returns an HTML fragment with session-expired message for HTMX requests with no session cookie", async () => {
    const request = new Request("https://example.com/admin/channels", {
      headers: {
        "HX-Request": "true"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    // HTMX requests should get a fragment, not a 302 redirect
    expect(result.response.status).not.toBe(302);
    const body = await result.response.text();
    expect(body).toContain("/admin/login");
  });

  it("returns an HTML fragment with meta-refresh tag for HTMX requests with expired session", async () => {
    const pastExpiry = new Date(Date.now() - 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getSession.mockResolvedValue({
      id: 1,
      token: "expired-token",
      expires_at: pastExpiry
    });

    const request = new Request("https://example.com/admin/settings", {
      headers: {
        "HX-Request": "true",
        Cookie: "feedmail_admin_session=expired-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    const body = await result.response.text();
    // Should include a meta refresh tag pointing to /admin/login
    expect(body).toContain("meta");
    expect(body).toContain("refresh");
    expect(body).toContain("/admin/login");
  });

  it("includes a clickable login link in the HTMX session-expired fragment", async () => {
    const request = new Request("https://example.com/admin/subscribers", {
      headers: {
        "HX-Request": "true"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    const body = await result.response.text();
    // Should include a link to /admin/login that the user can click immediately
    expect(body).toContain("/admin/login");
    expect(body).toContain("href");
  });

  it("returns a 302 redirect for standard requests with no session cookie", async () => {
    const request = new Request("https://example.com/admin/channels");

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("Location")).toContain("/admin/login");
  });

  it("returns a 302 redirect for standard requests with invalid session token", async () => {
    getSession.mockResolvedValue(null);

    const request = new Request("https://example.com/admin/channels", {
      headers: {
        Cookie: "feedmail_admin_session=invalid-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("Location")).toContain("/admin/login");
  });

  it("returns an HTML fragment for HTMX requests with invalid session token", async () => {
    getSession.mockResolvedValue(null);

    const request = new Request("https://example.com/admin/channels", {
      headers: {
        "HX-Request": "true",
        Cookie: "feedmail_admin_session=invalid-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    // Should not be a redirect for HTMX
    expect(result.response.status).not.toBe(302);
    const body = await result.response.text();
    expect(body).toContain("/admin/login");
  });

  it("still allows valid sessions through for both standard and HTMX requests", async () => {
    const futureExpiry = new Date(Date.now() + 3600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getSession.mockResolvedValue({
      id: 1,
      token: "valid-token",
      expires_at: futureExpiry
    });

    const htmxRequest = new Request("https://example.com/admin/channels", {
      headers: {
        "HX-Request": "true",
        Cookie: "feedmail_admin_session=valid-token"
      }
    });

    const result = await requireSession(htmxRequest, { DB: {} });

    expect(result.response).toBeNull();
    expect(result.session).toBeTruthy();
  });
});
