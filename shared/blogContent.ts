/** Shared, server-safe bodies for posts whose client and crawler copy must not drift. */
export {
  REALTOR_GROWTH_ENGINE_GUIDE_CONTENT,
  REALTOR_GROWTH_ENGINE_GUIDE_FAQ,
} from "./blog/realtor-growth-engine-complete-guide";
export {
  WHATSAPP_SERVICE_PRICING_OCT_2026_CONTENT,
  WHATSAPP_SERVICE_PRICING_OCT_2026_FAQ,
} from "./blog/whatsapp-service-message-pricing-october-2026";

export const TWILIO_WHATSAPP_SETUP_GUIDE_CONTENT = `
WhatsApp onboarding in WhachatCRM is now guided through Meta Embedded Signup. This keeps setup simple: choose your business, WhatsApp account, and phone number in Meta, then return to WhachatCRM for automatic verification.

## Before You Start

Make sure you are logged into the correct Facebook or Meta admin account. You need admin access to the Meta Business account and WhatsApp Business Account you want to connect.

Your WhatsApp number should be ready for production messaging. Some Meta features may require approval before live customer messaging works.

## Connect WhatsApp

1. Open Settings → Integrations / Channels
2. Click Connect WhatsApp
3. Continue with Meta Embedded Signup
4. Select or create your business account
5. Select your WhatsApp Business Account
6. Select the phone number you want to use
7. Return to WhachatCRM
8. WhachatCRM verifies the connection automatically
9. If multiple numbers exist, choose the number you want connected

## What Happens Next

Once connected, new WhatsApp conversations can route into the unified inbox. Your team can reply, add notes, use templates and follow-ups, and build basic or advanced workflows depending on your plan.

## Billing Transparency

WhachatCRM does not add a markup to Meta conversation pricing. You pay Meta/WhatsApp conversation fees directly based on Meta's pricing model, separate from your WhachatCRM subscription.

## Troubleshooting

If messages do not arrive, check that you used the correct Meta admin account, selected the right WhatsApp Business Account and phone number, and completed any required Meta approval steps. Reconnect the channel if permissions changed.

Need help? Contact support and we can help review the connection status.
`;
