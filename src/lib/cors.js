/**
 * CORS handling for cross-origin subscribe requests.
 */

import { getAllCorsOrigins } from "./config.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * Check if the request origin is allowed.
 * @param {Request} request
 * @param {object} env
 * @returns {string|null} The allowed origin, or null
 */
function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = getAllCorsOrigins(env);
  return allowed.includes(origin) ? origin : null;
}

/**
 * Handle CORS preflight OPTIONS request.
 * @param {Request} request
 * @param {object} env
 * @returns {Response}
 */
export function handleCORSPreflight(request, env) {
  const origin = getAllowedOrigin(request, env);
  if (!origin) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      ...CORS_HEADERS,
    },
  });
}

/**
 * Add CORS headers to an existing response.
 * @param {Response} response
 * @param {Request} request
 * @param {object} env
 * @returns {Response}
 */
export function withCORS(response, request, env) {
  const origin = getAllowedOrigin(request, env);
  if (!origin) return response;

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Access-Control-Allow-Origin", origin);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
