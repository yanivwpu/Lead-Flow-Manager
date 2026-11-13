# #298: exact-pair Shopify / WhatsApp identity reconciliation

Prepared November 13, 2026 against main `e1ee1f0d`. **Review only: production remains unchanged.** No contact deletion, consent grant, new contact/order/message, flag change, merge or deployment is authorized here. Checkout recovery and token PR #281 remain separate milestones.

## Why the generic merge is unsuitable

`storage.mergeContacts` moves conversations, messages and activity, copies missing identifiers and deletes the source. It does not reconcile Shopify metadata, consent/delivery references, restrictions, terminal jobs or send-fence keys. The post-purchase outbox trigger explicitly forbids changing `contact_id`; a generic commerce merge would be unsafe. This change leaves that API alone.

The existing exact pilot has A with Shopify identity and B with the matching existing WhatsApp identity. Both use the same Israeli digits-only phone; A lacks `whatsapp_id`. Signed inbound lookup selects B first, which lacks Shopify customer identity; consent capture correctly refuses the match. Copying a phone, enabling a journey, or approving a template does not resolve that conflict.

## Read-only production reference audit

Scoped to the existing production branch and pilot account/shop. No contact names, IDs, phone, email, keys, provider IDs or message bodies were returned or published. Pair selection was relational: the unique Shopify-linked contact in the exact account/shop and its same-phone WhatsApp contact. The eventual operator preview instead requires both exact IDs privately; it never auto-selects or applies a pair.

| Reference | A rows | B rows | Proposed treatment |
| --- | ---: | ---: | --- |
| Conversations | 1 | 1 | Move B's contact reference to A; keep both conversations, channel/thread IDs, controls and state |
| Messages | 1 | 6 | Move B's contact reference to A; keep conversation, content, media, provider IDs, status and timestamps |
| Activity | 4 | 8 | Move B's contact reference to A; preserve event payloads/history |
| Automation send fences | 0 | 2 completed | Retain original keys/status/times; re-parent ownership to A; add two canonical-key fence aliases so changing contact ID cannot reopen the budget |
| No-reply jobs | 0 | 6 | Re-parent contact reference only; preserve 3 cancelled, 1 completed and 2 skipped records, keys and statuses |
| Order-support tasks | 1 | 0 | Leave A's existing reference untouched |
| Post-purchase intents with a contact reference | 1 | 0 | Leave untouched; this count excludes intents with null contact references |
| Post-purchase/recovery consent and outbox references | 0 | 0 | No writes permitted; a newly discovered B reference blocks reconciliation |

Zero references on either side were observed in appointments, calendly cancellation tombstones, campaign enrollments/step events, inventory matches/opportunities, contact notes, flow jobs, prospect discovery/outcomes/enrichment/intelligence/outreach queue. All live contact FKs used `contact_id`; no additional FK column names were found. The extra `prospect_intelligence_contact_id`, generic `entity_id`, and all public JSON/JSONB columns (including ID arrays, workflow/timer/webhook snapshots) were searched for B's exact ID: no embedded references were found. Phone-keyed chats and identity-keyed marketing suppressions are retained, not rewritten; normalization preserves the same number, and existing privacy matching normalizes phone digits.

Both contacts were unpaused, had no other channel identities and no explicit `doNotContact=true`. These narrow observations do **not** establish absence of every opt-out or privacy restriction. The operator preview rechecks both complete restriction sets, marketing suppression ledger and keyed privacy locks before offering approval. Current runtime sending/capture flag values were not retrieved. Full runtime quiescence and current capture readiness are separate checkpoints.

This is a snapshot, not execution authorization. Counts, job states, connection, schema and identities must be freshly inspected before a later operation.

## Exact proposed changes — before any production writes

