/**
 * Admin API routes — subscriber stats and listing.
 * All routes require ADMIN_API_KEY authentication.
 */

import { getChannelById } from "../lib/config.js";
import {
  getSubscriberStats,
  getSentItemStats,
  getSubscriberList,
} from "../lib/db.js";

/**
 * Route admin requests by pathname.
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleAdmin(request, env, url) {
  if (url.pathname === "/api/admin/stats") {
    return handleStats(env, url);
  }

  if (url.pathname === "/api/admin/subscribers") {
    return handleSubscribers(env, url);
  }

  return new Response(JSON.stringify({ error: "Not Found" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/admin/stats?channelId=alxm.me
 * Returns subscriber counts and sent item stats for a channel.
 */
async function handleStats(env, url) {
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return new Response(
      JSON.stringify({ error: "Missing channelId query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const channel = getChannelById(env, channelId);
  if (!channel) {
    return new Response(JSON.stringify({ error: "Unknown channel" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [subscribers, sentItems] = await Promise.all([
    getSubscriberStats(env.DB, channelId),
    getSentItemStats(env.DB, channel.feeds.map((f) => f.url)),
  ]);

  return new Response(
    JSON.stringify({
      channelId,
      subscribers,
      sentItems,
      feeds: channel.feeds,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * GET /api/admin/subscribers?channelId=alxm.me&status=verified
 * Returns list of subscribers for a channel, optionally filtered by status.
 */
async function handleSubscribers(env, url) {
  const channelId = url.searchParams.get("channelId");

  if (!channelId) {
    return new Response(
      JSON.stringify({ error: "Missing channelId query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const channel = getChannelById(env, channelId);
  if (!channel) {
    return new Response(JSON.stringify({ error: "Unknown channel" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const statusFilter = url.searchParams.get("status") || null;
  const subscribers = await getSubscriberList(env.DB, channelId, statusFilter);

  return new Response(
    JSON.stringify({
      channelId,
      count: subscribers.length,
      subscribers,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
