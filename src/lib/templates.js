/**
 * Handlebars template compilation and rendering.
 * Templates are imported as strings at build time.
 */

import Handlebars from "handlebars";

// Import templates as raw strings
import newsletterHtml from "../templates/newsletter.hbs";
import newsletterText from "../templates/newsletter.txt.hbs";
import verificationEmailHtml from "../templates/verification-email.hbs";
import verifyPageHtml from "../templates/verify-page.hbs";
import unsubscribePageHtml from "../templates/unsubscribe-page.hbs";
import errorPageHtml from "../templates/error-page.hbs";

// Register Handlebars helpers
Handlebars.registerHelper("formatDate", (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
});

Handlebars.registerHelper("currentYear", () => new Date().getFullYear());

// Compile templates once
const templates = {
  newsletter: Handlebars.compile(newsletterHtml),
  newsletterText: Handlebars.compile(newsletterText),
  verificationEmail: Handlebars.compile(verificationEmailHtml),
  verifyPage: Handlebars.compile(verifyPageHtml),
  unsubscribePage: Handlebars.compile(unsubscribePageHtml),
  errorPage: Handlebars.compile(errorPageHtml),
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
