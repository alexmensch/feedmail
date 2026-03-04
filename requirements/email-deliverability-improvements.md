---
guid: 33B92369-DA50-4B57-8CD7-87CC1CBF37D2
date: 2026-03-04
feature: email-deliverability-improvements
---

#### Feature: Email deliverability improvements — List-Unsubscribe headers and footer standardization

Add `List-Unsubscribe` headers to verification emails and standardize the footer across all email templates to include an unsubscribe link and an optional company name/address block, improving deliverability signals for spam filters during domain warm-up.

#### Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | List-Unsubscribe header on verification emails | Verification emails include `List-Unsubscribe` and `List-Unsubscribe-Post` headers, using the subscriber's unsubscribe token, matching the format already used on newsletter emails. | Verification emails are sent with a `List-Unsubscribe` header containing the unsubscribe URL in angle brackets and a `List-Unsubscribe-Post` header with value `List-Unsubscribe=One-Click`. | For new subscribers, the unsubscribe token is generated at insert time and available immediately. For existing pending/unsubscribed subscribers re-requesting verification, the unsubscribe token already exists on the subscriber record. |
| 2 | Unsubscribe link in verification email footer | The verification email template footer includes an "Unsubscribe" link below the copyright line, using the subscriber's unsubscribe URL. | The verification email footer shows the copyright line, then an "Unsubscribe" link on the next line pointing to the subscriber's unsubscribe URL. | The unsubscribe URL must be passed as template data. If a subscriber clicks unsubscribe from a verification email, they are marked as unsubscribed and will not receive further emails (including if they later click the verify link — the verify flow should respect the unsubscribed status, which it already does). |
| 3 | Optional company name and address in site config | Each site in the `SITES` JSON config supports optional `companyName` and `companyAddress` fields. | Sites can include `companyName` (string) and `companyAddress` (string) in their config. Both fields are optional. Omitting them does not break any functionality. | Empty strings should be treated the same as omitted fields. Sites with only one of the two fields set display only that field. |
| 4 | Company name and address in all email footers | When a site has `companyName` and/or `companyAddress` configured, both the verification email and newsletter email templates display them in the footer below the unsubscribe link, separated by a small visual gap. | Footer layout order: (1) copyright + site name, (2) unsubscribe link, (3) small gap, (4) company name (if present), (5) company address on the next line (if present). When neither field is configured, only items 1–2 are shown. | A site with `companyName` but no `companyAddress` shows only the company name. A site with `companyAddress` but no `companyName` shows only the address. |
| 5 | Newsletter email footer consistency | The newsletter email template footer is updated to match the same layout as the verification email: copyright, then unsubscribe link, then optional company block. | The newsletter footer matches the layout described in requirement 4. The existing unsubscribe link in the newsletter template is repositioned to sit between the copyright line and the company block. | The newsletter unsubscribe link uses the existing `%%UNSUBSCRIBE_URL%%` placeholder mechanism, not the template variable used in verification emails. |

#### Out of scope

- Adding logos, app store links, or other branding elements to the footer
- Adding a physical address to non-email templates (HTML confirmation/error pages)
- Changes to the unsubscribe endpoint behavior (already supports GET and POST/RFC 8058)
- Changes to the `sendEmail` function (already supports a `headers` parameter)
- Adding `List-Unsubscribe` headers to any non-email HTTP responses
- Database schema changes (the `unsubscribe_token` column already exists)
- Domain warm-up strategy or DNS configuration changes
