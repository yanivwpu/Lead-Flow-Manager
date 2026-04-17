const GRAPH = "https://graph.facebook.com/v19.0";

const BASE_SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
  "business_management",
];

const INSTAGRAM_EXTRA_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
];

const SCOPES = BASE_SCOPES.join(",");
const INSTAGRAM_SCOPES = [...BASE_SCOPES, ...INSTAGRAM_EXTRA_SCOPES].join(",");

export interface MetaPage {
  id: string;
  name: string;
  category: string;
  picture?: string;
  accessToken: string;
  instagramAccountId?: string;
  instagramUsername?: string;
}

export interface ConnectPageResult {
  success: boolean;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  steps: {
    tokenValid: boolean;
    permissionsOk: boolean;
    webhookSubscribed: boolean;
    instagramDetected: boolean;
  };
  warnings: string[];
  error?: string;
  failedAt?: string;
}

export function buildMetaOAuthUrl(state: string, redirectUri: string, channel: "facebook" | "instagram" = "facebook"): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID is not configured on this server");

  const scopes = channel === "instagram" ? INSTAGRAM_SCOPES : SCOPES;
  console.log(`[Meta OAuth] Building auth URL — channel: ${channel}, scopes: ${scopes}`);

  return (
    `https://www.facebook.com/dialog/oauth` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${encodeURIComponent(state)}` +
    `&response_type=code`
  );
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const url =
    `${GRAPH}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code=${encodeURIComponent(code)}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as any;
  if (!resp.ok || !data.access_token) {
    throw new Error(data.error?.message || "Failed to exchange code for access token");
  }
  return data.access_token as string;
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<string> {
  const appId = process.env.META_APP_ID!;
  const appSecret = process.env.META_APP_SECRET!;
  const url =
    `${GRAPH}/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortToken)}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as any;
  if (!resp.ok || !data.access_token) return shortToken; // Non-fatal — keep short-lived
  return data.access_token as string;
}

export async function fetchUserPages(userToken: string): Promise<MetaPage[]> {
  // First debug the token to understand what permissions were actually granted
  const debugUrl = `${GRAPH}/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(process.env.META_APP_ID + '|' + process.env.META_APP_SECRET)}`;
  try {
    const debugResp = await fetch(debugUrl);
    const debugData = (await debugResp.json()) as any;
    console.log('[Meta OAuth] Token debug:', JSON.stringify({
      app_id: debugData?.data?.app_id,
      type: debugData?.data?.type,
      scopes: debugData?.data?.scopes,
      is_valid: debugData?.data?.is_valid,
      error: debugData?.data?.error,
    }));
  } catch (e) {
    console.warn('[Meta OAuth] Token debug failed (non-fatal):', e);
  }

  // --- Try /me/accounts first (works for pages directly administered by the personal FB account) ---
  const url =
    `${GRAPH}/me/accounts` +
    `?fields=id,name,category,picture,access_token` +
    `&access_token=${encodeURIComponent(userToken)}` +
    `&limit=50`;
  const resp = await fetch(url);
  const data = (await resp.json()) as any;
  console.log('[Meta OAuth] /me/accounts raw response:', JSON.stringify({
    status: resp.status,
    data_length: Array.isArray(data?.data) ? data.data.length : 'not-array',
    error: data?.error,
  }));
  if (resp.ok && Array.isArray(data.data) && data.data.length > 0) {
    return data.data.map((p: any) => ({
      id: p.id as string,
      name: p.name as string,
      category: (p.category as string) || "",
      picture: p.picture?.data?.url as string | undefined,
      accessToken: p.access_token as string,
    }));
  }

  // --- Fallback: Business Portfolio pages (pages managed via Meta Business Suite) ---
  console.log('[Meta OAuth] /me/accounts returned 0 pages — trying Business Portfolio API fallback');
  try {
    const bizResp = await fetch(
      `${GRAPH}/me/businesses?fields=id,name&access_token=${encodeURIComponent(userToken)}&limit=10`
    );
    const bizData = (await bizResp.json()) as any;
    console.log('[Meta OAuth] /me/businesses response:', JSON.stringify({
      status: bizResp.status,
      biz_count: Array.isArray(bizData?.data) ? bizData.data.length : 'not-array',
      error: bizData?.error,
    }));

    if (bizResp.ok && Array.isArray(bizData?.data) && bizData.data.length > 0) {
      const allPages: MetaPage[] = [];
      for (const biz of bizData.data) {
        try {
          const pagesResp = await fetch(
            `${GRAPH}/${biz.id}/owned_pages?fields=id,name,category,picture,access_token&access_token=${encodeURIComponent(userToken)}&limit=50`
          );
          const pagesData = (await pagesResp.json()) as any;
          console.log(`[Meta OAuth] Business ${biz.id} owned_pages:`, JSON.stringify({
            status: pagesResp.status,
            count: Array.isArray(pagesData?.data) ? pagesData.data.length : 'not-array',
            error: pagesData?.error,
          }));
          if (pagesResp.ok && Array.isArray(pagesData?.data)) {
            for (const p of pagesData.data) {
              if (p.access_token) {
                allPages.push({
                  id: p.id as string,
                  name: p.name as string,
                  category: (p.category as string) || "",
                  picture: p.picture?.data?.url as string | undefined,
                  accessToken: p.access_token as string,
                });
              }
            }
          }
        } catch (e) {
          console.warn(`[Meta OAuth] Failed to fetch pages for business ${biz.id}:`, e);
        }
      }
      if (allPages.length > 0) {
        console.log(`[Meta OAuth] Business Portfolio fallback found ${allPages.length} page(s)`);
        return allPages;
      }
    }
  } catch (e) {
    console.warn('[Meta OAuth] Business Portfolio fallback failed:', e);
  }

  if (!resp.ok || !Array.isArray(data.data)) {
    throw new Error(data.error?.message || "Failed to fetch your Facebook Pages");
  }
  return [];
}

export async function enrichWithInstagramData(pages: MetaPage[]): Promise<MetaPage[]> {
  return Promise.all(
    pages.map(async (page) => {
      try {
        const resp = await fetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.accessToken)}`
        );
        const data = (await resp.json()) as any;
        console.log(`[Meta OAuth] enrichWithInstagramData — page "${page.name}" (${page.id}): ig_id=${data.instagram_business_account?.id ?? 'none'} ok=${resp.ok} err=${JSON.stringify(data.error ?? null)}`);
        if (resp.ok && data.instagram_business_account?.id) {
          const igId = data.instagram_business_account.id as string;
          const igResp = await fetch(
            `${GRAPH}/${igId}?fields=id,username&access_token=${encodeURIComponent(page.accessToken)}`
          );
          const igData = (await igResp.json()) as any;
          console.log(`[Meta OAuth] enrichWithInstagramData — IG profile fetch for ${igId}: username=${igData.username ?? 'unknown'}`);
          return {
            ...page,
            instagramAccountId: igId,
            instagramUsername: (igData.username as string) || undefined,
          };
        }
      } catch (e) {
        console.warn(`[Meta OAuth] enrichWithInstagramData — failed for page "${page.name}":`, e);
      }
      return page;
    })
  );
}

