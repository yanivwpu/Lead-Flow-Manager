# Shopify self-service delivery plan

Reviewed against production main `f3dd7b37` and open trackers [#136](https://github.com/yanivwpu/Lead-Flow-Manager/issues/136), [#154](https://github.com/yanivwpu/Lead-Flow-Manager/issues/154), [#151](https://github.com/yanivwpu/Lead-Flow-Manager/issues/151), [#120](https://github.com/yanivwpu/Lead-Flow-Manager/issues/120) and [#76](https://github.com/yanivwpu/Lead-Flow-Manager/issues/76). Older tracker statements are historical evidence, not current runtime approval. Preserve existing passing acceptance results; repeat only checks affected by a change.

## Existing implementation to reuse

| Area | Existing work | Remaining acceptance boundary |
| --- | --- | --- |
| Onboarding | Shopify OAuth, trial/billing and verified first-use state; existing integration setup and sync controls | Bring existing internal support opt-in into the private dashboard. Keep connection and billing distinct from messaging readiness. |
| Order support | Synced order history, Inbox commerce events, duplicate-safe event inbox, merchant opt-in/pause, Follow-ups tasks, completion, assignment and in-app due reminders | Use current quick-start endpoint and task views. No historical task backfill or customer notification implied by turning on internal tasks. |
| Shopping | Catalog, grounded discovery/selection, fresh price/inventory preflight and private preparation | Cart incident is an independent blocked milestone. Execution remains disabled; its consumed shop-wide fence stays intact. |
| Abandoned checkout | Main contains bounded observation, fresh purchase recheck, eligibility and review-intent/privacy foundations; observation/preparation gates are staging-only | Not anonymous cart tracking. Do not activate production readers/workers or infer consent from a checkout. Verify authorized source/scopes, identity and purchase suppression first. |
| Recovery delivery | Tracker #154 records staging consent/outbox/worker/receipt work | Review and selectively reuse that work rather than rebuilding it or merging staging wholesale. Production consent, STOP, approved template/channel, last-boundary suppression, ambiguous outcome handling and controlled recipient acceptance remain separate gates. |
| Post-purchase | Order/fulfillment/cancellation event classification and inactive journey drafts | Drafts are not dispatch. Review existing workflow capabilities, verified event/recipient data and suppression before preparing previews; no automatic send activation. |

## Delivery order

1. **Internal support onboarding:** show the existing localized `ShopifySimpleSetup` on the private dashboard only after authenticated connection status succeeds. Existing explicit opt-in, schema/operator gates, pause and task links stay authoritative. No new API, table, sender or setup wizard. Test unavailable/disconnected/session/grant states and all three locales.
2. **Recovery review readiness:** reconcile existing staging implementation with main and close the source/identity/consent/channel/template gaps in #151/#154/#120. Build on current read-only observation and fresh purchase suppression. Present one clear blocked/ready-to-review state, with messaging still off. Require genuine recipient consent; fixture consent is not production evidence.
3. **Post-purchase previews:** reuse owned events and workflow drafts to preview order, fulfillment and cancellation assistance. Cancel outdated work on purchase/status change, STOP, privacy deletion or uninstall. Merchant preview and explicit opt-in precede any delivery acceptance.
4. **Outbound acceptance and release:** separately authorize one consenting recipient, verify provider receipt and no-resend handling, pause/STOP/purchase/privacy suppression, then approve gradual activation. Audit help/public promises before launch. Keep existing privacy operational gaps in #76 visible; do not equate successful sync with launch readiness.

## Independent cart incident

[The diagnostic/reconciliation reference](shopify-private-cart-execution-diagnostics.md) remains authoritative. Keep the original claim permanently consumed even if its approval expires or a later implementation changes. There is no documented cart lookup by our internal request UUID or time window. A support inquiry is not evidence that no cart exists, nor authorization to retry.

For a future cart test, use the existing owner-confirmed UI and fresh exact-scope approval only after an independent reconciliation/safety decision. Never add an override, reset the index/claim, change the shop spelling, or substitute a request to bypass the original fence. If the current fence disallows another attempt in that shop, do not attempt one there. A separately authorized genuine development installation can be assessed independently, with its own legitimate identity and existing protections; it is not a replacement authorization for the original shop/request. Any broader change to one-attempt policy requires its own explicit design and approval.

Before a separately authorized future attempt, review secure durable outcome/receipt retention using the existing encrypted-receipt facilities and privacy controls. Diagnostic logs deliberately exclude cart IDs/checkout URLs and do not replace recoverable private receipts. Do not create new infrastructure or alter production data as part of this onboarding milestone.
