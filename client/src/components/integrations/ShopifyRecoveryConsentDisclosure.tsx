import React from "react";

const STAGING_HOST = "whachatcrm-staging-app-staging.up.railway.app";
const TEST_SHOP = "whachatcrm.myshopify.com";

/** Viewing the notice never records consent or enables customer messaging. */
export function ShopifyRecoveryConsentDisclosure({ shop, hostname = typeof window === "undefined" ? "" : window.location.hostname }: {
  shop: string | null;
  hostname?: string;
}) {
  if (hostname !== STAGING_HOST || shop !== TEST_SHOP) return null;
  return (
    <section lang="en" dir="ltr" className="rounded-xl border border-slate-200 bg-white p-4 text-sm space-y-3"
      data-testid="shopify-recovery-consent-disclosure">
      <h3 className="font-semibold text-slate-900">WhatsApp checkout reminders — internal staging test</h3>
      <p className="text-slate-700">
        By opting in, you agree to receive WhatsApp messages from {TEST_SHOP} about your unfinished checkout,
        including reminders and a link to complete your purchase. For this controlled test, you may receive
        one reminder about one unfinished checkout. Consent is optional and not required to buy.
        Message and data rates may apply. Reply STOP to opt out.
      </p>
      <p className="text-slate-600">
        Once the test coordinator confirms setup is ready, opt in from your authorized WhatsApp test number
        by sending <strong>YES WHATSAPP CHECKOUT REMINDERS</strong> to the connected test business number.
      </p>
      <p className="text-xs text-slate-500">
        Reading this notice does not opt you in. Outbound checkout reminders remain disabled until a separate test is approved.
      </p>
    </section>
  );
}
