/**
 * ghlSync.ts — Outbound sync layer: WhachatCRM → GoHighLevel (LeadConnector)
 *
 * Exports:
 *  - GHL_TO_CRM_STAGE_MAP       — used by ghlRoutes.ts for inbound stage mapping
 *  - GHL_STATUS_TO_CRM_STAGE    — used by ghlRoutes.ts for inbound status → stage
 *  - CRM_TO_GHL_STAGE_MAP       — used here for outbound stage mapping
 *  - GHL_PRIMARY_PIPELINE_NAME  — single primary pipeline for sync
 *  - ghlSyncContactFields       — push name/email/phone/tags to GHL contact
 *  - ghlSyncOutboundMessage     — mirror outbound message to GHL conversation
 *  - ghlSyncPipelineStage       — create/update GHL opportunity when stage changes
 *
 * All public functions are fire-and-forget: they log failures and record them
 * in ghl_sync_failures for admin visibility, but never throw.
 *
 * Retry: each GHL API call is wrapped in withRetry() — up to 3 attempts with
 * 1 s / 2 s / 4 s exponential backoff before logging the failure permanently.
 *
 * Loop prevention: callers (PATCH /api/contacts/:id) perform a diff check and
 * only invoke these functions when a field value actually changed. The
 * ghlRoutes.ts webhook path calls storage directly and never passes through the
 * API route, so GHL-originated changes cannot reach these sync functions.
 */

import { storage } from './storage';

export const GHL_PRIMARY_PIPELINE_NAME = 'Real Estate AI Pipeline';

/** Exact mapping GHL stage name → WhachatCRM pipelineStage (used inbound) */
export const GHL_TO_CRM_STAGE_MAP: Record<string, string> = {
  'New Lead': 'New Lead',
  'AI Engaged': 'AI Engaged',
  'Warm Lead': 'Warm Lead',
  'Qualified': 'Qualified',
  'Appointment Booked': 'Appointment Booked',
  'Lost': 'Lost',
  'Closed Won': 'Closed',
  'Closed Lost': 'Unqualified',
};

/** GHL opportunity status overrides (checked before stage name — terminal states) */
export const GHL_STATUS_TO_CRM_STAGE: Record<string, string> = {
  won: 'Closed',
  lost: 'Unqualified',
  abandoned: 'Unqualified',
};

/** Exact mapping WhachatCRM pipelineStage → GHL stage name (used outbound) */
const CRM_TO_GHL_STAGE_MAP: Record<string, string> = {
  'New Lead': 'New Lead',
  'AI Engaged': 'AI Engaged',
  'Warm Lead': 'Warm Lead',
  'Qualified': 'Qualified',
  'Appointment Booked': 'Appointment Booked',
  'Lost': 'Lost',
  'Closed': 'Closed Won',
  'Unqualified': 'Closed Lost',
};

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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
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

// ── Retry + failure logging ───────────────────────────────────────────────────

interface FailureInfo {
  userId: string;
  entityType: string;
  entityId?: string;
  ghlContactId?: string;
  operation: string;
  payload?: Record<string, any>;
}

/** Exponential backoff: 1 s, 2 s, 4 s */
const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function withRetry<T>(
  fn: () => Promise<T>,
  failureInfo: FailureInfo,
): Promise<T | null> {
  let lastError: any;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  // All attempts exhausted — log to ghl_sync_failures
  try {
    await storage.createGhlSyncFailure({
      userId: failureInfo.userId,
      entityType: failureInfo.entityType,
      entityId: failureInfo.entityId ?? null,
      ghlContactId: failureInfo.ghlContactId ?? null,
      operation: failureInfo.operation,
      payload: failureInfo.payload ?? {},
      errorMessage: String(lastError?.message ?? lastError).substring(0, 500),
      retryCount: RETRY_DELAYS_MS.length,
      nextRetryAt: null,
      resolvedAt: null,
    });
  } catch (logErr) {
    console.error('[GHLSync] Failed to log sync failure:', logErr);
  }
  return null;
}

