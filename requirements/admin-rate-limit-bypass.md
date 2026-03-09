---
guid: 958A5E88-B87B-45D8-991E-3F236EF869A3
date: 2026-03-09
feature: admin-rate-limit-bypass
---

## Feature: Admin Rate Limit Bypass for Internal Service Binding Requests

Authenticated admin console usage should not be subject to API Worker rate limiting. Requests from the Admin Worker via the Cloudflare Service Binding are legitimate, session-authenticated traffic that currently accumulates rate limit entries under IP `"unknown"` and can block an active admin user. Internal requests should be identified explicitly and exempted from rate limiting when accompanied by a valid API key.

## Requirements

| # | Requirement | Description | Acceptance Criteria | Edge Cases / Error Conditions |
|---|-------------|-------------|---------------------|-------------------------------|
| 1 | Admin Worker marks internal requests | The Admin Worker's `callApi()` function sets a custom header (e.g. `X-Internal-Request`) on all requests sent via the service binding, identifying them as internal traffic. | Every request made through `callApi()` includes the custom header. No other request path in the system sets this header. | Header value should be a simple static value (e.g. `true`). Must not leak sensitive information. |
| 2 | API Worker defers rate limiting for internal requests | When the API Worker receives a request to `/api/admin/*` with the internal header present, it defers the rate limit decision until after authentication has been evaluated. | Requests with the internal header are not rate-limited before the auth check runs. Requests without the internal header follow the existing pipeline (rate limit before auth). | The internal header on non-`/api/admin/*` routes (e.g. `/api/subscribe`) should be ignored — those routes follow their normal rate limiting regardless. |
| 3 | Bypass rate limiting on successful auth with internal header | When a request has the internal header and passes API key authentication, rate limiting is skipped entirely. No row is inserted into the `rate_limits` table. | An authenticated internal request does not appear in the `rate_limits` table. An admin user can make unlimited API calls through the admin console without hitting rate limits. | Must verify that the auth check is a full API key validation, not just presence of the Authorization header. |
| 4 | Apply rate limiting on failed auth with internal header | When a request has the internal header but fails API key authentication, the rate limit check is applied retroactively before returning the auth failure response. | A request with the internal header and an invalid API key is rate-limited under the `"admin"` endpoint, using whatever IP is available (including `"unknown"` if no `CF-Connecting-IP`). Repeated failed attempts with the header still trigger 429 responses once the limit is exceeded. | Rate limiting on failed auth must use the same endpoint name, window, and limits as normal `/api/admin/*` rate limiting. The rate limit row should be recorded so it counts toward future checks. |
| 5 | No rate limit bypass without the internal header | Requests to `/api/admin/*` that do not include the internal header continue to be rate-limited before authentication, exactly as they are today. | External API requests (with `CF-Connecting-IP`) to `/api/admin/*` are rate-limited identically to current behaviour. No change to the public API rate limiting posture. | Verify that removing or omitting the header from a service binding call would cause it to be rate-limited normally. |

## Out of scope

- **Cleaning up existing `"unknown"` rows in `rate_limits`**: Existing rows from past service binding calls will be pruned naturally by the probabilistic 7-day cleanup.
- **Rate limiting changes on the Admin Worker**: The Admin Worker's own rate limiting of public routes (`admin_login`, `admin_verify`) is unrelated and unchanged.
- **Session-awareness in the API Worker**: The API Worker does not need to know about admin sessions. The internal header + API key is sufficient to identify legitimate internal traffic.
- **Configurable bypass behaviour**: The bypass is unconditional for authenticated internal requests. There is no need for a toggle or separate rate limit tier.
