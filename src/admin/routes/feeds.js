/**
 * Admin feed routes: add, edit, delete.
 */

import { callApi, API_UNREACHABLE_ERROR } from "../lib/api.js";
import { render } from "../../shared/lib/templates.js";
import { htmlResponse } from "../../shared/lib/response.js";

/**
 * GET /admin/channels/{channelId}/feeds/new — Feed creation form.
 */
export async function handleFeedNew(request, env, channelId) {
  // Verify channel exists
  const channelResult = await callApi(env, "GET", `/admin/channels/${encodeURIComponent(channelId)}`);

  if (!channelResult.ok) {
    const html = render("adminFeedForm", {
      activePage: "channels",
      error: channelResult.status === 404 ? "Channel not found" : (channelResult.data?.error || API_UNREACHABLE_ERROR)
    });
    return htmlResponse(html, channelResult.status === 404 ? 404 : 200);
  }

  const html = render("adminFeedForm", {
    activePage: "channels",
    isEdit: false,
    channelId,
    channelName: channelResult.data.siteName,
    feed: {}
  });
  return htmlResponse(html);
}

/**
 * POST /admin/channels/{channelId}/feeds — Create a new feed.
 */
export async function handleFeedCreate(request, env, channelId) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return htmlResponse(
      render("adminFeedForm", {
        activePage: "channels",
        isEdit: false,
        channelId,
        feed: {},
        error: "Invalid form data"
      })
    );
  }

  const name = (formData.get("name") || "").trim();
  const url = (formData.get("url") || "").trim();

  const result = await callApi(env, "POST", `/admin/channels/${encodeURIComponent(channelId)}/feeds`, { name, url });

  if (!result.ok) {
    const html = render("adminFeedForm", {
      activePage: "channels",
      isEdit: false,
      channelId,
      feed: { name, url },
      error: result.data?.error || "Failed to add feed"
    });
    return htmlResponse(html);
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Feed added")}`,
    302
  );
}

/**
 * GET /admin/channels/{channelId}/feeds/{feedId}/edit — Feed edit form.
 */
export async function handleFeedEdit(request, env, channelId, feedId) {
  // Fetch feeds for the channel to find the specific feed
  const result = await callApi(env, "GET", `/admin/channels/${encodeURIComponent(channelId)}/feeds`);

  if (!result.ok) {
    const html = render("adminFeedForm", {
      activePage: "channels",
      error: result.status === 404 ? "Channel not found" : (result.data?.error || API_UNREACHABLE_ERROR)
    });
    return htmlResponse(html, result.status === 404 ? 404 : 200);
  }

  const feeds = result.data?.feeds || [];
  const feed = feeds.find((f) => f.id === parseInt(feedId, 10));

  if (!feed) {
    const html = render("adminFeedForm", {
      activePage: "channels",
      error: "Feed not found"
    });
    return htmlResponse(html, 404);
  }

  const html = render("adminFeedForm", {
    activePage: "channels",
    isEdit: true,
    channelId,
    feedId: feed.id,
    feed: { name: feed.name, url: feed.url }
  });
  return htmlResponse(html);
}

/**
 * POST /admin/channels/{channelId}/feeds/{feedId} — Update a feed.
 */
export async function handleFeedUpdate(request, env, channelId, feedId) {
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?error=${encodeURIComponent("Invalid form data")}`,
      302
    );
  }

  const name = (formData.get("name") || "").trim();
  const url = (formData.get("url") || "").trim();

  const result = await callApi(env, "PUT", `/admin/channels/${encodeURIComponent(channelId)}/feeds/${feedId}`, { name, url });

  if (!result.ok) {
    const html = render("adminFeedForm", {
      activePage: "channels",
      isEdit: true,
      channelId,
      feedId,
      feed: { name, url },
      error: result.data?.error || "Failed to update feed"
    });
    return htmlResponse(html);
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Feed updated")}`,
    302
  );
}

/**
 * POST /admin/channels/{channelId}/feeds/{feedId}/delete — Delete a feed.
 */
export async function handleFeedDelete(request, env, channelId, feedId) {
  const result = await callApi(env, "DELETE", `/admin/channels/${encodeURIComponent(channelId)}/feeds/${feedId}`);

  if (!result.ok) {
    return Response.redirect(
      `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?error=${encodeURIComponent(result.data?.error || "Failed to delete feed")}`,
      302
    );
  }

  return Response.redirect(
    `https://${env.DOMAIN}/admin/channels/${encodeURIComponent(channelId)}?success=${encodeURIComponent("Feed deleted")}`,
    302
  );
}
