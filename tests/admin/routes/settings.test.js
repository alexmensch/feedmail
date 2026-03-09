import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/db.js", () => ({
  getPasskeyCredentials: vi.fn(),
  getPasskeyCredentialCount: vi.fn(),
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  createPasskeyCredential: vi.fn(),
  getPasskeyCredentialById: vi.fn(),
  updatePasskeyCredentialCounter: vi.fn(),
  updatePasskeyCredentialName: vi.fn(),
  deletePasskeyCredential: vi.fn(),
  createWebAuthnChallenge: vi.fn(),
  getWebAuthnChallenge: vi.fn(),
  deleteWebAuthnChallenge: vi.fn(),
  cleanupExpiredChallenges: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
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

import { handleSettings } from "../../../src/admin/routes/settings.js";
import { getPasskeyCredentials } from "../../../src/admin/lib/db.js";
import { render } from "../../../src/shared/lib/templates.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

describe("handleSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches passkeys and renders settings page", async () => {
    getPasskeyCredentials.mockResolvedValue([
      {
        credential_id: "cred-1",
        name: "MacBook Pro",
        created_at: "2025-01-01 12:00:00",
        counter: 5
      }
    ]);

    const request = new Request(
      "https://feedmail.example.com/admin/settings"
    );
    const response = await handleSettings(request, env);

    expect(response.status).toBe(200);
    expect(getPasskeyCredentials).toHaveBeenCalledWith(env.DB);
    expect(render).toHaveBeenCalledWith(
      "adminSettings",
      expect.objectContaining({
        credentials: expect.arrayContaining([
          expect.objectContaining({ credential_id: "cred-1" })
        ]),
        activePage: "settings",
        domain: "feedmail.example.com"
      })
    );
  });

  it("shows passkey bootstrap prompt when no passkeys are registered", async () => {
    getPasskeyCredentials.mockResolvedValue([]);

    const request = new Request(
      "https://feedmail.example.com/admin/settings"
    );
    const response = await handleSettings(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSettings",
      expect.objectContaining({
        credentials: [],
        showPasskeyPrompt: true
      })
    );
  });

  it("does not show passkey bootstrap prompt when passkeys exist", async () => {
    getPasskeyCredentials.mockResolvedValue([
      { credential_id: "cred-1", name: "Key", created_at: "2025-01-01", counter: 0 }
    ]);

    const request = new Request(
      "https://feedmail.example.com/admin/settings"
    );
    const response = await handleSettings(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSettings",
      expect.objectContaining({
        showPasskeyPrompt: false
      })
    );
  });

  it("displays success query param as feedback", async () => {
    getPasskeyCredentials.mockResolvedValue([]);

    const request = new Request(
      "https://feedmail.example.com/admin/settings?success=Passkey+registered"
    );
    const response = await handleSettings(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSettings",
      expect.objectContaining({
        success: "Passkey registered"
      })
    );
  });

  it("displays error query param as feedback", async () => {
    getPasskeyCredentials.mockResolvedValue([]);

    const request = new Request(
      "https://feedmail.example.com/admin/settings?error=Something+went+wrong"
    );
    const response = await handleSettings(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminSettings",
      expect.objectContaining({
        error: "Something went wrong"
      })
    );
  });
});
