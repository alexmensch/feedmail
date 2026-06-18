import { describe, it, expect } from "vitest";
import {
  applySecurityHeaders,
  ADMIN_SECURITY_HEADERS
} from "../../../src/admin/lib/security.js";

describe("applySecurityHeaders", () => {
  it("adds all admin security headers", () => {
    const wrapped = applySecurityHeaders(new Response("hi", { status: 200 }));
    expect(wrapped.headers.get("Content-Security-Policy")).toBe(
      ADMIN_SECURITY_HEADERS["Content-Security-Policy"]
    );
    expect(wrapped.headers.get("X-Frame-Options")).toBe("DENY");
    expect(wrapped.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(wrapped.headers.get("Referrer-Policy")).toBe("same-origin");
  });

  it("preserves status and body", async () => {
    const wrapped = applySecurityHeaders(
      new Response("body-text", { status: 201 })
    );
    expect(wrapped.status).toBe(201);
    expect(await wrapped.text()).toBe("body-text");
  });

  it("preserves pre-existing headers (e.g. Content-Type, Retry-After)", () => {
    const wrapped = applySecurityHeaders(
      new Response("{}", {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "60" }
      })
    );
    expect(wrapped.headers.get("Content-Type")).toBe("application/json");
    expect(wrapped.headers.get("Retry-After")).toBe("60");
    expect(wrapped.headers.get("Content-Security-Policy")).not.toBeNull();
  });

  it("works on immutable redirect responses, preserving Location", () => {
    const wrapped = applySecurityHeaders(
      Response.redirect("https://example.com/admin/login", 302)
    );
    expect(wrapped.status).toBe(302);
    expect(wrapped.headers.get("Location")).toBe(
      "https://example.com/admin/login"
    );
    expect(wrapped.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("uses a strict CSP — no unsafe-inline, frame-ancestors none", () => {
    const csp = ADMIN_SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