export async function connectPage(
  userId: string,
  channel: "facebook" | "instagram",
  page: MetaPage
): Promise<ConnectPageResult> {
  const result: ConnectPageResult = {
    success: false,
    steps: { tokenValid: false, permissionsOk: false, webhookSubscribed: false, instagramDetected: false },
    warnings: [],
  };

  const REQUIRED_SCOPES: Record<string, string[]> = {
    facebook: ["pages_messaging", "pages_manage_metadata"],
    instagram: ["pages_show_list", "pages_messaging"],
  };

  // Step 1 + 2: Verify token AND check scopes using /debug_token with the APP access token.
  // This uses app-level credentials (APP_ID|APP_SECRET), so it requires NO page permissions.
  // It is the correct Meta-compliant way to inspect any token.
  const appToken = `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`;
  const debugEndpoint = `${GRAPH}/debug_token?input_token=<page_token>&access_token=<app_token>`;
  console.log(`[MetaOAuth] Step 1: GET ${debugEndpoint}`);
  try {
    const debugResp = await fetch(
      `${GRAPH}/debug_token` +
      `?input_token=${encodeURIComponent(page.accessToken)}` +
      `&access_token=${encodeURIComponent(appToken)}`
    );
    const debugData = (await debugResp.json()) as any;
    const td = debugData?.data ?? {};
    console.log(`[MetaOAuth] debug_token result:`, JSON.stringify({
      is_valid: td.is_valid,
      type: td.type,
      app_id: td.app_id,
      scopes: td.scopes,
      granular_scopes: td.granular_scopes,
      error: td.error ?? debugData?.error,
    }));

    if (!debugResp.ok || !td.is_valid) {
      const errMsg = td.error?.message ?? debugData?.error?.message ?? "Page access token is invalid or expired";
      result.error = errMsg;
      result.failedAt = "token";
      return result;
    }
    result.steps.tokenValid = true;

    // Step 2: Scopes come directly from the debug response — no extra API call needed.
    // For page tokens, scopes list shows permissions on the token.
    const grantedScopes: string[] = Array.isArray(td.scopes) ? td.scopes : [];
    const required = REQUIRED_SCOPES[channel] ?? [];
    const missing = required.filter((s) => !grantedScopes.includes(s));
    console.log(`[MetaOAuth] Step 2: granted=${grantedScopes.join(",") || "(none)"} required=${required.join(",")} missing=${missing.join(",") || "none"}`);
    if (missing.length > 0) {
      result.warnings.push(`Missing permissions: ${missing.join(", ")} — some features may not work`);
    }
    result.steps.permissionsOk = true;
  } catch (e: any) {
    result.error = e.message || "Token verification failed";
    result.failedAt = "token";
    return result;
  }

  // Step 3: Subscribe page to webhooks.
  // Endpoint: POST /{page_id}/subscribed_apps
  // Fields: messages only (pages_manage_metadata is sufficient; no pages_read_engagement needed)
  const subEndpoint = `${GRAPH}/${page.id}/subscribed_apps`;
  console.log(`[MetaOAuth] Step 3: POST ${subEndpoint} subscribed_fields=messages`);
  try {
    const subResp = await fetch(subEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `subscribed_fields=messages&access_token=${encodeURIComponent(page.accessToken)}`,
    });
    const subData = (await subResp.json()) as any;
    console.log(`[MetaOAuth] subscribed_apps response:`, JSON.stringify({
      http_status: subResp.status,
      success: subData?.success,
      error_code: subData?.error?.code,
      error_type: subData?.error?.type,
      error_message: subData?.error?.message,
    }));
    if (subResp.ok && subData.success) {
      result.steps.webhookSubscribed = true;
    } else {
      result.warnings.push(
        `Webhook subscription failed [${subData?.error?.code ?? subResp.status}]: ` +
        (subData?.error?.message ?? "unknown — messages may not arrive until resolved")
      );
    }
  } catch (e: any) {
    result.warnings.push("Webhook subscription failed: " + (e.message || "unknown error"));
  }

  // Step 4: Instagram detection — only for instagram channel, all via the page token.
  // Fields requested: instagram_business_account (id only) — no broad metadata needed.
  let instagramAccountId = page.instagramAccountId;
  let instagramUsername = page.instagramUsername;
  if (channel === "instagram" && !instagramAccountId) {
    const igEndpoint = `${GRAPH}/${page.id}?fields=instagram_business_account`;
    console.log(`[MetaOAuth] Step 4: GET ${igEndpoint}`);
    try {
      const igPageResp = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.accessToken)}`
      );
      const igPageData = (await igPageResp.json()) as any;
      console.log(`[MetaOAuth] instagram_business_account response:`, JSON.stringify({
        ok: igPageResp.ok,
        status: igPageResp.status,
        ig_id: igPageData?.instagram_business_account?.id,
        error_code: igPageData?.error?.code,
        error: igPageData?.error?.message,
      }));
      if (igPageResp.ok && igPageData.instagram_business_account?.id) {
        instagramAccountId = igPageData.instagram_business_account.id as string;
        const igResp = await fetch(
          `${GRAPH}/${instagramAccountId}?fields=id,username&access_token=${encodeURIComponent(page.accessToken)}`
        );
        const igData = (await igResp.json()) as any;
        instagramUsername = (igData.username as string) || undefined;
        result.steps.instagramDetected = true;
      } else {
        result.warnings.push("No linked Instagram professional account found on this Facebook Page");
      }
    } catch {
      result.warnings.push("Could not detect Instagram account");
    }
  } else if (instagramAccountId) {
    result.steps.instagramDetected = true;
  } else {
    result.steps.instagramDetected = true; // Not required for Facebook-only
  }

  result.success = true;
  result.pageId = page.id;
  result.pageName = page.name;
  result.instagramAccountId = instagramAccountId;
  result.instagramUsername = instagramUsername;

  console.log(
    `[MetaOAuth] connectPage DONE userId=${userId} channel=${channel} ` +
    `page=${page.name}(${page.id}) webhookSubscribed=${result.steps.webhookSubscribed} ` +
    `igDetected=${result.steps.instagramDetected} warnings=${result.warnings.length}`
  );

  return result;
}
