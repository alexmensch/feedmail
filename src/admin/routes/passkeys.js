/**
 * Passkey (WebAuthn) routes: registration, authentication, management.
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

import { jsonResponse, htmlResponse } from "../../shared/lib/response.js";
import { render } from "../../shared/lib/templates.js";
import { getCredential } from "../../shared/lib/db.js";
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
  createSession as createSessionDb
} from "../lib/db.js";
import {
  getSessionFromCookie,
  createSessionCookie,
  SESSION_TTL_SECONDS
} from "../lib/session.js";

/** Fixed WebAuthn user ID for the single admin user (as Uint8Array). */
const WEBAUTHN_USER_ID = new TextEncoder().encode(
  "10000000-0000-4000-8000-feedmai10001"
);

/** Challenge TTL in seconds (5 minutes). */
const CHALLENGE_TTL_SECONDS = 300;

/** Cookie name for linking authentication challenges to browser sessions. */
const CHALLENGE_COOKIE_NAME = "feedmail_webauthn_challenge";

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * POST /admin/passkeys/register/options
 * Generate WebAuthn registration options. Requires authenticated session.
 */
export async function handleRegisterOptions(request, env) {
  const existingCredentials = await getPasskeyCredentials(env.DB);

  const adminEmail =
    (await getCredential(env.DB, "admin_email")) || "admin@feedmail";

  const excludeCredentials = existingCredentials.map((cred) => ({
    id: cred.credential_id,
    transports: cred.transports ? JSON.parse(cred.transports) : undefined
  }));

  const options = await generateRegistrationOptions({
    rpName: "feedmail",
    rpID: env.DOMAIN,
    userName: adminEmail,
    userDisplayName: adminEmail,
    userID: WEBAUTHN_USER_ID,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred"
    },
    excludeCredentials
  });

  // Store challenge linked to session token
  const sessionToken = getSessionFromCookie(request);
  const expiresAt = new Date(
    Date.now() + CHALLENGE_TTL_SECONDS * 1000
  ).toISOString();

  // Fire-and-forget cleanup of expired challenges
  cleanupExpiredChallenges(env.DB).catch((err) =>
    console.error("Challenge cleanup failed:", err)
  );

  await createWebAuthnChallenge(env.DB, {
    sessionToken,
    challenge: options.challenge,
    type: "registration",
    expiresAt
  });

  return jsonResponse(200, options);
}

/**
 * POST /admin/passkeys/register/verify
 * Verify WebAuthn registration response and store credential.
 */
export async function handleRegisterVerify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { verified: false, error: "Invalid JSON" });
  }

  const sessionToken = getSessionFromCookie(request);
  const challengeRow = await getWebAuthnChallenge(
    env.DB,
    sessionToken,
    "registration"
  );

  // Always delete the challenge after retrieval
  if (challengeRow) {
    await deleteWebAuthnChallenge(env.DB, sessionToken, "registration");
  }

  if (!challengeRow) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge not found or expired"
    });
  }

  // Check expiry
  const expiresAt = new Date(`${challengeRow.expires_at}Z`);
  if (expiresAt <= new Date()) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge expired"
    });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: `https://${env.DOMAIN}`,
      expectedRPID: env.DOMAIN
    });
  } catch (err) {
    console.error("Registration verification failed:", err);
    return jsonResponse(400, {
      verified: false,
      error: "Verification failed"
    });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return jsonResponse(400, { verified: false, error: "Verification failed" });
  }

  const { credential } = verification.registrationInfo;

  // Store credential — public key as base64url text
  const credentialIdBase64url = credential.id;
  const publicKeyBase64url = isoBase64URL.fromBuffer(credential.publicKey);

  await createPasskeyCredential(env.DB, {
    credentialId: credentialIdBase64url,
    publicKey: publicKeyBase64url,
    counter: credential.counter,
    transports: credential.transports,
    name: body.name || null
  });

  return jsonResponse(200, { verified: true });
}

// ─── Authentication ─────────────────────────────────────────────────────────

/**
 * POST /admin/passkeys/authenticate/options
 * Generate WebAuthn authentication options. Public (no session required).
 */
export async function handleAuthenticateOptions(request, env) {
  const existingCredentials = await getPasskeyCredentials(env.DB);

  const allowCredentials = existingCredentials.map((cred) => ({
    id: cred.credential_id,
    transports: cred.transports ? JSON.parse(cred.transports) : undefined
  }));

  const options = await generateAuthenticationOptions({
    rpID: env.DOMAIN,
    userVerification: "preferred",
    allowCredentials
  });

  // Store challenge linked to a cookie-based identifier
  const challengeToken = crypto.randomUUID();
  const expiresAt = new Date(
    Date.now() + CHALLENGE_TTL_SECONDS * 1000
  ).toISOString();

  // Fire-and-forget cleanup
  cleanupExpiredChallenges(env.DB).catch((err) =>
    console.error("Challenge cleanup failed:", err)
  );

  await createWebAuthnChallenge(env.DB, {
    sessionToken: challengeToken,
    challenge: options.challenge,
    type: "authentication",
    expiresAt
  });

  const cookieHeader = `${CHALLENGE_COOKIE_NAME}=${challengeToken}; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=${CHALLENGE_TTL_SECONDS}`;

  return new Response(JSON.stringify(options), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieHeader
    }
  });
}

