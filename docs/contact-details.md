# Contact Details

Contacts now opens `/app/contacts/:id`, with an encoded `returnTo` link to the list's search, tag/channel/stage filters, tab, and sort. List state lives in query parameters; browser back/forward and direct links work. Desktop and mobile rows also support Enter/Space. Creating a contact opens its profile.

The profile reuses the existing UI controls, channel/visitor display helpers, pipeline options, account-scoped query keys, and contact PATCH, notes, team, and appointment APIs. The dedicated details endpoint queries contacts, conversations, and activity with workspace predicates. It checks the existing Shopify customer privacy lock before fetching related data, returns 404 for foreign contacts and 410 for suppressed/locked records, and fails closed if privacy verification fails. Arbitrary webhook payloads, customer IDs, and access tokens are excluded from the response.

Open Conversation links to an existing messaging thread using the Inbox's `?conversation=` routing. Commerce-only customers and contacts with no threads show an explanatory empty state. Viewing details never creates a thread or sends a message.

Shopify purchases come from persisted `shopify_order_created` activity events, with store, number, products/quantity, total/currency, payment status, date, and fulfillment status when present. Customer synchronization metadata supplies the store and order count. The commerce section is hidden for other contacts. Identity fields controlled by Shopify are read-only here. CRM patches contain only fields edited by the user. Other identity edits include an optimistic version; the database rejects newer snapshots or identities newly linked to Shopify. Notes, tags, stages, assignment, and follow-ups retain existing persistence and automation hooks.

## Preview

1. Start the application with its usual development database/session configuration and `npm run dev`.
2. At `/app/contacts`, search and apply tag/channel/stage filters, change the sort, then open a row. Return using Contacts or browser Back; confirm the exact list criteria remain.
3. On a laptop viewport (1366 × 768), inspect the two-column profile/commerce/notes/timeline layout. At 390 × 844, confirm the single-column layout, wrapping header, readable order details, and usable form controls.
4. Test a Shopify customer with orders, a non-Shopify customer, and a customer without a messaging thread. Open Conversation should select the existing thread without creating messages. Try the profile URL in another workspace; it must return an unavailable state.
5. Edit CRM fields, add a note, and set a follow-up. Shopify identity fields remain read-only. For a non-Shopify identity edit, update the contact in another session before saving; the stale edit must show a conflict and a Refresh contact action.

## Validation and limits

Run `node --import tsx tests/contact-details.test.ts`, `tests/contact-details-route.test.ts`, `tests/contact-details-render.test.ts`, and `tests/contact-details-concurrency.test.ts` separately. The concurrency regression executes the actual storage update against PGlite, including PostgreSQL timestamp precision and workspace/Shopify guards. Existing Inbox, contact lifecycle, Shopify customer synchronization, privacy, and authorization suites also apply.

History uses the newest 200 persisted activity events, plus CRM notes and the existing active-future appointment API. Events display their persisted type/date; historical stage values and completed appointments are not synthesized. Order dates reflect persisted event capture time. Fulfillment is unavailable when the synchronized event did not record it; no new Shopify fetch is made. The existing model supports one email, phone, and CRM tag per contact. Server-side rendering checks cover responsive structure; viewport/browser acceptance is described above. PostgreSQL-only erasure suites require an explicit disposable Shopify test database and are separate from the PGlite regressions.