/** Wrap a fetch call: throw on non-2xx so withRetry can catch and retry */
async function ghlFetch(url: string, options: RequestInit): Promise<any> {
  const resp = await fetch(url, options);
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GHL API ${resp.status}: ${body.substring(0, 300)}`);
  }
  return resp.json().catch(() => ({}));
}

// ── Pipeline cache (per integration, stored in config) ───────────────────────

interface PipelineStage { id: string; name: string; }
interface Pipeline { id: string; name: string; stages: PipelineStage[]; }

async function getPrimaryPipeline(
  integration: any,
  token: string,
): Promise<Pipeline | null> {
  const locationId: string | undefined = (integration.config as any)?.locationId;
  if (!locationId) {
    console.warn('[GHLSync] No locationId on integration — cannot fetch pipelines');
    return null;
  }

  // Use cache if still fresh (1 hour)
  const cached = (integration.config as any)?._pipelineCache as { ts: number; pipeline: Pipeline } | undefined;
  if (cached && Date.now() - cached.ts < 3_600_000) return cached.pipeline;

  try {
    const data = await ghlFetch(
      `${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: '2021-07-28',
        },
      },
    );

    const pipelines: Pipeline[] = data.pipelines ?? [];
    const pipeline = pipelines.find(p => p.name === GHL_PRIMARY_PIPELINE_NAME);

    if (!pipeline) {
      console.warn(
        `[GHLSync] Pipeline "${GHL_PRIMARY_PIPELINE_NAME}" not found in location ${locationId}. ` +
        `Available: [${pipelines.map(p => `"${p.name}"`).join(', ')}]. ` +
        `Opportunity sync skipped — fix GHL pipeline name or update GHL_PRIMARY_PIPELINE_NAME.`,
      );
      return null;
    }

    // Cache in integration config (best-effort — don't fail sync on cache write error)
    await storage.updateIntegration(integration.id, {
      config: {
        ...(integration.config as any),
        _pipelineCache: { ts: Date.now(), pipeline },
      },
    }).catch(() => {});

    return pipeline;
  } catch (e) {
    console.error('[GHLSync] Failed to fetch GHL pipelines:', e);
    return null;
  }
}

// ── Contact field sync ────────────────────────────────────────────────────────

export interface GhlContactFields {
  name?: string;
  email?: string;
  phone?: string;
  /** Mapped from WhachatCRM contact.tag — sent as single-element tags array */
  tags?: string[];
}

/**
 * Push one or more contact fields (name, email, phone, tags) to the GHL
 * contact record in a single PUT request.
 * Only call with fields that actually changed (diff-checked by the caller).
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

    const payload: Record<string, any> = {};
    if (fields.name !== undefined) {
      const parts = fields.name.trim().split(/\s+/);
      payload.firstName = parts[0] ?? '';
      payload.lastName = parts.slice(1).join(' ') || undefined;
    }
    if (fields.email !== undefined) payload.email = fields.email;
    if (fields.phone !== undefined) payload.phone = fields.phone;
    if (fields.tags !== undefined) payload.tags = fields.tags;

    await withRetry(
      () => ghlFetch(`${GHL_API_BASE}/contacts/${ghlContactId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify(payload),
      }),
      {
        userId,
        entityType: 'contact',
        ghlContactId,
        operation: 'sync_contact_fields',
        payload: { fields: Object.keys(fields) },
      },
    );

    console.log(
      `[GHLSync] Contact synced → GHL contact: ${ghlContactId} — fields: [${Object.keys(fields).join(', ')}]`,
    );
  } catch (e) {
    console.error('[GHLSync] Error syncing contact fields:', e);
  }
}

// ── Outbound message sync ─────────────────────────────────────────────────────

/**
 * Mirror an outbound message sent from WhachatCRM to the GHL conversation feed.
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

    await withRetry(
      () => ghlFetch(`${GHL_API_BASE}/conversations/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Version: '2021-04-15',
        },
        body: JSON.stringify({ type: 'Custom', contactId: ghlContactId, message: content }),
      }),
      {
        userId,
        entityType: 'message',
        ghlContactId,
        operation: 'sync_outbound_message',
        payload: { preview: content.substring(0, 100) },
      },
    );

    console.log(`[GHLSync] Outbound message synced → GHL contact: ${ghlContactId}`);
  } catch (e) {
    console.error('[GHLSync] Error syncing outbound message:', e);
  }
}

// ── Pipeline stage sync ───────────────────────────────────────────────────────

/**
 * Create or update a GHL opportunity to reflect a WhachatCRM pipelineStage change.
 *
 * @param userId          WhachatCRM user ID
 * @param contactId       WhachatCRM contact ID (used to store opportunityId back)
 * @param ghlContactId    GHL contact ID
 * @param crmStage        WhachatCRM pipelineStage value (e.g. "Qualified")
 */
