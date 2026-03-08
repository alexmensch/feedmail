/**
 * Admin channel CRUD routes.
 * /api/admin/channels — list, create
 * /api/admin/channels/{channelId} — get, update, delete
 */

import { validateChannelFields } from "../../shared/lib/config.js";
import { jsonResponse } from "../../shared/lib/response.js";
import {
  getAllChannels,
  getChannelById,
  getFeedsByChannelId,
  insertChannel,
  updateChannel,
  deleteChannel,
  insertFeed
} from "../../shared/lib/db.js";

/**
 * Route channel requests.
 * @param {Request} request
 * @param {object} env
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleAdminChannels(request, env, url) {
  const match = url.pathname.match(/^\/api\/admin\/channels(?:\/([^/]+))?$/);
  const channelId = match?.[1] || null;

  if (!channelId) {
    // /api/admin/channels
    if (request.method === "GET") {
      return listChannels(env);
    }
    if (request.method === "POST") {
      return createChannel(request, env);
    }
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // /api/admin/channels/{channelId}
  if (request.method === "GET") {
    return getChannelHandler(env, channelId);
  }
  if (request.method === "PUT") {
    return updateChannelHandler(request, env, channelId);
  }
  if (request.method === "DELETE") {
    return deleteChannelHandler(env, channelId);
  }
  return jsonResponse(405, { error: "Method Not Allowed" });
}

async function listChannels(env) {
  const channels = await getAllChannels(env.DB);
  return jsonResponse(200, { channels });
}

async function getChannelHandler(env, channelId) {
  const channel = await getChannelById(env.DB, channelId);
  if (!channel) {
    return jsonResponse(404, { error: "Channel not found" });
  }
  const feeds = await getFeedsByChannelId(env.DB, channelId);
  return jsonResponse(200, { ...channel, feeds });
}

async function createChannel(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  // Require channel ID
  if (!body.id || typeof body.id !== "string") {
    return jsonResponse(400, { error: "Missing required field: id" });
  }

  // Validate all fields including feeds
  try {
    validateChannelFields(body, { requireFeeds: true });
  } catch (err) {
    return jsonResponse(400, { error: err.message });
  }

  // Check for duplicate channel ID
  const existing = await getChannelById(env.DB, body.id);
  if (existing) {
    return jsonResponse(409, { error: "Channel ID already exists" });
  }

  // Insert channel
  await insertChannel(env.DB, body);

  // Insert feeds
  for (const feed of body.feeds) {
    await insertFeed(env.DB, body.id, { name: feed.name, url: feed.url });
  }

  // Return created channel with feeds
  const created = await getChannelById(env.DB, body.id);
  const feeds = await getFeedsByChannelId(env.DB, body.id);
  return jsonResponse(201, { ...created, feeds });
}

async function updateChannelHandler(request, env, channelId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  // Check channel exists
  const existing = await getChannelById(env.DB, channelId);
  if (!existing) {
    return jsonResponse(404, { error: "Channel not found" });
  }

  // Validate fields (use URL channelId as authoritative id)
  try {
    validateChannelFields({ ...body, id: channelId });
  } catch (err) {
    return jsonResponse(400, { error: err.message });
  }

  await updateChannel(env.DB, channelId, body);

  // Return updated channel with feeds
  const updated = await getChannelById(env.DB, channelId);
  const feeds = await getFeedsByChannelId(env.DB, channelId);
  return jsonResponse(200, { ...updated, feeds });
}

async function deleteChannelHandler(env, channelId) {
  const existing = await getChannelById(env.DB, channelId);
  if (!existing) {
    return jsonResponse(404, { error: "Channel not found" });
  }

  await deleteChannel(env.DB, channelId);
  return new Response(null, { status: 204 });
}
