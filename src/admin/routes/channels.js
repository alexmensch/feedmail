/**
 * Admin channel routes: list, create, detail/edit, delete.
 */

import { callApi } from "../lib/api.js";
import { render } from "../../shared/lib/templates.js";
import { htmlResponse } from "../../shared/lib/response.js";

/**
 * Parse corsOrigins textarea value into a JSON array.
 * Filters out empty and whitespace-only lines.
 * @param {string} value - Textarea value (one origin per line)
 * @returns {string[]}
 */
function parseCorsOrigins(value) {
  if (!value || typeof value !== "string") {
    return [];
  }
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Build a channel body from form data for the API.
 * Omits empty optional fields.
 * @param {FormData} formData
 * @returns {object}
 */
function buildChannelBody(formData) {
  const body = {
    siteName: formData.get("siteName") || "",
    siteUrl: formData.get("siteUrl") || "",
    fromUser: formData.get("fromUser") || "",
    fromName: formData.get("fromName") || "",
    corsOrigins: parseCorsOrigins(formData.get("corsOrigins"))
  };

  const replyTo = (formData.get("replyTo") || "").trim();
  if (replyTo) {
    body.replyTo = replyTo;
  }

  const companyName = (formData.get("companyName") || "").trim();
  if (companyName) {
    body.companyName = companyName;
  }

  const companyAddress = (formData.get("companyAddress") || "").trim();
  if (companyAddress) {
    body.companyAddress = companyAddress;
  }

  return body;
}

/**
 * GET /admin/channels — Channel list page.
 */
export async function handleChannelList(request, env) {
  const url = new URL(request.url);
  const success = url.searchParams.get("success") || "";
  const error = url.searchParams.get("error") || "";

  const result = await callApi(env, "GET", "/admin/channels");

  if (!result.ok) {
    const html = render("adminChannels", {
      activePage: "channels",
      error: error || result.data?.error || "Unable to reach the API. Check your configuration."
    });
    return htmlResponse(html);
  }

  const channels = result.data?.channels || [];

  const html = render("adminChannels", {
    activePage: "channels",
    channels,
    hasChannels: channels.length > 0,
    success,
    error
  });
  return htmlResponse(html);
}

/**
 * GET /admin/channels/new — Channel creation form.
 */
export async function handleChannelNew(request, env) {
  const html = render("adminChannelForm", {
    activePage: "channels",
    isNew: true,
    channel: {}
  });
  return htmlResponse(html);
}

/**
 * POST /admin/channels — Create a new channel.
 */
export async function handleChannelCreate(request, env) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return htmlResponse(
      render("adminChannelForm", {
        activePage: "channels",
        isNew: true,
        channel: {},
        error: "Invalid form data"
      })
    );
  }

  const channelId = (formData.get("id") || "").trim();
  const body = buildChannelBody(formData);
  body.id = channelId;

  const result = await callApi(env, "POST", "/admin/channels", body);

  if (!result.ok) {
    // Re-render form with error and preserved values
    const html = render("adminChannelForm", {
      activePage: "channels",
      isNew: true,
      channel: {
        id: channelId,
        ...body,
        corsOrigins: (body.corsOrigins || []).join("\n")
      },
      error: result.data?.error || "Failed to create channel"
    });
    return htmlResponse(html);
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Channel created")}`,
    302
  );
}

/**
 * GET /admin/channels/{id} — Channel detail/edit page.
 */
export async function handleChannelDetail(request, env, channelId) {
  const url = new URL(request.url);
  const success = url.searchParams.get("success") || "";
  const error = url.searchParams.get("error") || "";

  const result = await callApi(env, "GET", `/admin/channels/${encodeURIComponent(channelId)}`);

  if (!result.ok) {
    if (result.status === 404) {
      const html = render("adminChannelForm", {
        activePage: "channels",
        error: "Channel not found"
      });
      return htmlResponse(html, 404);
    }
    const html = render("adminChannelForm", {
      activePage: "channels",
      error: result.data?.error || "Unable to reach the API. Check your configuration."
    });
    return htmlResponse(html);
  }

  const channel = result.data;

  const html = render("adminChannelForm", {
    activePage: "channels",
    isNew: false,
    channel: {
      ...channel,
      corsOrigins: (channel.corsOrigins || []).join("\n")
    },
    feeds: channel.feeds || [],
    hasFeeds: (channel.feeds || []).length > 0,
    success,
    error
  });
  return htmlResponse(html);
}

/**
 * POST /admin/channels/{id} — Update a channel.
 */
export async function handleChannelUpdate(request, env, channelId) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?error=${encodeURIComponent("Invalid form data")}`,
      302
    );
  }

  const body = buildChannelBody(formData);

  const result = await callApi(env, "PUT", `/admin/channels/${encodeURIComponent(channelId)}`, body);

  if (!result.ok) {
    // Fetch the current channel to show the form with error
    const channelResult = await callApi(env, "GET", `/admin/channels/${encodeURIComponent(channelId)}`);
    const currentChannel = channelResult.ok ? channelResult.data : {};

    const html = render("adminChannelForm", {
      activePage: "channels",
      isNew: false,
      channel: {
        id: channelId,
        ...body,
        corsOrigins: (body.corsOrigins || []).join("\n")
      },
      feeds: currentChannel.feeds || [],
      hasFeeds: (currentChannel.feeds || []).length > 0,
      error: result.data?.error || "Failed to update channel"
    });
    return htmlResponse(html);
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Channel updated")}`,
    302
  );
}

/**
 * POST /admin/channels/{id}/delete — Delete a channel.
 */
export async function handleChannelDelete(request, env, channelId) {
  const result = await callApi(env, "DELETE", `/admin/channels/${encodeURIComponent(channelId)}`);

  if (!result.ok) {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels?error=${encodeURIComponent(result.data?.error || "Failed to delete channel")}`,
      302
    );
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels?success=${encodeURIComponent("Channel deleted")}`,
    302
  );
}
