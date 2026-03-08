/**
 * Handlebars template rendering using precompiled specs.
 *
 * Templates are precompiled at build time (scripts/precompile-templates.mjs)
 * into JS modules that export template specification objects. At runtime,
 * Handlebars.template() instantiates them without needing new Function() —
 * which Cloudflare Workers disallows.
 */

import Handlebars from "handlebars/runtime.js";
import { getChannelById } from "./config.js";

// Import precompiled partial specs
import emailFooterSpec from "../templates/compiled/partials/email-footer.js";

// Import precompiled template specs
import newsletterSpec from "../templates/compiled/newsletter.js";
import newsletterTextSpec from "../templates/compiled/newsletter.txt.js";
import verificationEmailSpec from "../templates/compiled/verification-email.js";
import verifyPageSpec from "../templates/compiled/verify-page.js";
import unsubscribePageSpec from "../templates/compiled/unsubscribe-page.js";
import errorPageSpec from "../templates/compiled/error-page.js";

// Register Handlebars helpers
Handlebars.registerHelper("formatDate", (dateStr) => {
  if (!dateStr) {
    return "";
  }
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
});

Handlebars.registerHelper("currentYear", () => new Date().getFullYear());

// Register precompiled partials
Handlebars.registerPartial(
  "email-footer",
  Handlebars.template(emailFooterSpec)
);

// Instantiate templates from precompiled specs
const templates = {
  newsletter: Handlebars.template(newsletterSpec),
  newsletterText: Handlebars.template(newsletterTextSpec),
  verificationEmail: Handlebars.template(verificationEmailSpec),
  verifyPage: Handlebars.template(verifyPageSpec),
  unsubscribePage: Handlebars.template(unsubscribePageSpec),
  errorPage: Handlebars.template(errorPageSpec)
};

/**
 * Render a named template with the given data.
 * @param {string} name - Template name
 * @param {object} data - Template data
 * @returns {string} Rendered HTML
 */
export function render(name, data) {
  const template = templates[name];
  if (!template) {
    throw new Error(`Unknown template: ${name}`);
  }
  return template(data);
}

/**
 * Render the error page template and return an HTML Response.
 * @param {object} env - Worker environment bindings
 * @param {string|null} channelId - Channel ID for branding (nullable)
 * @param {string} message - Error message to display
 * @returns {Response}
 */
export async function renderErrorPage(env, channelId, message) {
  const channel = channelId ? await getChannelById(env, channelId) : null;

  const html = render("errorPage", {
    siteName: channel?.siteName || "feedmail",
    siteUrl: channel?.siteUrl || "/",
    errorMessage: message
  });

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
