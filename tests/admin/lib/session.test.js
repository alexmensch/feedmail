import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/admin/lib/db.js", () => ({
  getSession: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
}));

import {
  requireSession,
  getSessionFromCookie,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS
} from "../../../src/admin/lib/session.js";
import { getSession } from "../../../src/admin/lib/db.js";

describe("session constants", () => {
  describe("SESSION_COOKIE_NAME", () => {
    it("equals 'feedmail_admin_session'", () => {
      expect(SESSION_COOKIE_NAME).toBe("feedmail_admin_session");
    });
  });

  describe("SESSION_TTL_SECONDS", () => {
    it("equals 86400 (24 hours)", () => {
      expect(SESSION_TTL_SECONDS).toBe(86400);
    });
  });
});

describe("getSessionFromCookie", () => {
  it("extracts session token from cookie header", () => {
    const request = new Request("https://example.com/admin", {
      headers: {
        Cookie: "feedmail_admin_session=test-session-token; other=value"
      }
    });

    const token = getSessionFromCookie(request);

    expect(token).toBe("test-session-token");
  });

  it("returns null when cookie header is missing", () => {
    const request = new Request("https://example.com/admin");

    const token = getSessionFromCookie(request);

    expect(token).toBeNull();
  });

  it("returns null when session cookie is not present among cookies", () => {
    const request = new Request("https://example.com/admin", {
      headers: {
        Cookie: "other_cookie=value; another=thing"
      }
    });

    const token = getSessionFromCookie(request);

    expect(token).toBeNull();
  });

  it("handles session cookie as the only cookie", () => {
    const request = new Request("https://example.com/admin", {
      headers: {
        Cookie: "feedmail_admin_session=solo-session-token"
      }
    });

    const token = getSessionFromCookie(request);

    expect(token).toBe("solo-session-token");
  });

  it("returns null for empty cookie header", () => {
    const request = new Request("https://example.com/admin", {
      headers: {
        Cookie: ""
      }
    });

    const token = getSessionFromCookie(request);

    expect(token).toBeNull();
  });
});

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null (allows through) when session is valid and not expired", async () => {
    const futureExpiry = new Date(
      Date.now() + 3600 * 1000
    ).toISOString().replace("T", " ").replace("Z", "");
    getSession.mockResolvedValue({
      id: 1,
      token: "valid-session-token",
      expires_at: futureExpiry
    });

    const request = new Request("https://example.com/admin/dashboard", {
      headers: {
        Cookie: "feedmail_admin_session=valid-session-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeNull();
    expect(result.session).toBeTruthy();
    expect(getSession).toHaveBeenCalledWith({}, "valid-session-token");
  });

  it("returns redirect to /admin/login when no session cookie present", async () => {
    const request = new Request("https://example.com/admin/dashboard");

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("Location")).toContain("/admin/login");
  });

  it("returns redirect to /admin/login when session token not found in D1", async () => {
    getSession.mockResolvedValue(null);

    const request = new Request("https://example.com/admin/dashboard", {
      headers: {
        Cookie: "feedmail_admin_session=invalid-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("Location")).toContain("/admin/login");
  });

  it("returns redirect to /admin/login when session is expired", async () => {
    const pastExpiry = new Date(
      Date.now() - 3600 * 1000
    ).toISOString().replace("T", " ").replace("Z", "");
    getSession.mockResolvedValue({
      id: 1,
      token: "expired-session-token",
      expires_at: pastExpiry
    });

    const request = new Request("https://example.com/admin/dashboard", {
      headers: {
        Cookie: "feedmail_admin_session=expired-session-token"
      }
    });

    const result = await requireSession(request, { DB: {} });

    expect(result.response).toBeInstanceOf(Response);
    expect(result.response.status).toBe(302);
    expect(result.response.headers.get("Location")).toContain("/admin/login");
  });

  it("preserves the originally requested path in redirect query param", async () => {
    const request = new Request(
      "https://example.com/admin/channels/123/feeds"
    );

    const result = await requireSession(request, { DB: {} });

    expect(result.response.status).toBe(302);
    const location = result.response.headers.get("Location");
    expect(location).toContain("redirect=");
    expect(location).toContain(
      encodeURIComponent("/admin/channels/123/feeds")
    );
  });

  it("validates redirect parameter starts with /admin", async () => {
    // When the middleware generates a redirect, it should only include
    // paths that start with /admin to prevent open redirect attacks
    const request = new Request("https://example.com/admin/settings");

    const result = await requireSession(request, { DB: {} });

    expect(result.response.status).toBe(302);
    const location = result.response.headers.get("Location");
    const redirectParam = new URL(
      location,
      "https://example.com"
    ).searchParams.get("redirect");
    expect(redirectParam).toMatch(/^\/admin/);
  });
});
