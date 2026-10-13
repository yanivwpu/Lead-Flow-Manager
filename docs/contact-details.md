# CRM contact details

Clicking an existing or newly added contact in Contacts now opens `/app/contacts/:contactId`. The dedicated view shows contact identity, source/channel, CRM status, lead score, dates, assignment, notes, follow-up, recorded activity, and synchronized Shopify orders. The Inbox remains available through **Open Conversation**. Multiple persisted conversations can be selected; no conversation is created when none exists.

Contacts search, contact-type tab, tag/channel/stage filters, and sort are encoded in the list URL. Details links carry a validated list-only `returnTo`. Back to Contacts restores that URL; browser back/forward and direct details links work independently of component state.

## Components and persistence

The new `ContactDetails.tsx` page uses existing Button, Input, Textarea, Badge, authentication and subscription contexts, account-scoped React Query keys, channel/website visitor identity helpers, tag colors, and pipeline-stage options. The Inbox side panel combines messaging, Copilot and campaign UI; it is left intact. New code adds the responsive details layout, display projection, navigation helpers, strict editor schema, and tenant-scoped aggregate loader.

Notes reuse the existing tenant-authorized contact notes endpoint. Profile, stage, tag, assignment and follow-up edits reuse the contact PATCH handler and `storage.updateContact`, including its automation and CRM integration behavior, through `/api/contacts/:id/details`. Assignment choices retain the existing subscription entitlement. The details PATCH allowlist accepts only supported CRM/profile fields and a required version timestamp. It never accepts tenant ownership, arbitrary custom JSON, channel IDs or Shopify metadata. Only changed fields are submitted. An atomic tenant/version predicate rejects concurrent saves with 409; the page offers Refresh contact. Shopify-linked name/email/phone are read-only in this editor and rejected on the server. Tag/stage/assignment/follow-up/profile changes persist activity entries. Stale follow-up clears do not invoke appointment cleanup.

## Shopify and privacy

The page reads persisted customer synchronization summaries and `shopify_order_created` / `shopify_order_updated` activity metadata. It shows store, current authorized customer profile, order numbers, products/quantities, totals/currency and available payment/fulfillment statuses. Orders are grouped by store/order identity, retaining the latest recorded snapshot. There are no Shopify API requests or storefront credentials. An order's sync timestamp is explicitly labeled **Synced** when its original order date was not stored. Missing fields remain unavailable or omitted.

The first details lookup includes both contact ID and authenticated owner/workspace ID in SQL. On an unauthorized/missing contact, no conversations, notes, appointments, events or privacy identities are read. All related reads also include their workspace key, so malformed cross-workspace associations cannot leak. API responses use `Cache-Control: no-store`, explicit display allowlists and account-scoped frontend cache keys. Existing Shopify customer privacy locks are checked before related reads and before details edits; redacted stores and suppressed/redacted contact markers fail closed. Historical customer identity is never reconstructed from order metadata. The base branch's existing Shopify erasure, late-write suppression and deletion mechanisms are unchanged.

## Preview and browser regression

Use an authenticated development/staging workspace. Open `/app/contacts`, set a search plus filters and sorting, then choose a contact. At **1366 × 900**, profile and CRM notes appear beside orders/activity. At **390 × 844**, the layout stacks and scrolls above the existing mobile navigation. Check a Shopify contact and a non-Shopify contact; follow **Open Conversation** and return with browser Back. Check a contact without conversations and an inaccessible contact ID.

The repeatable browser test uses only synthetic intercepted API fixtures, including authentication; it never fetches real customers. It covers both list row layouts, direct links, browser history, explicit Inbox conversation selection, safe partial edits, notes/follow-up persistence, missing conversations, non-Shopify identity editing, inaccessible contacts, JavaScript errors and horizontal overflow. It saves desktop, mobile and mobile-commerce screenshots under `work/contact-details-screenshots`.

```sh
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173
# In another terminal; temporary dependency, no package manifest changes:
npm install --prefix work/browser --no-save --package-lock=false playwright-core
CONTACT_DETAILS_PLAYWRIGHT_PATH="$PWD/work/browser/node_modules/playwright-core/index.mjs" \
  node tests/contact-details-browser.mjs
```

Chromium defaults to `/usr/bin/chromium`; `CONTACT_DETAILS_CHROMIUM_PATH` can override the executable. `CONTACT_DETAILS_BASE_URL` and `CONTACT_DETAILS_SCREENSHOTS` can override the origin and screenshot directory.

Run the model/SQL regression with `node --import tsx --test tests/contact-details.test.ts`. It provisions disposable in-memory PostgreSQL tables and tests actual SQL ownership, privacy locks, related-row isolation, stale-update rejection and DTO redaction. Existing native PostgreSQL privacy/customer regression suites require the explicit disposable `SHOPIFY_TEST_DATABASE_URL` described in their test files.

## Limits

- Activity and order snapshots are bounded to the most recent 500 persisted events; this view is not an exhaustive Shopify order export. Only synchronized data can be shown.
- The current CRM schema supports one primary email, phone and CRM tag. The page does not add a second identity or multi-tag storage model.
- New labels are English; the existing app's language/direction behavior is retained.
- Shopify-linked identity is intentionally managed by synchronization; manual edits to those fields are available for other contacts.
- Existing repository TypeScript errors remain; the exact-base comparison must show no added diagnostics.

## Validation of this change

- 110 regression tests passed across Contacts, Inbox, account/authentication isolation, native PostgreSQL Shopify customer synchronization, store/customer erasure, privacy workers and alert delivery, OAuth, onboarding, and Website Chat lifecycle.
- The browser fixture checks passed at 1366 × 900 and 390 × 844, with zero page JavaScript errors and no horizontal overflow.
- Production client, server, worker and privacy-script builds passed via `node --import tsx script/build.ts` (the same build entrypoint; the sandbox prevents the `tsx` CLI IPC socket).
- Exact-base TypeScript comparison: base 97 diagnostics, change 97, zero added. Base: `968c8e188799b3e76b50d9fe1dd709e65043ebe0`.
- The legacy contact-deletion test's optional database-writing branch is not enabled; the new SQL isolation/concurrency fixtures and native Shopify privacy suites ran against disposable databases.
