/**
 * Admin dashboard page and send trigger handler.
 */

import { callApi, API_UNREACHABLE_ERROR } from "../lib/api.js";
import { render } from "../../shared/lib/templates.js";
import { htmlResponse } from "../../shared/lib/response.js";
import { getPasskeyCredentialCount } from "../lib/db.js";

/**
 * GET /admin — Dashboard page.
 * Displays subscriber counts and sent item stats per channel.
 */
export async function handleDashboard(request, env) {
  const url = new URL(request.url);
  const success = url.searchParams.get("success") || "";
  const error = url.searchParams.get("error") || "";
  const dismissed = url.searchParams.get("dismissed") === "passkey";

  // Check for passkey bootstrap prompt
  const passkeyCount = await getPasskeyCredentialCount(env.DB);
  const showPasskeyPrompt = passkeyCount === 0 && !dismissed;

  // Fetch all channels
  const channelsResult = await callApi(env, "GET", "/admin/channels");

  if (!channelsResult.ok) {
    const html = render("adminDashboard", {
      activePage: "dashboard",
      error: error || channelsResult.data?.error || API_UNREACHABLE_ERROR,
      showPasskeyPrompt
    });
    return htmlResponse(html);
  }

  const channels = channelsResult.data?.channels || [];

  // Fetch stats for all channels in parallel
  const channelStats = await Promise.all(
    channels.map(async (channel) => {
      const statsResult = await callApi(env, "GET", `/admin/stats?channelId=${encodeURIComponent(channel.id)}`);
      if (statsResult.ok) {
        return {
          id: channel.id,
          siteName: channel.siteName,
          subscribers: statsResult.data.subscribers,
          sentItems: statsResult.data.sentItems
        };
      }
      return {
        id: channel.id,
        siteName: channel.siteName,
        error: statsResult.data?.error || "Failed to load stats"
      };
    })
  );

  const html = render("adminDashboard", {
    activePage: "dashboard",
    channels: channelStats,
    hasChannels: channelStats.length > 0,
    success,
    error,
    showPasskeyPrompt
  });
  return htmlResponse(html);
}

/**
 * POST /admin/send — Trigger feed check and send.
 * Reads optional channelId from form data.
 * Redirects back to referring page with success/error feedback.
 */
export async function handleSendTrigger(request, env) {
  let channelId = null;
  try {
    const formData = await request.formData();
    channelId = formData.get("channelId") || null;
  } catch {
    // Invalid form data
  }

  const body = channelId ? { channelId } : undefined;
  const result = await callApi(env, "POST", "/send", body);

  // Determine redirect target from Referer header
  const referer = request.headers.get("Referer");
  let redirectPath = "/admin";
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.pathname.startsWith("/admin")) {
        redirectPath = refererUrl.pathname;
      }
    } catch {
      // Invalid referer URL
    }
  }

  const param = result.ok
    ? `success=${encodeURIComponent("Feed check completed")}`
    : `error=${encodeURIComponent(result.data?.error || "Feed check failed")}`;

  return Response.redirect(
    `https://${env.DOMAIN}${redirectPath}?${param}`,
    302
  );
}
