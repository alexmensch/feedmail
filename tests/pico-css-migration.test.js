import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync, statSync, readdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TEMPLATES_DIR = resolve(ROOT, "src/templates");
const PARTIALS_DIR = resolve(TEMPLATES_DIR, "partials");
const ASSETS_DIR = resolve(ROOT, "assets/admin");
const ADMIN_ROUTES_DIR = resolve(ROOT, "src/admin/routes");

function readFile(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

function fileExists(relativePath) {
  return existsSync(resolve(ROOT, relativePath));
}

function readTemplate(name) {
  return readFileSync(join(TEMPLATES_DIR, name), "utf-8");
}

function readPartial(name) {
  return readFileSync(join(PARTIALS_DIR, name), "utf-8");
}

function readAsset(name) {
  return readFileSync(join(ASSETS_DIR, name), "utf-8");
}

function readRoute(name) {
  return readFileSync(join(ADMIN_ROUTES_DIR, name), "utf-8");
}

/**
 * Collect all .hbs template files recursively.
 */
function getAllHbsFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllHbsFiles(fullPath));
    } else if (entry.name.endsWith(".hbs")) {
      results.push(fullPath);
    }
  }
  return results;
}

// CUBE CSS classes that should no longer appear in any template
const CUBE_CSS_CLASSES = [
  "sidebar-layout",
  "app-shell",
  "nav-sidebar",
  "form-field",
  "btn-primary",
  "btn-ghost",
  "cluster",
  "stack",
  "center",
  "cover",
  "flow",
  "text-muted",
  "font-size--1",
  "font-size-1",
  "auth-layout",
  "auth-card",
  "channel-actions",
  "page-header",
  "visually-hidden",
];

// CUBE CSS data attributes that should no longer appear
const CUBE_DATA_ATTRS = ["data-variant", "data-state", "data-gap"];

// CUBE CSS custom properties that should not appear in the stylesheet
const CUBE_CUSTOM_PROPERTIES = [
  "--color-",
  "--space-",
  "--step-",
  "--measure",
  "--radius",
  "--transition-speed",
];

// ─── Pico CSS Static Asset ──────────────────────────────────────────────────

describe("Pico CSS static asset", () => {
  it("pico.min.css exists in assets/admin/", () => {
    expect(fileExists("assets/admin/pico.min.css")).toBe(true);
  });

  it("is minified (contains minimal whitespace between rules)", () => {
    const css = readAsset("pico.min.css");
    // Minified CSS should not have lines with just whitespace or common
    // unminified formatting patterns like "  property: value;"
    const lines = css.split("\n");
    // A minified file typically has very few lines relative to its size
    // (often just 1-3 lines for ~80KB)
    expect(lines.length).toBeLessThan(50);
  });

  it("is a reasonable size for Pico CSS (> 50KB)", () => {
    const stats = statSync(resolve(ROOT, "assets/admin/pico.min.css"));
    expect(stats.size).toBeGreaterThan(50 * 1024);
  });
});

// ─── admin-head partial ─────────────────────────────────────────────────────

describe("admin-head partial", () => {
  let content;

  beforeAll(() => {
    content = readPartial("admin-head.hbs");
  });

  it("references pico.min.css", () => {
    expect(content).toContain("/admin/pico.min.css");
  });

  it("references styles.css", () => {
    expect(content).toContain("/admin/styles.css");
  });

  it("loads pico.min.css before styles.css", () => {
    const picoIndex = content.indexOf("/admin/pico.min.css");
    const stylesIndex = content.indexOf("/admin/styles.css");
    expect(picoIndex).toBeGreaterThanOrEqual(0);
    expect(stylesIndex).toBeGreaterThanOrEqual(0);
    expect(picoIndex).toBeLessThan(stylesIndex);
  });
});

// ─── admin-layout partial ───────────────────────────────────────────────────

