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
} from "../lib/db.js";
import { jsonResponse } from "../lib/response.js";

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
  if (existingFeeds.some((f) => f.url === body.url)) {
    return jsonResponse(409, {
      error: "Feed URL already exists in this channel"
    });
  }
  if (
    existingFeeds.some((f) => f.name.toLowerCase() === body.name.toLowerCase())
  ) {
    return jsonResponse(409, {
      error: "Feed name already exists in this channel (case-insensitive)"
    });
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
  if (
    url !== existing.url &&
    existingFeeds.some((f) => f.id !== feedId && f.url === url)
  ) {
    return jsonResponse(409, {
      error: "Feed URL already exists in this channel"
    });
  }
  if (
    name.toLowerCase() !== existing.name.toLowerCase() &&
    existingFeeds.some(
      (f) => f.id !== feedId && f.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    return jsonResponse(409, {
      error: "Feed name already exists in this channel (case-insensitive)"
    });
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
