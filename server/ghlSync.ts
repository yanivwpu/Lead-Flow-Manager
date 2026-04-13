/**
 * ghlSync.ts — Outbound sync layer: WhachatCRM → GoHighLevel (LeadConnector)
 *
 * Exports:
 *  - ghlSyncContactFields   — push contact name/email/phone/tags to GHL contact
 *  - ghlSyncOutboundMessage — mirror an outbound message to GHL conversation feed
 *
 * All functions are fire-and-forget: they log on failure but never throw,
 * so they can never break the primary request/send flow.
 *
 * Loop prevention: callers (PATCH /api/contacts/:id) perform a diff check and
 * only invoke these functions when a field value actually changed from the DB.
 * The ghlRoutes.ts webhook path calls storage directly and never goes through
 * the API route, so it cannot trigger these sync functions.
 */

import { storage } from './storage';

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_TOKEN_URL = `${GHL_API_BASE}/oauth/token`;

// ── Token management ──────────────────────────────────────────────────────────

async function getGhlIntegration(userId: string): Promise<any | null> {
  try {
    const integrations = await storage.getIntegrations(userId);
    return (
      integrations.find(
        (i: any) => i.type === 'gohighlevel' && i.isActive && i.accessToken,
      ) ?? null
    );
  } catch {
    return null;
  }
}

async function getValidToken(integration: any): Promise<string | null> {
  const isExpired =
    integration.tokenExpiresAt &&
    new Date(integration.tokenExpiresAt) < new Date();

  if (!isExpired) return integration.accessToken as string;

  const clientId = process.env.GHL_CLIENT_ID ?? '';
  const clientSecret = process.env.GHL_CLIENT_SECRET ?? '';
  if (!clientId || !clientSecret || !integration.refreshToken) {
    console.warn(
      '[GHLSync] Cannot refresh token — missing credentials or refresh token',
    );
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
        tokenExpiresAt: new Date(
          Date.now() + (data.expires_in ?? 86400) * 1000,
        ),
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

// ── Contact field sync ────────────────────────────────────────────────────────

export interface GhlContactFields {
  name?: string;
  email?: string;
  phone?: string;
  /** Mapped from WhachatCRM contact.tag — sent as a single-element tags array */
  tags?: string[];
}

/**
 * Push one or more contact fields (name, email, phone, tags) to the GHL
 * contact record in a single PUT request.
 *
 * Only call this with fields that have actually changed (diff check performed
 * by the caller) to avoid unnecessary API calls and infinite sync loops.
 */
export async function ghlSyncContactFields(
  userId: string,
  ghlContactId: string,
  fields: GhlContactFields,
): Promise<void> {
  if (!Object.keys(fields).length) return;

  try {
    const integration = await getGhlIntegration(userId);
    if (!integration) return;

    const token = await getValidToken(integration);
    if (!token) return;

    // Build GHL contact payload — only include fields that were provided
    const payload: Record<string, any> = {};
    if (fields.name !== undefined) {
      const parts = fields.name.trim().split(/\s+/);
      payload.firstName = parts[0] ?? '';
      payload.lastName = parts.slice(1).join(' ') || undefined;
    }
    if (fields.email !== undefined) payload.email = fields.email;
    if (fields.phone !== undefined) payload.phone = fields.phone;
    if (fields.tags !== undefined) payload.tags = fields.tags;

    const resp = await fetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Version: '2021-07-28',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      console.warn(
        `[GHLSync] Contact field sync failed (${resp.status}): ${errText.substring(0, 200)}`,
      );
    } else {
      console.log(
        `[GHLSync] Contact synced → GHL contact: ${ghlContactId} — fields: [${Object.keys(fields).join(', ')}]`,
      );
    }
  } catch (e) {
    console.error('[GHLSync] Error syncing contact fields:', e);
  }
}

// ── Outbound message sync ─────────────────────────────────────────────────────

/**
 * Mirror an outbound message sent from WhachatCRM to the GHL conversation feed.
 * Uses the GHL Conversations Messages API with type "Custom".
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
        `[GHLSync] Outbound message sync failed (${resp.status}): ${errText.substring(0, 200)}`,
      );
    } else {
      console.log(
        `[GHLSync] Outbound message synced → GHL contact: ${ghlContactId}`,
      );
    }
  } catch (e) {
    console.error('[GHLSync] Error syncing outbound message:', e);
  }
}
