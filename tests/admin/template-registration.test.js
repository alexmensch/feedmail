import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * These tests verify that the templates.js module registers all new
 * templates and partials needed for the styled admin console.
 * We read the source file directly rather than importing (which would
 * require compiled templates to exist).
 */
describe("template registration in templates.js", () => {
  const templatesPath = resolve(
    import.meta.dirname,
    "../../src/shared/lib/templates.js"
  );
  let source;

  try {
    source = readFileSync(templatesPath, "utf-8");
  } catch {
    source = null;
  }

  it("templates.js source file is readable", () => {
    expect(source).not.toBeNull();
    expect(source.length).toBeGreaterThan(0);
  });

  // New fragment templates expected for HTMX responses
  const expectedFragmentTemplates = [
    "adminSendFeedback",
    "adminChannelFormResult",
    "adminSubscriberTable",
    "adminPasskeyList",
    "adminChannelDeleteConfirm",
    "adminPasskeyDeleteConfirm",
    "adminSessionExpired"
  ];

  for (const templateName of expectedFragmentTemplates) {
    it(`registers the '${templateName}' fragment template`, () => {
      // The template should appear in the templates object or be imported
      expect(source).toContain(templateName);
    });
  }

  // New partials expected for the styled console
  const expectedPartials = ["admin-sidebar"];

  for (const partialName of expectedPartials) {
    it(`registers the '${partialName}' partial`, () => {
      expect(source).toContain(partialName);
    });
  }
});
