import { describe, it, expect } from "vitest";

import {
  isHtmxRequest,
  fragmentResponse
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

  it("is case-insensitive for header value", () => {
    const request = new Request("https://example.com/admin", {
      headers: { "HX-Request": "True" }
    });

    // HX-Request: true is the standard value; True should also work
    expect(isHtmxRequest(request)).toBe(true);
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
