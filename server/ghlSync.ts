/**
 * ghlSync.ts — Minimal outbound sync from WhachatCRM → GoHighLevel (LeadConnector)
 *
 * Two operations:
 *  1. ghlSyncOutboundMessage — mirrors an outbound message to the GHL conversation feed
 *  2. ghlSyncContactTags    — updates contact tags on the GHL contact record
 *
 * Both are fire-and-forget: they log on failure but never throw so they can't
 * break the primary request/send flow.
 */

import { storage } from './storage';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_TOKEN_URL = `${GHL_API_BASE}/oauth/token`;

async function getGhlIntegration(userId: string): Promise<any | null> {
  try {
    const integrations = await storage.getIntegrations(userId);
    return integrations.find(
      (i: any) => i.type === 'gohighlevel' && i.isActive && i.accessToken
    ) ?? null;
  } catch {
    return null;
  }
}

async function getValidToken(integration: any): Promise<string | null> {
  const isExpired =
    integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date();

  if (!isExpired) return integration.accessToken as string;

  const clientId = process.env.GHL_CLIENT_ID ?? '';
  const clientSecret = process.env.GHL_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret || !integration.refreshToken) {
    console.warn('[GHLSync] Cannot refresh token — missing credentials or refresh token');
    return null;
  }

  try {
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
    });

    const resp = await fetch(GHL_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    const data = (await resp.json()) as any;

    if (resp.ok && data.access_token) {
      await storage.updateIntegration(integration.id, {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? integration.refreshToken,
        tokenExpiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000),
        lastSyncAt: new Date(),
      });
      console.log('[GHLSync] Token refreshed for integration:', integration.id);
      return data.access_token as string;
    }

    console.warn('[GHLSync] Token refresh failed:', resp.status, data?.error);
    return null;
  } catch (e) {
    console.error('[GHLSync] Token refresh error:', e);
    return null;
  }
}

/**
 * Mirror an outbound message sent from WhachatCRM to the GHL conversation feed.
 * Uses the GHL Conversations Messages API.
 */
export async function ghlSyncOutboundMessage(
  userId: string,
  ghlContactId: string,
  content: string,
  _channel: string,
): Promise<void> {
  try {
    const integration = await getGhlIntegration(userId);
    if (!integration) return;

    const token = await getValidToken(integration);
    if (!token) return;

    const resp = await fetch(`${GHL_API_BASE}/conversations/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-04-15',
      },
      body: JSON.stringify({
        type: 'Custom',
        contactId: ghlContactId,
        message: content,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(
        `[GHLSync] Outbound message sync failed (${resp.status}): ${errText.substring(0, 200)}`
      );
    } else {
      console.log(`[GHLSync] Outbound message synced → GHL contact: ${ghlContactId}`);
    }
  } catch (e) {
    console.error('[GHLSync] Error syncing outbound message:', e);
  }
}

/**
 * Push updated tags from WhachatCRM to the GHL contact record.
 * Uses the GHL Contacts API PUT endpoint.
 */
export async function ghlSyncContactTags(
  userId: string,
  ghlContactId: string,
  tags: string[],
): Promise<void> {
  try {
    const integration = await getGhlIntegration(userId);
    if (!integration) return;

    const token = await getValidToken(integration);
    if (!token) return;

    const resp = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      body: JSON.stringify({ tags }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(
        `[GHLSync] Tag sync failed (${resp.status}): ${errText.substring(0, 200)}`
      );
    } else {
      console.log(
        `[GHLSync] Tags synced → GHL contact: ${ghlContactId} — [${tags.join(', ')}]`
      );
    }
  } catch (e) {
    console.error('[GHLSync] Error syncing contact tags:', e);
  }
}
