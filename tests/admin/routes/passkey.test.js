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
  getCookieValue: vi.fn(),
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
vi.mock("@simplewebauthn/server/helpers", () => ({
  isoBase64URL: {
    fromBuffer: vi.fn().mockReturnValue("mock-base64url-public-key"),
    toBuffer: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]))
  }
}));

import {
  handleRegisterOptions,
  handleRegisterVerify,
  handleAuthenticateOptions,
  handleAuthenticateVerify,
  handlePasskeyRename,
  handlePasskeyDelete
} from "../../../src/admin/routes/passkeys.js";
import {
  createPasskeyCredential,
  getPasskeyCredentials,
  getPasskeyCredentialById,
  updatePasskeyCredentialCounter,
  updatePasskeyCredentialName,
  deletePasskeyCredential,
  createWebAuthnChallenge,
  getWebAuthnChallenge,
  deleteWebAuthnChallenge,
  cleanupExpiredChallenges,
  createSession
} from "../../../src/admin/lib/db.js";
import { getCredential } from "../../../src/shared/lib/db.js";
import {
  createSessionCookie,
  getSessionFromCookie,
  getCookieValue
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

describe("handleRegisterOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentials.mockResolvedValue([]);
    getCredential.mockResolvedValue("admin@example.com");
    generateRegistrationOptions.mockResolvedValue({
      challenge: "mock-challenge-base64url",
      rp: { name: "feedmail", id: "feedmail.example.com" },
      user: { id: "admin", name: "admin", displayName: "Admin" }
    });
    getSessionFromCookie.mockReturnValue("test-session-token");
    createWebAuthnChallenge.mockResolvedValue({});
    cleanupExpiredChallenges.mockResolvedValue({});
  });

  it("returns JSON registration options from @simplewebauthn/server", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    const response = await handleRegisterOptions(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("challenge");
    expect(body).toHaveProperty("rp");
    expect(generateRegistrationOptions).toHaveBeenCalled();
  });

  it("stores the challenge in webauthn_challenges with session token and type", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    await handleRegisterOptions(request, env);

    expect(createWebAuthnChallenge).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        sessionToken: "test-session-token",
        challenge: "mock-challenge-base64url",
        type: "registration",
        expiresAt: expect.any(String)
      })
    );
  });

  it("passes existing credentials as excludeCredentials", async () => {
    getPasskeyCredentials.mockResolvedValue([
      { credential_id: "existing-cred-1", public_key: "pk1", counter: 0 }
    ]);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    await handleRegisterOptions(request, env);

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

    await handleRegisterOptions(request, env);

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

    await handleRegisterOptions(request, env);

    expect(cleanupExpiredChallenges).toHaveBeenCalledWith(env.DB);
  });

  it("does not fail when challenge cleanup errors", async () => {
    cleanupExpiredChallenges.mockRejectedValue(new Error("DB error"));

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/options",
      { method: "POST" }
    );

    const response = await handleRegisterOptions(request, env);

    expect(response.status).toBe(200);
  });
});

// ─── Registration Verification ────────────────────────────────────────────

describe("handleRegisterVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionFromCookie.mockReturnValue("test-session-token");
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
          counter: 0,
          transports: ["internal"]
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
          response: { id: "new-cred-id" },
          name: "MacBook Pro"
        })
      }
    );

    const response = await handleRegisterVerify(request, env);

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
          response: { id: "new-cred-id" },
          name: "MacBook Pro"
        })
      }
    );

    await handleRegisterVerify(request, env);

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
          response: { id: "bad-cred" },
          name: "Test"
        })
      }
    );

    const response = await handleRegisterVerify(request, env);

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
          response: { id: "new-cred-id" },
          name: "MacBook Pro"
        })
      }
    );

    await handleRegisterVerify(request, env);

    expect(deleteWebAuthnChallenge).toHaveBeenCalledWith(
      env.DB,
      "test-session-token",
      "registration"
    );
  });

  it("returns error when challenge is not found", async () => {
    getWebAuthnChallenge.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: { id: "cred" },
          name: "Test"
        })
      }
    );

    const response = await handleRegisterVerify(request, env);

    expect(response.status).toBe(400);
    expect(createPasskeyCredential).not.toHaveBeenCalled();
  });

  it("returns error when request body is not valid JSON", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json"
      }
    );

    const response = await handleRegisterVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
    expect(createPasskeyCredential).not.toHaveBeenCalled();
  });

  it("returns error when verifyRegistrationResponse throws", async () => {
    verifyRegistrationResponse.mockRejectedValue(new Error("Bad attestation"));

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: { id: "cred" },
          name: "Test"
        })
      }
    );

    const response = await handleRegisterVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(body.error).toBe("Verification failed");
    expect(createPasskeyCredential).not.toHaveBeenCalled();
  });

  it("returns error when challenge has expired", async () => {
    getWebAuthnChallenge.mockResolvedValue({
      challenge: "stored-challenge",
      expires_at: new Date(Date.now() - 1000)
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/register/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: { id: "cred" },
          name: "Test"
        })
      }
    );

    const response = await handleRegisterVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Challenge not found or expired");
    expect(deleteWebAuthnChallenge).toHaveBeenCalled();
  });
});

