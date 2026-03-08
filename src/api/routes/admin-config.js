/**
 * GET/PATCH /api/admin/config
 * Site-level settings and per-endpoint rate limit configuration.
 */

import {
  getSiteConfig,
  upsertSiteConfig,
  getRateLimitConfigs,
  upsertRateLimitConfig
} from "../../shared/lib/db.js";
import { RATE_LIMIT_DEFAULTS } from "../../shared/lib/config.js";
import { jsonResponse } from "../../shared/lib/response.js";

const VALID_ENDPOINTS = Object.keys(RATE_LIMIT_DEFAULTS);

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
  const siteConfig = await getSiteConfig(env.DB);
  const dbRateLimits = await getRateLimitConfigs(env.DB);

  // Merge DB rate limits with defaults
  const rateLimits = {};
  for (const endpoint of VALID_ENDPOINTS) {
    rateLimits[endpoint] =
      dbRateLimits[endpoint] || RATE_LIMIT_DEFAULTS[endpoint];
  }

  return jsonResponse(200, {
    verifyMaxAttempts: siteConfig?.verifyMaxAttempts ?? 3,
    verifyWindowHours: siteConfig?.verifyWindowHours ?? 24,
    rateLimits
  });
}

async function updateConfig(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  // Validate and apply verify settings
  if (
    body.verifyMaxAttempts !== undefined ||
    body.verifyWindowHours !== undefined
  ) {
    const currentSiteConfig = await getSiteConfig(env.DB);

    if (body.verifyMaxAttempts !== undefined) {
      if (
        !Number.isInteger(body.verifyMaxAttempts) ||
        body.verifyMaxAttempts <= 0
      ) {
        return jsonResponse(400, {
          error: "verifyMaxAttempts must be a positive integer"
        });
      }
    }
    if (body.verifyWindowHours !== undefined) {
      if (
        typeof body.verifyWindowHours !== "number" ||
        body.verifyWindowHours <= 0
      ) {
        return jsonResponse(400, {
          error: "verifyWindowHours must be a positive number"
        });
      }
    }

    const maxAttempts =
      body.verifyMaxAttempts ?? currentSiteConfig?.verifyMaxAttempts ?? 3;
    const windowHours =
      body.verifyWindowHours ?? currentSiteConfig?.verifyWindowHours ?? 24;

    await upsertSiteConfig(env.DB, {
      verifyMaxAttempts: maxAttempts,
      verifyWindowHours: windowHours
    });
  }

  // Validate and apply rate limit settings
  if (body.rateLimits) {
    for (const [endpoint, config] of Object.entries(body.rateLimits)) {
      if (!VALID_ENDPOINTS.includes(endpoint)) {
        return jsonResponse(400, { error: `Unknown endpoint: ${endpoint}` });
      }

      if (typeof config.maxRequests !== "number" || config.maxRequests <= 0) {
        return jsonResponse(400, {
          error: `rateLimits.${endpoint}.maxRequests must be a positive number`
        });
      }
      if (typeof config.windowHours !== "number" || config.windowHours <= 0) {
        return jsonResponse(400, {
          error: `rateLimits.${endpoint}.windowHours must be a positive number`
        });
      }

      await upsertRateLimitConfig(env.DB, endpoint, {
        windowHours: config.windowHours,
        maxRequests: config.maxRequests
      });
    }
  }

  // Return full updated config
  return getConfig(env);
}
