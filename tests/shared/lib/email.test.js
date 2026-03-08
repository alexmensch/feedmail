import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail } from "../../../src/shared/lib/email.js";

describe("sendEmail", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const baseOptions = {
    from: "hello@example.com",
    fromName: "Example",
    to: "user@test.com",
    subject: "Test Subject",
    html: "<p>Hello</p>",
    text: "Hello"
  };

  it("sends email successfully and returns success", async () => {
    fetch.mockResolvedValue({ ok: true });

    const result = await sendEmail("api-key", baseOptions);

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.from).toBe("Example <hello@example.com>");
    expect(body.to).toBe("user@test.com");
    expect(body.subject).toBe("Test Subject");
    expect(body.html).toBe("<p>Hello</p>");
    expect(body.text).toBe("Hello");
  });

  it("uses from directly when fromName is empty", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", { ...baseOptions, fromName: "" });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.from).toBe("hello@example.com");
  });

  it("uses from directly when fromName is undefined", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", { ...baseOptions, fromName: undefined });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.from).toBe("hello@example.com");
  });

  it("uses replyTo when provided", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", { ...baseOptions, replyTo: "reply@test.com" });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.reply_to).toBe("reply@test.com");
  });

  it("falls back to from when replyTo is not provided", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", { ...baseOptions, replyTo: undefined });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.reply_to).toBe("hello@example.com");
  });

  it("includes headers when provided and non-empty", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", {
      ...baseOptions,
      headers: {
        "List-Unsubscribe": "<https://example.com/unsub>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      }
    });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.headers).toEqual({
      "List-Unsubscribe": "<https://example.com/unsub>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    });
  });

  it("omits headers when empty object", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", { ...baseOptions, headers: {} });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.headers).toBeUndefined();
  });

  it("omits headers when undefined", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("api-key", { ...baseOptions, headers: undefined });

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.headers).toBeUndefined();
  });

  it("includes Bearer token in Authorization header", async () => {
    fetch.mockResolvedValue({ ok: true });

    await sendEmail("re_secret123", baseOptions);

    const headers = fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe("Bearer re_secret123");
  });

  describe("rate limit handling (429)", () => {
    it("retries on 429 with small retry-after", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "2" })
        })
        .mockResolvedValueOnce({ ok: true });

      const resultPromise = sendEmail("api-key", baseOptions);

      // Advance past the sleep(2000)
      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;
      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns quotaExhausted when retry-after exceeds MAX_RETRY_WAIT", async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "120" }),
        text: () => Promise.resolve("Rate limit exceeded")
      });

      const result = await sendEmail("api-key", baseOptions);

      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(true);
      expect(result.error).toContain("Resend 429");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("returns quotaExhausted after exhausting all retries on 429", async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "1" }),
        text: () => Promise.resolve("Rate limited")
      });

      const resultPromise = sendEmail("api-key", baseOptions);

      // First 3 attempts get 429 with retry-after=1, then 4th (last) attempt
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(true);
      // 4 attempts total: attempt 0, 1, 2 (retry), then attempt 3 (MAX_RETRIES, last attempt)
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it("defaults retry-after to 1 when header is missing", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers() // no retry-after
        })
        .mockResolvedValueOnce({ ok: true });

      const resultPromise = sendEmail("api-key", baseOptions);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;
      expect(result).toEqual({ success: true });
    });

    it("clamps retry-after to at least 1 when 0", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "0" })
        })
        .mockResolvedValueOnce({ ok: true });

      const resultPromise = sendEmail("api-key", baseOptions);
      await vi.advanceTimersByTimeAsync(1000);

      const result = await resultPromise;
      expect(result).toEqual({ success: true });
    });
  });

  describe("permanent errors", () => {
    it("returns failure for 400 errors without retrying", async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Invalid email")
      });

      const result = await sendEmail("api-key", baseOptions);

      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(false);
      expect(result.error).toContain("Resend 400: Invalid email");
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("returns failure for 401 errors", async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized")
      });

      const result = await sendEmail("api-key", baseOptions);

      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(false);
      expect(result.error).toContain("Resend 401");
    });

    it("returns failure for 500 errors", async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Server error")
      });

      const result = await sendEmail("api-key", baseOptions);

      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(false);
    });
  });

  describe("network errors", () => {
    it("retries on network error and succeeds", async () => {
      fetch
        .mockRejectedValueOnce(new Error("Connection refused"))
        .mockResolvedValueOnce({ ok: true });

      const result = await sendEmail("api-key", baseOptions);

      expect(result).toEqual({ success: true });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns failure after all network retries exhausted", async () => {
      fetch.mockRejectedValue(new Error("Network timeout"));

      const result = await sendEmail("api-key", baseOptions);

      expect(result.success).toBe(false);
      expect(result.quotaExhausted).toBe(false);
      expect(result.error).toContain("Network timeout");
      expect(result.error).toContain("4 attempts");
      expect(fetch).toHaveBeenCalledTimes(4); // MAX_RETRIES + 1
    });

    it("captures last error message from final network failure", async () => {
      fetch
        .mockRejectedValueOnce(new Error("First error"))
        .mockRejectedValueOnce(new Error("Second error"))
        .mockRejectedValueOnce(new Error("Third error"))
        .mockRejectedValueOnce(new Error("Final error"));

      const result = await sendEmail("api-key", baseOptions);

      expect(result.error).toContain("Final error");
    });
  });

  describe("retry-after parsing edge cases", () => {
    it("handles retry-after as HTTP date", async () => {
      const futureDate = new Date(Date.now() + 5000).toUTCString();
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": futureDate })
        })
        .mockResolvedValueOnce({ ok: true });

      const resultPromise = sendEmail("api-key", baseOptions);
      await vi.advanceTimersByTimeAsync(10000);

      const result = await resultPromise;
      expect(result).toEqual({ success: true });
    });

    it("handles retry-after as negative number", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "-5" })
        })
        .mockResolvedValueOnce({ ok: true });

      const resultPromise = sendEmail("api-key", baseOptions);
      await vi.advanceTimersByTimeAsync(1000); // clamped to 1

      const result = await resultPromise;
      expect(result).toEqual({ success: true });
    });

    it("handles unparseable retry-after value", async () => {
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "garbage" })
        })
        .mockResolvedValueOnce({ ok: true });

      const resultPromise = sendEmail("api-key", baseOptions);
      await vi.advanceTimersByTimeAsync(1000); // defaults to 1

      const result = await resultPromise;
      expect(result).toEqual({ success: true });
    });
  });
});
