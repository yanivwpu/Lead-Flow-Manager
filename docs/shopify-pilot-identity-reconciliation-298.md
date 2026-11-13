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

## Production-readiness follow-up: preview blocked, no execution approval

The existing read-only preview command was attempted in this executor. It exited without querying production because the explicit preview connection, private A/B bindings and current `SHOPIFY_API_SECRET` are not bound here. The local development binding is not an approved production substitute. Connected Railway OAuth exposes variable names only, not the current privacy key. Do not retrieve a privileged database password alone and then bypass keyed privacy verification, substitute a key, rotate a sealed value, or publish credentials in chat. **Preview digest: unavailable. Full keyed privacy/restriction preview: not completed. Execution: NO-GO.** This is an access limitation, not a reported `privacy_locked` result.

Fresh aggregate production SELECTs through the approved Neon connection confirmed one A candidate, one B candidate, A's empty WhatsApp ID and matching existing normalized phone/WhatsApp identity. Both contacts remain unpaused; post-purchase consent and outbox counts remain zero. All 24 audited direct-reference relations retain the counts above: B still has 1 conversation, 6 messages, 8 activities, 2 completed send fences and 6 terminal jobs (3 cancelled, 1 completed, 2 skipped). These separate SELECT snapshots are not the repeatable-read exact-pair preview, do not establish absence of privacy tombstones or every restriction, and cannot supply its approval digest. Previous JSON/FK audit evidence remains historical until the full preview reruns.

### Smallest safe maintenance scope

Do not stop/restart the whole service or change release variables merely for this pair. The current implementation needs no full-service deployment to run the standalone operator library, but it **does take shared-table write locks**. Tenant-scoped writes do not make those locks tenant-scoped. The 3-second lock timeout bounds lock acquisition; the 10-second statement timeout is per statement, not a total transaction deadline. Do not promise zero impact or a fixed 10-second maintenance window.

First obtain the full read-only preview in an already authorized operator environment using existing secure bindings. Measure that preview's duration before scheduling anything. Then establish a pilot-only drain of its inbox, Shopify customer sync and automation writers, without suspending other merchants or privacy ingestion. No such per-pilot operational drain has been verified in this executor. If the operator cannot establish it, stop rather than claim `writersDrained=true` or remove locks based only on an assertion.

If the existing implementation is retained, separately approve the brief shared-table blocking during a low-write interval. Use one dedicated operator process/connection, no automatic retry, and an approved external wall-clock watchdog that closes that connection on expiry. Choose its duration from the measured preview plus bounded apply work; record it in the approval. A timeout near COMMIT is an unknown outcome until read-back, never a reason to replay. Replacing the table locks with narrower locks is not justified until the actual writer-drain mechanism is demonstrated; it must preserve protection against racing fallback/contact creation, not merely make lock acquisition appear tenant-local.

### Exact execution and recovery procedure, after separate approval only

1. Bind the verified production read-only target, private exact A/B IDs and existing current privacy key in the secure operator environment. Run the existing preview command. Retain only its digest, blocker list, counts/hashes and proposed field names in the approval record. Review the private patches without publishing them. Require no blockers; compare the current connection, both identity mappings, all restrictions, references and fence aliases. No valid digest exists yet.
2. Prepare a secure preimage manifest of both contact rows and the exact IDs/ownership of each proposed reference move, plus original fence keys/statuses/timestamps and any pre-existing canonical aliases. Verify backup/recovery access. Do not put the manifest in GitHub or chat. Count-only output is insufficient for a selective reversal.
3. Obtain separate approval for the exact reviewed PR commit and manifest, current digest, pilot writer drain, shared-lock impact, watchdog duration and operator. Any merge/deployment is a distinct authorization. The same-number Shopify sync fix must be present before normal pilot customer sync resumes, or that sync must remain safely drained under a separately approved plan: unmodified production sync would otherwise strip the canonical `+` again. Do not claim the correction durable while that prerequisite is unresolved.
4. In the approved window, keep merchant delivery paused and sending gates blocked, verify the drain, and run the operator library once against the exact target with the approved digest and attestations. It rereads and compares state under locks; drift/blockers require rollback and a new preview/review, not an override. No such invocation has occurred.
5. Before resuming writers, read back A's unchanged ID and exact Shopify customer/shop mapping; A's phone must be E.164 and its WhatsApp ID must be the exact former B value. Verify B still exists as a neutral paused shell, unique normal Shopify/WhatsApp lookup resolves A, every manifest history reference moved exactly once, original and alias budgets remain consumed, jobs remain terminal, and all consent/commerce/receipt records and suppression ledgers are unchanged. Confirm the same-number sync prerequisite above. Then resume only the approved pilot writers.
6. Verify the existing authenticated enrollment response has current saved connection, ordered schema/key readiness and `captureReady=true` for Order Confirmation. If STOP/DNC/pause/privacy or capture release blocks it, stop; do not change flags or clear restrictions to obtain a green state. Reconciliation is not consent. A genuine customer opt-in and a later controlled send require their existing separate approvals; the fulfilled order's suppressed intent remains closed.

**Recovery:** any pre-COMMIT failure rolls the whole transaction back. After COMMIT or an uncertain connection outcome, first read back; never automatically retry. A selective inverse requires separate approval, a fresh drain and proof that the manifest rows/identities have not changed or gained new inbound/consent/commerce work. Restore only approved contact preimages and manifest reference ownership in one guarded transaction. Retain consumed original/alias send fences and all current STOP/privacy evidence; never reverse a grant/revocation, reopen jobs/intents, delete either contact or restore the entire database to reset a budget. If any intervening work exists, forward-reconcile after review instead of performing a blind inverse. Reverting to the original pair also restores the original ambiguity, so consent capture remains NO-GO until corrected again.

Required future owner approval wording, with private values filled only after a successful preview:

> Approve one execution of the reviewed PR #301 commit against the verified production target for private pair A/B and preview digest [digest], using preimage manifest [private reference]. Keep A canonical, transfer only B's existing WhatsApp identity, preserve all history/restrictions/fences, retain B, and make no consent, commerce-state, send or release-variable changes. Approve pilot-only writer drain [method], bounded shared-table blocking and watchdog [duration], operator [owner], and the documented read-back/recovery procedure. Separately authorize any required code release; otherwise do not resume incompatible Shopify sync. No automatic retry or rollback after intervening work.

No code correction, test repetition, production write, merge or deployment was performed in this follow-up. The immediate action is secure access for the existing full read-only preview, not execution approval.
