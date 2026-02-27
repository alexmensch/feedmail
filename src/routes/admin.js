/**
 * Admin API routes — subscriber stats and listing.
 * All routes require ADMIN_API_KEY authentication.
 */

import { getSiteById } from "../lib/config.js";
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
 * GET /api/admin/stats?siteId=alxm.me
 * Returns subscriber counts and sent item stats for a site.
 */
async function handleStats(env, url) {
  const siteId = url.searchParams.get("siteId");

  if (!siteId) {
    return new Response(
      JSON.stringify({ error: "Missing siteId query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const site = getSiteById(env, siteId);
  if (!site) {
    return new Response(JSON.stringify({ error: "Unknown site" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [subscribers, sentItems] = await Promise.all([
    getSubscriberStats(env.DB, siteId),
    getSentItemStats(env.DB, site.feeds),
  ]);

  return new Response(
    JSON.stringify({
      siteId,
      subscribers,
      sentItems,
      feeds: site.feeds,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * GET /api/admin/subscribers?siteId=alxm.me&status=verified
 * Returns list of subscribers for a site, optionally filtered by status.
 */
async function handleSubscribers(env, url) {
  const siteId = url.searchParams.get("siteId");

  if (!siteId) {
    return new Response(
      JSON.stringify({ error: "Missing siteId query parameter" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const site = getSiteById(env, siteId);
  if (!site) {
    return new Response(JSON.stringify({ error: "Unknown site" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const statusFilter = url.searchParams.get("status") || null;
  const subscribers = await getSubscriberList(env.DB, siteId, statusFilter);

  return new Response(
    JSON.stringify({
      siteId,
      count: subscribers.length,
      subscribers,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