// ─── Authentication Options ───────────────────────────────────────────────

describe("handleAuthenticateOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPasskeyCredentials.mockResolvedValue([
      { credential_id: "cred-1", public_key: "pk1", counter: 0 }
    ]);
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

    const response = await handleAuthenticateOptions(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("challenge");
    expect(generateAuthenticationOptions).toHaveBeenCalled();
  });

  it("stores the challenge with session token and type", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    await handleAuthenticateOptions(request, env);

    expect(createWebAuthnChallenge).toHaveBeenCalledWith(
      env.DB,
      expect.objectContaining({
        challenge: "auth-challenge-base64url",
        type: "authentication",
        expiresAt: expect.any(String)
      })
    );
  });

  it("sets rpID to DOMAIN", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    await handleAuthenticateOptions(request, env);

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

    await handleAuthenticateOptions(request, env);

    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: expect.arrayContaining([
          expect.objectContaining({ id: "cred-1" })
        ])
      })
    );
  });

  it("does not fail when challenge cleanup errors", async () => {
    cleanupExpiredChallenges.mockRejectedValue(new Error("DB error"));

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    const response = await handleAuthenticateOptions(request, env);

    expect(response.status).toBe(200);
  });

  it("sets a challenge cookie in the response", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/options",
      { method: "POST" }
    );

    const response = await handleAuthenticateOptions(request, env);

    const setCookie = response.headers.get("Set-Cookie");
    expect(setCookie).toContain("feedmail_webauthn_challenge=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
  });
});

// ─── Authentication Verification ──────────────────────────────────────────

describe("handleAuthenticateVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("mock-session-uuid")
    });
    getCookieValue.mockReturnValue("challenge-token-123");
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
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.verified).toBe(true);
    expect(body.redirectUrl).toBe("/admin");
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
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    const cookies = response.headers.getSetCookie
      ? response.headers.getSetCookie()
      : [response.headers.get("Set-Cookie")];
    const allCookies = cookies.join("; ");
    expect(allCookies).toContain("feedmail_admin_session=");
    expect(createSessionCookie).toHaveBeenCalledWith("mock-session-uuid");
  });

  it("updates the credential counter after successful authentication", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    await handleAuthenticateVerify(request, env);

    expect(updatePasskeyCredentialCounter).toHaveBeenCalledWith(
      env.DB,
      "cred-1",
      6
    );
  });

  it("rejects authentication when counter goes backwards", async () => {
    verifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 3,
        credentialID: "cred-1"
      }
    });

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

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
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when challenge cookie is missing", async () => {
    getCookieValue.mockReturnValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    expect(response.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when request body is not valid JSON", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: "not json"
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when challenge is not found or expired", async () => {
    getWebAuthnChallenge.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Challenge not found or expired");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when credential ID is missing from body", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({ response: {} })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Missing credential ID");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when verifyAuthenticationResponse throws", async () => {
    verifyAuthenticationResponse.mockRejectedValue(new Error("Bad signature"));

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "cred-1" },
          id: "cred-1"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(body.error).toBe("Verification failed");
    expect(createSession).not.toHaveBeenCalled();
  });

  it("returns error when credential is not found in D1", async () => {
    getPasskeyCredentialById.mockResolvedValue(null);

    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/authenticate/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "feedmail_webauthn_challenge=challenge-token-123"
        },
        body: JSON.stringify({
          response: { id: "unknown-cred" },
          id: "unknown-cred"
        })
      }
    );

    const response = await handleAuthenticateVerify(request, env);

    const body = await response.json();
    expect(body.verified).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
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

  it("renames a credential and redirects to /admin/settings", async () => {
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
    expect(response.headers.get("Location")).toContain("/admin/settings");
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
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
  });

  it("rejects name that is too long", async () => {
    const longName = "a".repeat(101);
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
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
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

  it("redirects with error when form data is invalid", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/rename",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not form data"
      }
    );

    const response = await handlePasskeyRename(request, env, "cred-1");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
    expect(updatePasskeyCredentialName).not.toHaveBeenCalled();
  });

  it("redirects with error when credential does not exist", async () => {
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

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("error=");
    expect(updatePasskeyCredentialName).not.toHaveBeenCalled();
  });
});

// ─── Passkey Delete ───────────────────────────────────────────────────────

describe("handlePasskeyDelete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deletePasskeyCredential.mockResolvedValue({});
  });

  it("deletes a credential and redirects to /admin/settings", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/cred-1/delete",
      { method: "POST" }
    );

    const response = await handlePasskeyDelete(request, env, "cred-1");

    expect(deletePasskeyCredential).toHaveBeenCalledWith(env.DB, "cred-1");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("/admin/settings");
  });

  it("succeeds silently when credential does not exist (idempotent)", async () => {
    const request = new Request(
      "https://feedmail.example.com/admin/passkeys/nonexistent/delete",
      { method: "POST" }
    );

    const response = await handlePasskeyDelete(request, env, "nonexistent");

    expect(deletePasskeyCredential).toHaveBeenCalledWith(env.DB, "nonexistent");
    expect(response.status).toBe(302);
  });
});
