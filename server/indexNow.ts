import { getMarketingRoutes } from "./seo";

const INDEXNOW_KEY = "9726ec610d574c62b33130ba828766eb";
const HOST = "whachatcrm.com";
const KEY_LOCATION = `https://${HOST}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_API = "https://api.indexnow.org/indexnow";

const BLOG_SLUGS = [
  "whatsapp-crm-complete-guide-2025",
  "whatsapp-business-api-vs-business-app",
  "automate-whatsapp-messages-small-business",
  "whatsapp-lead-management-tips",
  "wati-alternatives-comparison",
  "whatsapp-customer-service-best-practices",
  "twilio-whatsapp-setup-guide",
  "whatsapp-drip-campaigns-examples",
];

function buildPublicPages(): string[] {
  const base = `https://${HOST}`;

  const marketing = getMarketingRoutes().map((r) => `${base}${r}`);

  const blog = [
    `${base}/blog`,
    ...BLOG_SLUGS.map((s) => `${base}/blog/${s}`),
  ];

  const extra = [
    `${base}/`,
    `${base}/pricing`,
    `${base}/contact`,
    `${base}/help`,
    `${base}/privacy-policy`,
    `${base}/terms-of-use`,
    `${base}/realtor-growth-engine`,
  ];

  const combined = [...new Set([...extra, ...marketing, ...blog])];
  return combined.filter(
    (u) =>
      !u.includes("/admin") &&
      !u.includes("/dashboard") &&
      !u.includes("/login") &&
      !u.includes("/auth") &&
      !u.includes("/settings") &&
      !u.includes("/api/")
  );
}

export const PUBLIC_PAGES: string[] = buildPublicPages();

const pendingUrls = new Set<string>();
let debounceTimer: NodeJS.Timeout | null = null;
const DEBOUNCE_MS = 5_000;

export async function submitUrls(urls: string | string[]): Promise<void> {
  const list = Array.isArray(urls) ? urls : [urls];
  for (const u of list) pendingUrls.add(u);

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    const batch = Array.from(pendingUrls);
    pendingUrls.clear();
    debounceTimer = null;
    await submitNow(batch);
  }, DEBOUNCE_MS);
}

export async function submitNow(
  urls: string[]
): Promise<{ status: number; body: string; error?: string }> {
  const ts = new Date().toISOString();
  const unique = [...new Set(urls)];

  const payload = {
    host: HOST,
    key: INDEXNOW_KEY,
    keyLocation: KEY_LOCATION,
    urlList: unique,
  };

  try {
    const response = await fetch(INDEXNOW_API, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const body = await response.text();

    console.log(
      `[IndexNow] ${ts} | submitted ${unique.length} URL(s) | HTTP ${response.status} | ${body || "(empty)"}`
    );
    for (const u of unique) console.log(`[IndexNow]   → ${u}`);

    return { status: response.status, body };
  } catch (err: any) {
    console.error(
      `[IndexNow] ${ts} | FAILED | ${err.message} | URLs: ${unique.join(", ")}`
    );
    return { status: 0, body: "", error: err.message };
  }
}

export async function submitAllPublicPages(): Promise<{
  status: number;
  body: string;
  error?: string;
}> {
  console.log(
    `[IndexNow] Submitting all ${PUBLIC_PAGES.length} public pages to IndexNow...`
  );
  return submitNow(PUBLIC_PAGES);
}
