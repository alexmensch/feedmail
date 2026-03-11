/**
 * Admin channel routes: list, create, detail/edit, delete.
 */

import { callApi, API_UNREACHABLE_ERROR } from "../lib/api.js";
import { render } from "../../shared/lib/templates.js";
import { htmlResponse } from "../../shared/lib/response.js";
import { isHtmxRequest, fragmentResponse } from "../lib/htmx.js";

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
 * Parse indexed feed rows from form data.
 * Supports `feeds[0][name]`, `feeds[0][url]`, `feeds[0][id]` naming.
 * @param {FormData} formData
 * @returns {Array<{id?: number, name: string, url: string}>}
 */
export function parseFeedRows(formData) {
  const feeds = {};

  for (const [key, value] of formData.entries()) {
    const match = key.match(/^feeds\[(\d+)]\[(\w+)]$/);
    if (!match) {
      continue;
    }
    const index = match[1];
    const field = match[2];
    if (!feeds[index]) {
      feeds[index] = {};
    }
    feeds[index][field] = typeof value === "string" ? value.trim() : value;
  }

  return Object.keys(feeds)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((idx) => {
      const row = feeds[idx];
      const feed = { name: row.name || "", url: row.url || "" };
      if (row.id) {
        feed.id = parseInt(row.id, 10);
      }
      return feed;
    });
}

/**
 * Build template feed data from parsed feed rows for re-rendering.
 * @param {Array} feedRows
 * @returns {Array}
 */
function feedRowsForTemplate(feedRows) {
  return feedRows.map((f, i) => ({
    id: f.id || "",
    name: f.name || "",
    url: f.url || "",
    index: i
  }));
}

/**
 * Build a channel object for template rendering from an API body and channel ID.
 * Converts corsOrigins array back to newline-separated string for textarea.
 * @param {string} channelId
 * @param {object} body - API body from buildChannelBody()
 * @returns {object}
 */
