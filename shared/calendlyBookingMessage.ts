const INTERNAL_CALENDLY_TRACKING_PARAMS = [
  "utm_content",
  "utm_campaign",
  "utm_term",
] as const;

const WHACHAT_CALENDLY_UTM_PARAMS = ["utm_source", "utm_medium", ...INTERNAL_CALENDLY_TRACKING_PARAMS] as const;

function stripInternalCalendlyParams(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (!url.hostname.toLowerCase().includes("calendly.com")) return rawUrl;
    for (const key of WHACHAT_CALENDLY_UTM_PARAMS) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export function sanitizeCalendlyBookingLinks(content: string): { content: string; calendlyUrls: string[] } {
  if (!content || !/calendly\.com/i.test(content)) return { content, calendlyUrls: [] };
  const calendlyUrls: string[] = [];
  const next = content.replace(/https?:\/\/[^\s<>"')]+/gi, (raw) => {
    const trailing = raw.match(/[.,!?;:]+$/)?.[0] || "";
    const url = trailing ? raw.slice(0, -trailing.length) : raw;
    const clean = stripInternalCalendlyParams(url);
    if (/calendly\.com/i.test(clean)) {
      calendlyUrls.push(clean);
    }
    return `${clean}${trailing}`;
  });
  return {
    content: next.replace(
      /(https?:\/\/[^\s<>"')]*calendly\.com[^\s<>"')]*)\s+((?:I['’]ll) make sure we have the right details ready\.)/i,
      "$1\n\nI’ll make sure we have the right details ready."
    ),
    calendlyUrls,
  };
}

export function formatBookingMessage(calendlyUrl: string): string {
  const cleanUrl = stripInternalCalendlyParams(calendlyUrl.trim());
  return `Sure — you can pick a time here:\n${cleanUrl}\n\nI’ll make sure we have the right details ready.`;
}

export function containsInternalCalendlyTracking(value: string): boolean {
  return INTERNAL_CALENDLY_TRACKING_PARAMS.some((key) => value.includes(key));
}
