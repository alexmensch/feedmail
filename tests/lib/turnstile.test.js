import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "../../src/lib/turnstile.js";

describe("verifyTurnstile", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns error for missing token (null)", async () => {
    const result = await verifyTurnstile("secret", null);
    expect(result).toEqual({
      success: false,
      error: "Missing Turnstile token",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns error for missing token (undefined)", async () => {
    const result = await verifyTurnstile("secret", undefined);
    expect(result).toEqual({
      success: false,
      error: "Missing Turnstile token",
    });
  });

  it("returns error for empty string token", async () => {
    const result = await verifyTurnstile("secret", "");
    expect(result).toEqual({
      success: false,
      error: "Missing Turnstile token",
    });
  });

  it("returns success when Turnstile verifies", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    const result = await verifyTurnstile("secret-key", "valid-token");

    expect(result).toEqual({ success: true });
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body);
    expect(body.secret).toBe("secret-key");
    expect(body.response).toBe("valid-token");
    expect(body.remoteip).toBeUndefined();
  });

  it("includes remoteIp when provided", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstile("secret", "token", "1.2.3.4");

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.remoteip).toBe("1.2.3.4");
  });

  it("does not include remoteip when null", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstile("secret", "token", null);

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.remoteip).toBeUndefined();
  });

  it("does not include remoteip when undefined", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: true }),
    });

    await verifyTurnstile("secret", "token");

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.remoteip).toBeUndefined();
  });

  it("returns error with error codes when verification fails", async () => {
    fetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          success: false,
          "error-codes": ["invalid-input-response", "timeout-or-duplicate"],
        }),
    });

    const result = await verifyTurnstile("secret", "bad-token");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Turnstile verification failed");
    expect(result.error).toContain("invalid-input-response");
    expect(result.error).toContain("timeout-or-duplicate");
  });

  it("returns error with empty string when error-codes is missing", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: false }),
    });

    const result = await verifyTurnstile("secret", "bad-token");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Turnstile verification failed:");
  });

  it("returns error with empty error-codes array", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.resolve({ success: false, "error-codes": [] }),
    });

    const result = await verifyTurnstile("secret", "bad-token");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Turnstile verification failed: ");
  });

  it("handles network error", async () => {
    fetch.mockRejectedValue(new Error("Connection refused"));

    const result = await verifyTurnstile("secret", "token");

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      "Turnstile request failed: Connection refused",
    );
  });

  it("handles JSON parse error from response", async () => {
    fetch.mockResolvedValue({
      json: () => Promise.reject(new Error("Unexpected token")),
    });

    const result = await verifyTurnstile("secret", "token");

    expect(result.success).toBe(false);
    expect(result.error).toContain("Turnstile request failed:");
    expect(result.error).toContain("Unexpected token");
  });
});
