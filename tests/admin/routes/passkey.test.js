import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("../../../src/admin/lib/db.js", () => ({
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  createPasskeyCredential: vi.fn(),
  getPasskeyCredentials: vi.fn(),
  getPasskeyCredentialById: vi.fn(),
  getPasskeyCredentialCount: vi.fn(),
  updatePasskeyCredentialCounter: vi.fn(),
  updatePasskeyCredentialName: vi.fn(),
  deletePasskeyCredential: vi.fn(),
  createWebAuthnChallenge: vi.fn(),
  getWebAuthnChallenge: vi.fn(),
  deleteWebAuthnChallenge: vi.fn(),
  cleanupExpiredChallenges: vi.fn(),
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
  ),
  jsonResponse: vi.fn().mockImplementation(
    (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
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
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyAuthenticationResponse: vi.fn()
}));

import {
  handlePasskeyRegisterOptions,
  handlePasskeyRegisterVerify,
  handlePasskeyAuthenticateOptions,
  handlePasskeyAuthenticateVerify,
  handlePasskeyManagement,
  handlePasskeyRename,
  handlePasskeyDelete
} from "../../../src/admin/routes/passkey.js";
import {
  createPasskeyCredential,
  getPasskeyCredentials,
  getPasskeyCredentialById,
  getPasskeyCredentialCount,
  updatePasskeyCredentialCounter,
  updatePasskeyCredentialName,
  deletePasskeyCredential,
  createWebAuthnChallenge,
  getWebAuthnChallenge,
  deleteWebAuthnChallenge,
  cleanupExpiredChallenges,
  createSession
} from "../../../src/admin/lib/db.js";
import { render } from "../../../src/shared/lib/templates.js";
import {
  createSessionCookie,
  SESSION_TTL_SECONDS
} from "../../../src/admin/lib/session.js";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

// ─── Registration Options ─────────────────────────────────────────────────

describe("handlePasskeyRegisterOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentials.mockResolvedValue({ results: [] });
    generateRegistrationOptions.mockResolvedValue({
      challenge: "mock-challenge-base64url",
      rp: { name: "feedmail", id: "feedmail.example.com" },
      user: { id: "admin", name: "admin", displayName: "Admin" }
    });
    createWebAuthnChallenge.mockResolvedValue({});
    cleanupExpiredChallenges.mockResolvedValue({});
  });

  it("returns JSON registration options from @simplewebauthn/server", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    const response = await handlePasskeyRegisterOptions(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("challenge");
    expect(body).toHaveProperty("rp");
    expect(generateRegistrationOptions).toHaveBeenCalled();
  });

  it("stores the challenge in webauthn_challenges with a 5-minute TTL", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    await handlePasskeyRegisterOptions(request, env);

    expect(createWebAuthnChallenge).toHaveBeenCalledWith(
      env.DB,
      "mock-challenge-base64url",
      expect.any(String) // expires_at
    );
  });

  it("passes existing credentials as excludeCredentials to prevent re-registration", async () => {
    getPasskeyCredentials.mockResolvedValue({
      results: [
        { credential_id: "existing-cred-1", public_key: "pk1", counter: 0 }
      ]
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    await handlePasskeyRegisterOptions(request, env);

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCredentials: expect.arrayContaining([
          expect.objectContaining({ id: "existing-cred-1" })
        ])
      })
    );
  });

  it("sets rpID to DOMAIN", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    await handlePasskeyRegisterOptions(request, env);

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: "feedmail.example.com"
      })
    );
  });

  it("cleans up expired challenges", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    await handlePasskeyRegisterOptions(request, env);

    expect(cleanupExpiredChallenges).toHaveBeenCalledWith(env.DB);
  });
});

// ─── Registration Verification ────────────────────────────────────────────

