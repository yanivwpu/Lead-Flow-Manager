# Internal test merchant disclosure

The owner confirmed on October 23, 2026 that the authorized WhatsApp recipient
is their own internal test number. No earlier customer-facing disclosure is
known to have been shown. This is authorization to test; it is not consent
evidence or proof of a Shopify customer identity.

The connected merchant's existing `/app/integrations?setup=shopify` panel now
contains a notice limited to the exact staging hostname and
`whachatcrm.myshopify.com`. The store domain identifies the merchant without
guessing a Shopify display name. The notice states the WhatsApp channel,
unfinished-checkout purpose and link, one reminder for one checkout in this
controlled test, optional consent independent of purchase, possible message/data
rates and STOP. It displays the exact inbound opt-in command after the notice.
Viewing it records nothing and enables no sends. It is English with explicit
LTR direction for this internal test.

Deployment and recipient viewing must be evidenced separately. A rendered unit
test is not evidence that a person saw the deployed notice. Do not ask for the
live YES until the test coordinator has independently verified the exact
merchant/customer/contact mapping, privacy safeguards, schema and staging key.
The owner must read the notice and send the opt-in themselves. Do not invent a
customer identity, alter merchant/contact records or synthesize webhook evidence.

There is no Shopify checkout UI extension or storefront consent widget in this
repository. The CRM notice is an internal staging-test surface, not a disclosure
installed on the merchant's storefront or checkout. For merchant launch, the
same notice must appear in the actual customer journey before the affirmative
choice, near the WhatsApp reminder opt-in on a merchant-controlled cart or
supported checkout extension. Keep it distinct from Shopify email/SMS marketing
preferences. Store-specific sender, frequency, scope and STOP handling need
acceptance before that separate rollout.

Consent capture and all outbound recovery flags remain disabled. No HMAC key
was generated or replaced while identity and live notice acceptance are pending.
