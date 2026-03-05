/**
 * Template rendering integration tests for email deliverability improvements.
 *
 * These tests use actual precompiled Handlebars templates (not mocked) to verify
 * that the rendered output includes the expected content.
 *
 * Prerequisites: templates must be precompiled (pnpm pretest runs this automatically).
 */

import { describe, it, expect } from "vitest";
import Handlebars from "handlebars/runtime.js";
import emailFooterSpec from "../../src/templates/compiled/partials/email-footer.js";
import verificationEmailSpec from "../../src/templates/compiled/verification-email.js";
import newsletterSpec from "../../src/templates/compiled/newsletter.js";
import newsletterTextSpec from "../../src/templates/compiled/newsletter.txt.js";

// Register helpers that templates depend on
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

// Register partials
Handlebars.registerPartial("email-footer", Handlebars.template(emailFooterSpec));

// Instantiate templates from precompiled specs
const verificationEmailTemplate = Handlebars.template(verificationEmailSpec);
const newsletterTemplate = Handlebars.template(newsletterSpec);
const newsletterTextTemplate = Handlebars.template(newsletterTextSpec);

const currentYear = new Date().getFullYear();

describe("verification email template unsubscribe link", () => {
  const baseData = {
    siteName: "Test Site",
    siteUrl: "https://example.com",
    verifyUrl: "https://feedmail.cc/api/verify?token=abc123",
    unsubscribeUrl: "https://feedmail.cc/api/unsubscribe?token=xyz789",
  };

  it("renders an Unsubscribe link in the HTML footer", () => {
    const html = verificationEmailTemplate(baseData);
    // The HTML footer shows an "Unsubscribe" link below the copyright line
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("https://feedmail.cc/api/unsubscribe?token=xyz789");
  });

  it("unsubscribe link points to the subscriber's unsubscribe URL", () => {
    const html = verificationEmailTemplate(baseData);
    // link href points to the unsubscribe URL
    expect(html).toContain('href="https://feedmail.cc/api/unsubscribe?token=xyz789"');
  });

  it("copyright line appears before unsubscribe link", () => {
    const html = verificationEmailTemplate(baseData);
    const copyrightIndex = html.indexOf(`&copy; ${currentYear} Test Site`);
    const unsubscribeIndex = html.indexOf("https://feedmail.cc/api/unsubscribe?token=xyz789");
    expect(copyrightIndex).toBeGreaterThan(-1);
    expect(unsubscribeIndex).toBeGreaterThan(-1);
    // Copyright must appear before unsubscribe link
    expect(copyrightIndex).toBeLessThan(unsubscribeIndex);
  });

  it("still contains the verification CTA button", () => {
    const html = verificationEmailTemplate(baseData);
    expect(html).toContain("https://feedmail.cc/api/verify?token=abc123");
    expect(html).toContain("Confirm subscription");
  });
});

