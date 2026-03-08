import { describe, it, expect, vi } from "vitest";

// Mock the precompiled template imports since they require the build step
vi.mock("../../../src/templates/compiled/newsletter.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "newsletter html" }
}));
vi.mock("../../../src/templates/compiled/newsletter.txt.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "newsletter text" }
}));
vi.mock("../../../src/templates/compiled/verification-email.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "verification html" }
}));
vi.mock("../../../src/templates/compiled/verify-page.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "verify page html" }
}));
vi.mock("../../../src/templates/compiled/unsubscribe-page.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "unsubscribe page html" }
}));
vi.mock("../../../src/templates/compiled/error-page.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "error page html" }
}));
vi.mock("../../../src/templates/compiled/partials/email-footer.js", () => ({
  default: { compiler: [8, ">= 4.3.0"], main: () => "email footer" }
}));

// Mock Handlebars runtime to capture template instantiation
vi.mock("handlebars/runtime.js", () => {
  const helpers = {};
  return {
    default: {
      template: (spec) => {
        // Return a function that calls spec.main if available
        return (data) => {
          if (typeof spec.main === "function") {
            return spec.main(data);
          }
          return "rendered";
        };
      },
      registerHelper: (name, fn) => {
        helpers[name] = fn;
      },
      registerPartial: () => {},
      _helpers: helpers
    }
  };
});

import { render } from "../../../src/shared/lib/templates.js";
import Handlebars from "handlebars/runtime.js";

describe("templates", () => {
  describe("render", () => {
    it("renders newsletter template", () => {
      const result = render("newsletter", { title: "Test" });
      expect(result).toBe("newsletter html");
    });

    it("renders newsletterText template", () => {
      const result = render("newsletterText", {});
      expect(result).toBe("newsletter text");
    });

    it("renders verificationEmail template", () => {
      const result = render("verificationEmail", {});
      expect(result).toBe("verification html");
    });

    it("renders verifyPage template", () => {
      const result = render("verifyPage", {});
      expect(result).toBe("verify page html");
    });

    it("renders unsubscribePage template", () => {
      const result = render("unsubscribePage", {});
      expect(result).toBe("unsubscribe page html");
    });

    it("renders errorPage template", () => {
      const result = render("errorPage", {});
      expect(result).toBe("error page html");
    });

    it("throws for unknown template name", () => {
      expect(() => render("nonexistent", {})).toThrow(
        "Unknown template: nonexistent"
      );
    });

    it("throws for empty template name", () => {
      expect(() => render("", {})).toThrow("Unknown template: ");
    });

    it("throws for null template name", () => {
      expect(() => render(null, {})).toThrow("Unknown template: null");
    });
  });

  describe("Handlebars helpers", () => {
    it("registers formatDate helper", () => {
      expect(Handlebars._helpers.formatDate).toBeDefined();
    });

    it("formatDate returns empty string for falsy input", () => {
      const formatDate = Handlebars._helpers.formatDate;
      expect(formatDate("")).toBe("");
      expect(formatDate(null)).toBe("");
      expect(formatDate(undefined)).toBe("");
      expect(formatDate(0)).toBe("");
      expect(formatDate(false)).toBe("");
    });

    it("formatDate formats valid date", () => {
      const formatDate = Handlebars._helpers.formatDate;
      const result = formatDate("2025-01-15T10:00:00Z");
      // en-GB long format: "15 January 2025"
      expect(result).toBe("15 January 2025");
    });

    it("registers currentYear helper", () => {
      expect(Handlebars._helpers.currentYear).toBeDefined();
    });

    it("currentYear returns current year", () => {
      const currentYear = Handlebars._helpers.currentYear;
      expect(currentYear()).toBe(new Date().getFullYear());
    });
  });
});
