import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../src/admin/lib/db.js", () => ({
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  getPasskeyCredentialCount: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
}));
vi.mock("../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn(),
  getResendApiKey: vi.fn()
}));
vi.mock("../../src/shared/lib/email.js", () => ({
  sendEmail: vi.fn()
}));
vi.mock("../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>mock template</html>")
}));
vi.mock("../../src/shared/lib/response.js", () => ({
  htmlResponse: vi.fn().mockImplementation(
    (html, status = 200) =>
      new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));
vi.mock("../../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  createSessionCookie: vi.fn().mockImplementation(
    (token) =>
      `feedmail_admin_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=86400`
  ),
  clearSessionCookie: vi.fn().mockReturnValue(
    "feedmail_admin_session=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0"
  ),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
}));

import { handleLogin } from "../../src/admin/routes/auth.js";
import { getPasskeyCredentialCount } from "../../src/admin/lib/db.js";
import { render } from "../../src/shared/lib/templates.js";
import { requireSession } from "../../src/admin/lib/session.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("handleLogin — passkey integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireSession.mockResolvedValue({ session: null, response: null });
  });

  it("passes hasPasskeys=true to login template when passkeys exist in D1", async () => {
    getPasskeyCredentialCount.mockResolvedValue({ count: 2 });

    const request = new Request("https://feedmail.example.com/admin/login");

    await handleLogin(request, env);

    expect(getPasskeyCredentialCount).toHaveBeenCalledWith(env.DB);
    expect(render).toHaveBeenCalledWith(
      "adminLogin",
      expect.objectContaining({
        hasPasskeys: true
      })
    );
  });

  it("passes hasPasskeys=false to login template when no passkeys exist", async () => {
    getPasskeyCredentialCount.mockResolvedValue({ count: 0 });

    const request = new Request("https://feedmail.example.com/admin/login");

    await handleLogin(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminLogin",
      expect.objectContaining({
        hasPasskeys: false
      })
    );
  });

  it("passes domain to login template for WebAuthn rpID", async () => {
    getPasskeyCredentialCount.mockResolvedValue({ count: 1 });

    const request = new Request("https://feedmail.example.com/admin/login");

    await handleLogin(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminLogin",
      expect.objectContaining({
        domain: "feedmail.example.com"
      })
    );
  });
});