1. **Keep A's ID and Shopify mapping.** Copy the exact existing digits-only WhatsApp ID from B, after confirming both phones equal that same Israeli identity; normalize A's phone to `+` plus those digits. No number, WhatsApp ID or customer ID is generated or inferred from an email/name.
2. **Preserve stronger restrictions.** Keep A's custom metadata and OR the known STOP/DNC/opt-out booleans from both contacts; a `marketingOptIn=false` remains false. Preserve contact pause and its actor/time as an operational pause, not new DNC. STOP/DNC evidence on either side or an `all`-scope matching suppression conservatively blocks the canonical contact with DNC. Email-only suppression remains in the existing ledger without becoming WhatsApp DNC. No restriction is cleared or ledger rewritten. A privacy lock stops the operation entirely. Restriction preservation can legitimately leave future capture blocked.
3. **Preserve history and fences** as listed above. This is reference re-parenting, not conversation coalescing or replay. Original workflow send keys retain consumed status, and reviewed `wf_msg_tpl` / `wf_msg_tpl_meta` keys get A-specific aliases with the same status/time. Unknown fence formats, nonterminal fences, active no-reply jobs or unsafe collisions stop for review.
4. **Keep both contact rows.** B becomes a paused, neutral `Reconciled contact` shell with no phone, WhatsApp ID, email, active Shopify metadata or other personal/profile fields. The original A and B snapshots are retained inside A's Shopify-scoped `source_details.identityReconciliation` object. This preserves information removed from the neutral shell without creating another matchable identity. The shell has no conversations to receive inbound, no customer mapping and no phone to match. Its ID remains for historical references. It may still appear as a neutral row in some administrative views; no general archive UI or global merge behavior is added.
5. **Keep privacy effective.** The snapshot carries the explicit shop marker so existing Shopify redaction scrubs it. Customer erasure removes A and its owned history; B's neutral shell contains no customer identity. Original and alias send-fence ownership follows A. The shared deletion cleanup now removes those non-FK fences, whose keys may contain message text, when an existing authorized erasure/deletion occurs. That cleanup does not run during reconciliation and does not clear marketing suppression tombstones.
6. **Never touch commerce decisions.** A's task/intent references, suppressed intent states, consent, receipts and outboxes remain unchanged. Source-side protected/unknown commerce references block execution rather than being relinked. No attempted delivery opportunity can be reset or reassigned.

One small runtime fix is also required: Shopify customer sync currently strips the `+` on every phone update. It now preserves an **already existing** `+digits` phone only when the existing WhatsApp ID equals the same incoming digits. Other imports retain their current behavior; a changed Shopify number cannot manufacture a new WhatsApp ID and must be reverified. This prevents the exact reconciliation from being undone by the next same-number sync.

## Operator tools and safety boundary

`scripts/shopify-pilot/reconcileIdentity.ts` is an operator-only library, pinned to the exact pilot account/shop. It has no route, generic merge replacement, scheduler, migration, sender or automatic invocation. `previewIdentity.ts` is the only command-line entry point and is **read-only**; it accepts no arguments or apply flag.

Using an approved read-only binding and secret-store inputs, run:

```sh
node --import tsx scripts/shopify-pilot/previewIdentity.ts
```

Required private environment bindings:

- `PILOT_IDENTITY_READ_ONLY_DATABASE_URL`: explicitly verified existing production target, preferably a read-only role; never an implicit application URL.
- `PILOT_IDENTITY_CANONICAL_CONTACT_ID`: privately reviewed exact A.
- `PILOT_IDENTITY_SOURCE_CONTACT_ID`: privately reviewed exact B.
- `SHOPIFY_API_SECRET`: the existing current binding, used only to check the existing privacy lock hashes; never print, copy into the PR or rotate it.

The preview opens `REPEATABLE READ READ ONLY`, rolls back, and returns only a digest, blockers, reference counts/hashes and field names/summary. Its internal contact patches contain private retained history and must not be logged or published. A missing schema/key, wrong tenant/pair, changed connection, ambiguous owner/customer/phone or third identity fails closed. It audits current FK and application reference columns plus JSON snapshots. Unknown populated references block; it does not guess how to migrate them. This preview has **not** been run against production as an executable; the audit above used narrowly scoped SELECTs via the existing connection.

