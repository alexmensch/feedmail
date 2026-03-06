/**
 * Admin channel CRUD routes.
 * /api/admin/channels — list, create
 * /api/admin/channels/{channelId} — get, update, delete
 */

import { getChannelById, validateChannelFields } from "../lib/config.js";
import {
  getAllChannels,
  getChannelFromDb,
  insertChannel,
  updateChannel,
  deleteChannelCascade,
  insertFeed,
  getFeedsByChannelId,
  checkFeedUrlUnique,
  checkFeedNameUnique,
} from "../lib/db.js";

/**
 * Route channel requests.
 * @param {Request} request
 * @param {object} env
 * @param {string|null} channelId
 * @returns {Promise<Response>}
 */
export async function handleAdminChannels(request, env, channelId) {
  if (!channelId) {
    // /api/admin/channels
    if (request.method === "GET") return listChannels(env);
    if (request.method === "POST") return createChannel(request, env);
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  // /api/admin/channels/{channelId}
  if (request.method === "GET") return getChannel(env, channelId);
  if (request.method === "PUT") return updateChannelHandler(request, env, channelId);
  if (request.method === "DELETE") return deleteChannel(env, channelId);
  return jsonResponse(405, { error: "Method Not Allowed" });
}

async function listChannels(env) {
  const rows = await getAllChannels(env.DB);
  const channels = rows.map(formatChannelRow);
  return jsonResponse(200, { channels });
}

async function getChannel(env, channelId) {
  const channel = await getChannelById(env.DB, channelId);
  if (!channel) {
    return jsonResponse(404, { error: "Channel not found" });
  }
  return jsonResponse(200, channel);
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
  const error = validateChannelFields(body, { requireFeeds: true });
  if (error) {
    return jsonResponse(400, { error });
  }

  // Check for duplicate channel ID
  const existing = await getChannelFromDb(env.DB, body.id);
  if (existing) {
    return jsonResponse(409, { error: "Channel ID already exists" });
  }

  // Insert channel
  await insertChannel(env.DB, body);

  // Insert feeds
  for (const feed of body.feeds) {
    await insertFeed(env.DB, body.id, feed.name, feed.url);
  }

  // Return created channel with feeds
  const created = await getChannelById(env.DB, body.id);
  return jsonResponse(201, created);
}

async function updateChannelHandler(request, env, channelId) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  // Check channel exists
  const existing = await getChannelFromDb(env.DB, channelId);
  if (!existing) {
    return jsonResponse(404, { error: "Channel not found" });
  }

  // Validate fields (feeds not required for update — managed via feed endpoints)
  const error = validateChannelFields(body);
  if (error) {
    return jsonResponse(400, { error });
  }

  await updateChannel(env.DB, channelId, body);

  // Return updated channel with feeds
  const updated = await getChannelById(env.DB, channelId);
  return jsonResponse(200, updated);
}

async function deleteChannel(env, channelId) {
  const existing = await getChannelFromDb(env.DB, channelId);
  if (!existing) {
    return jsonResponse(404, { error: "Channel not found" });
  }

  await deleteChannelCascade(env.DB, channelId);
  return new Response(null, { status: 204 });
}

function formatChannelRow(row) {
  return {
    id: row.id,
    siteName: row.site_name,
    siteUrl: row.site_url,
    fromUser: row.from_user,
    fromName: row.from_name,
    replyTo: row.reply_to || undefined,
    companyName: row.company_name || undefined,
    companyAddress: row.company_address || undefined,
    corsOrigins: JSON.parse(row.cors_origins),
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
