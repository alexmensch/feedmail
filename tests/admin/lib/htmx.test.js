import { describe, it, expect, vi } from "vitest";

import {
  isHtmxRequest,
  fragmentResponse,
  respondFeedback
} from "../../../src/admin/lib/htmx.js";

describe("isHtmxRequest", () => {
  it("returns true when HX-Request header is set to 'true'", () => {
    const request = new Request("https://example.com/admin", {
      headers: { "HX-Request": "true" }
    });

    expect(isHtmxRequest(request)).toBe(true);
  });

  it("returns false when HX-Request header is missing", () => {
    const request = new Request("https://example.com/admin");

    expect(isHtmxRequest(request)).toBe(false);
  });

  it("returns false when HX-Request header is empty string", () => {
    const request = new Request("https://example.com/admin", {
      headers: { "HX-Request": "" }
    });

    expect(isHtmxRequest(request)).toBe(false);
  });

  it("returns false when HX-Request header is set to a non-true value", () => {
    const request = new Request("https://example.com/admin", {
      headers: { "HX-Request": "false" }
    });

    expect(isHtmxRequest(request)).toBe(false);
  });

  it("returns false for non-lowercase 'true' value", () => {
    const request = new Request("https://example.com/admin", {
      headers: { "HX-Request": "True" }
    });

    // HTMX always sends lowercase "true"; only accept the exact value
    expect(isHtmxRequest(request)).toBe(false);
  });
});

describe("fragmentResponse", () => {
  it("returns a Response with the provided HTML content", async () => {
    const html = "<div>Fragment content</div>";
    const response = fragmentResponse(html);

    expect(response).toBeInstanceOf(Response);
    const body = await response.text();
    expect(body).toBe(html);
  });

  it("sets Content-Type to text/html with charset", async () => {
    const response = fragmentResponse("<p>test</p>");

    expect(response.headers.get("Content-Type")).toContain("text/html");
  });

  it("returns status 200 by default", () => {
    const response = fragmentResponse("<p>test</p>");

    expect(response.status).toBe(200);
  });

  it("does not wrap content in a full HTML document", async () => {
    const html = "<div>Just a fragment</div>";
    const response = fragmentResponse(html);
    const body = await response.text();

    expect(body).not.toContain("<!DOCTYPE");
    expect(body).not.toContain("<html");
    expect(body).not.toContain("<head");
    expect(body).not.toContain("<body");
    expect(body).toBe(html);
  });
});

describe("respondFeedback", () => {
  it("calls the fragment builder for HTMX requests", () => {
    const fragment = vi.fn().mockReturnValue("FRAGMENT");
    const result = respondFeedback({
      htmx: true,
      fragment,
      redirectUrl: "https://feedmail.cc/admin?error=x"
    });

    expect(fragment).toHaveBeenCalledOnce();
    expect(result).toBe("FRAGMENT");
  });

  it("returns a 302 redirect for non-HTMX requests", () => {
    const fragment = vi.fn();
    const response = respondFeedback({
      htmx: false,
      fragment,
      redirectUrl: "https://feedmail.cc/admin?success=done"
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://feedmail.cc/admin?success=done"
    );
  });

  it("does not build the fragment on the redirect path (lazy)", () => {
    const fragment = vi.fn();
    respondFeedback({
      htmx: false,
      fragment,
      redirectUrl: "https://feedmail.cc/admin"
    });

    expect(fragment).not.toHaveBeenCalled();
  });
});
