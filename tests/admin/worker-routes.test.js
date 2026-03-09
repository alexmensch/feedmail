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
  handlePasskeyManagement: vi.fn(),
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
vi.mock("../../src/admin/routes/feeds.js", () => ({
  handleFeedNew: vi.fn(),
  handleFeedCreate: vi.fn(),
  handleFeedEdit: vi.fn(),
  handleFeedUpdate: vi.fn(),
  handleFeedDelete: vi.fn()
}));
vi.mock("../../src/admin/routes/subscribers.js", () => ({
  handleSubscriberList: vi.fn()
}));
vi.mock("../../src/admin/routes/settings.js", () => ({
  handleSettings: vi.fn()
}));
// Mock admin db
vi.mock("../../src/admin/lib/db.js", () => ({
  getPasskeyCredentialCount: vi.fn().mockResolvedValue(0),
  createMagicLinkToken: vi.fn(),
  getMagicLinkToken: vi.fn(),
  markMagicLinkTokenUsed: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  MAGIC_LINK_TTL_SECONDS: 900
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
// Mock templates
vi.mock("../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>mock</html>")
}));
// Mock shared response helpers
vi.mock("../../src/shared/lib/response.js", () => ({
  htmlResponse: vi.fn().mockImplementation(
    (html, status = 200) =>
      new Response(html, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));
// Mock shared db
vi.mock("../../src/shared/lib/db.js", () => ({
  getCredential: vi.fn()
}));

import adminApp from "../../src/admin/worker.js";
import { requireSession } from "../../src/admin/lib/session.js";
import { getRateLimitConfig } from "../../src/shared/lib/config.js";
import {
  checkRateLimit,
  getEndpointName
} from "../../src/shared/lib/rate-limit.js";
import {
  handleDashboard,
  handleSendTrigger
} from "../../src/admin/routes/dashboard.js";
import {
  handleChannelList,
  handleChannelNew,
  handleChannelCreate,
  handleChannelDetail,
  handleChannelUpdate,
  handleChannelDelete
} from "../../src/admin/routes/channels.js";
import {
  handleFeedNew,
  handleFeedCreate,
  handleFeedEdit,
  handleFeedUpdate,
  handleFeedDelete
} from "../../src/admin/routes/feeds.js";
import { handleSubscriberList } from "../../src/admin/routes/subscribers.js";
import { handleSettings } from "../../src/admin/routes/settings.js";

const RATE_LIMITS = {
  admin_login: { maxRequests: 10, windowSeconds: 3600 },
  admin_verify: { maxRequests: 20, windowSeconds: 3600 }
};

const env = {
  DB: {},
  DOMAIN: "feedmail.example.com"
};

const okResponse = new Response("<html>OK</html>", {
  status: 200,
  headers: { "Content-Type": "text/html" }
});

function makeRequest(method, path, headers = {}) {
  const reqHeaders = new Headers(headers);
  const options = { method, headers: reqHeaders };
  if (method === "POST" && !reqHeaders.has("Content-Type")) {
    reqHeaders.set("Content-Type", "application/x-www-form-urlencoded");
  }
  return new Request(`https://feedmail.example.com${path}`, options);
}

describe("admin worker — new route dispatching", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Session middleware: allow through
    requireSession.mockResolvedValue({
      session: { id: 1, token: "test-session" },
      response: null
    });

    // Rate limiting defaults: allow all requests
    getRateLimitConfig.mockResolvedValue(RATE_LIMITS);
    checkRateLimit.mockResolvedValue({ allowed: true });
    getEndpointName.mockReturnValue(null);

    // Default handler responses
    handleDashboard.mockResolvedValue(okResponse);
    handleSendTrigger.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin?success=ok" }
      })
    );
    handleChannelList.mockResolvedValue(okResponse);
    handleChannelNew.mockResolvedValue(okResponse);
    handleChannelCreate.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/channels/new-ch" }
      })
    );
    handleChannelDetail.mockResolvedValue(okResponse);
    handleChannelUpdate.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/channels/test-ch" }
      })
    );
    handleChannelDelete.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/channels" }
      })
    );
    handleFeedNew.mockResolvedValue(okResponse);
    handleFeedCreate.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/channels/test-ch" }
      })
    );
    handleFeedEdit.mockResolvedValue(okResponse);
    handleFeedUpdate.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/channels/test-ch" }
      })
    );
    handleFeedDelete.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/admin/channels/test-ch" }
      })
    );
    handleSubscriberList.mockResolvedValue(okResponse);
    handleSettings.mockResolvedValue(okResponse);
  });

  describe("dashboard routes", () => {
    it("routes GET /admin to handleDashboard", async () => {
      const request = makeRequest("GET", "/admin");
      await adminApp.fetch(request, env);

      expect(handleDashboard).toHaveBeenCalledWith(request, env);
    });

    it("routes POST /admin/send to handleSendTrigger", async () => {
      const request = makeRequest("POST", "/admin/send");
      await adminApp.fetch(request, env);

      expect(handleSendTrigger).toHaveBeenCalledWith(request, env);
    });

    it("returns 405 for GET /admin/send", async () => {
      const request = makeRequest("GET", "/admin/send");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  describe("channel routes", () => {
    it("routes GET /admin/channels to handleChannelList", async () => {
      const request = makeRequest("GET", "/admin/channels");
      await adminApp.fetch(request, env);

      expect(handleChannelList).toHaveBeenCalledWith(request, env);
    });

    it("routes GET /admin/channels/new to handleChannelNew", async () => {
      const request = makeRequest("GET", "/admin/channels/new");
      await adminApp.fetch(request, env);

      expect(handleChannelNew).toHaveBeenCalledWith(request, env);
    });

    it("routes POST /admin/channels to handleChannelCreate", async () => {
      const request = makeRequest("POST", "/admin/channels");
      await adminApp.fetch(request, env);

      expect(handleChannelCreate).toHaveBeenCalledWith(request, env);
    });

    it("routes GET /admin/channels/{id} to handleChannelDetail", async () => {
      const request = makeRequest("GET", "/admin/channels/test-ch");
      await adminApp.fetch(request, env);

      expect(handleChannelDetail).toHaveBeenCalledWith(request, env, "test-ch");
    });

    it("routes POST /admin/channels/{id} to handleChannelUpdate", async () => {
      const request = makeRequest("POST", "/admin/channels/test-ch");
      await adminApp.fetch(request, env);

      expect(handleChannelUpdate).toHaveBeenCalledWith(request, env, "test-ch");
    });

    it("routes POST /admin/channels/{id}/delete to handleChannelDelete", async () => {
      const request = makeRequest("POST", "/admin/channels/test-ch/delete");
      await adminApp.fetch(request, env);

      expect(handleChannelDelete).toHaveBeenCalledWith(request, env, "test-ch");
    });

    it("returns 405 for DELETE /admin/channels/{id}", async () => {
      const request = makeRequest("DELETE", "/admin/channels/test-ch");
      const response = await adminApp.fetch(request, env);

      // Browser forms can't send DELETE, so this should be handled
      expect(response.status).toBe(405);
    });
  });

  describe("feed routes", () => {
    it("routes GET /admin/channels/{id}/feeds/new to handleFeedNew", async () => {
      const request = makeRequest("GET", "/admin/channels/test-ch/feeds/new");
      await adminApp.fetch(request, env);

      expect(handleFeedNew).toHaveBeenCalledWith(request, env, "test-ch");
    });

    it("routes POST /admin/channels/{id}/feeds to handleFeedCreate", async () => {
      const request = makeRequest("POST", "/admin/channels/test-ch/feeds");
      await adminApp.fetch(request, env);

      expect(handleFeedCreate).toHaveBeenCalledWith(request, env, "test-ch");
    });

    it("routes GET /admin/channels/{id}/feeds/{feedId}/edit to handleFeedEdit", async () => {
      const request = makeRequest(
        "GET",
        "/admin/channels/test-ch/feeds/1/edit"
      );
      await adminApp.fetch(request, env);

      expect(handleFeedEdit).toHaveBeenCalledWith(request, env, "test-ch", "1");
    });

    it("routes POST /admin/channels/{id}/feeds/{feedId} to handleFeedUpdate", async () => {
      const request = makeRequest("POST", "/admin/channels/test-ch/feeds/1");
      await adminApp.fetch(request, env);

      expect(handleFeedUpdate).toHaveBeenCalledWith(
        request,
        env,
        "test-ch",
        "1"
      );
    });

    it("routes POST /admin/channels/{id}/feeds/{feedId}/delete to handleFeedDelete", async () => {
      const request = makeRequest(
        "POST",
        "/admin/channels/test-ch/feeds/1/delete"
      );
      await adminApp.fetch(request, env);

      expect(handleFeedDelete).toHaveBeenCalledWith(
        request,
        env,
        "test-ch",
        "1"
      );
    });

    it("returns 405 for POST /admin/channels/{id}/feeds/new", async () => {
      const request = makeRequest("POST", "/admin/channels/test-ch/feeds/new");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for GET /admin/channels/{id}/feeds/{feedId}/delete", async () => {
      const request = makeRequest(
        "GET",
        "/admin/channels/test-ch/feeds/1/delete"
      );
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for POST /admin/channels/{id}/feeds/{feedId}/edit", async () => {
      const request = makeRequest(
        "POST",
        "/admin/channels/test-ch/feeds/1/edit"
      );
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });

    it("returns 405 for GET /admin/channels/{id}/feeds/{feedId}", async () => {
      const request = makeRequest("GET", "/admin/channels/test-ch/feeds/1");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  describe("subscriber routes", () => {
    it("routes GET /admin/subscribers to handleSubscriberList", async () => {
      const request = makeRequest("GET", "/admin/subscribers");
      await adminApp.fetch(request, env);

      expect(handleSubscriberList).toHaveBeenCalledWith(request, env);
    });

    it("returns 405 for POST /admin/subscribers", async () => {
      const request = makeRequest("POST", "/admin/subscribers");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  describe("settings routes", () => {
    it("routes GET /admin/settings to handleSettings", async () => {
      const request = makeRequest("GET", "/admin/settings");
      await adminApp.fetch(request, env);

      expect(handleSettings).toHaveBeenCalledWith(request, env);
    });

    it("returns 405 for POST /admin/settings", async () => {
      const request = makeRequest("POST", "/admin/settings");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(405);
    });
  });

  describe("passkey redirect", () => {
    it("redirects GET /admin/passkeys to /admin/settings", async () => {
      const request = makeRequest("GET", "/admin/passkeys");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(
        "https://feedmail.example.com/admin/settings"
      );
    });
  });

  describe("authentication requirements", () => {
    it("requires session for GET /admin/channels", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("GET", "/admin/channels");
      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(handleChannelList).not.toHaveBeenCalled();
    });

    it("requires session for GET /admin/subscribers", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("GET", "/admin/subscribers");
      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(handleSubscriberList).not.toHaveBeenCalled();
    });

    it("requires session for GET /admin/settings", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("GET", "/admin/settings");
      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(handleSettings).not.toHaveBeenCalled();
    });

    it("requires session for POST /admin/send", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("POST", "/admin/send");
      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(handleSendTrigger).not.toHaveBeenCalled();
    });

    it("requires session for POST /admin/channels/{id}/delete", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("POST", "/admin/channels/test-ch/delete");
      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(handleChannelDelete).not.toHaveBeenCalled();
    });

    it("requires session for feed routes", async () => {
      requireSession.mockResolvedValue({
        session: null,
        response: new Response(null, {
          status: 302,
          headers: { Location: "/admin/login" }
        })
      });

      const request = makeRequest("GET", "/admin/channels/test-ch/feeds/new");
      const response = await adminApp.fetch(request, env);

      expect(requireSession).toHaveBeenCalled();
      expect(response.status).toBe(302);
      expect(handleFeedNew).not.toHaveBeenCalled();
    });
  });

  describe("unknown paths", () => {
    it("returns 404 for unknown admin paths", async () => {
      const request = makeRequest("GET", "/admin/nonexistent");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(404);
    });

    it("returns 404 for unknown nested paths", async () => {
      const request = makeRequest("GET", "/admin/channels/test-ch/unknown");
      const response = await adminApp.fetch(request, env);

      expect(response.status).toBe(404);
    });
  });
});