describe("admin-layout partial", () => {
  let content;

  beforeAll(() => {
    content = readPartial("admin-layout.hbs");
  });

  it("contains <main class=\"container\">", () => {
    expect(content).toMatch(/<main\s[^>]*class="container"/);
  });

  it("contains a <nav> element", () => {
    expect(content).toMatch(/<nav[\s>]/);
  });

  it("includes the HTMX script", () => {
    expect(content).toContain("htmx.min.js");
  });

  it("does not use CUBE CSS sidebar-layout class", () => {
    expect(content).not.toContain("sidebar-layout");
  });

  it("does not use CUBE CSS app-shell class", () => {
    expect(content).not.toContain("app-shell");
  });

  it("does not use CUBE CSS main-content class", () => {
    expect(content).not.toContain("main-content");
  });

  it("does not use CUBE CSS stack class", () => {
    expect(content).not.toMatch(/class="[^"]*\bstack\b/);
  });

  it("does not use data-gap attribute", () => {
    expect(content).not.toContain("data-gap");
  });
});

// ─── admin-nav partial ─────────────────────────────────────────────────────

describe("admin-nav partial", () => {
  let content;

  beforeAll(() => {
    content = readPartial("admin-nav.hbs");
  });

  it("uses aria-current=\"page\" for active navigation", () => {
    expect(content).toContain('aria-current="page"');
  });

  it("does not use data-state=\"active\"", () => {
    expect(content).not.toContain('data-state="active"');
  });

  it("contains <ul> elements for nav items", () => {
    expect(content).toMatch(/<ul[\s>]/);
  });

  it("contains links to all main sections", () => {
    expect(content).toContain("/admin");
    expect(content).toContain("/admin/channels");
    expect(content).toContain("/admin/subscribers");
    expect(content).toContain("/admin/settings");
  });

  it("contains a logout link", () => {
    expect(content).toContain("/admin/logout");
  });

  it("contains the brand text 'feedmail'", () => {
    expect(content).toContain("feedmail");
  });

  it("does not use CUBE CSS nav-sidebar classes", () => {
    expect(content).not.toContain("nav-sidebar");
  });

  it("does not use CUBE CSS app-shell__brand class", () => {
    expect(content).not.toContain("app-shell__brand");
  });
});

// ─── admin-auth-layout partial ──────────────────────────────────────────────

describe("admin-auth-layout partial", () => {
  let content;

  beforeAll(() => {
    content = readPartial("admin-auth-layout.hbs");
  });

  it("contains an <article> element", () => {
    expect(content).toMatch(/<article[\s>]/);
  });

  it("does not contain a <nav> element", () => {
    expect(content).not.toMatch(/<nav[\s>]/);
  });

  it("does not include the HTMX script", () => {
    expect(content).not.toContain("htmx.min.js");
  });

  it("does not use CUBE CSS auth-layout class", () => {
    expect(content).not.toContain("auth-layout");
  });

  it("does not use CUBE CSS auth-card class", () => {
    expect(content).not.toContain("auth-card");
  });

  it("does not use CUBE CSS stack class", () => {
    expect(content).not.toMatch(/class="[^"]*\bstack\b/);
  });

  it("does not use data-gap attribute", () => {
    expect(content).not.toContain("data-gap");
  });
});

// ─── Admin dashboard template ───────────────────────────────────────────────

describe("admin-dashboard template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-dashboard.hbs");
  });

  it("contains <article> elements for channel cards", () => {
    expect(content).toMatch(/<article[\s>]/);
  });

  it("preserves hx-post attribute for send form", () => {
    expect(content).toContain("hx-post");
  });

  it("preserves hx-target=\"#send-feedback\"", () => {
    expect(content).toContain('hx-target="#send-feedback"');
  });

  it("contains the #send-feedback target element", () => {
    expect(content).toContain('id="send-feedback"');
  });

  it("uses feedback class for messages", () => {
    expect(content).toContain("feedback");
  });

  it("does not use CUBE CSS card class with stack", () => {
    expect(content).not.toMatch(/class="card\s+stack"/);
  });

  it("does not use CUBE CSS text-muted class", () => {
    expect(content).not.toContain("text-muted");
  });

  it("does not use data-variant attribute", () => {
    expect(content).not.toContain("data-variant");
  });

  it("does not use data-gap attribute", () => {
    expect(content).not.toContain("data-gap");
  });
});

// ─── Admin channels template ────────────────────────────────────────────────

describe("admin-channels template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-channels.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });

  it("has a <table> element", () => {
    expect(content).toMatch(/<table[\s>]/);
  });
});

