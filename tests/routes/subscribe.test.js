import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies
vi.mock("../../src/lib/config.js", () => ({
  getSiteById: vi.fn(),
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
import { getSiteById, getVerifyLimits } from "../../src/lib/config.js";
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

const SITE = {
  id: "test-site",
  url: "https://example.com",
  name: "Test Site",
  fromEmail: "hello@example.com",
  fromName: "Test",
  replyTo: "reply@example.com",
  corsOrigins: ["https://example.com"],
  feeds: ["https://example.com/feed"],
};

const env = {
  DB: {},
  RESEND_API_KEY: "re_test",
  BASE_URL: "https://feedmail.cc",
  SITES: JSON.stringify([SITE]),
};

function makeRequest(body) {
  return new Request("https://feedmail.cc/api/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": "1.2.3.4",
    },
    body: JSON.stringify(body),
  });
}

describe("handleSubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub crypto.randomUUID
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("test-uuid"),
    });

    getSiteById.mockReturnValue(SITE);
    getVerifyLimits.mockReturnValue({ maxAttempts: 5, windowHours: 24 });
    sendEmail.mockResolvedValue({ success: true });
    countRecentVerificationAttempts.mockResolvedValue(0);
    insertSubscriber.mockResolvedValue({
      meta: { last_row_id: 1 },
    });
  });

  describe("input validation", () => {
    it("returns 400 for invalid JSON body", async () => {
      const request = new Request("https://feedmail.cc/api/subscribe", {
        method: "POST",
        body: "not json",
      });

      const response = await handleSubscribe(request, env);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.message).toBe("Invalid request body");
    });

    it("returns 400 for missing siteId", async () => {
      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Missing site identifier");
    });

    it("returns 400 for unknown siteId", async () => {
      getSiteById.mockReturnValue(null);

      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "unknown",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Unknown site");
    });

    it("returns 400 for missing email", async () => {
      const response = await handleSubscribe(
        makeRequest({ siteId: "test-site" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Please provide a valid email address");
    });

    it("returns 400 for invalid email format", async () => {
      const invalidEmails = [
        "notanemail",
        "@example.com",
        "user@",
        "user@domain",
        "user @domain.com",
        "",
      ];

      for (const email of invalidEmails) {
        const response = await handleSubscribe(
          makeRequest({ email, siteId: "test-site" }),
          env,
        );
        const body = await response.json();
        expect(response.status).toBe(400);
        expect(body.message).toBe("Please provide a valid email address");
      }
    });

    it("accepts valid email formats", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      const validEmails = [
        "user@domain.com",
        "user+tag@domain.com",
        "first.last@domain.co.uk",
      ];

      for (const email of validEmails) {
        const response = await handleSubscribe(
          makeRequest({ email, siteId: "test-site" }),
          env,
        );
        const body = await response.json();
        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
      }
    });
  });

  describe("strict field validation", () => {
    it("rejects request with unexpected field (honeypot support)", async () => {
      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
          honeypot: "gotcha",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.message).toBe("Invalid request body");
    });

    it("rejects request with multiple extra fields", async () => {
      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
          name: "Bot",
          phone: "123",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Invalid request body");
    });

    it("accepts request with exactly the expected fields", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("rejects before any DB or email work is done", async () => {
      await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
          honeypot: "filled",
        }),
        env,
      );

      expect(getSubscriberByEmail).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("existing subscriber handling", () => {
    it("returns success without sending email for verified subscriber (no info leak)", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "verified",
        email: "a@b.com",
        unsubscribe_token: "existing-unsub-token",
      });

      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(sendEmail).not.toHaveBeenCalled();
      expect(updateVerifyToken).not.toHaveBeenCalled();
    });

    it("regenerates token and re-sends for pending subscriber", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "pending",
        email: "a@b.com",
        unsubscribe_token: "existing-unsub-token",
      });

      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(updateVerifyToken).toHaveBeenCalledWith(
        env.DB,
        1,
        "test-uuid",
      );
      expect(sendEmail).toHaveBeenCalled();
    });

    it("resets to pending and re-sends for unsubscribed subscriber", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "unsubscribed",
        email: "a@b.com",
        unsubscribe_token: "existing-unsub-token",
      });

      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(resetSubscriberToPending).toHaveBeenCalledWith(
        env.DB,
        1,
        "test-uuid",
      );
      expect(sendEmail).toHaveBeenCalled();
    });

    it("all status responses are identical (no info leak)", async () => {
      const statuses = [
        { id: 1, status: "verified", email: "a@b.com", unsubscribe_token: "unsub-tok" },
        { id: 1, status: "pending", email: "a@b.com", unsubscribe_token: "unsub-tok" },
        { id: 1, status: "unsubscribed", email: "a@b.com", unsubscribe_token: "unsub-tok" },
        null, // new subscriber
      ];

      const responses = [];

      for (const existing of statuses) {
        vi.clearAllMocks();
        getSiteById.mockReturnValue(SITE);
        getVerifyLimits.mockReturnValue({ maxAttempts: 5, windowHours: 24 });
        sendEmail.mockResolvedValue({ success: true });
        countRecentVerificationAttempts.mockResolvedValue(0);
        insertSubscriber.mockResolvedValue({ meta: { last_row_id: 1 } });
        getSubscriberByEmail.mockResolvedValue(existing);

        const response = await handleSubscribe(
          makeRequest({
            email: "a@b.com",
            siteId: "test-site",
          }),
          env,
        );
        const body = await response.json();
        responses.push({ status: response.status, body });
      }

      // All should return same status and body structure
      for (const r of responses) {
        expect(r.status).toBe(200);
        expect(r.body.success).toBe(true);
        expect(r.body.message).toBe(
          "Check your email to confirm your subscription",
        );
      }
    });
  });

  describe("new subscriber", () => {
    it("inserts subscriber and sends verification email", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({
          email: "New@Example.COM",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);

      // Should normalize email
      expect(insertSubscriber).toHaveBeenCalledWith(env.DB, {
        siteId: "test-site",
        email: "new@example.com",
        verifyToken: "test-uuid",
        unsubscribeToken: "test-uuid",
      });

      expect(sendEmail).toHaveBeenCalled();
    });

    it("normalizes email to lowercase", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({
          email: "USER@DOMAIN.COM",
          siteId: "test-site",
        }),
        env,
      );

      expect(getSubscriberByEmail).toHaveBeenCalledWith(
        env.DB,
        "user@domain.com",
        "test-site",
      );
    });

    it("rejects emails with leading/trailing spaces (regex validation)", async () => {
      // The EMAIL_REGEX requires no whitespace, so emails with spaces fail
      // validation before reaching normalization
      const response = await handleSubscribe(
        makeRequest({
          email: "  USER@DOMAIN.COM  ",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.message).toBe("Please provide a valid email address");
    });

    it("falls back to re-querying subscriber when last_row_id is missing", async () => {
      getSubscriberByEmail
        .mockResolvedValueOnce(null) // first call: check existing
        .mockResolvedValueOnce({ id: 99, email: "a@b.com" }); // fallback lookup

      insertSubscriber.mockResolvedValue({ meta: {} }); // no last_row_id

      await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );

      // Should have called getSubscriberByEmail twice
      expect(getSubscriberByEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe("rate limiting", () => {
    it("silently skips email when rate limited", async () => {
      getSubscriberByEmail.mockResolvedValue(null);
      countRecentVerificationAttempts.mockResolvedValue(5);

      const response = await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("sends email when just under rate limit", async () => {
      getSubscriberByEmail.mockResolvedValue(null);
      countRecentVerificationAttempts.mockResolvedValue(4);

      await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );

      expect(sendEmail).toHaveBeenCalled();
    });

    it("records verification attempt on successful send", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );

      expect(insertVerificationAttempt).toHaveBeenCalled();
    });

    it("does not record attempt when email send fails", async () => {
      getSubscriberByEmail.mockResolvedValue(null);
      sendEmail.mockResolvedValue({
        success: false,
        error: "Send failed",
      });

      await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );

      expect(insertVerificationAttempt).not.toHaveBeenCalled();
    });
  });

  describe("verification email content", () => {
    it("renders verification email template with correct data", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({
          email: "a@b.com",
          siteId: "test-site",
        }),
        env,
      );

      // Requirement 2(d): render call passes unsubscribeUrl in template data
      expect(render).toHaveBeenCalledWith("verificationEmail", {
        siteName: "Test Site",
        siteUrl: "https://example.com",
        verifyUrl: "https://feedmail.cc/api/verify?token=test-uuid",
        unsubscribeUrl: "https://feedmail.cc/api/unsubscribe?token=test-uuid",
      });
    });

    it("sends email with correct from, to, and subject", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({
          email: "user@test.com",
          siteId: "test-site",
        }),
        env,
      );

      // Requirement 1(c): sendEmail call includes headers with both List-Unsubscribe headers
      expect(sendEmail).toHaveBeenCalledWith("re_test", {
        from: "hello@example.com",
        fromName: "Test",
        replyTo: "reply@example.com",
        to: "user@test.com",
        subject: "Confirm your subscription to Test Site",
        html: expect.any(String),
        text: expect.stringContaining("Confirm your subscription"),
        headers: {
          "List-Unsubscribe": "<https://feedmail.cc/api/unsubscribe?token=test-uuid>",
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
    });
  });

  // Requirement 1: List-Unsubscribe headers on verification emails
  describe("Requirement 1: List-Unsubscribe headers on verification emails", () => {
    it("includes List-Unsubscribe header with angle-bracket-wrapped URL for new subscriber", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].headers).toBeDefined();
      expect(emailCall[1].headers["List-Unsubscribe"]).toBe(
        "<https://feedmail.cc/api/unsubscribe?token=test-uuid>",
      );
    });

    it("includes List-Unsubscribe-Post header with One-Click value for new subscriber", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
    });

    it("uses existing unsubscribe_token for pending subscriber", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "pending",
        email: "a@b.com",
        unsubscribe_token: "existing-pending-token",
      });

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].headers["List-Unsubscribe"]).toBe(
        "<https://feedmail.cc/api/unsubscribe?token=existing-pending-token>",
      );
      expect(emailCall[1].headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
    });

    it("uses existing unsubscribe_token for unsubscribed subscriber re-subscribing", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "unsubscribed",
        email: "a@b.com",
        unsubscribe_token: "existing-unsub-token",
      });

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      expect(emailCall[1].headers["List-Unsubscribe"]).toBe(
        "<https://feedmail.cc/api/unsubscribe?token=existing-unsub-token>",
      );
      expect(emailCall[1].headers["List-Unsubscribe-Post"]).toBe(
        "List-Unsubscribe=One-Click",
      );
    });

    it("uses the same header format as newsletter emails in send.js", async () => {
      // The format must match: <{BASE_URL}/api/unsubscribe?token={token}>
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      const header = emailCall[1].headers["List-Unsubscribe"];
      // Must start with < and end with >
      expect(header).toMatch(/^<.+>$/);
      // Must contain the full unsubscribe URL
      expect(header).toContain("https://feedmail.cc/api/unsubscribe?token=");
    });
  });

  // Requirement 2: Unsubscribe link in verification email footer
  describe("Requirement 2: Unsubscribe link in verification email footer", () => {
    it("passes unsubscribeUrl in template data for new subscriber", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      // crypto.randomUUID returns "test-uuid" for all calls
      // New subscribers: unsubscribeToken is also "test-uuid"
      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          unsubscribeUrl: "https://feedmail.cc/api/unsubscribe?token=test-uuid",
        }),
      );
    });

    it("passes unsubscribeUrl for pending subscriber using existing token", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "pending",
        email: "a@b.com",
        unsubscribe_token: "pending-unsub-tok",
      });

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          unsubscribeUrl: "https://feedmail.cc/api/unsubscribe?token=pending-unsub-tok",
        }),
      );
    });

    it("passes unsubscribeUrl for unsubscribed subscriber using existing token", async () => {
      getSubscriberByEmail.mockResolvedValue({
        id: 1,
        status: "unsubscribed",
        email: "a@b.com",
        unsubscribe_token: "resub-unsub-tok",
      });

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          unsubscribeUrl: "https://feedmail.cc/api/unsubscribe?token=resub-unsub-tok",
        }),
      );
    });

    it("includes unsubscribe URL in plain text email body", async () => {
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      const textBody = emailCall[1].text;
      // Requirement 2(c): plain text includes "Unsubscribe: {url}"
      expect(textBody).toContain("Unsubscribe:");
      expect(textBody).toContain("https://feedmail.cc/api/unsubscribe?token=test-uuid");
    });
  });

  // Requirement 3: Optional companyName and companyAddress in SITES config
  describe("Requirement 3: Optional companyName and companyAddress in SITES config", () => {
    it("site config without companyName and companyAddress works normally", async () => {
      // SITE fixture has no companyName or companyAddress
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(sendEmail).toHaveBeenCalled();
    });

    it("site config with companyName and companyAddress works normally", async () => {
      const siteWithCompany = {
        ...SITE,
        companyName: "Acme Corp",
        companyAddress: "123 Main St, Springfield, IL 62701",
      };
      getSiteById.mockReturnValue(siteWithCompany);
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(sendEmail).toHaveBeenCalled();
    });

    it("site config with empty string companyName and companyAddress works normally", async () => {
      const siteWithEmpty = {
        ...SITE,
        companyName: "",
        companyAddress: "",
      };
      getSiteById.mockReturnValue(siteWithEmpty);
      getSubscriberByEmail.mockResolvedValue(null);

      const response = await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  // Requirement 4: Company info in verification email footer
  describe("Requirement 4: Company info in verification email footer", () => {
    it("passes companyName and companyAddress to template data when configured", async () => {
      const siteWithCompany = {
        ...SITE,
        companyName: "Acme Corp",
        companyAddress: "123 Main St, Springfield, IL 62701",
      };
      getSiteById.mockReturnValue(siteWithCompany);
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          companyName: "Acme Corp",
          companyAddress: "123 Main St, Springfield, IL 62701",
        }),
      );
    });

    it("does not pass companyName or companyAddress when not configured", async () => {
      // Default SITE has no companyName/companyAddress
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const renderCall = render.mock.calls[0];
      const templateData = renderCall[1];
      // When site config does not have these fields, they should still be
      // passed through (as undefined) or not present -- the important thing
      // is that the template handles it gracefully via {{#if}} blocks.
      // The implementation should pass site.companyName and site.companyAddress
      // which will be undefined when not configured.
      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          companyName: undefined,
          companyAddress: undefined,
        }),
      );
    });

    it("passes empty string companyName when site has empty string", async () => {
      const siteWithEmpty = {
        ...SITE,
        companyName: "",
        companyAddress: "123 Main St",
      };
      getSiteById.mockReturnValue(siteWithEmpty);
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      // Empty string companyName should be passed through (treated as falsy in Handlebars)
      expect(render).toHaveBeenCalledWith(
        "verificationEmail",
        expect.objectContaining({
          companyName: "",
          companyAddress: "123 Main St",
        }),
      );
    });

    it("includes company info in plain text email when configured", async () => {
      const siteWithCompany = {
        ...SITE,
        companyName: "Acme Corp",
        companyAddress: "123 Main St, Springfield, IL 62701",
      };
      getSiteById.mockReturnValue(siteWithCompany);
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      const textBody = emailCall[1].text;
      expect(textBody).toContain("Acme Corp");
      expect(textBody).toContain("123 Main St, Springfield, IL 62701");
    });

    it("does not include company info in plain text email when not configured", async () => {
      // Default SITE has no companyName/companyAddress
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      const textBody = emailCall[1].text;
      // Should not contain any company-related text
      // (but should still contain the standard verification content)
      expect(textBody).toContain("Confirm your subscription");
      expect(textBody).not.toContain("Acme Corp");
    });

    it("includes only companyAddress when companyName is empty string", async () => {
      const sitePartial = {
        ...SITE,
        companyName: "",
        companyAddress: "123 Main St",
      };
      getSiteById.mockReturnValue(sitePartial);
      getSubscriberByEmail.mockResolvedValue(null);

      await handleSubscribe(
        makeRequest({ email: "a@b.com", siteId: "test-site" }),
        env,
      );

      const emailCall = sendEmail.mock.calls[0];
      const textBody = emailCall[1].text;
      expect(textBody).toContain("123 Main St");
    });
  });
});