describe("verification email template company info", () => {
  const baseData = {
    siteName: "Test Site",
    siteUrl: "https://example.com",
    verifyUrl: "https://feedmail.cc/api/verify?token=abc123",
    unsubscribeUrl: "https://feedmail.cc/api/unsubscribe?token=xyz789",
  };

  it("displays companyName when configured", () => {
    const html = verificationEmailTemplate({
      ...baseData,
      companyName: "Acme Corp",
    });
    expect(html).toContain("Acme Corp");
  });

  it("displays companyAddress when configured", () => {
    const html = verificationEmailTemplate({
      ...baseData,
      companyAddress: "123 Main St, Springfield, IL 62701",
    });
    expect(html).toContain("123 Main St, Springfield, IL 62701");
  });

  it("displays both companyName and companyAddress when both configured", () => {
    const html = verificationEmailTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St, Springfield, IL 62701",
    });
    expect(html).toContain("Acme Corp");
    expect(html).toContain("123 Main St, Springfield, IL 62701");
  });

  it("does not display company block when neither is configured", () => {
    const html = verificationEmailTemplate(baseData);
    // Should not contain empty elements or extra whitespace for company info
    // The footer should just have copyright and unsubscribe
    expect(html).not.toContain("Acme Corp");
    expect(html).not.toContain("123 Main St");
  });

  it("displays only companyAddress when companyName is empty string", () => {
    const html = verificationEmailTemplate({
      ...baseData,
      companyName: "",
      companyAddress: "123 Main St",
    });
    // Empty string is falsy in Handlebars {{#if}}, so companyName block should not render
    expect(html).toContain("123 Main St");
  });

  it("company info appears after unsubscribe link in footer", () => {
    const html = verificationEmailTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St",
    });

    const unsubscribeLinkIndex = html.indexOf("Unsubscribe</a>");
    const companyNameIndex = html.indexOf("Acme Corp");

    expect(unsubscribeLinkIndex).toBeGreaterThan(-1);
    expect(companyNameIndex).toBeGreaterThan(-1);
    // unsubscribe link before company block
    expect(unsubscribeLinkIndex).toBeLessThan(companyNameIndex);
  });

  it("footer order: copyright, unsubscribe, company info", () => {
    const html = verificationEmailTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St",
    });

    const copyrightIndex = html.indexOf(`&copy; ${currentYear} Test Site`);
    const unsubscribeIndex = html.indexOf("Unsubscribe</a>");
    const companyIndex = html.indexOf("Acme Corp");

    expect(copyrightIndex).toBeLessThan(unsubscribeIndex);
    expect(unsubscribeIndex).toBeLessThan(companyIndex);
  });
});

describe("newsletter template company info", () => {
  const baseData = {
    title: "Test Post",
    date: "2025-01-15T10:00:00Z",
    link: "https://example.com/post-1",
    content: "<p>Full content</p>",
    hasFullContent: true,
    summary: "A summary",
    siteName: "Test Site",
    siteUrl: "https://example.com",
    unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
  };

  it("displays companyName in HTML newsletter when configured", () => {
    const html = newsletterTemplate({
      ...baseData,
      companyName: "Acme Corp",
    });
    expect(html).toContain("Acme Corp");
  });

  it("displays companyAddress in HTML newsletter when configured", () => {
    const html = newsletterTemplate({
      ...baseData,
      companyAddress: "123 Main St, Springfield, IL 62701",
    });
    expect(html).toContain("123 Main St, Springfield, IL 62701");
  });

  it("displays both company fields in HTML newsletter", () => {
    const html = newsletterTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St",
    });
    expect(html).toContain("Acme Corp");
    expect(html).toContain("123 Main St");
  });

  it("does not display company block in HTML newsletter when not configured", () => {
    const html = newsletterTemplate(baseData);
    expect(html).not.toContain("Acme Corp");
    expect(html).not.toContain("123 Main St");
  });

  it("displays companyName in text newsletter when configured", () => {
    const text = newsletterTextTemplate({
      ...baseData,
      companyName: "Acme Corp",
    });
    expect(text).toContain("Acme Corp");
  });

  it("displays companyAddress in text newsletter when configured", () => {
    const text = newsletterTextTemplate({
      ...baseData,
      companyAddress: "123 Main St",
    });
    expect(text).toContain("123 Main St");
  });

  it("does not display company info in text newsletter when not configured", () => {
    const text = newsletterTextTemplate(baseData);
    expect(text).not.toContain("Acme Corp");
    expect(text).not.toContain("123 Main St");
  });

  it("company info appears after unsubscribe link in HTML newsletter footer", () => {
    const html = newsletterTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St",
    });

    const unsubscribeIndex = html.indexOf("Unsubscribe</a>");
    const companyIndex = html.indexOf("Acme Corp");

    expect(unsubscribeIndex).toBeGreaterThan(-1);
    expect(companyIndex).toBeGreaterThan(-1);
    expect(unsubscribeIndex).toBeLessThan(companyIndex);
  });
});

