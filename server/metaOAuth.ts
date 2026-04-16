const GRAPH = "https://graph.facebook.com/v19.0";

const SCOPES = [
  "public_profile",
  "pages_show_list",
  "pages_messaging",
  "pages_manage_metadata",
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

export function buildMetaOAuthUrl(state: string, redirectUri: string): string {
  const appId = process.env.META_APP_ID;
  if (!appId) throw new Error("META_APP_ID is not configured on this server");

  // Standard Facebook Login — shows the page-picker dialog so the user can
  // choose which Pages to grant access to. /me/accounts then returns those
  // pages with their per-page access tokens.
  return (
    `https://www.facebook.com/dialog/oauth` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
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
    paging: data?.paging,
  }));
  if (!resp.ok || !Array.isArray(data.data)) {
    throw new Error(data.error?.message || "Failed to fetch your Facebook Pages");
  }
  return data.data.map((p: any) => ({
    id: p.id as string,
    name: p.name as string,
    category: (p.category as string) || "",
    picture: p.picture?.data?.url as string | undefined,
    accessToken: p.access_token as string,
  }));
}

export async function enrichWithInstagramData(pages: MetaPage[]): Promise<MetaPage[]> {
  return Promise.all(
    pages.map(async (page) => {
      try {
        const resp = await fetch(
          `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.accessToken)}`
        );
        const data = (await resp.json()) as any;
        if (resp.ok && data.instagram_business_account?.id) {
          const igId = data.instagram_business_account.id as string;
          const igResp = await fetch(
            `${GRAPH}/${igId}?fields=id,username&access_token=${encodeURIComponent(page.accessToken)}`
          );
          const igData = (await igResp.json()) as any;
          return {
            ...page,
            instagramAccountId: igId,
            instagramUsername: (igData.username as string) || undefined,
          };
        }
      } catch {
        // Non-fatal — page simply has no linked IG account
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

  // Step 1: Verify token
  try {
    const meResp = await fetch(
      `${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(page.accessToken)}`
    );
    const meData = (await meResp.json()) as any;
    if (!meResp.ok || !meData.id) {
      result.error = meData?.error?.message || "Page access token is invalid";
      result.failedAt = "token";
      return result;
    }
    result.steps.tokenValid = true;
  } catch (e: any) {
    result.error = e.message || "Token validation failed";
    result.failedAt = "token";
    return result;
  }

  // Step 2: Check permissions
  try {
    const permResp = await fetch(
      `${GRAPH}/me/permissions?access_token=${encodeURIComponent(page.accessToken)}`
    );
    const permData = (await permResp.json()) as any;
    if (permResp.ok && Array.isArray(permData?.data)) {
      const granted = permData.data
        .filter((p: any) => p.status === "granted")
        .map((p: any) => p.permission as string);
      const required = REQUIRED_SCOPES[channel] ?? [];
      const missing = required.filter((s) => !granted.includes(s));
      if (missing.length > 0) {
        result.warnings.push(`Some permissions were not granted: ${missing.join(", ")}`);
      }
    }
    result.steps.permissionsOk = true;
  } catch {
    result.steps.permissionsOk = true; // Non-fatal for page tokens
  }

  // Step 3: Subscribe page to webhooks
  try {
    const subFields =
      channel === "instagram"
        ? "messages,messaging_seen,instagram_messages"
        : "messages,messaging_postbacks,messaging_seen,messaging_referrals";
    const subResp = await fetch(
      `${GRAPH}/${encodeURIComponent(page.id)}/subscribed_apps`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `subscribed_fields=${encodeURIComponent(subFields)}&access_token=${encodeURIComponent(page.accessToken)}`,
      }
    );
    const subData = (await subResp.json()) as any;
    if (subResp.ok && subData.success) {
      result.steps.webhookSubscribed = true;
    } else {
      result.warnings.push(
        subData?.error?.message || "Webhook subscription failed — messages may not be received until resolved"
      );
    }
  } catch (e: any) {
    result.warnings.push("Webhook subscription failed: " + (e.message || "unknown error"));
  }

  // Step 4: IG detection (always run for instagram channel; also run for facebook in case IG is linked)
  let instagramAccountId = page.instagramAccountId;
  let instagramUsername = page.instagramUsername;
  if (channel === "instagram" && !instagramAccountId) {
    try {
      const igPageResp = await fetch(
        `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.accessToken)}`
      );
      const igPageData = (await igPageResp.json()) as any;
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
    result.steps.instagramDetected = true; // Not needed for Facebook-only
  }

  result.success = true;
  result.pageId = page.id;
  result.pageName = page.name;
  result.instagramAccountId = instagramAccountId;
  result.instagramUsername = instagramUsername;

  console.log(
    `[MetaOAuth] connectPage userId=${userId} channel=${channel} page=${page.name}(${page.id}) ` +
    `webhookSubscribed=${result.steps.webhookSubscribed} igDetected=${result.steps.instagramDetected}`
  );

  return result;
}
