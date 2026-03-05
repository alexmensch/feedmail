import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/config.js", () => ({
  getChannelById: vi.fn(),
}));
vi.mock("../../src/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>rendered</html>"),
}));
vi.mock("../../src/lib/db.js", () => ({
  getSubscriberByVerifyToken: vi.fn(),
  markSubscriberVerified: vi.fn(),
  clearVerificationAttempts: vi.fn(),
}));

import { handleVerify } from "../../src/routes/verify.js";
import { getChannelById } from "../../src/lib/config.js";
import { render } from "../../src/lib/templates.js";
import {
  getSubscriberByVerifyToken,
  markSubscriberVerified,
  clearVerificationAttempts,
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteName: "Test Site",
  siteUrl: "https://test.example.com",
};

const env = { DB: {}, DOMAIN: "test.example.com" };

function makeUrl(token) {
  const url = new URL("https://test.example.com/api/verify");
  if (token !== undefined) url.searchParams.set("token", token);
  return url;
}

function makeRequest() {
  return new Request("https://test.example.com/api/verify", { method: "GET" });
}

describe("handleVerify — channel restructuring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getChannelById.mockReturnValue(CHANNEL);
  });

  describe("uses channel_id instead of site_id", () => {
    it("reads subscriber.channel_id to look up channel", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-channel",
        created_at: createdStr,
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
    });

    it("does not access subscriber.site_id", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      // Subscriber has channel_id, not site_id
      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-channel",
        created_at: createdStr,
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      // Should call getChannelById with "test-channel", not undefined
      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
      expect(markSubscriberVerified).toHaveBeenCalledWith(env.DB, 42);
    });
  });

  describe("uses getChannelById instead of getSiteById", () => {
    it("calls getChannelById for successful verification", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-channel",
        created_at: createdStr,
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("verifyPage", {
        siteName: "Test Site",
        siteUrl: "https://test.example.com",
      });
    });

    it("renders verify page with channel.siteName and channel.siteUrl", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-channel",
        created_at: createdStr,
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("verifyPage", {
        siteName: "Test Site",
        siteUrl: "https://test.example.com",
      });
    });

    it("uses fallback when channel not found in config", async () => {
      getChannelById.mockReturnValue(null);

      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "unknown-channel",
        created_at: createdStr,
      });

      await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(render).toHaveBeenCalledWith("verifyPage", {
        siteName: "the newsletter",
        siteUrl: "/",
      });
    });
  });

  describe("error page uses channel_id for lookup", () => {
    it("uses channel_id for error page site info on expired token", async () => {
      const created = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 1,
        channel_id: "test-channel",
        created_at: createdStr,
      });

      await handleVerify(makeRequest(), env, makeUrl("expired-token"));

      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
      expect(render).toHaveBeenCalledWith("errorPage", {
        siteName: "Test Site",
        siteUrl: "https://test.example.com",
        errorMessage: "This link is invalid or has expired. Please try subscribing again.",
      });
    });
  });

  describe("no feedmail.cc references in test URLs", () => {
    it("test URLs use test.example.com", async () => {
      const created = new Date(Date.now() - 1 * 60 * 60 * 1000);
      const createdStr = created.toISOString().replace("T", " ").replace("Z", "").split(".")[0];

      getSubscriberByVerifyToken.mockResolvedValue({
        id: 42,
        channel_id: "test-channel",
        created_at: createdStr,
      });

      const response = await handleVerify(makeRequest(), env, makeUrl("valid-token"));

      expect(response.status).toBe(200);
      expect(render).toHaveBeenCalledWith("verifyPage", {
        siteName: "Test Site",
        siteUrl: "https://test.example.com",
      });
    });
  });
});
