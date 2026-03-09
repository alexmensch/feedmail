/**
 * Admin settings page handler.
 * Wraps passkey management functionality.
 */

import { render } from "../../shared/lib/templates.js";
import { htmlResponse } from "../../shared/lib/response.js";
import { getPasskeyCredentials } from "../lib/db.js";

/**
 * GET /admin/settings — Settings page with passkey management.
 */
export async function handleSettings(request, env) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error") || "";
  const success = url.searchParams.get("success") || "";

  const credentials = await getPasskeyCredentials(env.DB);

  const html = render("adminSettings", {
    activePage: "settings",
    credentials,
    error,
    success,
    domain: env.DOMAIN
  });
  return htmlResponse(html);
}
