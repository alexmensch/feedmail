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

import { jsonResponse } from "../../shared/lib/response.js";
import { render } from "../../shared/lib/templates.js";
import { getCredential } from "../../shared/lib/db.js";
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
  createSession as createSessionDb
} from "../lib/db.js";
import {
  getSessionFromCookie,
  getCookieValue,
  createSessionCookie,
  SESSION_TTL_SECONDS
} from "../lib/session.js";
import { isHtmxRequest, fragmentResponse } from "../lib/htmx.js";

/** Fixed WebAuthn user ID for the single admin user (as Uint8Array). */
const WEBAUTHN_USER_ID = new TextEncoder().encode(
  "10000000-0000-4000-8000-feedmai10001"
);

/** Challenge TTL in seconds (5 minutes). */
const CHALLENGE_TTL_SECONDS = 300;

/** Cookie name for linking authentication challenges to browser sessions. */
const CHALLENGE_COOKIE_NAME = "feedmail_webauthn_challenge";

/**
 * Build the passkey management page URL with a query parameter.
 * @param {string} domain
 * @param {string} param - Query parameter name ("error" or "success")
 * @param {string} value - Query parameter value
 * @returns {string}
 */
function passkeyManagementUrl(domain, param, value) {
  return `https://${domain}/admin/settings?${param}=${encodeURIComponent(value)}`;
}

/**
 * Render the passkey list fragment with current credentials.
 * @param {object} db - D1 database binding
 * @param {object} [feedbackData] - Optional {success, error} for feedback messages
 * @returns {Promise<Response>}
 */
async function renderPasskeyListFragment(db, feedbackData = {}) {
  const credentials = await getPasskeyCredentials(db);
  return fragmentResponse(
    render("adminPasskeyList", {
      credentials,
      ...feedbackData
    })
  );
}

/**
 * Retrieve and consume a WebAuthn challenge in one step.
 * Deletes the challenge immediately after retrieval and validates expiry.
 *
 * @param {object} db - D1 database binding
 * @param {string} token - Session or challenge token
 * @param {string} type - "registration" or "authentication"
 * @returns {Promise<{ challenge: string } | null>} The challenge string, or null if not found/expired
 */