// ─── Admin channel form template ────────────────────────────────────────────

describe("admin-channel-form template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-channel-form.hbs");
  });

  it("has addFeedRow function with feed-row class", () => {
    expect(content).toContain("feed-row");
  });

  it("has addFeedRow function with feed-row-actions class", () => {
    expect(content).toContain("feed-row-actions");
  });

  it("does not use CUBE CSS form-field class", () => {
    expect(content).not.toContain("form-field");
  });

  it("does not use CUBE CSS btn class as standalone", () => {
    // Should not have class="btn btn-primary" or similar CUBE patterns
    expect(content).not.toMatch(/class="btn\s+btn-primary"/);
  });

  it("preserves hx-target=\"#form-result\"", () => {
    expect(content).toContain("#form-result");
  });

  it("preserves the #channel-actions target", () => {
    expect(content).toContain("channel-actions");
  });
});

// ─── Admin channel form body partial ────────────────────────────────────────

describe("admin-channel-form-body partial", () => {
  let content;

  beforeAll(() => {
    content = readPartial("admin-channel-form-body.hbs");
  });

  it("does not use CUBE CSS form-field class", () => {
    expect(content).not.toContain("form-field");
  });

  it("does not use CUBE CSS btn class", () => {
    expect(content).not.toMatch(/class="[^"]*\bbtn\b[^"]*btn-primary/);
  });
});

// ─── Admin channel form result fragment ─────────────────────────────────────

describe("admin-channel-form-result template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-channel-form-result.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });
});

// ─── Admin subscribers template ─────────────────────────────────────────────

describe("admin-subscribers template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-subscribers.hbs");
  });

  it("preserves HTMX attributes for filtering", () => {
    expect(content).toMatch(/hx-(get|post|target|swap|trigger)/);
  });

  it("preserves #subscriber-table target", () => {
    expect(content).toContain("subscriber-table");
  });
});

// ─── Admin subscriber table fragment ────────────────────────────────────────

describe("admin-subscriber-table template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-subscriber-table.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });
});

// ─── Admin settings template ────────────────────────────────────────────────

describe("admin-settings template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-settings.hbs");
  });

  it("preserves HTMX attributes for passkey management", () => {
    expect(content).toMatch(/hx-(post|target|swap)/);
  });

  it("preserves #passkey-list target", () => {
    expect(content).toContain("passkey-list");
  });
});

// ─── Admin passkey list fragment ────────────────────────────────────────────

describe("admin-passkey-list template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-passkey-list.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });
});

// ─── Admin login template ───────────────────────────────────────────────────

describe("admin-login template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-login.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });

  it("contains passkey button section", () => {
    expect(content).toMatch(/passkey/i);
  });
});

// ─── Admin login-sent template ──────────────────────────────────────────────

describe("admin-login-sent template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-login-sent.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });
});

// ─── Admin auth-error template ──────────────────────────────────────────────

describe("admin-auth-error template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-auth-error.hbs");
  });

  it("does not use CUBE CSS classes", () => {
    for (const cls of CUBE_CSS_CLASSES) {
      expect(content).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });
});

// ─── Admin send-feedback fragment ───────────────────────────────────────────

describe("admin-send-feedback template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-send-feedback.hbs");
  });

  it("uses feedback class", () => {
    expect(content).toContain("feedback");
  });

  it("does not use data-variant attribute", () => {
    expect(content).not.toContain("data-variant");
  });
});

// ─── Admin delete-confirm fragment ──────────────────────────────────────────

describe("admin-delete-confirm template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-delete-confirm.hbs");
  });

  it("does not use CUBE CSS button classes", () => {
    expect(content).not.toMatch(/class="[^"]*\bbtn-primary\b/);
    expect(content).not.toMatch(/class="[^"]*\bbtn-ghost\b/);
  });
});

// ─── Admin session-expired fragment ─────────────────────────────────────────

describe("admin-session-expired template", () => {
  let content;

  beforeAll(() => {
    content = readTemplate("admin-session-expired.hbs");
  });

  it("uses session-expired class", () => {
    expect(content).toContain("session-expired");
  });
});

