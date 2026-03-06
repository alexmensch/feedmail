/**
 * Admin feed CRUD routes.
 * /api/admin/channels/{channelId}/feeds — list, add
 * /api/admin/channels/{channelId}/feeds/{feedId} — update, delete
 */

import {
  getChannelFromDb,
  getFeedsByChannelId,
  getFeedById,
  insertFeed,
  updateFeed,
  deleteFeedCascade,
  checkFeedUrlUnique,
  checkFeedNameUnique,
} from "../lib/db.js";

/**
 * Route feed requests.
 * @param {Request} request
 * @param {object} env
 * @param {string} channelId
 * @param {number|null} feedId
 * @returns {Promise<Response>}
 */
export async function handleAdminFeeds(request, env, channelId, feedId) {
  // Verify channel exists
  const channel = await getChannelFromDb(env.DB, channelId);
  if (!channel) {
    return jsonResponse(404, { error: "Channel not found" });
  }

  if (!feedId) {
    // /api/admin/channels/{channelId}/feeds
    if (request.method === "GET") return listFeeds(env, channelId);
    if (request.method === "POST") return addFeed(request, env, channelId);
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // /api/admin/channels/{channelId}/feeds/{feedId}
  if (request.method === "PUT") return updateFeedHandler(request, env, channelId, feedId);
  if (request.method === "DELETE") return deleteFeedHandler(env, channelId, feedId);
  return jsonResponse(405, { error: "Method Not Allowed" });
}

async function listFeeds(env, channelId) {
  const feeds = await getFeedsByChannelId(env.DB, channelId);
  return jsonResponse(200, {
    channelId,
    feeds: feeds.map((f) => ({ id: f.id, name: f.name, url: f.url })),
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

  // Check URL uniqueness within channel
  const urlUnique = await checkFeedUrlUnique(env.DB, channelId, body.url);
  if (!urlUnique) {
    return jsonResponse(409, { error: "Feed URL already exists in this channel" });
  }

  // Check name uniqueness (case-insensitive) within channel
  const nameUnique = await checkFeedNameUnique(env.DB, channelId, body.name);
  if (!nameUnique) {
    return jsonResponse(409, { error: "Feed name already exists in this channel (case-insensitive)" });
  }

  const result = await insertFeed(env.DB, channelId, body.name, body.url);
  const feedId = result.meta?.last_row_id;

  const feed = await getFeedById(env.DB, feedId, channelId);
  return jsonResponse(201, { id: feed.id, name: feed.name, url: feed.url });
}

async function updateFeedHandler(request, env, channelId, feedId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const existing = await getFeedById(env.DB, feedId, channelId);
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

  // Check URL uniqueness (excluding this feed)
  if (url !== existing.url) {
    const urlUnique = await checkFeedUrlUnique(env.DB, channelId, url, feedId);
    if (!urlUnique) {
      return jsonResponse(409, { error: "Feed URL already exists in this channel" });
    }
  }

  // Check name uniqueness (excluding this feed)
  if (name.toLowerCase() !== existing.name.toLowerCase()) {
    const nameUnique = await checkFeedNameUnique(env.DB, channelId, name, feedId);
    if (!nameUnique) {
      return jsonResponse(409, { error: "Feed name already exists in this channel (case-insensitive)" });
    }
  }

  await updateFeed(env.DB, feedId, name, url);

  const updated = await getFeedById(env.DB, feedId, channelId);
  return jsonResponse(200, { id: updated.id, name: updated.name, url: updated.url });
}

async function deleteFeedHandler(env, channelId, feedId) {
  const existing = await getFeedById(env.DB, feedId, channelId);
  if (!existing) {
    return jsonResponse(404, { error: "Feed not found" });
  }

  await deleteFeedCascade(env.DB, feedId);
  return new Response(null, { status: 204 });
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