async function consumeChallenge(db, token, type) {
  const row = await getWebAuthnChallenge(db, token, type);

  // Always delete after retrieval
  if (row) {
    await deleteWebAuthnChallenge(db, token, type);
  }

  if (!row) {
    return null;
  }

  // Check expiry
  const expiresAt = new Date(`${row.expires_at}Z`);
  if (expiresAt <= new Date()) {
    return null;
  }

  return { challenge: row.challenge };
}

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
  const result = await consumeChallenge(env.DB, sessionToken, "registration");

  if (!result) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge not found or expired"
    });
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: result.challenge,
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
  const challengeToken = getCookieValue(request, CHALLENGE_COOKIE_NAME);

  if (!challengeToken) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge not found"
    });
  }

  const result = await consumeChallenge(
    env.DB,
    challengeToken,
    "authentication"
  );

  if (!result) {
    return jsonResponse(400, {
      verified: false,
      error: "Challenge not found or expired"
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

  const storedCredential = await getPasskeyCredentialById(env.DB, credentialId);

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
      expectedChallenge: result.challenge,
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
 * POST /admin/passkeys/{credentialId}/rename
 * Rename a passkey credential. Requires authenticated session.
 * For HTMX requests, returns the passkey list fragment.
 */
export async function handlePasskeyRename(request, env, credentialId) {
  const htmx = isHtmxRequest(request);

  // Check credential exists
  const credential = await getPasskeyCredentialById(env.DB, credentialId);
  if (!credential) {
    if (htmx) {
      return renderPasskeyListFragment(env.DB, {
        error: "Passkey not found"
      });
    }
    return Response.redirect(
      passkeyManagementUrl(env.DOMAIN, "error", "Passkey not found"),
      302
    );
  }

  let name;
  try {
    const formData = await request.formData();
    name = formData.get("name") || "";
  } catch {
    if (htmx) {
      return renderPasskeyListFragment(env.DB, {
        error: "Invalid form data"
      });
    }
    return Response.redirect(
      passkeyManagementUrl(env.DOMAIN, "error", "Invalid form data"),
      302
    );
  }

  name = name.trim();

  if (!name) {
    if (htmx) {
      return renderPasskeyListFragment(env.DB, {
        error: "Name cannot be empty"
      });
    }
    return Response.redirect(
      passkeyManagementUrl(env.DOMAIN, "error", "Name cannot be empty"),
      302
    );
  }

  if (name.length > 100) {
    if (htmx) {
      return renderPasskeyListFragment(env.DB, {
        error: "Name must be 100 characters or fewer"
      });
    }
    return Response.redirect(
      passkeyManagementUrl(
        env.DOMAIN,
        "error",
        "Name must be 100 characters or fewer"
      ),
      302
    );
  }

  await updatePasskeyCredentialName(env.DB, credentialId, name);

  if (htmx) {
    return renderPasskeyListFragment(env.DB, { success: "Passkey renamed" });
  }

  return Response.redirect(
    passkeyManagementUrl(env.DOMAIN, "success", "Passkey renamed"),
    302
  );
}

/**
 * POST /admin/passkeys/{credentialId}/delete
 * Delete a passkey credential. Idempotent. Requires authenticated session.
 * For HTMX requests, returns the passkey list fragment.
 */
export async function handlePasskeyDelete(request, env, credentialId) {
  const htmx = isHtmxRequest(request);

  await deletePasskeyCredential(env.DB, credentialId);

  if (htmx) {
    return renderPasskeyListFragment(env.DB, { success: "Passkey deleted" });
  }

  return Response.redirect(
    passkeyManagementUrl(env.DOMAIN, "success", "Passkey deleted"),
    302
  );
}

/**
 * GET /admin/passkeys/{credentialId}/delete/confirm
 * Returns an inline confirmation fragment for passkey deletion.
 */
export async function handlePasskeyDeleteConfirm(request, env, credentialId) {
  if (!isHtmxRequest(request)) {
    return Response.redirect(`https://${env.DOMAIN}/admin/settings`, 302);
  }

  const credential = await getPasskeyCredentialById(env.DB, credentialId);

  if (!credential) {
    return fragmentResponse(
      render("adminDeleteConfirm", {
        message: "Passkey not found.",
        confirmAction: `/admin/passkeys/${encodeURIComponent(credentialId)}/delete`,
        cancelHtml: `<button type="button" class="btn-small btn-danger" hx-get="/admin/passkeys/${encodeURIComponent(credentialId)}/delete/confirm" hx-target="#passkey-delete-${encodeURIComponent(credentialId)}" hx-swap="innerHTML">Delete</button>`
      })
    );
  }

  const passkeyName = credential.name || "Unnamed passkey";
  const allCredentials = await getPasskeyCredentials(env.DB);
  const isOnlyPasskey = allCredentials.length <= 1;
  const warning = isOnlyPasskey
    ? ` This is your only passkey — magic link will be the only login method.`
    : "";

  const html = render("adminDeleteConfirm", {
    message: `Delete passkey "${passkeyName}"?${warning} This cannot be undone.`,
    confirmAction: `/admin/passkeys/${encodeURIComponent(credentialId)}/delete`,
    htmxPost: `/admin/passkeys/${encodeURIComponent(credentialId)}/delete`,
    htmxTarget: "#passkey-list",
    htmxSwap: "innerHTML",
    cancelHtml: `<button type="button" class="btn-small btn-danger" hx-get="/admin/passkeys/${encodeURIComponent(credentialId)}/delete/confirm" hx-target="#passkey-delete-${encodeURIComponent(credentialId)}" hx-swap="innerHTML">Delete</button>`
  });
  return fragmentResponse(html);
}
