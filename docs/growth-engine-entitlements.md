# Growth Engine pricing and entitlement policy

## Current policy

- Every current and future Growth Engine is **included with Pro** at no additional charge. Growth Engines are not a standalone SKU and have no activation fee.
- Free accounts may browse the catalog and preview benefits. Installing or activating an engine requires the effective Pro entitlement.
- An active Pro account can install an engine directly; no Growth Engine Stripe or Shopify checkout is involved.
- The existing 14-day `pro_ai` trial resolves to the effective `pro` plan with workflows enabled, so installation **is allowed during the trial**, following the same entitlement path as paid Pro.
- When Pro access ends, the entitlement, installation row, onboarding progress, configuration, and data remain stored. Growth Engine workflow execution is denied by the shared runtime entitlement check until Pro is restored.
- Legacy `purchased` field/status names remain in database records for backward compatibility only. They are not evidence of a current standalone product or charge.

## Repository audit and changes

The previous standalone-payment assumption appeared in:

- the pricing-page callout, crawlable pricing output, public product facts, canonical commercial catalog, and Realtor landing structured data;
- English, Spanish, and Hebrew Realtor landing pricing layers, FAQs, final notes, and app locale strings;
- the Growth Engine gallery price strip, badges, CTAs, detail-page requirements, banners, and onboarding completion copy;
- the authenticated Realtor Growth Engine purchase and payment-verification routes, Stripe price/session creation, payment-confirmation handling, and checkout-return behavior;
- the Shopify one-time purchase API/callback and Shopify-only Growth Engine hiding;
- the Stripe webhook branch that fulfilled one-time Growth Engine sessions;
- website-knowledge extraction guidance and tests that taught or asserted the old one-time offer.

The implementation now uses one server-side Pro entitlement decision for installation, activation, and runtime. Historical installations are reconciled and preserved before entitlement denial, while workflow execution pauses when that decision fails.