/**
 * POST /admin/passkeys/authenticate/verify
 * Verify WebAuthn authentication response, create session.
 */
export async function handleAuthenticateVerify(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { verified: false, error: "Invalid JSON" });
  }

  // Get challenge token from cookie
  const cookieHeader = request.headers.get("Cookie") || "";
  let challengeToken = null;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${CHALLENGE_COOKIE_NAME}=`)) {
      challengeToken = trimmed.slice(CHALLENGE_COOKIE_NAME.length + 1);
      break;
    }
  }

  if (!challengeToken) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge not found"
    });
  }

  const challengeRow = await getWebAuthnChallenge(
    env.DB,
    challengeToken,
    "authentication"
  );

  // Always delete the challenge after retrieval
  if (challengeRow) {
    await deleteWebAuthnChallenge(env.DB, challengeToken, "authentication");
  }

  if (!challengeRow) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge not found or expired"
    });
  }

  // Check expiry
  const expiresAt = new Date(`${challengeRow.expires_at}Z`);
  if (expiresAt <= new Date()) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge expired"
    });
  }

  // Look up the credential
  const credentialId = body.response?.id || body.id;
  if (!credentialId) {
    return jsonResponse(400, {
      verified: false,
      error: "Missing credential ID"
    });
  }

  const storedCredential = await getPasskeyCredentialById(
    env.DB,
    credentialId
  );

  if (!storedCredential) {
    return jsonResponse(400, {
      verified: false,
      error: "Unknown credential"
    });
  }

  // Reconstruct the credential for verification
  const publicKeyBytes = isoBase64URL.toBuffer(storedCredential.public_key);

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: `https://${env.DOMAIN}`,
      expectedRPID: env.DOMAIN,
      credential: {
        id: storedCredential.credential_id,
        publicKey: publicKeyBytes,
        counter: storedCredential.counter,
        transports: storedCredential.transports
          ? JSON.parse(storedCredential.transports)
          : undefined
      }
    });
  } catch (err) {
    console.error("Authentication verification failed:", err);
    return jsonResponse(400, {
      verified: false,
      error: "Verification failed"
    });
  }

  if (!verification.verified) {
    return jsonResponse(400, { verified: false, error: "Verification failed" });
  }

  const { authenticationInfo } = verification;

  // Reject backwards counter (possible cloned authenticator)
  if (authenticationInfo.newCounter < storedCredential.counter) {
    console.error(
      `Passkey counter went backwards for credential ${credentialId}: stored=${storedCredential.counter}, received=${authenticationInfo.newCounter}`
    );
    return jsonResponse(400, {
      verified: false,
      error: "Authenticator counter went backwards — possible cloned device"
    });
  }

  // Update counter
  await updatePasskeyCredentialCounter(
    env.DB,
    credentialId,
    authenticationInfo.newCounter
  );

  // Create session identical to magic link verification
  const sessionToken = crypto.randomUUID();
  const sessionExpiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000
  ).toISOString();

  await createSessionDb(env.DB, sessionToken, sessionExpiresAt);

  // Clear the challenge cookie, set the session cookie
  const clearChallengeCookie = `${CHALLENGE_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/admin; Max-Age=0`;

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.append("Set-Cookie", createSessionCookie(sessionToken));
  headers.append("Set-Cookie", clearChallengeCookie);

  return new Response(
    JSON.stringify({ verified: true, redirectUrl: "/admin" }),
    { status: 200, headers }
  );
}

// ─── Management ─────────────────────────────────────────────────────────────

/**
 * GET /admin/passkeys
 * Passkey management page. Requires authenticated session.
 */
export async function handlePasskeyManagement(request, env) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error") || "";
  const success = url.searchParams.get("success") || "";

  const credentials = await getPasskeyCredentials(env.DB);

  const html = render("adminPasskeys", {
    credentials,
    error,
    success,
    domain: env.DOMAIN
  });
  return htmlResponse(html);
}

/**
 * POST /admin/passkeys/{credentialId}/rename
 * Rename a passkey credential. Requires authenticated session.
 */
export async function handlePasskeyRename(request, env, credentialId) {
  let name = "";
  try {
    const formData = await request.formData();
    name = formData.get("name") || "";
  } catch {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/passkeys?error=${encodeURIComponent("Invalid form data")}`,
      302
    );
  }

  // Cap name at 100 chars
  name = name.trim().slice(0, 100);

  if (!name) {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/passkeys?error=${encodeURIComponent("Name cannot be empty")}`,
      302
    );
  }

  await updatePasskeyCredentialName(env.DB, credentialId, name);

  return Response.redirect(
    `https://${env.DOMAIN}/admin/passkeys?success=${encodeURIComponent("Passkey renamed")}`,
    302
  );
}

/**
 * POST /admin/passkeys/{credentialId}/delete
 * Delete a passkey credential. Idempotent. Requires authenticated session.
 */
export async function handlePasskeyDelete(request, env, credentialId) {
  await deletePasskeyCredential(env.DB, credentialId);

  return Response.redirect(
    `https://${env.DOMAIN}/admin/passkeys?success=${encodeURIComponent("Passkey deleted")}`,
    302
  );
}