// ─── Public-facing pages use CDN Pico ───────────────────────────────────────

describe("public-facing pages use CDN Pico", () => {
  const publicPages = [
    "verify-page.hbs",
    "unsubscribe-page.hbs",
    "error-page.hbs",
  ];

  for (const page of publicPages) {
    describe(page, () => {
      let content;

      beforeAll(() => {
        content = readTemplate(page);
      });

      it("references Pico CSS from a CDN", () => {
        // Should contain a CDN link for Pico CSS (e.g. unpkg, jsdelivr, or cdnjs)
        expect(content).toMatch(
          /https?:\/\/(unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\/.*pico/i,
        );
      });

      it("does not contain an inline <style> block", () => {
        expect(content).not.toMatch(/<style[\s>]/);
      });

      it("contains <main class=\"container\">", () => {
        expect(content).toMatch(/<main\s[^>]*class="container"/);
      });

      it("contains an <article> element", () => {
        expect(content).toMatch(/<article[\s>]/);
      });
    });
  }
});

// ─── Override stylesheet ────────────────────────────────────────────────────

describe("override stylesheet (styles.css)", () => {
  let css;

  beforeAll(() => {
    css = readAsset("styles.css");
  });

  it("exists in assets/admin/", () => {
    expect(fileExists("assets/admin/styles.css")).toBe(true);
  });

  it("contains .feed-row class", () => {
    expect(css).toContain(".feed-row");
  });

  it("contains .feedback class", () => {
    expect(css).toContain(".feedback");
  });

  it("contains .btn-danger class", () => {
    expect(css).toContain(".btn-danger");
  });

  it("contains .btn-small class", () => {
    expect(css).toContain(".btn-small");
  });

  it("contains .htmx-indicator class", () => {
    expect(css).toContain(".htmx-indicator");
  });

  it("contains .loading-spinner class", () => {
    expect(css).toContain(".loading-spinner");
  });

  it("contains .passkey-prompt class", () => {
    expect(css).toContain(".passkey-prompt");
  });

  it("contains .inline-confirm class", () => {
    expect(css).toContain(".inline-confirm");
  });

  it("contains .session-expired class", () => {
    expect(css).toContain(".session-expired");
  });

  it("contains .input-suffix class", () => {
    expect(css).toContain(".input-suffix");
  });

  it("contains .helper-text class", () => {
    expect(css).toContain(".helper-text");
  });

  it("contains .field-error class", () => {
    expect(css).toContain(".field-error");
  });

  it("uses Pico custom properties (--pico-)", () => {
    expect(css).toMatch(/--pico-/);
  });

  it("contains prefers-reduced-motion media query", () => {
    expect(css).toContain("prefers-reduced-motion");
  });

  it("does not contain CUBE CSS custom properties", () => {
    for (const prop of CUBE_CUSTOM_PROPERTIES) {
      expect(css).not.toContain(prop);
    }
  });

  it("does not contain hard-coded hex color values", () => {
    // Match hex colors like #fff, #ffffff, #0055cc but not in comments
    // Remove CSS comments first, then check for hex colors
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cssNoComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("does not contain CUBE CSS section header comment", () => {
    expect(css).not.toContain("CUBE CSS");
  });

  it("does not contain CUBE CSS composition classes", () => {
    expect(css).not.toContain(".sidebar-layout");
    expect(css).not.toContain(".app-shell");
    expect(css).not.toContain(".nav-sidebar");
  });
});

// ─── No CUBE CSS classes in any template ────────────────────────────────────

describe("no CUBE CSS remnants in templates", () => {
  let allTemplateContents;

  beforeAll(() => {
    const allFiles = getAllHbsFiles(TEMPLATES_DIR);
    allTemplateContents = allFiles.map((f) => ({
      path: f,
      name: f.replace(TEMPLATES_DIR + "/", ""),
      content: readFileSync(f, "utf-8"),
    }));
  });

  for (const cls of CUBE_CSS_CLASSES) {
    it(`no template uses the "${cls}" class`, () => {
      for (const tmpl of allTemplateContents) {
        // Match the class name in class= attributes, not in id= attributes or hx-target values
        expect(
          tmpl.content,
          `Found "${cls}" in ${tmpl.name}`,
        ).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
      }
    });
  }

  for (const attr of CUBE_DATA_ATTRS) {
    it(`no template uses the "${attr}" attribute`, () => {
      for (const tmpl of allTemplateContents) {
        expect(
          tmpl.content,
          `Found "${attr}" in ${tmpl.name}`,
        ).not.toContain(attr);
      }
    });
  }
});

// ─── Route handler HTML strings ─────────────────────────────────────────────

describe("route handler HTML strings", () => {
  describe("channels.js", () => {
    let content;

    beforeAll(() => {
      content = readRoute("channels.js");
    });

    it("cancelHtml does not contain 'btn btn-primary'", () => {
      // Extract cancelHtml strings and check them
      expect(content).not.toMatch(/cancelHtml.*btn\s+btn-primary/);
    });

    it("cancelHtml does not contain 'btn-ghost'", () => {
      expect(content).not.toMatch(/cancelHtml.*btn-ghost/);
    });
  });

  describe("passkeys.js", () => {
    let content;

    beforeAll(() => {
      content = readRoute("passkeys.js");
    });

    it("cancelHtml does not contain 'btn btn-primary'", () => {
      expect(content).not.toMatch(/cancelHtml.*btn\s+btn-primary/);
    });

    it("cancelHtml does not contain 'btn-ghost'", () => {
      expect(content).not.toMatch(/cancelHtml.*btn-ghost/);
    });
  });
});

// ─── HTMX preservation ─────────────────────────────────────────────────────

describe("HTMX preservation", () => {
  it("dashboard has #send-feedback target", () => {
    const content = readTemplate("admin-dashboard.hbs");
    expect(content).toContain('id="send-feedback"');
  });

  it("subscribers template has #subscriber-table target", () => {
    const content = readTemplate("admin-subscribers.hbs");
    expect(content).toContain("subscriber-table");
  });

  it("channel form has #form-result target", () => {
    const content = readTemplate("admin-channel-form.hbs");
    expect(content).toContain("form-result");
  });

  it("channel form has #channel-actions target", () => {
    const content = readTemplate("admin-channel-form.hbs");
    expect(content).toContain("channel-actions");
  });

  it("settings has #passkey-list target", () => {
    const content = readTemplate("admin-settings.hbs");
    expect(content).toContain("passkey-list");
  });

  it("dashboard preserves hx-post on send form", () => {
    const content = readTemplate("admin-dashboard.hbs");
    expect(content).toContain('hx-post="/admin/send"');
  });

  it("dashboard preserves hx-swap on send form", () => {
    const content = readTemplate("admin-dashboard.hbs");
    expect(content).toContain("hx-swap");
  });
});

// ─── Accessibility ──────────────────────────────────────────────────────────

describe("accessibility", () => {
  it("admin-nav uses aria-current=\"page\" for active page", () => {
    const content = readPartial("admin-nav.hbs");
    expect(content).toContain('aria-current="page"');
  });

  it("send-feedback target has aria-live attribute", () => {
    const content = readTemplate("admin-dashboard.hbs");
    // The element with id="send-feedback" or the feedback messages should have aria-live
    expect(content).toContain("aria-live");
  });

  it("feedback elements use role=\"alert\" or role=\"status\"", () => {
    const content = readTemplate("admin-dashboard.hbs");
    expect(content).toMatch(/role="(alert|status)"/);
  });

  it("send-feedback template has role=\"alert\" for errors", () => {
    const content = readTemplate("admin-send-feedback.hbs");
    expect(content).toContain('role="alert"');
  });
});

// ─── Dark mode support ──────────────────────────────────────────────────────

describe("dark mode support", () => {
  let css;

  beforeAll(() => {
    css = readAsset("styles.css");
  });

  it("does not contain hard-coded hex colors outside comments", () => {
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cssNoComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("either uses prefers-color-scheme or inherits from Pico", () => {
    // The stylesheet should either contain prefers-color-scheme
    // or be small enough that it relies entirely on Pico for theming
    const hasDarkMode = css.includes("prefers-color-scheme");
    const usesPicoVars = css.includes("--pico-");
    expect(hasDarkMode || usesPicoVars).toBe(true);
  });
});
