# Shopify Growth Engine: automatic WhatsApp setup

Connect Shopify and your own WhatsApp Business Account, then install the E-Commerce Growth Engine. Automatic setup becomes available when your store is included in the rollout.

1. Open **Growth Engine → Setup** or **Post-Purchase**.
2. Select **Set up my messages**. This permits template management in your connected WhatsApp account. It does not permit customer sending or create customer consent.
3. WhachatCRM checks your account, reuses compatible approved English messages and submits missing messages to Meta. You can leave the page while approval continues.
4. Choose the order journeys you want. Compatible approved messages are saved in your WhatsApp Library and assigned automatically. Existing selections are preserved.
5. When delivery becomes available, select **Enable selected post-purchase journeys** or **Enable checkout reminders** separately. Only eligible customers with consent for that message purpose can receive them. Use **Pause** to stop a delivery preference. Pause post-purchase delivery before adding another purpose.

The initial package contains order confirmation, shipping update and order cancellation messages in Meta's Utility category, plus a Marketing checkout reminder. All submissions use English. Spanish and Hebrew setup screens, including Hebrew RTL, are supported; changing the interface language does not submit translated templates.

Review requests, repeat-purchase offers and win-back journeys keep their existing configured messages, timing and separate Marketing consent requirements. Automatic setup does not invent messages for those purposes.

| Status | Meaning / next action |
| --- | --- |
| Ready | Meta has approved a compatible message in your connected account and it is assigned. Sending still requires activation and delivery eligibility. |
| Awaiting Meta approval | No action is normally needed. We check again automatically. |
| Action required | Read the explanation. Renew an expired WhatsApp connection or grant template-management permission when requested. A rejected, recategorized or conflicting message requires review. |
| Unavailable | A connection, eligible installation, rollout release or verification is missing. This does not mean sending is active. |
| Active | The selected delivery path has the required release controls and merchant preference enabled. Each recipient still passes consent, suppression, current order/checkout and live template checks. |
| Paused | The delivery preference is paused, Meta paused/disabled the message, or you cleared its selection. |

## Troubleshooting

- **Meta is still reviewing a message:** WhachatCRM cannot approve it for Meta. Do not create another copy. Setup checks status in the background.
- **Expired connection or missing permission:** Open the WhatsApp connection in Settings. Renew the connection with the appropriate business permission. Existing bindings and submission history remain saved for the same account.
- **Changed WhatsApp account:** Authorize setup for the newly connected account. Another WABA's approval does not transfer. New delivery authorization is tied to the connected account and installation.
- **A message with this name already exists:** WhachatCRM preserves it. A compatible approved message can be reused; an incompatible or rejected definition needs attention. Use the WhatsApp Library for inspection. Visit Meta only when the provider requires a review or correction.
- **Submission could not be confirmed:** WhachatCRM checks Meta again without submitting a duplicate. Support must establish the provider outcome before considering any further submission.
- **A cleared message returns:** Automatic setup now respects a cleared Post-Purchase selection as paused. Select an approved message in Post-Purchase to resume that binding.
- **The message is ready but activation is unavailable:** Template approval alone is insufficient. The delivery release, schema, selected journeys and current provider checks must also pass. Recipient consent is checked separately at delivery; Shopify email/SMS preferences do not grant WhatsApp permission.

Checkout reminders never send after a completed purchase or without verified recipient-specific WhatsApp checkout-reminder opt-in. STOP/unsubscribe, deletion requests, invalid contacts and duplicate protection remain enforced. Do not send real customer test messages to troubleshoot setup.
