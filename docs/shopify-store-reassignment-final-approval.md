# Shopify store reassignment — final approval packet

**Awaiting explicit owner approval. Nothing in this packet has been executed against production.** Continue in existing PR #176; do not create a new app, service, charge, installation or staging change.

## Verification decisions

### Subscription: existing charge preserved, optional metadata disclosed

The owner verified the production app in Shopify Admin: Pro, Free trial, five days remaining, $0/year afterward, installed October 14 and permissions updated October 15. Production and staging apps are separately installed. Production records existing reference `gid://shopify/AppSubscription/58073350426`, Active/Pro. An ACTIVE subscription can be in its provider trial; this does not conflict with the Admin display. Local expired May/June CRM trial fields are historical and will remain unchanged.

| Evidence | Status | Required for this operation? |
|---|---|---|
| Owner authorization for this shop and production app | Confirmed by owner in Admin | Yes |
| Exact existing DB charge reference and installation | Verified; SQL aborts on any different reference | Yes |
| Target has no competing Shopify/Stripe subscription or installation | Read-only preflight passed; SQL rechecks atomically | Yes |
| Preserve credential, charge ID and existing plan; no billing API mutation | Explicit SQL/code review and rehearsal passed | Yes |
| Provider returned reference match | Not independently fetched here; Admin evidence plus existing reference accepted for unchanged-charge tenancy move | Desirable corroboration, not required to calculate or initiate billing because neither occurs |
| Provider `test` flag | Not available in Admin page or current production subscription response | Optional metadata for this no-charge operation; required before any future billable operation |
| Exact provider currentPeriodEnd/trial-end timestamp | Not available; do not infer from “five days” | Optional metadata; preserve provider-owned billing lifecycle without fabricating dates |

The existing `/api/shopify/subscription` path requires a real Shopify session token and its deployed query does not select test/period fields. The available connector has no browser/Admin session or existing-container command execution; no Railway CLI credential is configured. The prepared read-only verifier can obtain those fields later inside the existing app service. No token/session was extracted or forged and no new credential-access path was created. The unknown fields remain unknown; they are not silently treated as test=true or as a specific billing date.

**Decision:** the owner-confirmed current plan and preservation of the exact existing charge are sufficient for this narrowly scoped tenancy move. This approval would not authorize creating, modifying, renewing or cancelling a Shopify subscription. Retain the read-only verifier for later diagnostics; do not gate this no-charge migration on billing metadata it does not consume.

### Store-erasure tasks: independent external-erasure obligations

Both tasks are genuine blocked **external-copy erasure follow-ups**, not smoke fixtures. Keep their status, evidence requirements, deadlines, suppression/erasure protections and processor work unchanged.

| Task | Scope start (UTC) | Requested (UTC) | Correlated redacted account creation (UTC) |
|---|---|---|---|
| `725eda1d-5594-4869-851d-05eb765ae7d3` | Oct 18 01:04:45.637 | Oct 18 03:16:36.766 | `fd3ff0e3-131f-46cd-ab98-1b6ec4308248`, 01:04:45.582 |
| `ceb76af7-cf58-4c65-a822-5bbbf301ac5b` | Oct 18 01:03:34.486 | Oct 18 03:22:29.610 | `2e1d007c-2e5b-4cc2-bda9-bdd0b8b0b4a4`, 01:03:34.444 |

Both correlated accounts are now redacted, with null shop/token/install fields. They were created within 55/42 milliseconds before the respective retained installation-scope timestamps. Their original domains were intentionally erased. There is no retained request payload or plaintext shop selector, and the dedupe values are keyed hashes, not recoverable domain indexes. Historical Railway log lookup returned no entries. No erased selectors were recovered from backups.

By contrast, `whachatcrm.myshopify.com` retains its original October 14 installation/integration, August 27 backfilled trial ledger, May 27 contact and October 14 order message, including later #1003/#1004 history. The supported redaction transaction clears the matching merchant installation, deletes that shop's integration/trial data, and enqueues the external task only after those database changes. The surviving earlier records and different scope starts strongly support two other redacted-account/store lifecycles. This is an evidence correlation, not an immutable task-to-domain join; naming the erased domains is neither possible from the retained records nor necessary to preserve their erasure obligations.

The handler intentionally enqueues no store/domain/user selector: it requests stream/copy erasure for retained time coverage. `blocked: missing_configuration` means the required external verification (logs, mail processor, archives, backups, exports and local review) is outstanding; it is not a blanket prohibition on all account changes in the application. The reassignment moves only current surviving records, does not restore either redacted account's data, and does not change any task or its coverage. This fresh snapshot/restore already contains the two redacted states, not their erased selectors.

**Decision:** these tasks remain blockers to completing their own external-erasure workflows, but are not a blanket operational hold on reassignment of the surviving store. Approval here is not a legal waiver or an assertion that either request is fulfilled. Keep processor remediation and retention/restoration protections in force, including for any relevant operational copies. If new evidence links a pending request to this shop, abort cutover and resolve it rather than overriding the privacy process. The new signed shop-redaction cleanup also deletes this shop’s assignment and purges its one-operation inverse manifest. This prevents ownership bindings or rollback metadata from surviving a later legitimate erasure. Unrelated assignments are preserved; missing optional tables are supported.

## Exact proposed production change

Source: `271c48f9-3515-4682-b391-2fead371593d`. Destination: `6868785e-e8af-4152-8e2d-8d031c2e97d0` (`marketing@whachatcrm.com`). Store: `whachatcrm.myshopify.com`.

