/**
 * Admin authentication routes: login, magic link verification, logout.
 */

import { sendEmail } from "../../shared/lib/email.js";
import { render } from "../../shared/lib/templates.js";
import { getCredential, getResendApiKey } from "../../shared/lib/db.js";
import { htmlResponse } from "../../shared/lib/response.js";
import {
  createMagicLinkToken,
  getMagicLinkToken,
  markMagicLinkTokenUsed,
  MAGIC_LINK_TTL_SECONDS,
  createSession as createSessionDb,
  deleteSession,
  getPasskeyCredentialCount
} from "../lib/db.js";
import {
  requireSession,
  getSessionFromCookie,
  createSessionCookie,
  clearSessionCookie,
  SESSION_TTL_SECONDS
} from "../lib/session.js";

/**
 * GET /admin/login — render login page.
 * Redirects to /admin if already authenticated.
 */
export async function handleLogin(request, env) {
  // Check if already authenticated
  const { session } = await requireSession(request, env);
  if (session) {
    return Response.redirect(new URL("/admin", request.url).toString(), 302);
  }

  const url = new URL(request.url);
  const redirect = url.searchParams.get("redirect") || "";
  const error = url.searchParams.get("error") || "";

  const passkeyCount = await getPasskeyCredentialCount(env.DB);
  const hasPasskeys = passkeyCount > 0;

  const html = render("adminLogin", { redirect, error, hasPasskeys });
  return htmlResponse(html);
}

/**
 * POST /admin/login — handle magic link request.
 * Always shows "check your email" regardless of whether the email matched.
 */
export async function handleLoginSubmit(request, env) {
  // Parse form body
  let email = null;
  let redirect = "";
  try {
    const formData = await request.formData();
    email = formData.get("email");
    redirect = formData.get("redirect") || "";
  } catch {
    // Invalid form data
  }

  if (!email || typeof email !== "string" || !email.trim()) {
    const html = render("adminLogin", {
      redirect,
      error: "Please enter your email address"
    });
    return htmlResponse(html);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check if email matches admin email
  const adminEmail = await getCredential(env.DB, "admin_email");

  if (adminEmail && normalizedEmail === adminEmail.toLowerCase().trim()) {
    // Generate magic link token
    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + MAGIC_LINK_TTL_SECONDS * 1000
    ).toISOString();

    await createMagicLinkToken(env.DB, token, expiresAt);

    // Send magic link email
    const verifyUrl = `https://${env.DOMAIN}/admin/verify?token=${token}`;
    const resendApiKey = await getResendApiKey(env);

    if (resendApiKey) {
      const html = render("adminMagicLink", {
        verifyUrl,
        domain: env.DOMAIN
      });

      const result = await sendEmail(resendApiKey, {
        from: `admin@${env.DOMAIN}`,
        fromName: "feedmail",
        to: normalizedEmail,
        subject: "Sign in to feedmail admin",
        html,
        text: `Sign in to your feedmail admin console:\n\n${verifyUrl}\n\nThis link expires in 15 minutes.\n\nIf you didn't request this, you can safely ignore this email.`
      });

      if (!result.success) {
        console.error("Failed to send magic link email:", result.error);
      }
    } else {
      console.error(
        "Cannot send magic link: Resend API key not configured in D1"
      );
    }
  }

  // Always show "check your email" — no info leakage
  const html = render("adminLoginSent", {});
  return htmlResponse(html);
}

/**
 * GET /admin/verify?token= — validate magic link and create session.
 */
export async function handleAdminVerify(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const redirect = url.searchParams.get("redirect") || "/admin";

  if (!token) {
    return renderAuthError("This link has expired. Please request a new one.");
  }

  const magicLink = await getMagicLinkToken(env.DB, token);

  if (!magicLink) {
    return renderAuthError("This link has expired. Please request a new one.");
  }

  // Check if already used
  if (magicLink.used) {
    return renderAuthError("This link has already been used.");
  }

  // Check expiry
  const expiresAt = new Date(`${magicLink.expires_at}Z`);
  if (expiresAt <= new Date()) {
    return renderAuthError("This link has expired. Please request a new one.");
  }

  // Mark token as used (race-safe: only succeeds if used = 0)
  const markResult = await markMagicLinkTokenUsed(env.DB, token);
  if (!markResult.meta?.changes) {
    return renderAuthError("This link has already been used.");
  }

  // Create session
  const sessionToken = crypto.randomUUID();
  const sessionExpiresAt = new Date(
    Date.now() + SESSION_TTL_SECONDS * 1000
  ).toISOString();

  await createSessionDb(env.DB, sessionToken, sessionExpiresAt);

  // Validate redirect starts with /admin
  const safeRedirect = redirect.startsWith("/admin") ? redirect : "/admin";

  return new Response(null, {
    status: 302,
    headers: {
      Location: safeRedirect,
      "Set-Cookie": createSessionCookie(sessionToken)
    }
  });
}

/**
 * GET /admin/logout — destroy session and redirect to login.
 */
export async function handleLogout(request, env) {
  const token = getSessionFromCookie(request);

  if (token) {
    await deleteSession(env.DB, token);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/admin/login",
      "Set-Cookie": clearSessionCookie()
    }
  });
}

/**
 * Render an auth error page with a link to login.
 * @param {string} message
 * @returns {Response}
 */
function renderAuthError(message) {
  const html = render("adminAuthError", {
    error: message,
    loginUrl: "/admin/login"
  });
  return htmlResponse(html);
}
