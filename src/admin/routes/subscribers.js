/**
 * Admin subscriber list page handler.
 */

import { callApi, API_UNREACHABLE_ERROR } from "../lib/api.js";
import { render } from "../../shared/lib/templates.js";
import { htmlResponse } from "../../shared/lib/response.js";
import { isHtmxRequest, fragmentResponse } from "../lib/htmx.js";

/**
 * GET /admin/subscribers — Subscriber list page.
 * Filterable by channel (dropdown) and status.
 * For HTMX requests, returns the subscriber table fragment only.
 */
export async function handleSubscriberList(request, env) {
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId") || "";
  const status = url.searchParams.get("status") || "";
  const error = url.searchParams.get("error") || "";
  const htmx = isHtmxRequest(request);

  // Fetch channels for the dropdown
  const channelsResult = await callApi(env, "GET", "/admin/channels");

  if (!channelsResult.ok) {
    if (htmx) {
      return fragmentResponse(
        render("adminSubscriberTable", {
          error: error || channelsResult.data?.error || API_UNREACHABLE_ERROR
        })
      );
    }
    const html = render("adminSubscribers", {
      activePage: "subscribers",
      error: error || channelsResult.data?.error || API_UNREACHABLE_ERROR
    });
    return htmlResponse(html);
  }

  const channels = channelsResult.data?.channels || [];

  // Mark the selected channel in the list
  const channelOptions = channels.map((ch) => ({
    id: ch.id,
    siteName: ch.siteName,
    selected: ch.id === channelId
  }));

  const templateData = {
    activePage: "subscribers",
    channels: channelOptions,
    hasChannels: channels.length > 0,
    selectedChannelId: channelId,
    selectedStatus: status,
    error
  };

  // Only fetch subscribers if a channel is selected
  if (channelId) {
    let apiPath = `/admin/subscribers?channelId=${encodeURIComponent(channelId)}`;
    if (status) {
      apiPath += `&status=${encodeURIComponent(status)}`;
    }

    const subscribersResult = await callApi(env, "GET", apiPath);

    if (subscribersResult.ok) {
      templateData.subscribers = subscribersResult.data?.subscribers || [];
      templateData.hasSubscribers = templateData.subscribers.length > 0;
      templateData.showTable = true;
    } else {
      templateData.error =
        subscribersResult.data?.error || "Failed to load subscribers";
    }
  }

  // HTMX request: return just the subscriber table fragment
  if (htmx) {
    return fragmentResponse(render("adminSubscriberTable", templateData));
  }

  const html = render("adminSubscribers", templateData);
  return htmlResponse(html);
}
