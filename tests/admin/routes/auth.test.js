import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/db.js", () => ({
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  getPasskeyCredentialCount: vi.fn().mockResolvedValue(0),
  MAGIC_LINK_TTL_SECONDS: 900
}));
vi.mock("../../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn(),
  getResendApiKey: vi.fn()
}));
vi.mock("../../../src/shared/lib/email.js", () => ({
  sendEmail: vi.fn()
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
vi.mock("../../../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  createSessionCookie: vi
    .fn()
    .mockImplementation(
      (token) =>
        `feedmail_admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=86400`
    ),
  clearSessionCookie: vi
    .fn()
    .mockReturnValue(
      "feedmail_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0"
    ),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
}));

import {
  handleLogin,
  handleLoginSubmit,
  handleAdminVerify,
  handleLogout
} from "../../../src/admin/routes/auth.js";
import {
  createMagicLinkToken,
  getMagicLinkToken,
  markMagicLinkTokenUsed,
  createSession,
  deleteSession
} from "../../../src/admin/lib/db.js";
import { getCredential, getResendApiKey } from "../../../src/shared/lib/db.js";
import { sendEmail } from "../../../src/shared/lib/email.js";
import { render } from "../../../src/shared/lib/templates.js";
import {
  requireSession,
  getSessionFromCookie
} from "../../../src/admin/lib/session.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("handleLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: null, response: null });
  });

  it("renders the login page template", async () => {
    const request = new Request("https://feedmail.example.com/admin/login");

    const response = await handleLogin(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith("adminLogin", expect.any(Object));
  });

  it("returns HTML content type", async () => {
    const request = new Request("https://feedmail.example.com/admin/login");

    const response = await handleLogin(request, env);

    expect(response.headers.get("Content-Type")).toContain("text/html");
  });

  it("redirects to /admin when already authenticated", async () => {
    requireSession.mockResolvedValue({
      session: { id: 1, token: "valid-session-token" },
      response: null
    });

    const request = new Request("https://feedmail.example.com/admin/login");

    const response = await handleLogin(request, env);

    // Should redirect to /admin
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin");
  });

  it("preserves redirect parameter from query string", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/login?redirect=%2Fadmin%2Fchannels"
    );

    await handleLogin(request, env);

    // Should pass redirect to the template as a hidden field
    expect(render).toHaveBeenCalledWith(
      "adminLogin",
      expect.objectContaining({
        redirect: "/admin/channels"
      })
    );
  });
});

