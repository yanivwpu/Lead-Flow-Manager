/** Public URLs for onboarding activation email screenshots (served from client/public/email/activation/). */
export function activationEmailAssetBase(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/email/activation`;
}

export function activationEmailAssets(appUrl: string, options?: { assetBase?: string }) {
  const base = options?.assetBase ?? activationEmailAssetBase(appUrl);
  return {
    /** Day 3 — Settings → Communication Channels */
    channelsPage: `${base}/channels.png`,
    /** Day 3 — Connect WhatsApp modal (Meta Embedded Signup) */
    connectWhatsApp: `${base}/connect-whatsapp.png`,
    /** Day 3 — Meta Embedded Signup welcome screen */
    embeddedSignup: `${base}/embedded-signup.png`,
    /** Day 3 — Meta business asset selection step */
    metaBusinessSelection: `${base}/meta-business-selection.png`,
    /** Day 10 — Unified inbox with AI Copilot, lead score, and Auto mode */
    inbox: `${base}/inbox.png`,
  } as const;
}
