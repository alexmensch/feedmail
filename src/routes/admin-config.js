/**
 * GET/PATCH /api/admin/config
 * Site-level settings and per-endpoint rate limit configuration.
 */

import { getVerifyLimits, getRateLimitConfig } from "../lib/config.js";
import { RATE_LIMITS } from "../lib/rate-limit.js";
import {
  getSiteConfig,
  upsertSiteConfig,
  getAllRateLimitConfig,
  upsertRateLimitConfig,
} from "../lib/db.js";

const VALID_ENDPOINTS = Object.keys(RATE_LIMITS);

/**
 * Handle config requests.
 * @param {Request} request
 * @param {object} env
 * @returns {Promise<Response>}
 */
export async function handleAdminConfig(request, env) {
  if (request.method === "GET") {
    return getConfig(env);
  }
  if (request.method === "PATCH") {
    return updateConfig(request, env);
  }
  return jsonResponse(405, { error: "Method Not Allowed" });
}

async function getConfig(env) {
  const verify = await getVerifyLimits(env.DB);

  const rateLimits = {};
  for (const endpoint of VALID_ENDPOINTS) {
    rateLimits[endpoint] = await getRateLimitConfig(env.DB, endpoint);
  }

  return jsonResponse(200, { verify, rateLimits });
}

async function updateConfig(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  // Validate and apply verify settings
  if (body.verify) {
    const current = await getVerifyLimits(env.DB);
    const maxAttempts = body.verify.maxAttempts ?? current.maxAttempts;
    const windowHours = body.verify.windowHours ?? current.windowHours;

    if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
      return jsonResponse(400, { error: "verify.maxAttempts must be a positive integer" });
    }
    if (!Number.isInteger(windowHours) || windowHours <= 0) {
      return jsonResponse(400, { error: "verify.windowHours must be a positive integer" });
    }

    await upsertSiteConfig(env.DB, { verifyMaxAttempts: maxAttempts, verifyWindowHours: windowHours });
  }

  // Validate and apply rate limit settings
  if (body.rateLimits) {
    for (const [endpoint, config] of Object.entries(body.rateLimits)) {
      if (!VALID_ENDPOINTS.includes(endpoint)) {
        return jsonResponse(400, { error: `Unknown endpoint: ${endpoint}` });
      }

      const current = await getRateLimitConfig(env.DB, endpoint);
      const maxRequests = config.maxRequests ?? current.maxRequests;
      const windowSeconds = config.windowSeconds ?? current.windowSeconds;

      if (!Number.isInteger(maxRequests) || maxRequests <= 0) {
        return jsonResponse(400, { error: `rateLimits.${endpoint}.maxRequests must be a positive integer` });
      }
      if (!Number.isInteger(windowSeconds) || windowSeconds <= 0) {
        return jsonResponse(400, { error: `rateLimits.${endpoint}.windowSeconds must be a positive integer` });
      }

      await upsertRateLimitConfig(env.DB, endpoint, maxRequests, windowSeconds);
    }
  }

  // Return full updated config
  return getConfig(env);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