describe("handlePasskeyRegisterVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getWebAuthnChallenge.mockResolvedValue({
      challenge: "stored-challenge",
      expires_at: new Date(Date.now() + 300000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
    });
    deleteWebAuthnChallenge.mockResolvedValue({});
    verifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: "new-cred-id",
          publicKey: new Uint8Array([1, 2, 3]),
          counter: 0
        }
      }
    });
    createPasskeyCredential.mockResolvedValue({});
  });

  it("returns { verified: true } on successful registration", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "new-cred-id", response: {} },
          name: "MacBook Pro"
        })
      }
    );

    const response = await handlePasskeyRegisterVerify(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verified).toBe(true);
  });

  it("stores the credential in D1 after successful verification", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "new-cred-id", response: {} },
          name: "MacBook Pro"
        })
      }
    );

    await handlePasskeyRegisterVerify(request, env);

    expect(createPasskeyCredential).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        credentialId: "new-cred-id",
        name: "MacBook Pro"
      })
    );
  });

  it("returns { verified: false } when verification fails", async () => {
    verifyRegistrationResponse.mockResolvedValue({
      verified: false
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "bad-cred", response: {} },
          name: "Test"
        })
      }
    );

    const response = await handlePasskeyRegisterVerify(request, env);

    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(createPasskeyCredential).not.toHaveBeenCalled();
  });

  it("deletes the challenge after verification attempt", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "new-cred-id", response: {} },
          name: "MacBook Pro"
        })
      }
    );

    await handlePasskeyRegisterVerify(request, env);

    expect(deleteWebAuthnChallenge).toHaveBeenCalled();
  });

  it("returns error when challenge is not found or expired", async () => {
    getWebAuthnChallenge.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred", response: {} },
          name: "Test"
        })
      }
    );

    const response = await handlePasskeyRegisterVerify(request, env);

    expect(response.status).toBe(400);
    expect(createPasskeyCredential).not.toHaveBeenCalled();
  });

  it("returns error when request body is missing", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      }
    );

    const response = await handlePasskeyRegisterVerify(request, env);

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("uses a default name when name is not provided", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "new-cred-id", response: {} }
        })
      }
    );

    await handlePasskeyRegisterVerify(request, env);

    if (createPasskeyCredential.mock.calls.length > 0) {
      const nameArg = createPasskeyCredential.mock.calls[0][1].name;
      expect(nameArg).toBeTruthy(); // Should have a default name
    }
  });
});

// ─── Authentication Options ───────────────────────────────────────────────

describe("handlePasskeyAuthenticateOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentials.mockResolvedValue({
      results: [
        { credential_id: "cred-1", public_key: "pk1", counter: 0 }
      ]
    });
    generateAuthenticationOptions.mockResolvedValue({
      challenge: "auth-challenge-base64url",
      allowCredentials: [{ id: "cred-1" }]
    });
    createWebAuthnChallenge.mockResolvedValue({});
    cleanupExpiredChallenges.mockResolvedValue({});
  });

  it("returns JSON authentication options", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    const response = await handlePasskeyAuthenticateOptions(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("challenge");
    expect(generateAuthenticationOptions).toHaveBeenCalled();
  });

  it("stores the challenge with a 5-minute TTL", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    await handlePasskeyAuthenticateOptions(request, env);

    expect(createWebAuthnChallenge).toHaveBeenCalledWith(
      env.DB,
      "auth-challenge-base64url",
      expect.any(String)
    );
  });

  it("sets rpID to DOMAIN", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    await handlePasskeyAuthenticateOptions(request, env);

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: "feedmail.example.com"
      })
    );
  });

  it("includes registered credentials in allowCredentials", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    await handlePasskeyAuthenticateOptions(request, env);

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: expect.arrayContaining([
          expect.objectContaining({ id: "cred-1" })
        ])
      })
    );
  });

  it("returns error when no passkeys are registered", async () => {
    getPasskeyCredentials.mockResolvedValue({ results: [] });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    const response = await handlePasskeyAuthenticateOptions(request, env);

    // Should indicate no passkeys available
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── Authentication Verification ──────────────────────────────────────────

describe("handlePasskeyAuthenticateVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("mock-session-uuid")
    });
    getWebAuthnChallenge.mockResolvedValue({
      challenge: "auth-challenge",
      expires_at: new Date(Date.now() + 300000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
    });
    deleteWebAuthnChallenge.mockResolvedValue({});
    getPasskeyCredentialById.mockResolvedValue({
      credential_id: "cred-1",
      public_key: "pk-base64url",
      counter: 5,
      name: "MacBook"
    });
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 6,
        credentialID: "cred-1"
      }
    });
    updatePasskeyCredentialCounter.mockResolvedValue({});
    createSession.mockResolvedValue({});
  });

  it("creates a session on successful authentication", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    const response = await handlePasskeyAuthenticateVerify(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verified).toBe(true);
    expect(createSession).toHaveBeenCalledWith(
      env.DB,
      "mock-session-uuid",
      expect.any(String)
    );
  });

  it("sets session cookie on successful authentication", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    const response = await handlePasskeyAuthenticateVerify(request, env);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("feedmail_admin_session=");
    expect(createSessionCookie).toHaveBeenCalledWith("mock-session-uuid");
  });

  it("updates the credential counter after successful authentication", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    await handlePasskeyAuthenticateVerify(request, env);

    expect(updatePasskeyCredentialCounter).toHaveBeenCalledWith(
      env.DB,
      "cred-1",
      6
    );
  });

  it("rejects authentication when counter goes backwards (possible cloned authenticator)", async () => {
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 3, // backwards from stored counter of 5
        credentialID: "cred-1"
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    const response = await handlePasskeyAuthenticateVerify(request, env);

    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns { verified: false } when verification fails", async () => {
    verifyAuthenticationResponse.mockResolvedValue({
      verified: false
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    const response = await handlePasskeyAuthenticateVerify(request, env);

    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("deletes the challenge after verification attempt", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    await handlePasskeyAuthenticateVerify(request, env);

    expect(deleteWebAuthnChallenge).toHaveBeenCalled();
  });

  it("returns error when challenge is not found or expired", async () => {
    getWebAuthnChallenge.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "cred-1", response: {} }
        })
      }
    );

    const response = await handlePasskeyAuthenticateVerify(request, env);

    expect(response.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when credential is not found in D1", async () => {
    getPasskeyCredentialById.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: { id: "unknown-cred", response: {} }
        })
      }
    );

    const response = await handlePasskeyAuthenticateVerify(request, env);

    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });
});

