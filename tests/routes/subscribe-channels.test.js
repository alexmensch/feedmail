import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("../../src/lib/config.js", () => ({
  getChannelById: vi.fn(),
  getVerifyLimits: vi.fn(),
}));
vi.mock("../../src/lib/email.js", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("../../src/lib/templates.js", () => ({
  render: vi.fn().mockReturnValue("<html>verification</html>"),
}));
vi.mock("../../src/lib/db.js", () => ({
  getSubscriberByEmail: vi.fn(),
  insertSubscriber: vi.fn(),
  resetSubscriberToPending: vi.fn(),
  updateVerifyToken: vi.fn(),
  countRecentVerificationAttempts: vi.fn(),
  insertVerificationAttempt: vi.fn(),
}));

import { handleSubscribe } from "../../src/routes/subscribe.js";
import { getChannelById, getVerifyLimits } from "../../src/lib/config.js";
import { sendEmail } from "../../src/lib/email.js";
import { render } from "../../src/lib/templates.js";
import {
  getSubscriberByEmail,
  insertSubscriber,
  resetSubscriberToPending,
  updateVerifyToken,
  countRecentVerificationAttempts,
  insertVerificationAttempt,
} from "../../src/lib/db.js";

const CHANNEL = {
  id: "test-channel",
  siteUrl: "https://test.example.com",
  siteName: "Test Site",
  fromUser: "hello",
  fromName: "Test",
  replyTo: "reply@test.example.com",
  corsOrigins: ["https://test.example.com"],
  feeds: [{ name: "Main Feed", url: "https://test.example.com/feed" }],
};

const env = {
  DB: {},
  RESEND_API_KEY: "re_test",
  DOMAIN: "test.example.com",
  CHANNELS: JSON.stringify([CHANNEL]),
};

function makeRequest(body) {
  return new Request("https://test.example.com/api/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });
}

describe("handleSubscribe — channel restructuring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("test-uuid"),
    });

    getChannelById.mockReturnValue(CHANNEL);
    getVerifyLimits.mockReturnValue({ maxAttempts: 5, windowHours: 24 });
    sendEmail.mockResolvedValue({ success: true });
    countRecentVerificationAttempts.mockResolvedValue(0);
    insertSubscriber.mockResolvedValue({
      meta: { last_row_id: 1 },
    });
  });

  describe("channelId replaces siteId", () => {
    it("accepts channelId in request body", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("returns 400 for missing channelId", async () => {
      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      // Error message references channel, not site
      expect(body.message).toMatch(/channel/i);
    });

    it("returns 400 for unknown channelId", async () => {
      getChannelById.mockReturnValue(null);

      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          channelId: "unknown",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toMatch(/channel/i);
    });

    it("calls getChannelById (not getSiteById) to look up channel", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      expect(getChannelById).toHaveBeenCalledWith(env, "test-channel");
    });

    it("ALLOWED_FIELDS includes channelId (not siteId)", async () => {
      // Request with channelId should be accepted (not rejected as unexpected field)
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("rejects siteId as an unexpected field (honeypot)", async () => {
      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          channelId: "test-channel",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Invalid request body");
    });
  });

  describe("from-email constructed as fromUser@DOMAIN", () => {
    it("sends email with from address as fromUser@DOMAIN", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "user@test.com", channelId: "test-channel" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      // from should be "hello@test.example.com" (fromUser@DOMAIN)
      expect(emailCall[1].from).toBe("hello@test.example.com");
    });

    it("does not use channel.fromEmail", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "user@test.com", channelId: "test-channel" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      // Should NOT be fromEmail — should be fromUser@DOMAIN
      expect(emailCall[1].from).not.toContain("fromEmail");
    });
  });

  describe("URLs use https://{DOMAIN}", () => {
    it("verify URL uses https://{DOMAIN}/api/verify", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          verifyUrl: "https://test.example.com/api/verify?token=test-uuid",
        }),
      );
    });

    it("unsubscribe URL uses https://{DOMAIN}/api/unsubscribe", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          unsubscribeUrl: "https://test.example.com/api/unsubscribe?token=test-uuid",
        }),
      );
    });

    it("List-Unsubscribe header uses https://{DOMAIN}", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].headers["List-Unsubscribe"]).toBe(
        "<https://test.example.com/api/unsubscribe?token=test-uuid>",
      );
    });

    it("plain text email contains unsubscribe URL with DOMAIN", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].text).toContain(
        "https://test.example.com/api/unsubscribe?token=test-uuid",
      );
    });
  });

  describe("template data uses channel field names", () => {
    it("renders template with siteName from channel", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          siteName: "Test Site",
          siteUrl: "https://test.example.com",
        }),
      );
    });

    it("email subject uses channel.siteName", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].subject).toBe("Confirm your subscription to Test Site");
    });
  });

  describe("insertSubscriber uses channelId", () => {
    it("passes channelId (not siteId) to insertSubscriber", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        env,
      );

      expect(insertSubscriber).toHaveBeenCalledWith(env.DB, {
        channelId: "test-channel",
        email: "a@b.com",
        verifyToken: "test-uuid",
        unsubscribeToken: "test-uuid",
      });
    });
  });

  describe("no BASE_URL references", () => {
    it("does not read env.BASE_URL", async () => {
      const envWithBaseUrl = {
        ...env,
        BASE_URL: "https://old.feedmail.cc",
      };
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", channelId: "test-channel" }),
        envWithBaseUrl,
      );

      // URLs should use DOMAIN, not BASE_URL
      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          verifyUrl: expect.stringContaining("test.example.com"),
        }),
      );
      expect(render).not.toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          verifyUrl: expect.stringContaining("feedmail.cc"),
        }),
      );
    });
  });
});