function buildTemplateChannel(channelId, body) {
  return {
    id: channelId,
    ...body,
    corsOrigins: (body.corsOrigins || []).join("\n")
  };
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
    const html = render("adminChannelForm", {
      activePage: "channels",
      error: error || result.data?.error || API_UNREACHABLE_ERROR
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
export async function handleChannelNew(_request, env) {
  const html = render("adminChannelForm", {
    activePage: "channels",
    isEdit: false,
    channel: {},
    feeds: [],
    domain: env.DOMAIN
  });
  return htmlResponse(html);
}

/**
 * POST /admin/channels — Create a new channel.
 * For HTMX requests, returns HX-Redirect header on success.
 */
export async function handleChannelCreate(request, env) {
  const htmx = isHtmxRequest(request);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return htmlResponse(
      render("adminChannelForm", {
        activePage: "channels",
        isEdit: false,
        channel: {},
        feeds: [],
        domain: env.DOMAIN,
        error: "Invalid form data"
      })
    );
  }

  const action = (formData.get("action") || "").trim();
  const channelId = (formData.get("id") || "").trim();
  const body = buildChannelBody(formData);
  body.id = channelId;
  const feedRows = parseFeedRows(formData);

  // Helper to re-render the form with error
  const renderWithError = (errorMsg, submittedFeeds) => {
    const html = render("adminChannelForm", {
      activePage: "channels",
      isEdit: false,
      channel: buildTemplateChannel(channelId, body),
      feeds: feedRowsForTemplate(submittedFeeds),
      domain: env.DOMAIN,
      error: errorMsg
    });
    return htmlResponse(html);
  };

  // Handle noscript add-feed action
  if (action === "add-feed") {
    feedRows.push({ name: "", url: "" });
    return renderWithError(null, feedRows);
  }

  // Handle noscript remove-feed action
  if (action === "remove-feed") {
    const removeIndex = parseInt(formData.get("removeIndex"), 10);
    if (!isNaN(removeIndex) && feedRows.length > 1) {
      feedRows.splice(removeIndex, 1);
    }
    return renderWithError(null, feedRows);
  }

  // Validate at least one feed with data
  const nonEmptyFeeds = feedRows.filter((f) => f.name || f.url);
  if (nonEmptyFeeds.length === 0) {
    return renderWithError(
      "At least one feed is required",
      feedRows.length > 0 ? feedRows : [{ name: "", url: "" }]
    );
  }

  body.feeds = nonEmptyFeeds;

  const result = await callApi(env, "POST", "/admin/channels", body);

  if (!result.ok) {
    return renderWithError(
      result.data?.error || "Failed to create channel",
      feedRows
    );
  }

  const redirectUrl = `/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Channel created")}`;

  // HTMX: use HX-Redirect header
  if (htmx) {
    return new Response("", {
      status: 200,
      headers: {
        "HX-Redirect": redirectUrl
      }
    });
  }

  return Response.redirect(
    `https://${env.DOMAIN}${redirectUrl}`,
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

  const result = await callApi(
    env,
    "GET",
    `/admin/channels/${encodeURIComponent(channelId)}`
  );

  if (!result.ok) {
    if (result.status === 404) {
      const html = render("adminChannelForm", {
        activePage: "channels",
        error: "Channel not found",
        domain: env.DOMAIN
      });
      return htmlResponse(html, 404);
    }
    const html = render("adminChannelForm", {
      activePage: "channels",
      error: result.data?.error || API_UNREACHABLE_ERROR,
      domain: env.DOMAIN
    });
    return htmlResponse(html);
  }

  const channel = result.data;
  const feeds = channel.feeds || [];

  const html = render("adminChannelForm", {
    activePage: "channels",
    isEdit: true,
    channel: buildTemplateChannel(channel.id, channel),
    feeds,
    domain: env.DOMAIN,
    success,
    error
  });
  return htmlResponse(html);
}

/**
 * POST /admin/channels/{id} — Update a channel.
 * Orchestrates channel update + feed create/update/delete.
 * For HTMX requests, returns the form result fragment.
 */
export async function handleChannelUpdate(request, env, channelId) {
  const htmx = isHtmxRequest(request);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    if (htmx) {
      return fragmentResponse(
        render("adminChannelFormResult", {
          error: "Invalid form data",
          channel: { id: channelId },
          feeds: [],
          domain: env.DOMAIN
        })
      );
    }
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?error=${encodeURIComponent("Invalid form data")}`,
      302
    );
  }

  const action = (formData.get("action") || "").trim();
  const body = buildChannelBody(formData);
  const feedRows = parseFeedRows(formData);

  // Helper to re-render the form with error — for both HTMX and standard
  const renderFormResult = (errorMsg, successMsg, submittedFeeds) => {
    const templateData = {
      isEdit: true,
      channel: buildTemplateChannel(channelId, body),
      feeds: feedRowsForTemplate(submittedFeeds),
      domain: env.DOMAIN,
      error: errorMsg || "",
      success: successMsg || ""
    };

    if (htmx) {
      return fragmentResponse(
        render("adminChannelFormResult", templateData)
      );
    }

    const html = render("adminChannelForm", {
      activePage: "channels",
      ...templateData
    });
    return htmlResponse(html);
  };

  // Handle noscript add-feed action
  if (action === "add-feed") {
    feedRows.push({ name: "", url: "" });
    return renderFormResult(null, null, feedRows);
  }

  // Handle noscript remove-feed action
  if (action === "remove-feed") {
    const removeIndex = parseInt(formData.get("removeIndex"), 10);
    if (!isNaN(removeIndex) && feedRows.length > 1) {
      feedRows.splice(removeIndex, 1);
    }
    return renderFormResult(null, null, feedRows);
  }

  // Validate at least one feed
  const nonEmptyFeeds = feedRows.filter((f) => f.name || f.url);
  if (nonEmptyFeeds.length === 0) {
    return renderFormResult(
      "At least one feed is required",
      null,
      feedRows.length > 0 ? feedRows : [{ name: "", url: "" }]
    );
  }

  // Step 1: Update channel fields
  const channelResult = await callApi(
    env,
    "PUT",
    `/admin/channels/${encodeURIComponent(channelId)}`,
    body
  );

  if (!channelResult.ok) {
    return renderFormResult(
      channelResult.data?.error || "Failed to update channel",
      null,
      feedRows
    );
  }

  // Step 2: Get current feeds for diffing
  const currentResult = await callApi(
    env,
    "GET",
    `/admin/channels/${encodeURIComponent(channelId)}`
  );
  const currentFeeds = currentResult.ok ? currentResult.data?.feeds || [] : [];

  // Step 3: Diff and apply feed changes
  const errors = [];
  const submittedIds = new Set();

  for (const feed of nonEmptyFeeds) {
    if (feed.id) {
      submittedIds.add(feed.id);
      // Check if changed compared to current
      const current = currentFeeds.find((f) => f.id === feed.id);
      if (current && (current.name !== feed.name || current.url !== feed.url)) {
        const updateResult = await callApi(
          env,
          "PUT",
          `/admin/channels/${encodeURIComponent(channelId)}/feeds/${feed.id}`,
          { name: feed.name, url: feed.url }
        );
        if (!updateResult.ok) {
          errors.push(
            `Failed to update feed '${feed.name}': ${updateResult.data?.error || "unknown error"}`
          );
        }
      }
    } else {
      // New feed
      const createResult = await callApi(
        env,
        "POST",
        `/admin/channels/${encodeURIComponent(channelId)}/feeds`,
        { name: feed.name, url: feed.url }
      );
      if (!createResult.ok) {
        errors.push(
          `Failed to add feed '${feed.name}': ${createResult.data?.error || "unknown error"}`
        );
      }
    }
  }

  // Delete feeds not in submission
  for (const current of currentFeeds) {
    if (!submittedIds.has(current.id)) {
      const deleteResult = await callApi(
        env,
        "DELETE",
        `/admin/channels/${encodeURIComponent(channelId)}/feeds/${current.id}`
      );
      if (!deleteResult.ok) {
        errors.push(
          `Failed to delete feed '${current.name}': ${deleteResult.data?.error || "unknown error"}`
        );
      }
    }
  }

  if (errors.length > 0) {
    const errorMsg = `Channel saved, but ${errors.join("; ")}`;
    if (htmx) {
      return renderChannelFormFragment(env, channelId, body, feedRows, { error: errorMsg });
    }
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?error=${encodeURIComponent(errorMsg)}`,
      302
    );
  }

  if (htmx) {
    return renderChannelFormFragment(env, channelId, body, [], { success: "Channel updated" });
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Channel updated")}`,
    302
  );
}

/**
 * POST /admin/channels/{id}/delete — Delete a channel.
 */
/**
 * Re-fetch channel data and render an HTMX fragment for the channel form.
 */
async function renderChannelFormFragment(env, channelId, body, fallbackFeeds, feedback) {
  const updatedResult = await callApi(
    env,
    "GET",
    `/admin/channels/${encodeURIComponent(channelId)}`
  );
  const updatedChannel = updatedResult.ok ? updatedResult.data : { id: channelId, ...body };
  const updatedFeeds = updatedChannel.feeds || fallbackFeeds;
  return fragmentResponse(
    render("adminChannelFormResult", {
      ...feedback,
      channel: buildTemplateChannel(channelId, updatedChannel),
      feeds: updatedFeeds,
      domain: env.DOMAIN
    })
  );
}

export async function handleChannelDelete(request, env, channelId) {
  const result = await callApi(
    env,
    "DELETE",
    `/admin/channels/${encodeURIComponent(channelId)}`
  );

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

/**
 * GET /admin/channels/{id}/delete/confirm — Channel delete confirmation fragment.
 * Returns an inline confirmation prompt for HTMX.
 */
export async function handleChannelDeleteConfirm(request, env, channelId) {
  if (!isHtmxRequest(request)) {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}`,
      302
    );
  }

  // Fetch channel to get name
  const result = await callApi(
    env,
    "GET",
    `/admin/channels/${encodeURIComponent(channelId)}`
  );

  if (!result.ok) {
    return fragmentResponse(
      render("adminDeleteConfirm", {
        message: "Channel not found.",
        confirmAction: `/admin/channels/${encodeURIComponent(channelId)}/delete`,
        cancelHtml: `<button type="button" class="btn-danger" hx-get="/admin/channels/${encodeURIComponent(channelId)}/delete/confirm" hx-target="#channel-actions" hx-swap="innerHTML">Delete channel</button>`
      })
    );
  }

  const channel = result.data;
  const html = render("adminDeleteConfirm", {
    message: `Delete channel "${channel.id}" (${channel.siteName})? This will remove all subscribers and feeds. This cannot be undone.`,
    confirmAction: `/admin/channels/${encodeURIComponent(channelId)}/delete`,
    cancelHtml: `<button type="button" class="btn-danger" hx-get="/admin/channels/${encodeURIComponent(channelId)}/delete/confirm" hx-target="#channel-actions" hx-swap="innerHTML">Delete channel</button>`
  });
  return fragmentResponse(html);
}
