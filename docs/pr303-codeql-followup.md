# PR #303 — CodeQL follow-up

## Retrieved findings

Original head: `45b46195a6415639a36782b11d147ff2b955f378`.

The failing [Code scanning results / CodeQL check](https://github.com/yanivwpu/Lead-Flow-Manager/runs/132069364501) reports exactly five new high alerts. The published [security-extended analysis artifact](https://github.com/yanivwpu/Lead-Flow-Manager/actions/runs/43478650909) (`storefront-second-cart-review-codeql`, artifact ID `14064168137`, `javascript.sarif`) at that head contains exactly these five high findings intersecting the changed source ranges.

All five use **`js/missing-rate-limiting` — Missing rate limiting**, security severity **7.5 / high**, CWE-770, CWE-307 and CWE-400. Positions below refer to the original head, before this follow-up.

| Location | Sensitive operation reported | Classification |
|---|---|---|
| `server/routes/conversations.ts:379–608` | Filesystem access at lines 508 and 520 in `GET /api/media/proxy` | Genuine pre-existing resource-exhaustion gap surfaced by the edited handler. Base `2a7d75ad` has the same route at line 376 without a matching global rate-limit rule. |
| `server/routes/emailChannel.ts:95–119` | Authorization at line 97 in `GET /api/messages/:messageId/email-inline`; subsequent email/provider work | Genuine pre-existing gap surfaced by the edited handler. Base route: line 94. |
| `server/routes/emailChannel.ts:125–167` | Authorization at line 127 in `GET /api/messages/:messageId/email-attachment`; subsequent attachment/provider work | Genuine pre-existing gap surfaced by the edited handler. Base route: line 124. |
| `server/routes/emailChannel.ts:303–403` | Authorization at line 305 in `GET /api/messages/:messageId/email-details`; subsequent database and HTML work | Genuine pre-existing gap surfaced by the edited handler. Base route: line 302. |
| `tests/inbox-team-security.test.ts:74–78` | Test-only `req.logIn` at line 77 | False positive for production exposure: this login route exists only in the test fixture, listens on loopback and is absent from the production entrypoint/bundle. It was nevertheless genuinely unbounded inside the fixture and now has a real limiter. |

The existing global `rateLimitMiddleware` does not provide a blanket limit. Its route matcher returns no rule for all four production paths, so existing session/tenant checks do not make these four alerts false positives. They were not new authentication or tenant-isolation bypasses introduced by Phase 1.

## Source fixes

- Apply an explicit `express-rate-limit` middleware to all four production handlers **before** workspace resolution, authorization lookups, filesystem access or provider/content work. Authentication and existing ownership checks remain in place.
- Share a 240-request/minute content budget across the four paths for each actual authenticated actor. Workspace IDs, resource IDs and forged headers cannot select a new budget. Different teammates sharing one public IP retain separate budgets. Anonymous requests use normalized IP keys with IPv6 subnet handling.
- Reuse the existing Redis-backed counters and their in-memory fallback. This adds no second Redis connection or separate collaboration store. Successful and failed attempts both count; limit exhaustion returns HTTP 429 with `Retry-After` and the existing `RATE_LIMITED` response convention.
- Give the loopback test login a real 30-request/minute limiter. No test exclusion, alert dismissal, query suppression, permission relaxation or CodeQL configuration change is used.

The limiter controls request admission, not conversation ownership. It does not grant access, bypass membership checks or provide duplicate-send protection. The existing Redis-unavailable fallback remains process-local, as in the current limiter infrastructure.

## Regression and analysis evidence

- `tests/inbox-content-rate-limit.test.ts` exercises real HTTP requests: a shared budget across routes, independent authenticated actors on one IP, failed-request accounting, resistance to forged identity/forwarding hints, 429 before handler execution, `Retry-After` and recovery in the next window.
- `tests/inbox-team-security.test.ts` exhausts the real actor counter and checks all four actual registered content endpoints. Another authorized actor remains able to read; the existing forged identity, tenant isolation, assignment, pending/revoked membership and socket tests remain enabled.
- The focused CI workflow includes both suites and watches changes to the limiter and its existing counter backend.
- Local verification: **94 tests passed**, including the new throttling checks and existing auth/Inbox/email regressions; production build passed; exact-base TypeScript comparison remained **97 existing diagnostics → 97, zero additions**.
- The authoritative GitHub CodeQL analysis is rerun on the updated PR head; success must include the Code scanning results check, not merely the analysis/upload workflow.

No production database, provider delivery, merge or deployment is performed.