describe("handleLoginSubmit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("mock-magic-token-uuid")
    });
    sendEmail.mockResolvedValue({ success: true });
    getResendApiKey.mockResolvedValue("re_test_key");
  });

  it("always renders the 'check your email' page regardless of email match", async () => {
    getCredential.mockResolvedValue("admin@feedmail.example.com");

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin%40feedmail.example.com"
    });

    const response = await handleLoginSubmit(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith("adminLoginSent", expect.any(Object));
  });

  it("creates a token and sends email when email matches admin email", async () => {
    getCredential.mockResolvedValue("admin@feedmail.example.com");

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin%40feedmail.example.com"
    });

    await handleLoginSubmit(request, env);

    expect(createMagicLinkToken).toHaveBeenCalledWith(
      env.DB,
      "mock-magic-token-uuid",
      expect.any(String)
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it("does not create a token or send email when email does not match", async () => {
    getCredential.mockResolvedValue("admin@feedmail.example.com");

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=wrong%40example.com"
    });

    const response = await handleLoginSubmit(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith("adminLoginSent", expect.any(Object));
    expect(createMagicLinkToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("performs case-insensitive email comparison", async () => {
    getCredential.mockResolvedValue("Admin@FeedMail.Example.COM");

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin%40feedmail.example.com"
    });

    await handleLoginSubmit(request, env);

    expect(createMagicLinkToken).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  it("re-renders login page with error when email is empty", async () => {
    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email="
    });

    const response = await handleLoginSubmit(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminLogin",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
    expect(createMagicLinkToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("re-renders login page with error when email field is missing", async () => {
    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: ""
    });

    const response = await handleLoginSubmit(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminLogin",
      expect.objectContaining({
        error: expect.any(String)
      })
    );
  });

  it("shows same 'check your email' page when admin_email is not configured in D1", async () => {
    getCredential.mockResolvedValue(null);

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=someone%40example.com"
    });

    const response = await handleLoginSubmit(request, env);

    // No info leakage: same page shown
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith("adminLoginSent", expect.any(Object));
    expect(createMagicLinkToken).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("parses application/x-www-form-urlencoded body correctly", async () => {
    getCredential.mockResolvedValue("admin@feedmail.example.com");

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin%40feedmail.example.com&redirect=%2Fadmin%2Fdashboard"
    });

    await handleLoginSubmit(request, env);

    expect(createMagicLinkToken).toHaveBeenCalled();
  });

  describe("magic link email content", () => {
    beforeEach(() => {
      getCredential.mockResolvedValue("admin@feedmail.example.com");
      getResendApiKey.mockResolvedValue("re_test_resend_key");
    });

    it("sends email from admin@{DOMAIN} with name 'feedmail'", async () => {
      const request = new Request("https://feedmail.example.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=admin%40feedmail.example.com"
      });

      await handleLoginSubmit(request, env);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          from: "admin@feedmail.example.com",
          fromName: "feedmail"
        })
      );
    });

    it("sends email with subject 'Sign in to feedmail admin'", async () => {
      const request = new Request("https://feedmail.example.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=admin%40feedmail.example.com"
      });

      await handleLoginSubmit(request, env);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          subject: "Sign in to feedmail admin"
        })
      );
    });

    it("sends email to the admin email address", async () => {
      const request = new Request("https://feedmail.example.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=admin%40feedmail.example.com"
      });

      await handleLoginSubmit(request, env);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          to: "admin@feedmail.example.com"
        })
      );
    });

    it("uses shared getResendApiKey to resolve API key", async () => {
      const request = new Request("https://feedmail.example.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=admin%40feedmail.example.com"
      });

      await handleLoginSubmit(request, env);

      expect(getResendApiKey).toHaveBeenCalledWith(env);
      expect(sendEmail).toHaveBeenCalledWith(
        "re_test_resend_key",
        expect.any(Object)
      );
    });

    it("includes verify URL with token in email", async () => {
      const request = new Request("https://feedmail.example.com/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "email=admin%40feedmail.example.com"
      });

      await handleLoginSubmit(request, env);

      expect(sendEmail).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          text: expect.stringContaining(
            "https://feedmail.example.com/admin/verify?token=mock-magic-token-uuid"
          )
        })
      );
    });
  });

  it("shows same 'check your email' page when Resend API key is missing", async () => {
    getCredential.mockResolvedValue("admin@feedmail.example.com");
    getResendApiKey.mockResolvedValue(null);

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin%40feedmail.example.com"
    });

    const response = await handleLoginSubmit(request, env);

    // No info leakage
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith("adminLoginSent", expect.any(Object));
  });

  it("shows same 'check your email' page when Resend API fails", async () => {
    getCredential.mockResolvedValue("admin@feedmail.example.com");
    getResendApiKey.mockResolvedValue("re_test_key");
    sendEmail.mockResolvedValue({ success: false, error: "API error" });

    const request = new Request("https://feedmail.example.com/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=admin%40feedmail.example.com"
    });

    const response = await handleLoginSubmit(request, env);

    // No info leakage
    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith("adminLoginSent", expect.any(Object));
  });
});

