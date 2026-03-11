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
import emailFooterSpec from "../../templates/compiled/partials/email-footer.js";
import webauthnHelpersSpec from "../../templates/compiled/partials/webauthn-helpers.js";
import adminNavSpec from "../../templates/compiled/partials/admin-nav.js";
import adminHeadSpec from "../../templates/compiled/partials/admin-head.js";
import adminLayoutSpec from "../../templates/compiled/partials/admin-layout.js";
import adminAuthLayoutSpec from "../../templates/compiled/partials/admin-auth-layout.js";

// Import precompiled template specs
import newsletterSpec from "../../templates/compiled/newsletter.js";
import newsletterTextSpec from "../../templates/compiled/newsletter.txt.js";
import verificationEmailSpec from "../../templates/compiled/verification-email.js";
import verifyPageSpec from "../../templates/compiled/verify-page.js";
import unsubscribePageSpec from "../../templates/compiled/unsubscribe-page.js";
import errorPageSpec from "../../templates/compiled/error-page.js";

// Import precompiled admin template specs
import adminLoginSpec from "../../templates/compiled/admin-login.js";
import adminLoginSentSpec from "../../templates/compiled/admin-login-sent.js";
import adminAuthErrorSpec from "../../templates/compiled/admin-auth-error.js";
import adminMagicLinkSpec from "../../templates/compiled/admin-magic-link.js";
import adminDashboardSpec from "../../templates/compiled/admin-dashboard.js";
import adminChannelsSpec from "../../templates/compiled/admin-channels.js";
import adminChannelFormSpec from "../../templates/compiled/admin-channel-form.js";
import adminSubscribersSpec from "../../templates/compiled/admin-subscribers.js";
import adminSettingsSpec from "../../templates/compiled/admin-settings.js";

// Import precompiled fragment template specs
import adminChannelFormResultSpec from "../../templates/compiled/admin-channel-form-result.js";
import adminSubscriberTableSpec from "../../templates/compiled/admin-subscriber-table.js";
import adminSendFeedbackSpec from "../../templates/compiled/admin-send-feedback.js";
import adminPasskeyListSpec from "../../templates/compiled/admin-passkey-list.js";
import adminSessionExpiredSpec from "../../templates/compiled/admin-session-expired.js";
import adminDeleteConfirmSpec from "../../templates/compiled/admin-delete-confirm.js";

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

Handlebars.registerHelper("eq", (a, b) => a === b);

Handlebars.registerHelper("iif", (conditional, trueVal, falseVal) =>
  conditional ? trueVal : falseVal
);

// Register precompiled partials
Handlebars.registerPartial(
  "email-footer",
  Handlebars.template(emailFooterSpec)
);
Handlebars.registerPartial(
  "webauthn-helpers",
  Handlebars.template(webauthnHelpersSpec)
);
Handlebars.registerPartial("admin-nav", Handlebars.template(adminNavSpec));
Handlebars.registerPartial("admin-head", Handlebars.template(adminHeadSpec));
Handlebars.registerPartial(
  "admin-layout",
  Handlebars.template(adminLayoutSpec)
);
Handlebars.registerPartial(
  "admin-auth-layout",
  Handlebars.template(adminAuthLayoutSpec)
);

// Instantiate templates from precompiled specs
const templates = {
  newsletter: Handlebars.template(newsletterSpec),
  newsletterText: Handlebars.template(newsletterTextSpec),
  verificationEmail: Handlebars.template(verificationEmailSpec),
  verifyPage: Handlebars.template(verifyPageSpec),
  unsubscribePage: Handlebars.template(unsubscribePageSpec),
  errorPage: Handlebars.template(errorPageSpec),
  adminLogin: Handlebars.template(adminLoginSpec),
  adminLoginSent: Handlebars.template(adminLoginSentSpec),
  adminAuthError: Handlebars.template(adminAuthErrorSpec),
  adminMagicLink: Handlebars.template(adminMagicLinkSpec),
  adminDashboard: Handlebars.template(adminDashboardSpec),
  adminChannels: Handlebars.template(adminChannelsSpec),
  adminChannelForm: Handlebars.template(adminChannelFormSpec),
  adminSubscribers: Handlebars.template(adminSubscribersSpec),
  adminSettings: Handlebars.template(adminSettingsSpec),
  adminChannelFormResult: Handlebars.template(adminChannelFormResultSpec),
  adminSubscriberTable: Handlebars.template(adminSubscriberTableSpec),
  adminSendFeedback: Handlebars.template(adminSendFeedbackSpec),
  adminPasskeyList: Handlebars.template(adminPasskeyListSpec),
  adminSessionExpired: Handlebars.template(adminSessionExpiredSpec),
  adminDeleteConfirm: Handlebars.template(adminDeleteConfirmSpec)
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
