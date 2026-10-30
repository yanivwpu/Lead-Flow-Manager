# Post-purchase development milestone: saved plans and no-send timing policy

This follow-up is stacked on draft #225, without merging it. Reviewed #136 and #154 and their comments first. Existing Shopify OAuth, orders/fulfilled/cancelled inbox classification, CRM order/contact ingestion, workflow drafts, order-support tasks, template library and recovery delivery/consent infrastructure are reused or preserved. The checkout observation/consent/template acceptance recorded in #154 was not replayed.

## Implemented

- Six independently selected/paused plans, bounded 0–180 day delays, localized EN/ES/HE RTL controls and illustrative message previews inside #225's connected pilot preview.
- Existing workflow-draft route now accepts a distinct strict plan-save action. No new backend route or schema. Per-journey JSON updates preserve credentials, existing drafts and concurrent edits. Same authenticated pilot boundary, active merchant/shop recheck and privacy/uninstall advisory lock as existing draft saves.
- Pure no-send scheduling policy reuses the existing webhook classifier. Exact tenant/shop/order/customer match, fresh order check, status supersession, purpose-specific channel consent, STOP, erasure, merchant/contact pause, matching live/local approval/category and semantic order/journey duplicate fences. Marketing journeys also require fresh purchase evidence. Missing prerequisites block the preview. Even a ready policy result explicitly has messagingEnabled=false.
- Utility templates for confirmation/fulfillment/cancellation; conservative marketing requirements for review/repeat/win-back. Require approved templates even within the WhatsApp 24-hour window. Checkout recovery consent cannot grant any post-purchase purpose.
- Native PostgreSQL concurrency/isolation test in existing CI plus focused policy and localized UI coverage.

## Explicit incomplete delivery integration

Saved selection is planning only, not runtime activation. The UI labels activation unavailable. Examples are not approved templates or recipient-specific messages. The policy is not wired to webhooks or a worker and does not create durable jobs or send anything. No claim of live automation or enforced delivery idempotency is made: the semantic key must later be backed by a unique durable attempt fence, never a read-only list alone.

Next implementation must connect trusted current order/contact/consent/template evidence to this policy, persist scheduled intents under existing privacy locks, implement purpose-specific verified consent capture using existing signed-inbound infrastructure (do not reinterpret checkout consent), and integrate the existing delivery infrastructure with send-time rechecks, durable uncertain-attempt protection and receipts. Add privacy cleanup of any future intents and verify uninstall fencing. No post-purchase consent grant is synthesized here. Actual recipient-specific preview, merchant activation and separately authorized delivery acceptance remain pending.

No migrations applied, Shopify orders/checkouts created, recovery tests repeated, environment flags changed, production changes, merge, deployment or customer messages.
