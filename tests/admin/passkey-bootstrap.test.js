import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock route handlers
vi.mock("../../src/admin/routes/auth.js", () => ({
  handleLogin: vi.fn(),
  handleLoginSubmit: vi.fn(),
  handleAdminVerify: vi.fn(),
  handleLogout: vi.fn()
}));
vi.mock("../../src/admin/routes/passkeys.js", () => ({
  handleRegisterOptions: vi.fn(),
  handleRegisterVerify: vi.fn(),
  handleAuthenticateOptions: vi.fn(),
  handleAuthenticateVerify: vi.fn(),
  handlePasskeyManagement: vi.fn(),
  handlePasskeyRename: vi.fn(),
  handlePasskeyDelete: vi.fn()
}));
// Mock session middleware
vi.mock("../../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
}));
// Mock admin db
vi.mock("../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialCount: vi.fn(),
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
}));
// Mock shared config for rate limiting
vi.mock("../../src/shared/lib/config.js", () => ({
  getRateLimitConfig: vi.fn()
}));
// Mock shared rate-limit
vi.mock("../../src/shared/lib/rate-limit.js", () => ({
  checkRateLimit: vi.fn(),
  getEndpointName: vi.fn()
}));
// Mock templates
vi.mock("../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>mock</html>")
}));
// Mock shared response helpers
vi.mock("../../src/shared/lib/response.js", () => ({
  htmlResponse: vi.fn().mockImplementation(
    (html, status = 200) =>
      new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));
// Mock shared db
vi.mock("../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn()
}));

import adminApp from "../../src/admin/worker.js";
import { requireSession } from "../../src/admin/lib/session.js";
import { getPasskeyCredentialCount } from "../../src/admin/lib/db.js";
import { getRateLimitConfig } from "../../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../../src/shared/lib/rate-limit.js";
import { getCredential } from "../../src/shared/lib/db.js";
import { render } from "../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.example.com${path}`, {
    method,
    headers: reqHeaders
  });
}

describe("admin dashboard — passkey bootstrap prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Session middleware: valid session
    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    // Rate limiting: allow all
    getRateLimitConfig.mockResolvedValue({});
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockReturnValue(null);

    // Admin email configured
    getCredential.mockResolvedValue("admin@example.com");
  });

  it("shows passkey setup prompt when no passkeys are registered", async () => {
    getPasskeyCredentialCount.mockResolvedValue(0);

    const request = makeRequest("GET", "/admin");

    await adminApp.fetch(request, env);

    expect(getPasskeyCredentialCount).toHaveBeenCalledWith(env.DB);
    expect(render).toHaveBeenCalledWith(
      "adminPlaceholder",
      expect.objectContaining({
        showPasskeyPrompt: true
      })
    );
  });

  it("does not show passkey setup prompt when passkeys are registered", async () => {
    getPasskeyCredentialCount.mockResolvedValue(2);

    const request = makeRequest("GET", "/admin");

    await adminApp.fetch(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminPlaceholder",
      expect.objectContaining({
        showPasskeyPrompt: false
      })
    );
  });

  it("hides passkey prompt when dismissed via query parameter", async () => {
    getPasskeyCredentialCount.mockResolvedValue(0);

    const request = makeRequest("GET", "/admin?dismissed=passkey");

    await adminApp.fetch(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminPlaceholder",
      expect.objectContaining({
        showPasskeyPrompt: false
      })
    );
  });

  it("still shows prompt on next visit after dismissal (not persisted)", async () => {
    getPasskeyCredentialCount.mockResolvedValue(0);

    // First visit with dismissal
    const request1 = makeRequest("GET", "/admin?dismissed=passkey");
    await adminApp.fetch(request1, env);

    vi.clearAllMocks();
    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });
    getCredential.mockResolvedValue("admin@example.com");
    getPasskeyCredentialCount.mockResolvedValue(0);
    getRateLimitConfig.mockResolvedValue({});
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockReturnValue(null);

    // Next visit without dismissal
    const request2 = makeRequest("GET", "/admin");
    await adminApp.fetch(request2, env);

    expect(render).toHaveBeenCalledWith(
      "adminPlaceholder",
      expect.objectContaining({
        showPasskeyPrompt: true
      })
    );
  });

  it("does not show passkey prompt when admin email is not configured", async () => {
    getCredential.mockResolvedValue(null);
    getPasskeyCredentialCount.mockResolvedValue(0);

    const request = makeRequest("GET", "/admin");

    await adminApp.fetch(request, env);

    // setupError takes precedence; no passkey prompt when setup is incomplete
    expect(render).toHaveBeenCalledWith(
      "adminPlaceholder",
      expect.objectContaining({
        setupError: expect.any(String)
      })
    );
  });
});
