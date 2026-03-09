/**
 * API client helper for authenticated requests from Admin Worker to API Worker.
 */

import { getCredential } from "../../shared/lib/db.js";

export const API_UNREACHABLE_ERROR =
  "Unable to reach the API. Check your configuration.";

/**
 * Make an authenticated request to the API Worker.
 * @param {object} env - Worker environment bindings
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. "/admin/channels")
 * @param {object} [body] - Optional JSON body
 * @returns {Promise<{ ok: boolean, status: number, data: object }>}
 */
export async function callApi(env, method, path, body) {
  const apiKey = await getCredential(env.DB, "admin_api_key");

  if (!apiKey) {
    return {
      ok: false,
      status: 0,
      data: { error: "admin_api_key not configured in database" }
    };
  }

  const url = `https://${env.DOMAIN}/api${path}`;
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Internal-Request": "true"
    }
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await env.API_SERVICE.fetch(url, options);
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: API_UNREACHABLE_ERROR }
    };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}
