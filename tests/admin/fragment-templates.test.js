import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * These tests verify that fragment templates (used for HTMX partial responses)
 * do NOT contain document-level HTML elements. Fragment templates should only
 * contain the HTML fragment to be swapped into the page, not full documents.
 */
describe("fragment templates do not contain document-level elements", () => {
  const templatesDir = resolve(
    import.meta.dirname,
    "../../src/templates"
  );

  // Fragment template filenames — these are templates designed for HTMX partial responses.
  // They should contain only HTML fragments, not full documents.
  const fragmentTemplateNames = [
    "admin-send-feedback.hbs",
    "admin-channel-form-result.hbs",
    "admin-subscriber-table.hbs",
    "admin-passkey-list.hbs",
    "admin-delete-confirm.hbs",
    "admin-session-expired.hbs"
  ];

  for (const filename of fragmentTemplateNames) {
    const templatePath = resolve(templatesDir, filename);

    describe(filename, () => {
      it("exists as a template file", () => {
        expect(existsSync(templatePath)).toBe(true);
      });

      it("does not contain <!DOCTYPE> declaration", () => {
        if (!existsSync(templatePath)) {
          return; // Skip if file doesn't exist (will fail in the exists test)
        }
        const content = readFileSync(templatePath, "utf-8");
        expect(content.toLowerCase()).not.toContain("<!doctype");
      });

      it("does not contain <html> element", () => {
        if (!existsSync(templatePath)) {
          return;
        }
        const content = readFileSync(templatePath, "utf-8");
        expect(content.toLowerCase()).not.toMatch(/<html[\s>]/);
      });

      it("does not contain <head> element", () => {
        if (!existsSync(templatePath)) {
          return;
        }
        const content = readFileSync(templatePath, "utf-8");
        expect(content.toLowerCase()).not.toMatch(/<head[\s>]/);
      });

      it("does not contain <body> element", () => {
        if (!existsSync(templatePath)) {
          return;
        }
        const content = readFileSync(templatePath, "utf-8");
        expect(content.toLowerCase()).not.toMatch(/<body[\s>]/);
      });
    });
  }
});