describe("newsletter footer layout standardization", () => {
  const baseData = {
    title: "Test Post",
    date: "2025-01-15T10:00:00Z",
    link: "https://example.com/post-1",
    content: "<p>Full content</p>",
    hasFullContent: true,
    summary: "A summary",
    siteName: "Test Site",
    siteUrl: "https://example.com",
    unsubscribeUrl: "%%UNSUBSCRIBE_URL%%",
  };

  it("HTML footer contains copyright line with current year and site name", () => {
    const html = newsletterTemplate(baseData);
    // copyright line in footer
    expect(html).toContain(`&copy; ${currentYear} Test Site`);
  });

  it("HTML footer does NOT contain 'You received this email because' text", () => {
    const html = newsletterTemplate(baseData);
    // subscription notice is removed
    expect(html).not.toContain("You received this email because");
  });

  it("HTML footer contains Unsubscribe link using unsubscribeUrl", () => {
    const html = newsletterTemplate(baseData);
    // unsubscribe link uses {{{unsubscribeUrl}}}
    expect(html).toContain("Unsubscribe");
    expect(html).toContain("%%UNSUBSCRIBE_URL%%");
  });

  it("HTML footer order: copyright, then unsubscribe link", () => {
    const html = newsletterTemplate(baseData);
    const copyrightIndex = html.indexOf(`&copy; ${currentYear} Test Site`);
    const unsubscribeIndex = html.indexOf("Unsubscribe</a>");

    expect(copyrightIndex).toBeGreaterThan(-1);
    expect(unsubscribeIndex).toBeGreaterThan(-1);
    expect(copyrightIndex).toBeLessThan(unsubscribeIndex);
  });

  it("HTML footer order with company info: copyright, unsubscribe, company", () => {
    const html = newsletterTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St",
    });
    const copyrightIndex = html.indexOf(`&copy; ${currentYear} Test Site`);
    const unsubscribeIndex = html.indexOf("Unsubscribe</a>");
    const companyIndex = html.indexOf("Acme Corp");

    expect(copyrightIndex).toBeLessThan(unsubscribeIndex);
    expect(unsubscribeIndex).toBeLessThan(companyIndex);
  });

  it("plain text footer does NOT contain 'You received this email because' text", () => {
    const text = newsletterTextTemplate(baseData);
    // text footer also removes subscription notice
    expect(text).not.toContain("You received this email because");
  });

  it("plain text footer contains copyright line", () => {
    const text = newsletterTextTemplate(baseData);
    expect(text).toContain(`${currentYear} Test Site`);
  });

  it("plain text footer contains Unsubscribe URL", () => {
    const text = newsletterTextTemplate(baseData);
    expect(text).toContain("Unsubscribe");
    expect(text).toContain("%%UNSUBSCRIBE_URL%%");
  });

  it("plain text footer order: copyright before unsubscribe", () => {
    const text = newsletterTextTemplate(baseData);
    const copyrightIndex = text.indexOf(`${currentYear} Test Site`);
    const unsubscribeIndex = text.indexOf("%%UNSUBSCRIBE_URL%%");

    expect(copyrightIndex).toBeGreaterThan(-1);
    expect(unsubscribeIndex).toBeGreaterThan(-1);
    expect(copyrightIndex).toBeLessThan(unsubscribeIndex);
  });

  it("plain text footer with company info follows same order", () => {
    const text = newsletterTextTemplate({
      ...baseData,
      companyName: "Acme Corp",
      companyAddress: "123 Main St",
    });
    const copyrightIndex = text.indexOf(`${currentYear} Test Site`);
    const unsubscribeIndex = text.indexOf("%%UNSUBSCRIBE_URL%%");
    const companyIndex = text.indexOf("Acme Corp");

    expect(copyrightIndex).toBeLessThan(unsubscribeIndex);
    expect(unsubscribeIndex).toBeLessThan(companyIndex);
  });
});