In one SERIALIZABLE transaction, with a 3-second lock timeout and 30-second statement timeout:

1. Require the production branch identity and an explicit transaction-local approval marker. Acquire the existing store advisory fence, both account row locks and scoped row locks on all affected relations. Recheck account emails, source store/token/charge/plan, destination conflicts, active integration uniqueness, customer collisions, row counts and absence of an in-flight catalog lease. Abort on drift or contention.
2. Create the small ownership binding/guard and private rollback manifest. Move the credential directly inside the database; no credential value enters the manifest or reports. The new OAuth resolver must be deployed before committing the binding, preventing synthetic-email reclaim after uninstall/reinstall. The database guard additionally rejects any other account claiming this assigned shop.
3. Reparent these existing rows, preserving IDs and all customer content:

| Relation | Rows |
|---|---:|
| Active Shopify integration | 1 |
| Shopify contacts / conversations / order messages | 3 / 2 / 3 |
| Shopify activities, including #1002–#1004 | 11 |
| Catalog source / products / variants / media / collections | 1 / 17 / 26 / 18 / 3 |
| Shopify merchant contact | 1 |
| Catalog events | 0, asserted |

The two existing user rows receive only the declared Shopify installation/current entitlement changes. Move the store/token/charge/current installation and recorded Pro entitlement to marketing. Detach those live Shopify fields from the original account, mark its Shopify status `transferred`, and return its Shopify-derived plan to Free. Preserve both accounts, identities, trial history and consumed shop ledger; prior changed billing values remain in the private manifest. Keep unrelated marketing data/settings and the source's 11 inactive integrations, legacy chat, MLS demo inventory, inactive flow and usage history. The 12 catalog memberships retain their IDs/references unchanged.

4. Temporarily defer six existing composite catalog constraints, validate the moved graph, and restore all six to NOT DEFERRABLE before commit. No FK is disabled or removed. DDL lock contention causes rollback; use a coordinated maintenance window rather than forcing lock acquisition. Verify final sole store ownership and all recorded row/credential checksums.

Forward SQL: [forward-production.sql](../scripts/shopify-reassignment/forward-production.sql). SHA-256:
`7cbccb07b9794b23c2fa57eecc2159e183b04dc4ed19b311b0f8395aeafaab8c`

The file has explicit BEGIN/COMMIT and refuses execution without approval. The custom approval marker is an operational guard, not a substitute for this owner's explicit final approval. It has been set only in isolated rehearsal transactions.

## Fresh backup, rehearsal and rollback

Snapshot `snap-wild-fog-anaysiwm`, created Oct 24 at 11:54:51 PM America/New_York (Oct 25 03:54:51 UTC), expires Nov 8 23:59:59 UTC. Restored without production name/compute changes to `br-nameless-band-anh6jkkc`, expiring Oct 28 23:59:59 UTC. No app or worker is attached.

The production SQL body was rehearsed on this current copy, changing only the expected environment branch ID and supplying the marker for rehearsal. The connector supplied the same transaction boundary as the explicit file wrappers. Results:

- Approval-marker omission denied the operation before writes.
- Complete forward transaction passed, moving the expected row counts.
- #1002–#1004 appeared under marketing with their original activity/contact/conversation IDs.
- Complete inverse passed: full original source/target row checksums restored across all 13 touched relations, including credentials and billing fields.
- Earlier negative rehearsals rejected old-owner reclaim, target-contact collision, wrong branch and rollback with changed customer data.
- Live production remained on the original owner throughout. No erasure task or staging data was modified.

Inverse SQL: [rollback-production.sql](../scripts/shopify-reassignment/rollback-production.sql). SHA-256:
`e4ff033e971db5e345db463652735461015ba3e8460b2b286079a62d124f09e8`

The inverse takes the same fences/locks, verifies every affected relation against post-migration checksums, reverses the credential/ownership move inside the database, restores declared changed fields and checks original complete-row digests. Any intervening new/deleted/edited row aborts rollback for review; do not overwrite later activity or restore the whole production database. Keep current application code for privacy cleanup. The inverse removes the active ownership binding but leaves inert preparation schema/manifest for audited retention. A legitimate subsequent shop erasure purges the relevant inverse manifest and binding; any later inverse fails its missing/different-checksum guard. Privacy deletion always outranks rollback.

## Approval scope and execution sequence

Approval should cover **PR #176 code deployment plus this exact store-specific forward transaction and the guarded inverse for failed acceptance**, with the unknown provider metadata explicitly disclosed above. Do not mark the draft ready/merge, deploy the ownership resolver or run production SQL until that approval arrives.

After approval: recheck unchanged reviewed head and CI, current production ownership/conflicts/counts and snapshot freshness; abort if anything changed. Deploy the resolver first and verify startup. Then coordinate this store's ingestion/OAuth/billing callbacks and catalog leases, execute the atomic transaction, and perform read-only acceptance: marketing login, historical orders, tenant isolation, catalog and AI handoff. Do not create a checkout/order or send customer messages without separate authorization. Staging app and all credentials/callbacks remain unchanged. Outbound recovery and consent activation remain disabled; merchant task opt-in remains a separate action.

UI/AI checks: 14 final guard/localized UI tests passed; the added in-memory PostgreSQL privacy regression verifies assignment/inverse erasure, unrelated-store preservation and replay on the final preparation, plus earlier 35 unique UI/AI/billing-guard/handoff fixture tests and five green PR workflows. CI must pass again on the final amended head before approval is exercised. Authenticated live browser checks still need a normal owner session and permitted network access; local tests are not a claim that live merchant acceptance has occurred.
