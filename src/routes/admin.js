/**
 * Admin API router — routes to sub-handlers for config, channels, feeds,
 * stats, and subscriber management.
 * All routes require ADMIN_API_KEY authentication (enforced in index.js).
 */

import { getChannelById } from "../lib/config.js";
import {
  getSubscriberStats,
  getSentItemStats,
  getSubscriberList,
} from "../lib/db.js";
import { handleAdminConfig } from "./admin-config.js";
import { handleAdminChannels } from "./admin-channels.js";
import { handleAdminFeeds } from "./admin-feeds.js";

/**
 * Route admin requests by pathname.
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleAdmin(request, env, url) {
  const path = url.pathname;

  if (path === "/api/admin/stats") {
    if (request.method !== "GET") return methodNotAllowed();
    return handleStats(env, url);
  }

  if (path === "/api/admin/subscribers") {
    if (request.method !== "GET") return methodNotAllowed();
    return handleSubscribers(env, url);
  }

  if (path === "/api/admin/config") {
    return handleAdminConfig(request, env);
  }

  // /api/admin/channels/* — delegate to channels or feeds handler
  const channelsMatch = path.match(/^\/api\/admin\/channels(?:\/([^/]+)(?:\/feeds(?:\/(\d+))?)?)?$/);
  if (channelsMatch) {
    const channelId = channelsMatch[1] || null;
    const hasFeedsSegment = channelId && path.includes("/feeds");

    if (hasFeedsSegment) {
      return handleAdminFeeds(request, env, url);
    }
    return handleAdminChannels(request, env, url);
  }

  return jsonResponse(404, { error: "Not Found" });
}

/**
 * GET /api/admin/stats?channelId=alxm.me
 */
async function handleStats(env, url) {
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return jsonResponse(400, { error: "Missing channelId query parameter" });
  }

  const channel = await getChannelById(env, channelId);
  if (!channel) {
    return jsonResponse(404, { error: "Unknown channel" });
  }

  const feedUrls = channel.feeds.map((f) => f.url);
  const [subscribers, sentItems] = await Promise.all([
    getSubscriberStats(env.DB, channelId),
    feedUrls.length > 0 ? getSentItemStats(env.DB, feedUrls) : { total: 0, lastSentAt: null },
  ]);

  return jsonResponse(200, {
    channelId,
    subscribers,
    sentItems,
    feeds: channel.feeds,
  });
}

/**
 * GET /api/admin/subscribers?channelId=alxm.me&status=verified
 */
async function handleSubscribers(env, url) {
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return jsonResponse(400, { error: "Missing channelId query parameter" });
  }

  const channel = await getChannelById(env, channelId);
  if (!channel) {
    return jsonResponse(404, { error: "Unknown channel" });
  }

  const statusFilter = url.searchParams.get("status") || null;
  const subscribers = await getSubscriberList(env.DB, channelId, statusFilter);

  return jsonResponse(200, {
    channelId,
    count: subscribers.length,
    subscribers,
  });
}

function methodNotAllowed() {
  return jsonResponse(405, { error: "Method Not Allowed" });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
