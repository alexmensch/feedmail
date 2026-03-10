import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock route handlers
vi.mock("../../src/admin/routes/auth.js", () => ({
  handleLogin: vi.fn(),
  handleLoginSubmit: vi.fn(),
  handleAdminVerify: vi.fn(),
  handleLogout: vi.fn()
}));
vi.mock("../../src/admin/routes/passkeys.js", () => ({
  handleRegisterOptions: vi.fn(),
  handleRegisterVerify: vi.fn(),
  handleAuthenticateOptions: vi.fn(),
  handleAuthenticateVerify: vi.fn(),
  handlePasskeyRename: vi.fn(),
  handlePasskeyDelete: vi.fn()
}));
vi.mock("../../src/admin/routes/dashboard.js", () => ({
  handleDashboard: vi.fn(),
  handleSendTrigger: vi.fn()
}));
vi.mock("../../src/admin/routes/channels.js", () => ({
  handleChannelList: vi.fn(),
  handleChannelNew: vi.fn(),
  handleChannelCreate: vi.fn(),
  handleChannelDetail: vi.fn(),
  handleChannelUpdate: vi.fn(),
  handleChannelDelete: vi.fn()
}));
vi.mock("../../src/admin/routes/subscribers.js", () => ({
  handleSubscriberList: vi.fn()
}));
vi.mock("../../src/admin/routes/settings.js", () => ({
  handleSettings: vi.fn()
}));
// Mock session middleware
vi.mock("../../src/admin/lib/session.js", () => ({
  requireSession: vi.fn(),
  getSessionFromCookie: vi.fn(),
  SESSION_COOKIE_NAME: "feedmail_admin_session",
  SESSION_TTL_SECONDS: 86400
}));
// Mock shared config for rate limiting
vi.mock("../../src/shared/lib/config.js", () => ({
  getRateLimitConfig: vi.fn()
}));
// Mock shared rate-limit
vi.mock("../../src/shared/lib/rate-limit.js", () => ({
  checkRateLimit: vi.fn(),
  getEndpointName: vi.fn()
}));

import adminApp from "../../src/admin/worker.js";
import { requireSession } from "../../src/admin/lib/session.js";
import { getRateLimitConfig } from "../../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../../src/shared/lib/rate-limit.js";
import { handleDashboard } from "../../src/admin/routes/dashboard.js";

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  return new Request(`https://feedmail.example.com${path}`, {
    method,
    headers: reqHeaders
  });
}

describe("admin dashboard — passkey bootstrap prompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Session middleware: valid session
    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    // Rate limiting: allow all
    getRateLimitConfig.mockResolvedValue({});
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockReturnValue(null);

    // handleDashboard returns a mock response
    handleDashboard.mockResolvedValue(
      new Response("<html>dashboard</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      })
    );
  });

  it("routes GET /admin to handleDashboard", async () => {
    const request = makeRequest("GET", "/admin");
    await adminApp.fetch(request, env);

    expect(handleDashboard).toHaveBeenCalledWith(request, env);
  });

  it("handleDashboard receives the request and env for passkey prompt logic", async () => {
    const request = makeRequest("GET", "/admin?dismissed=passkey");
    await adminApp.fetch(request, env);

    expect(handleDashboard).toHaveBeenCalledWith(request, env);
  });
});
