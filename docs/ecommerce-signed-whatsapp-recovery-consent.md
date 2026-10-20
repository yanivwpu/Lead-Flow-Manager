# Signed WhatsApp checkout reminder opt-in and STOP — staging milestone

**Not live. No customer recovery sends.** This change adds narrow consent
capture in the existing Meta Business API webhook, NOT a Shopify SMS/email
marketing permission conversion.

## Inbound supported commands

The shopper must send the exact text **YES WHATSAPP CHECKOUT REMINDERS** from
the same WhatsApp number as the independently matched Shopify customer.
This expressly names the WhatsApp channel and checkout-reminder purpose.

**STOP**, **STOP CHECKOUT REMINDERS**, and **UNSUBSCRIBE** revoke existing
recovery consent for the verified WhatsApp phone, even when the inbound CRM
contact has not been merged to its Shopify customer.

The affirmative wording must be displayed with a merchant-specific disclosure:
merchant identity, checkout reminder purpose/frequency and opt-out instructions.
The disclosure and consumer-facing activation UI remain release gates. Do NOT
enable the staging flag until those are independently reviewed.

## Security

- Meta X-Hub-Signature-256 over captured raw bytes is mandatory even on staging.
  The preexisting nonproduction webhook verification bypass cannot grant consent.
- Only recent signed text messages, valid Meta WAMIDs, correct merchant
  WhatsApp phone number ID and matching Shopify customer/WhatsApp CRM contact
  can grant. Anonymous/mismatched/cross-tenant contacts fail closed.
- Current Shopify installation is checked under the shop privacy advisory lock.
- Consent stores phone HMAC, signed wamid/timestamp and no raw phone or message.
- STOP suppresses pending outbox entries. A stale YES webhook cannot regrant
  consent after a newer STOP. Later explicit re-opt-in never resurrects a
  previously suppressed send.
- Enabling requires explicit staging-only
  ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED=true (default OFF).
- Inbound capture happens before Meta webhook ACK. Persistence failure returns
  503 for safe Meta webhook replay with timestamp idempotency.

## Schema and remaining gates

Reviewed additive migration (AFTER earlier recovery consent/outbox migration):
migrations/20261020_ecommerce_recovery_signed_inbound_consent.sql

Do not apply to production. Existing signed Shopify customer/shop erasure deletes
the underlying consent records, including new inbound evidence fields.

Before activating recovery: approve customer-facing notice, staging backup and
migration, real Meta inbound and Shopify contact identity test, approved template,
scheduled worker and delivery receipts/reconciliation, merchant self-serve UI,
purchase and STOP test matrix, and explicit release signoff. No outbound sends
or production deployment are included.
