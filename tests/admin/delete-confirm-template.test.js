import { describe, it, expect } from "vitest";

import { render } from "../../src/shared/lib/templates.js";

/**
 * Real render of the shared delete-confirm fragment. The cancel control is
 * built from structured fields (not a server-interpolated HTML string), so
 * every value must be HTML-escaped by Handlebars — closing the self-XSS surface
 * that the old `{{{cancelHtml}}}` raw block carried.
 */
describe("adminDeleteConfirm template — data-driven cancel button", () => {
  it("builds the cancel button from the structured fields", () => {
    const html = render("adminDeleteConfirm", {
      message: "Delete channel?",
      confirmAction: "/admin/blog/delete",
      cancelClass: "btn-danger",
      cancelHxGet: "/admin/blog/delete/confirm",
      cancelHxTarget: "#channel-actions",
      cancelLabel: "Delete channel"
    });

    expect(html).toContain('class="btn-danger"');
    expect(html).toContain('hx-get="/admin/blog/delete/confirm"');
    expect(html).toContain('hx-target="#channel-actions"');
    expect(html).toContain('hx-swap="innerHTML"');
    expect(html).toContain(">Delete channel</button>");
  });

  it("HTML-escapes the cancel fields (no raw-HTML injection)", () => {
    const html = render("adminDeleteConfirm", {
      message: "Delete?",
      confirmAction: "/admin/x/delete",
      cancelClass: "btn-danger",
      cancelHxGet: "/admin/x/delete/confirm",
      cancelHxTarget: "#t",
      cancelLabel: '<img src=x onerror="alert(1)">'
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src");
  });
});