The separate `reconcile` export has no CLI apply mode. A later reviewed operator harness must supply the exact approved preview digest and explicit exact-pair approval/drained-writers attestations. It takes the existing shop/privacy and marketing advisory locks, owner and contact/reference locks, re-inspects in a serializable transaction, rejects drift/blockers, and applies only this bounded proposal atomically. All affected reference rows are tenant-checked. Because no normalized-phone uniqueness constraint exists, the brief table locks also block other tenants' writes to these shared tables; the maintenance window must explicitly account for that effect. A statement/lock timeout, constraint collision or failure rolls back every move and returns a sanitized error. No retry loop is included. The library changes neither deployment flags nor the merchant integration config.

## Separate approval and capture-readiness sequence

1. Review this PR, focused fixture evidence and the exact proposed changes above. Do not run the generic Merge Contacts action. No production apply, contact neutralization, deployment or customer action is part of this PR preparation.
2. In a private change record, verify exact database/service, A/B IDs, customer identity and current connection; record the fresh read-only preview digest, blockers and counts. Confirm backup/recovery access. Approve this exact field/reference diff separately; a changed digest needs a new review.
3. Before an approved apply, arrange an independently approved bounded maintenance window: drain the affected inbox, Shopify sync, workflows/timers and any in-flight provider work. Contact table locks prevent racing inserts/updates only during the transaction; they cannot stop an already dispatched external request. Do not disable privacy ingestion or erase queues/fences. Do not change release flags as part of reconciliation. If safe quiescence cannot be established within the existing restrictions, remain NO-GO.
4. Only after that explicit approval, use a separately reviewed operator harness once with the current key/bindings and exact digest. Keep delivery paused and all sending release gates blocked. Stop on drift/failure; never delete B or reset an old claim to recover. No production invocation is performed here.
5. Read back one unique canonical Shopify/WhatsApp identity, E.164 phone and unchanged history/terminal jobs/fences/commerce state. Resume only the approved drained processes. Same-number Shopify sync must retain the canonical E.164 match. Rollback after new inbound work is not a blind row restore; re-audit and forward-fix under the same restrictions.
6. Verify the existing consent-enrollment response for this workspace: current saved connection, selected Order Confirmation notice, schema/HMAC readiness and `captureReady=true`. Operator **delivery** release may remain blocked; capture-only permission is independent. Confirm recipient not STOP/DNC/paused/privacy-locked. Reconciliation creates no consent and does not itself prove capture release.
7. Only then, with the chosen customer/purpose approved, the willing customer can use the existing storefront link and personally send `YES WHATSAPP ORDER CONFIRMATIONS`. The signed raw-body Meta inbound must resolve to A and the existing writer must record purpose-specific evidence. No unsolicited request, replay, direct consent mutation, grant from historical messages or confirmation send is included. The existing fulfilled order's suppressed Order Confirmation intent remains closed.

## Validation

New disposable PostgreSQL-engine/PGlite fixtures exercise exact-pair preview/apply, unique subsequent identity lookup, preserved rows/history, immutable commerce blocking, terminal job/fence budgets, third identities, tenant/foreign history rejection, unknown FKs and JSON snapshots, stale approval, privacy tombstones, restriction union, rollback/error sanitization, actual signed-consent writer and STOP, and actual erasure cleanup. Existing customer-webhook tests cover the same-number sync fix; existing consent tests are reused as targeted regressions. No live consent/STOP or storefront/provider acceptance is repeated.

The standalone operator library typecheck passes. Repository-wide TypeScript still reports the accepted 97 diagnostics with none in changed runtime files. A native local PostgreSQL probe returned `ECONNREFUSED`; local reconciliation tests used PGlite's PostgreSQL engine, not a claimed native multi-process lock test. Required hosted checks on the PR remain authoritative for their own native suites. No production writes, contact deletion, credential/key changes, sends, flag changes, merge or deployment occurred.
