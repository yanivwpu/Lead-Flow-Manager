const GRAPH = "https://graph.facebook.com/v19.0";

// ── Facebook Messenger / Pages flow ──────────────────────────────────────────
// Only the three permissions needed for Messenger webhooks + messaging.
const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
].join(",");

// ── Instagram DMs flow ────────────────────────────────────────────────────────
// Instagram DMs route through the Messenger Platform — the same Facebook Login
// scopes are used. instagram_basic / instagram_manage_messages are NOT valid
// Facebook Login OAuth scopes; they are Messenger Platform app-level features
// enabled in the Meta Developer Console, not dialog scopes.
const INSTAGRAM_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "pages_read_engagement",  // needed to read instagram_business_account from the linked Page
].join(",");

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

  const scopes = channel === "instagram" ? INSTAGRAM_SCOPES : FACEBOOK_SCOPES;
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

export async function enrichWithInstagramData(pages: MetaPage[], userAccessToken?: string): Promise<MetaPage[]> {
  // Helper: fetch IG profile (id + username) given an IG account ID and a page token
  async function fetchIgProfile(igId: string, token: string): Promise<{ id: string; username?: string }> {
    try {
      const r = await fetch(`${GRAPH}/${igId}?fields=id,username&access_token=${encodeURIComponent(token)}`);
      const d = (await r.json()) as any;
      return { id: igId, username: (d.username as string) || undefined };
    } catch {
      return { id: igId };
    }
  }

  const enriched = await Promise.all(
    pages.map(async (page) => {
      try {
        // Attempt 1: instagram_business_account (Business accounts)
        // Attempt 2: connected_instagram_account (Creator accounts)
        const resp = await fetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(page.accessToken)}`
        );
        const data = (await resp.json()) as any;
        const igId: string | undefined =
          data.instagram_business_account?.id ||
          data.connected_instagram_account?.id;
        console.log(
          `[Meta OAuth] enrichWithInstagramData — page "${page.name}" (${page.id}): ` +
          `business_ig=${data.instagram_business_account?.id ?? 'none'} ` +
          `creator_ig=${data.connected_instagram_account?.id ?? 'none'} ` +
          `ok=${resp.ok} err=${JSON.stringify(data.error ?? null)}`
        );
        if (resp.ok && igId) {
          const profile = await fetchIgProfile(igId, page.accessToken);
          console.log(`[Meta OAuth] enrichWithInstagramData — IG profile for ${igId}: username=${profile.username ?? 'unknown'}`);
          return { ...page, instagramAccountId: igId, instagramUsername: profile.username };
        }
      } catch (e) {
        console.warn(`[Meta OAuth] enrichWithInstagramData — failed for page "${page.name}":`, e);
      }
      return page;
    })
  );

  // Attempt 3: if no page yielded an IG account and we have a user token,
  // try querying /me/accounts with instagram_business_account + connected_instagram_account fields.
  // This catches accounts where the IG is in the Business Portfolio but the page token lacks the field.
  if (userAccessToken && enriched.every((p) => !p.instagramAccountId)) {
    console.log('[Meta OAuth] enrichWithInstagramData — no IG found via page tokens; trying user-level /me/accounts with IG fields');
    try {
      const r = await fetch(
        `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(userAccessToken)}&limit=50`
      );
      const d = (await r.json()) as any;
      console.log('[Meta OAuth] enrichWithInstagramData — user /me/accounts with IG fields:', JSON.stringify({
        status: r.status,
        count: Array.isArray(d?.data) ? d.data.length : 'not-array',
        error: d?.error,
      }));
      if (r.ok && Array.isArray(d?.data)) {
        for (let i = 0; i < enriched.length; i++) {
          const match = d.data.find((p: any) => p.id === enriched[i].id);
          if (match) {
            const igId: string | undefined =
              match.instagram_business_account?.id ||
              match.connected_instagram_account?.id;
            if (igId) {
              const token = match.access_token || enriched[i].accessToken;
              const profile = await fetchIgProfile(igId, token);
              console.log(`[Meta OAuth] enrichWithInstagramData — user-level IG found for page ${enriched[i].id}: igId=${igId} username=${profile.username ?? 'unknown'}`);
              enriched[i] = { ...enriched[i], instagramAccountId: igId, instagramUsername: profile.username };
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Meta OAuth] enrichWithInstagramData — user-level IG fallback failed:', e);
    }
  }

  return enriched;
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
    facebook: ["pages_manage_metadata", "pages_messaging"],
    instagram: ["pages_show_list", "pages_manage_metadata"],
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
    const igEndpoint = `${GRAPH}/${page.id}?fields=instagram_business_account,connected_instagram_account`;
    console.log(`[MetaOAuth] Step 4: GET ${igEndpoint}`);
    try {
      const igPageResp = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account,connected_instagram_account&access_token=${encodeURIComponent(page.accessToken)}`
      );
      const igPageData = (await igPageResp.json()) as any;
      const detectedIgId: string | undefined =
        igPageData?.instagram_business_account?.id ||
        igPageData?.connected_instagram_account?.id;
      console.log(`[MetaOAuth] IG account detection response:`, JSON.stringify({
        ok: igPageResp.ok,
        status: igPageResp.status,
        business_ig: igPageData?.instagram_business_account?.id,
        creator_ig: igPageData?.connected_instagram_account?.id,
        error_code: igPageData?.error?.code,
        error: igPageData?.error?.message,
      }));
      if (igPageResp.ok && detectedIgId) {
        instagramAccountId = detectedIgId;
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
