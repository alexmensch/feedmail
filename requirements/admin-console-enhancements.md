---
guid: 0921300D-83E6-4423-AE32-DFB5ED5BD88A
date: 2026-03-07
feature: admin-console-enhancements
depends-on: D108788E-EB05-4EFC-B7AD-FB9840790A69
---

## Feature: Admin Console Enhancements

Adds server-side pagination to the subscriber list and site configuration editing to the admin console Settings page. These enhancements build on the core admin console UI and require both API-side changes (pagination parameters) and frontend additions.

## Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Subscriber list pagination API | The `GET /api/admin/subscribers` endpoint on the feedmail API Worker is extended to accept `page` and `limit` query parameters for server-side pagination. The response includes pagination metadata (total count, current page, total pages). When no pagination parameters are provided, the endpoint behaves as before (returns all results) for backward compatibility. | `page` and `limit` parameters are accepted and produce paginated results. Response includes total subscriber count, current page number, and total page count. Omitting parameters returns all results (backward compatible). Filters (`channelId`, `status`) work correctly with pagination. | `page` exceeding total pages: returns empty results with correct metadata. `limit` of 0 or negative: rejected with validation error. Non-numeric parameters: rejected with validation error. |
| 2 | Subscriber list pagination UI | The subscriber list in the admin console uses server-side pagination. The admin Worker requests paginated data from the API and renders page controls (previous, next, page numbers). Page size is fixed. Current page and filters are preserved across pagination. | Page controls appear when results exceed one page. Previous/next and page number links work correctly. Current page is visually indicated. Filters are preserved when changing pages. Pagination updates via HTMX (table content swaps without full page reload). | First page: previous button disabled. Last page: next button disabled. Page number out of range: redirect to last valid page. Filters change: reset to page 1. |
| 3 | Site configuration editing | A section within the Settings page at `/admin/settings` displays and allows editing of site-level configuration: verification limits (max attempts, window hours) and per-endpoint rate limits (max requests, window hours per endpoint). Edits are persisted via `PATCH /api/admin/config`. | Current configuration values are displayed. Edit form shows all configurable fields with current values pre-filled. Save persists changes and confirms success. Rate limit fields are grouped by endpoint. | Invalid values (negative numbers, zero, non-numeric): validation errors shown. API error on save: error displayed without losing form state. Default values are indicated when no overrides exist in the database. |

## Out of scope

- **Customizable page size** — fixed page size; user-configurable sizing is a future enhancement
- **Client-side sorting or searching within subscriber list** — server-side filtering via existing channel/status params only
- **Rate limit config per-worker** — config applies to the feedmail API Worker only; admin Worker rate limits use the same config