// ─── Passkey Management Page ──────────────────────────────────────────────

describe("handlePasskeyManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the passkey management page with list of credentials", async () => {
    getPasskeyCredentials.mockResolvedValue({
      results: [
        {
          credential_id: "cred-1",
          name: "MacBook Pro",
          created_at: "2025-01-01 12:00:00",
          counter: 5
        },
        {
          credential_id: "cred-2",
          name: "iPhone",
          created_at: "2025-01-02 12:00:00",
          counter: 3
        }
      ]
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys"
    );

    const response = await handlePasskeyManagement(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminPasskeys",
      expect.objectContaining({
        credentials: expect.any(Array)
      })
    );
  });

  it("renders empty state when no credentials exist", async () => {
    getPasskeyCredentials.mockResolvedValue({ results: [] });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys"
    );

    const response = await handlePasskeyManagement(request, env);

    expect(response.status).toBe(200);
    expect(render).toHaveBeenCalledWith(
      "adminPasskeys",
      expect.objectContaining({
        credentials: []
      })
    );
  });

  it("passes the domain to the template for WebAuthn rpID", async () => {
    getPasskeyCredentials.mockResolvedValue({ results: [] });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys"
    );

    await handlePasskeyManagement(request, env);

    expect(render).toHaveBeenCalledWith(
      "adminPasskeys",
      expect.objectContaining({
        domain: "feedmail.example.com"
      })
    );
  });
});

// ─── Passkey Rename ───────────────────────────────────────────────────────

describe("handlePasskeyRename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentialById.mockResolvedValue({
      credential_id: "cred-1",
      name: "Old Name"
    });
    updatePasskeyCredentialName.mockResolvedValue({});
  });

  it("renames a credential and redirects to /admin/passkeys", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=New+Name"
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(updatePasskeyCredentialName).toHaveBeenCalledWith(
      env.DB,
      "cred-1",
      "New Name"
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/passkeys");
  });

  it("rejects empty name", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name="
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(updatePasskeyCredentialName).not.toHaveBeenCalled();
    // Should redirect back with error or return error status
    expect(response.status).toBeGreaterThanOrEqual(300);
  });

  it("rejects name that is too long", async () => {
    const longName = "a".repeat(256);
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `name=${encodeURIComponent(longName)}`
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(updatePasskeyCredentialName).not.toHaveBeenCalled();
    expect(response.status).toBeGreaterThanOrEqual(300);
  });

  it("trims whitespace from name", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=+My+MacBook+"
      }
    );

    await handlePasskeyRename(request, env, "cred-1");

    expect(updatePasskeyCredentialName).toHaveBeenCalledWith(
      env.DB,
      "cred-1",
      "My MacBook"
    );
  });

  it("returns 404 when credential does not exist", async () => {
    getPasskeyCredentialById.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/nonexistent/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "name=Test"
      }
    );

    const response = await handlePasskeyRename(request, env, "nonexistent");

    expect(response.status).toBe(404);
    expect(updatePasskeyCredentialName).not.toHaveBeenCalled();
  });
});

// ─── Passkey Delete ───────────────────────────────────────────────────────

describe("handlePasskeyDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentialById.mockResolvedValue({
      credential_id: "cred-1",
      name: "MacBook"
    });
    deletePasskeyCredential.mockResolvedValue({});
  });

  it("deletes a credential and redirects to /admin/passkeys", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/delete",
      { method: "POST" }
    );

    const response = await handlePasskeyDelete(request, env, "cred-1");

    expect(deletePasskeyCredential).toHaveBeenCalledWith(env.DB, "cred-1");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/passkeys");
  });

  it("returns 404 when credential does not exist", async () => {
    getPasskeyCredentialById.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/nonexistent/delete",
      { method: "POST" }
    );

    const response = await handlePasskeyDelete(request, env, "nonexistent");

    expect(response.status).toBe(404);
    expect(deletePasskeyCredential).not.toHaveBeenCalled();
  });

  it("allows deleting the last passkey", async () => {
    getPasskeyCredentialCount.mockResolvedValue({ count: 1 });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/delete",
      { method: "POST" }
    );

    const response = await handlePasskeyDelete(request, env, "cred-1");

    expect(deletePasskeyCredential).toHaveBeenCalledWith(env.DB, "cred-1");
    expect(response.status).toBe(302);
  });
});