describe("handleAdminVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("mock-session-token-uuid")
    });
  });

  it("creates session and redirects to /admin for valid, unused, non-expired token", async () => {
    const futureExpiry = new Date(Date.now() + 600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "valid-token",
      expires_at: futureExpiry,
      used: 0
    });
    markMagicLinkTokenUsed.mockResolvedValue({ meta: { changes: 1 } });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=valid-token"
    );

    const response = await handleAdminVerify(request, env);

    expect(markMagicLinkTokenUsed).toHaveBeenCalledWith(env.DB, "valid-token");
    expect(createSession).toHaveBeenCalledWith(
      env.DB,
      "mock-session-token-uuid",
      expect.any(String)
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin");
  });

  it("sets session cookie with correct attributes", async () => {
    const futureExpiry = new Date(Date.now() + 600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "valid-token",
      expires_at: futureExpiry,
      used: 0
    });
    markMagicLinkTokenUsed.mockResolvedValue({ meta: { changes: 1 } });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=valid-token"
    );

    const response = await handleAdminVerify(request, env);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain(
      "feedmail_admin_session=mock-session-token-uuid"
    );
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/admin");
    expect(setCookie).toContain("Max-Age=86400");
  });

  it("redirects to the redirect parameter when present and valid", async () => {
    const futureExpiry = new Date(Date.now() + 600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "valid-token",
      expires_at: futureExpiry,
      used: 0
    });
    markMagicLinkTokenUsed.mockResolvedValue({ meta: { changes: 1 } });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=valid-token&redirect=%2Fadmin%2Fchannels%2F123"
    );

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/channels/123");
  });

  it("ignores redirect parameter that does not start with /admin", async () => {
    const futureExpiry = new Date(Date.now() + 600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "valid-token",
      expires_at: futureExpiry,
      used: 0
    });
    markMagicLinkTokenUsed.mockResolvedValue({ meta: { changes: 1 } });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=valid-token&redirect=https%3A%2F%2Fevil.com"
    );

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(302);
    // Should fall back to /admin, not redirect to evil.com
    expect(response.headers.get("Location")).toBe("/admin");
  });

  it("shows error page for already-used token", async () => {
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "used-token",
      expires_at: new Date(Date.now() + 600 * 1000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", ""),
      used: 1
    });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=used-token"
    );

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.stringContaining("already been used")
      })
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("shows error page for expired token", async () => {
    const pastExpiry = new Date(Date.now() - 600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "expired-token",
      expires_at: pastExpiry,
      used: 0
    });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=expired-token"
    );

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.stringContaining("expired")
      })
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("shows expired error for missing token (token not in D1)", async () => {
    getMagicLinkToken.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=nonexistent"
    );

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.stringContaining("expired")
      })
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("shows error when token query parameter is missing", async () => {
    const request = new Request("https://feedmail.example.com/admin/verify");

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.stringContaining("expired")
      })
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("handles race condition where UPDATE changes = 0 (another tab used the token first)", async () => {
    const futureExpiry = new Date(Date.now() + 600 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");
    getMagicLinkToken.mockResolvedValue({
      id: 1,
      token: "race-token",
      expires_at: futureExpiry,
      used: 0
    });
    // The UPDATE WHERE used = 0 returns 0 changes (another tab used it)
    markMagicLinkTokenUsed.mockResolvedValue({ meta: { changes: 0 } });

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=race-token"
    );

    const response = await handleAdminVerify(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        error: expect.stringContaining("already been used")
      })
    );
    expect(createSession).not.toHaveBeenCalled();
  });

  it("error page includes a link back to /admin/login", async () => {
    getMagicLinkToken.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/verify?token=bad"
    );

    await handleAdminVerify(request, env);

    // The error template should be rendered with loginUrl
    expect(render).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        loginUrl: expect.stringContaining("/admin/login")
      })
    );
  });
});

describe("handleLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes session from D1 and redirects to /admin/login", async () => {
    const request = new Request("https://feedmail.example.com/admin/logout", {
      headers: {
        Cookie: "feedmail_admin_session=session-to-delete"
      }
    });
    getSessionFromCookie.mockReturnValue("session-to-delete");

    const response = await handleLogout(request, env);

    expect(deleteSession).toHaveBeenCalledWith(env.DB, "session-to-delete");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login");
  });

  it("clears the session cookie with expired Max-Age", async () => {
    const request = new Request("https://feedmail.example.com/admin/logout", {
      headers: {
        Cookie: "feedmail_admin_session=session-to-delete"
      }
    });
    getSessionFromCookie.mockReturnValue("session-to-delete");

    const response = await handleLogout(request, env);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("feedmail_admin_session=");
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/admin");
  });

  it("works without a valid session (idempotent logout)", async () => {
    const request = new Request("https://feedmail.example.com/admin/logout");
    getSessionFromCookie.mockReturnValue(null);

    const response = await handleLogout(request, env);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login");
    // Should not attempt to delete a null session, or handle gracefully
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it("handles expired session cookie gracefully", async () => {
    const request = new Request("https://feedmail.example.com/admin/logout", {
      headers: {
        Cookie: "feedmail_admin_session=expired-token"
      }
    });
    getSessionFromCookie.mockReturnValue("expired-token");
    deleteSession.mockResolvedValue({});

    const response = await handleLogout(request, env);

    expect(deleteSession).toHaveBeenCalledWith(env.DB, "expired-token");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login");
  });
});
