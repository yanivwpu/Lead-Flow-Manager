# Focused regression review of 17cdea534f68439724745c4d5cb132656103aa4c

Reviewed locally, 2026-11-16. No push, deployment, production data mutation, global setting change or outbound message was performed. The original commit needed the corrections below before release.

## 1. Agent confirmation

There was no verified pre-existing agent-confirmed RGE enrollment field/action. Commit 17cdea53 introduced optional `buyerPreferenceProfile.agentConfirmedAt`. `hasConfirmedBuyerEnrollment` recognizes that field after profile normalization; buyer labels, saved criteria, source="explicit" and extracted evidence strings do not count as confirmation. The only production writer is `applyManualBuyerPreferencePatch`, called by the authenticated, tenant-owned PATCH `/api/contacts/:id/buyer-preferences`. It invokes `mergeAndPersistBuyerPreferences` with `{agentConfirmed: true}`, which stamps an ISO timestamp. The extraction patch schema excludes this metadata, and automatic merges never stamp it.

The review found that the only Inbox instance of the preferences editor was compact/read-only, and hidden for ineligible contacts. Thus the original commit provided no usable Inbox confirmation action. The correction exposes an explicit “Set up property matching…” action for connector-capable workspaces, reusing the existing preferences editor. It initially displays no inferred preference cards and does not prefill unsupported preferences. The dialog explains the effect and its button says “Save and enable matching”. It sends `confirmRealEstateEnrollment: true` through the existing PATCH. An empty preference patch is accepted only with that explicit flag; confirmation can precede collecting criteria. Genuine buyers do not need this action. No automatic installation or classification path writes confirmation.

Validation renders the setup action for an ineligible contact, checks that inferred chips are absent, verifies that an automatic merge leaves confirmation absent, verifies that manual confirmation stamps it even before criteria exist, and rejects a foreign-tenant writer. This is renderer/service validation, not a live browser click-through.

## 2. Existing buyers

The new metadata is optional. Eligibility uses actual inbound property intent, rather than merely saved criteria. The original 100-message window could disable older genuine leads whose profiles lacked message references. The correction pages through the contact’s conversation history until valid evidence is found or history ends; each message is assessed separately. It also resolves existing message references to actual inbound messages and validates contact/workspace ownership. Saved evidence strings are never treated as proof. System notifications cannot authorize intent through the referenced-message path.

Passing cases, all without `agentConfirmedAt`: established condo-buyer intent followed by “Hi!”, “Thanks, talk tomorrow”, weather small talk, vehicle-maintenance small talk, and a CRM integration question. Another case puts the property intent on page two, after 100 greetings, with no message references. Buyer matching remains eligible in all cases. A current system/product message can still suppress real-estate AI reply context under the existing domain policy; that does not erase established buyer matching eligibility.

## 3. Workflow/timer scope

The original blanket gate on every RGE-tagged workflow was too broad. The correction distinguishes inventory eligibility from real-estate relationship and ordinary workflow behavior:

| Path | Intent policy |
| --- | --- |
| Inventory API, background opportunities, AI inventory summary, contact-specific draft, saved-match reads/writes | Buyer/property-rental intent or explicit agent confirmation |
| RGE W1 automatic enrollment and W4/W5/W6 automatic nurture | Established buyer, seller or real-estate referral context; tenant/entitlement/stage/send policies still apply |
| RGE `re_engagement` listing-outreach template | Buyer/property intent, including when used by a custom RGE workflow |
| W2 property qualification | Buyer/property intent at scheduling and again immediately before delayed sending |
| Configured service/referral routing and `w2_routing` timer | Existing routing/confirmation and tenant/send policies; no buyer-matching prerequisite |
| W3 booking, W7 DNC safety, W8 language, other custom workflows, non-RGE workflows | No blanket buyer/property-matching gate; existing policies remain |

Seller intent and explicit real-estate referral requests can qualify for RGE relationship workflows without enabling inventory matching. The workflow executor reloads current contact state before guarded execution; a stale eligible contact object cannot authorize a queued property action. Delayed W2 qualification also loads current contact state and rechecks buyer eligibility. The focused test exercises both stale workflow snapshots and a queued qualification job, with sends unreachable. Its routing test verifies that the independent routing timer remains schedulable when qualification is suppressed. Empty-action W3/W7/W8/custom workflows execute successfully through unchanged entitlement/execution paths using controlled stubs; no provider sends are invoked.

