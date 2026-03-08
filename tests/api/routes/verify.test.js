import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/shared/lib/config.js", () => ({
  getChannelById: vi.fn()
}));
vi.mock("../../../src/shared/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>rendered</html>"),
  renderErrorPage: vi.fn().mockImplementation(
    () =>
      new Response("<html>error</html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" }
      })
  )
}));
vi.mock("../../../src/shared/lib/db.js", () => ({
  getSubscriberByVerifyToken: vi.fn(),
  markSubscriberVerified: vi.fn(),
  clearVerificationAttempts: vi.fn()
}));

import { handleVerify } from "../../../src/api/routes/verify.js";
import { getChannelById } from "../../../src/shared/lib/config.js";
import { render, renderErrorPage } from "../../../src/shared/lib/templates.js";
import {
  getSubscriberByVerifyToken,
  markSubscriberVerified,
  clearVerificationAttempts
} from "../../../src/shared/lib/db.js";

const CHANNEL = {
  id: "test-site",
  siteName: "Test Site",
  siteUrl: "https://example.com"
};

const env = { DB: {} };

function makeUrl(token) {
  const url = new URL("https://test.example.com/api/verify");
  if (token !== undefined) {
    url.searchParams.set("token", token);
  }
  return url;
}

function makeRequest() {
  return new Request("https://test.example.com/api/verify", { method: "GET" });
}

describe("handleVerify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockReturnValue(CHANNEL);
  });

  describe("missing or invalid token", () => {
    it("returns error page when token is missing", async () => {
      const url = new URL("https://test.example.com/api/verify"); // no token param

      const response = await handleVerify(makeRequest(), env, url);

      expect(response.status).toBe(200);
      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        null,
        "This link is invalid or has expired. Please try subscribing again."
      );
    });

    it("returns error page when subscriber not found for token", async () => {
      getSubscriberByVerifyToken.mockResolvedValue(null);

      const response = await handleVerify(
        makeRequest(),
        env,
        makeUrl("invalid-token")
      );

      expect(response.status).toBe(200);
      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        null,
        "This link is invalid or has expired. Please try subscribing again."
      );
      expect(markSubscriberVerified).not.toHaveBeenCalled();
    });
  });

  describe("token expiry", () => {
    it("returns error page when token is expired (>24 hours)", async () => {
      const created = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 1,
        channel_id: "test-site",
        created_at: createdStr
      });

      const response = await handleVerify(
        makeRequest(),
        env,
        makeUrl("expired-token")
      );

      expect(response.status).toBe(200);
      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        "test-site",
        "This link is invalid or has expired. Please try subscribing again."
      );
      expect(markSubscriberVerified).not.toHaveBeenCalled();
    });

    it("succeeds when token is exactly at 24 hour boundary", async () => {
      // Exactly 23.9 hours ago - should still be valid
      const created = new Date(Date.now() - 23.9 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 1,
        channel_id: "test-site",
        created_at: createdStr
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(markSubscriberVerified).toHaveBeenCalledWith(env.DB, 1);
    });

    it("uses error page with channel_id when expired token has valid channel_id", async () => {
      const created = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 1,
        channel_id: "test-site",
        created_at: createdStr
      });

      await handleVerify(makeRequest(), env, makeUrl("expired-token"));

      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        "test-site",
        "This link is invalid or has expired. Please try subscribing again."
      );
    });
  });

  describe("successful verification", () => {
    it("marks subscriber as verified", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-site",
        created_at: createdStr
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(markSubscriberVerified).toHaveBeenCalledWith(env.DB, 42);
    });

    it("clears verification attempts", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-site",
        created_at: createdStr
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(clearVerificationAttempts).toHaveBeenCalledWith(env.DB, 42);
    });

    it("renders verify page with site info", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-site",
        created_at: createdStr
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("verifyPage", {
        siteName: "Test Site",
        siteUrl: "https://example.com"
      });
    });

    it("returns HTML content type", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-site",
        created_at: createdStr
      });

      const response = await handleVerify(
        makeRequest(),
        env,
        makeUrl("valid-token")
      );

      expect(response.headers.get("Content-Type")).toBe(
        "text/html; charset=utf-8"
      );
    });

    it("uses fallback site name when site not found in config", async () => {
      getChannelById.mockReturnValue(null);

      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "unknown-site",
        created_at: createdStr
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("verifyPage", {
        siteName: "the newsletter",
        siteUrl: "/"
      });
    });
  });

  describe("error page consistency (no info leak)", () => {
    it("returns same status 200 for all error cases", async () => {
      // No token
      const r1 = await handleVerify(
        makeRequest(),
        env,
        new URL("https://test.example.com/api/verify")
      );
      expect(r1.status).toBe(200);

      // Invalid token
      getSubscriberByVerifyToken.mockResolvedValue(null);
      const r2 = await handleVerify(makeRequest(), env, makeUrl("bad-token"));
      expect(r2.status).toBe(200);

      // Expired token
      const created = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];
      getSubscriberByVerifyToken.mockResolvedValue({
        id: 1,
        channel_id: "test-site",
        created_at: createdStr
      });
      const r3 = await handleVerify(makeRequest(), env, makeUrl("expired"));
      expect(r3.status).toBe(200);
    });

    it("uses same error message for all error cases", async () => {
      const expectedMsg =
        "This link is invalid or has expired. Please try subscribing again.";

      // No token
      renderErrorPage.mockClear();
      await handleVerify(
        makeRequest(),
        env,
        new URL("https://test.example.com/api/verify")
      );
      expect(renderErrorPage).toHaveBeenCalledWith(env, null, expectedMsg);

      // Invalid token
      renderErrorPage.mockClear();
      getSubscriberByVerifyToken.mockResolvedValue(null);
      await handleVerify(makeRequest(), env, makeUrl("bad-token"));
      expect(renderErrorPage).toHaveBeenCalledWith(env, null, expectedMsg);

      // Expired token
      renderErrorPage.mockClear();
      const created = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const createdStr = created
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
        .split(".")[0];
      getSubscriberByVerifyToken.mockResolvedValue({
        id: 1,
        channel_id: "test-site",
        created_at: createdStr
      });
      await handleVerify(makeRequest(), env, makeUrl("expired"));
      expect(renderErrorPage).toHaveBeenCalledWith(
        env,
        "test-site",
        expectedMsg
      );
    });
  });
});
