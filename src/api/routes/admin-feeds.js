/**
 * Admin feed CRUD routes.
 * /api/admin/channels/{channelId}/feeds — list, add
 * /api/admin/channels/{channelId}/feeds/{feedId} — update, delete
 */

import {
  getChannelById,
  getFeedsByChannelId,
  getFeedById,
  insertFeed,
  updateFeed,
  deleteFeed
} from "../../shared/lib/db.js";
import { jsonResponse } from "../../shared/lib/response.js";

/**
 * Route feed requests.
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleAdminFeeds(request, env, url) {
  const match = url.pathname.match(
    /^\/api\/admin\/channels\/([^/]+)\/feeds(?:\/(\d+))?$/
  );
  if (!match) {
    return jsonResponse(404, { error: "Not Found" });
  }

  const channelId = match[1];
  const feedId = match[2] ? parseInt(match[2], 10) : null;

  // Verify channel exists
  const channel = await getChannelById(env.DB, channelId);
  if (!channel) {
    return jsonResponse(404, { error: "Channel not found" });
  }

  if (!feedId) {
    // /api/admin/channels/{channelId}/feeds
    if (request.method === "GET") {
      return listFeeds(env, channelId);
    }
    if (request.method === "POST") {
      return addFeed(request, env, channelId);
    }
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // /api/admin/channels/{channelId}/feeds/{feedId}
  if (request.method === "PUT") {
    return updateFeedHandler(request, env, channelId, feedId);
  }
  if (request.method === "DELETE") {
    return deleteFeedHandler(env, feedId);
  }
  return jsonResponse(405, { error: "Method Not Allowed" });
}

/**
 * Check whether a feed name/url collides with existing feeds in the channel.
 * Name comparison is case-insensitive. Pass excludeId to ignore the feed
 * being updated.
 * @param {Array<{id: number, name: string, url: string}>} existingFeeds
 * @param {{name: string, url: string, excludeId?: number|null}} candidate
 * @returns {string|null} Error message, or null if unique
 */
function feedUniquenessError(existingFeeds, { name, url, excludeId = null }) {
  const others =
    excludeId === null
      ? existingFeeds
      : existingFeeds.filter((f) => f.id !== excludeId);

  if (others.some((f) => f.url === url)) {
    return "Feed URL already exists in this channel";
  }
  if (others.some((f) => f.name.toLowerCase() === name.toLowerCase())) {
    return "Feed name already exists in this channel (case-insensitive)";
  }
  return null;
}

async function listFeeds(env, channelId) {
  const feeds = await getFeedsByChannelId(env.DB, channelId);
  return jsonResponse(200, {
    channelId,
    feeds: feeds.map((f) => ({ id: f.id, name: f.name, url: f.url }))
  });
}

async function addFeed(request, env, channelId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  if (!body.name || typeof body.name !== "string") {
    return jsonResponse(400, { error: "Missing required field: name" });
  }
  if (!body.url || typeof body.url !== "string") {
    return jsonResponse(400, { error: "Missing required field: url" });
  }

  // Check uniqueness within channel
  const existingFeeds = await getFeedsByChannelId(env.DB, channelId);
  const conflict = feedUniquenessError(existingFeeds, {
    name: body.name,
    url: body.url
  });
  if (conflict) {
    return jsonResponse(409, { error: conflict });
  }

  const result = await insertFeed(env.DB, channelId, {
    name: body.name,
    url: body.url
  });
  const feedId = result.meta?.last_row_id || result.id;

  const feed = await getFeedById(env.DB, feedId);
  return jsonResponse(201, { id: feed.id, name: feed.name, url: feed.url });
}

async function updateFeedHandler(request, env, channelId, feedId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const existing = await getFeedById(env.DB, feedId);
  if (!existing) {
    return jsonResponse(404, { error: "Feed not found" });
  }

  const name = body.name ?? existing.name;
  const url = body.url ?? existing.url;

  if (!name || typeof name !== "string") {
    return jsonResponse(400, { error: "name must be a non-empty string" });
  }
  if (!url || typeof url !== "string") {
    return jsonResponse(400, { error: "url must be a non-empty string" });
  }

  // Check uniqueness (excluding this feed)
  const existingFeeds = await getFeedsByChannelId(env.DB, channelId);
  const conflict = feedUniquenessError(existingFeeds, {
    name,
    url,
    excludeId: feedId
  });
  if (conflict) {
    return jsonResponse(409, { error: conflict });
  }

  await updateFeed(env.DB, feedId, { name, url });

  const updated = await getFeedById(env.DB, feedId);
  return jsonResponse(200, {
    id: updated.id,
    name: updated.name,
    url: updated.url
  });
}

async function deleteFeedHandler(env, feedId) {
  const existing = await getFeedById(env.DB, feedId);
  if (!existing) {
    return jsonResponse(404, { error: "Feed not found" });
  }

  await deleteFeed(env.DB, feedId);
  return new Response(null, { status: 204 });
}