## 4. Existing bad matches and caches

Production logs prove an 88-result ranking response for America’s Best Car Rental. They do not prove that 88 saved-match or opportunity records exist. Those tables remain inaccessible. The known profile criteria (areas and bedsMin=11) are retained and do not authorize matching.

The new code checks contact eligibility before reading/scoring inventory or returning saved/opportunity records, constructing AI inventory summaries, or generating contact-specific property drafts. Saving an existing match/opportunity also requires eligibility. Existing stored rows can remain without making an ineligible contact eligible. Tests use old listing IDs and make database access throw, proving the rejected paths never reach those stored records or providers. Existing matching/AI/opportunity tests continue to reject the Hebrew case before listing queries.

The review also found that a cached response from the former workspace-only buyer-preferences endpoint could contain `eligible: true`. The endpoint now returns `eligibilityVersion: 2`; the client trusts API eligibility only with this version. Thus old broad eligibility cannot reveal previously cached 88-match cards under the new client. Contact-scoped caches, late-response isolation and abort handling remain in place.

These are code and controlled-fixture guarantees for an ineligible contact. They are not a post-deployment observation. Without the contact’s full production history/profile, we cannot certify that no genuine property-intent message exists elsewhere in its history. Deliberate future agent confirmation would also change its eligibility. Old browser bundles already running before deployment require normal reload/version adoption; this local patch cannot alter code already loaded in those browsers.

## 5. Evidence, checks and release impact

* Verified production evidence from the prior read-only investigation: the contact name/ID link, Hebrew payment/maintenance/photo messages, and the contact-specific 88-match/10-returned ranking log. One sampled inbound turn reported no active chatbot flow, no booking intent, and disabled auto-reply. No claim is made that all historical workflows/outbound actions were absent.
* Inaccessible: raw production profile/classification provenance, complete messages, saved matches/opportunities, workflow execution and timer tables. No new production access was attempted for this focused review. Actual Inbox browser verification remains unavailable.
* The previously failing test is `tests/buyer-preference-fastpath.test.ts`, assertion `Pompano area extracted` at line 134. It failed identically on exact pre-change base `48f802de6925cdf78c4a6e6bb721f545e1fc4483`. The saved baseline run was reused; the test was not rerun unnecessarily. An audit of all 3,145 archived tracked blobs against that Git tree found zero missing or differing blobs. The failing test blob SHA is `8995fa6f3e308e4bf93ec352a0c9fc81989b4754` in both the archive and base.
* No database migration is required: `buyer_preference_profile` is an existing JSONB column. `agentConfirmedAt` is optional JSON metadata; no SQL column/table, default, bulk backfill or schema-version change was introduced. `eligibilityVersion` is an API response field, not a database field.
* Newly run focused tests: `rge-focused-release-review.test.ts`; rerun because their code paths changed: `inventory-contact-server-gate.test.ts`, `rge-w4-no-reply-enrollment.test.ts`, `rge-no-reply-meta-safe.test.ts`. All four pass.
* Prior passing coverage reused without rerunning unaffected tests: `inventory-contact-eligibility`, `inventory-matches-refetch`, `ai-domain-eligibility`, `copilot-email-system-guard`, `copilot-greeting-discovery`, `copilot-shareable-matching`, buyer-search scenario/command/replacement tests, inventory matching regression/hard-gate/funnel tests, and ingress cross-tenant tests. The previous broader selection was 21/22 passing with the exact-base failure above.

Remaining operational limit: the complete-history fallback can scan multiple message pages for legacy contacts without verified references. This preserves correctness; production query load has not been measured. No repair is required to make unsupported criteria non-authorizing, and no targeted data repair was performed or proposed.

Final validation of the corrected working tree: production build PASS; full TypeScript check reports the same 97 diagnostics as the exact pre-change base, with zero additional diagnostic messages. Generated hero AVIF files were restored and are excluded from the review changes. All four affected/focused test files listed above pass. These results supplement, rather than repeat, the retained broader-suite results.