export async function ghlSyncPipelineStage(
  userId: string,
  contactId: string,
  ghlContactId: string,
  crmStage: string,
): Promise<void> {
  // Map CRM stage → GHL stage name (explicit only — no fuzzy matching)
  const ghlStageName = CRM_TO_GHL_STAGE_MAP[crmStage];
  if (!ghlStageName) {
    console.warn(
      `[GHLSync] Unmapped CRM stage "${crmStage}" — opportunity sync skipped. ` +
      `Add to CRM_TO_GHL_STAGE_MAP to enable this stage.`,
    );
    return;
  }

  try {
    const integration = await getGhlIntegration(userId);
    if (!integration) return;
    const token = await getValidToken(integration);
    if (!token) return;

    // Resolve pipeline + stage IDs
    const pipeline = await getPrimaryPipeline(integration, token);
    if (!pipeline) return; // Warning already logged in getPrimaryPipeline

    const stage = pipeline.stages.find(s => s.name === ghlStageName);
    if (!stage) {
      console.warn(
        `[GHLSync] Stage "${ghlStageName}" not found in pipeline "${GHL_PRIMARY_PIPELINE_NAME}". ` +
        `Available stages: [${pipeline.stages.map(s => `"${s.name}"`).join(', ')}]. Sync skipped.`,
      );
      return;
    }

    // Read current ghlOpportunityId from contact.customFields
    const contact = await storage.getContact(contactId);
    const existingOpportunityId: string | undefined =
      (contact?.customFields as any)?.ghlOpportunityId;

    if (existingOpportunityId) {
      // Update existing opportunity stage
      await withRetry(
        () => ghlFetch(`${GHL_API_BASE}/opportunities/${existingOpportunityId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28',
          },
          body: JSON.stringify({ pipelineStageId: stage.id }),
        }),
        {
          userId,
          entityType: 'opportunity',
          entityId: existingOpportunityId,
          ghlContactId,
          operation: 'sync_pipeline_stage',
          payload: { crmStage, ghlStageName, pipelineStageId: stage.id },
        },
      );
      console.log(
        `[GHLSync] Opportunity ${existingOpportunityId} stage → "${ghlStageName}" for contact ${ghlContactId}`,
      );
    } else {
      // Create new opportunity
      const locationId = (integration.config as any)?.locationId;
      const data = await withRetry(
        () => ghlFetch(`${GHL_API_BASE}/opportunities/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Version: '2021-07-28',
          },
          body: JSON.stringify({
            pipelineId: pipeline.id,
            pipelineStageId: stage.id,
            contactId: ghlContactId,
            locationId,
            name: contact?.name ?? 'New Opportunity',
            status: 'open',
          }),
        }),
        {
          userId,
          entityType: 'opportunity',
          ghlContactId,
          operation: 'sync_pipeline_stage',
          payload: { crmStage, ghlStageName, pipelineId: pipeline.id, stageId: stage.id },
        },
      );

      const newOpportunityId: string | undefined = data?.opportunity?.id ?? data?.id;
      if (newOpportunityId && contact) {
        // Store ghlOpportunityId on the contact for future updates
        await storage.updateContact(contactId, {
          customFields: {
            ...(contact.customFields as any ?? {}),
            ghlOpportunityId: newOpportunityId,
          },
        });
        console.log(
          `[GHLSync] Created GHL opportunity ${newOpportunityId} (stage "${ghlStageName}") for contact ${ghlContactId}`,
        );
      }
    }
  } catch (e) {
    console.error('[GHLSync] Error syncing pipeline stage:', e);
  }
}
