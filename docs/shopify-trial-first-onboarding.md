# Shopify trial-first onboarding

First installs formerly redirected to Pricing after the trial grant, and the fresh-install flag forced plan selection even when access was usable. Settings also reused that flag for voluntary plan browsing. The callback previously proceeded after a non-grant readiness result without an actionable provisioning screen.

## Behavior

- A usable first-install Pro + AI trial opens /shopify/start. The screen verifies its state with the signed-in session and offers channel setup, Inbox, and voluntary Pricing.
- Existing usable merchants and paid subscriptions continue to Inbox. Used/expired trials without usable access go to Pricing. Blocked history gets an explicit support state; disconnected sessions get an instruction to reopen from Shopify.
- Trial welcome mail is deferred until usable access is confirmed, and sent through the existing send-once service after successful recovery.
- Provisioning failures retain the OAuth connection and session, allowing recovery without replaying a single-use authorization code. Retry uses the session's shop and the existing transactional claim.
- The claim locks and reads the current user before eligibility evaluation. It never overwrites an existing shop-ledger row, resets dates, bypasses a readiness gate, or changes paid plans.
- Uninstall still keeps the ledger, and valid shop/redact still removes it. Original installation/trial dates remain unchanged. Integration metadata records the most recent first-token installation/reinstallation time for early-uninstall measurement.

## Validation

The PR workflow runs policy/UI renders, real HTTP sessions and CSRF, real PostgreSQL concurrency and rollback, existing Shopify billing/OAuth/ledger/redaction regressions, TypeScript, and build. The PostgreSQL test requires an explicitly named disposable localhost database and never accepts a production URL.

## Telemetry and limits

Structured runtime logs use the existing hashed-shop convention, UTC timestamps, fixed milestone names, and bounded page/reason values. New telemetry never includes emails, names, phone numbers, messages, raw URLs, access tokens, or arbitrary error text. Browser events are session-authorized and deduplicated per session; they are observations rather than entitlement authority.

First successful render is emitted after the actual page commits inside its Suspense/error boundary. First channel setup requires a successful server activation read transitioning from no channel to a connected channel. A session-storage hint bridges a same-tab channel OAuth return. Missing browser events can also reflect network loss or a closed tab; they do not by themselves prove a broken screen. Early uninstall means within ten minutes of the latest installation metadata, with the historical installation timestamp as fallback for older records. Webhook redelivery can repeat runtime observations; do not treat log line counts as unique merchant counts.

Existing ambiguous or consumed ledger rows remain fail-closed and require support rather than a fresh grant. A process restart/backfill after an incomplete historical install may classify missing dates as blocked history; this PR deliberately does not bypass that safeguard. Log retention and handling of pseudonymous hashes remain governed by the existing production logging/redaction policy.

No live Shopify installation, Railway deployment, or production database was accessed during implementation. The October 9 deployed version and Kingra's actual journey remain unverified. Before release, validate a staging OAuth install and channel connection in a real browser, plus a voluntary Shopify Managed Pricing round trip.
