import type { Chat, Contact } from "@shared/schema";
import { storage } from "./storage";
import { decryptIntegrationConfig, encryptIntegrationConfig } from "./integrationConfigCrypto";
import { pushLeadsToHubSpot, type HubSpotLeadRow, normalizePhoneForHubSpot } from "./hubspotSync";
import { isLegacyCalendlyWorkflowChat, LEGACY_CHAT_CALENDLY_PREFIX } from "./userTwilio";

const DEBOUNCE_MS = 120_000;
const HUBSPOT_AUTO_CF_KEY = "hubspotAuto";

type HubSpotAutoCf = {
  lastSyncAt?: string;
  fingerprint?: string;
};

function isCrmContact(x: Contact | Chat): x is Contact {
  return "primaryChannel" in x;
}

function fingerprintForHubSpotFromContact(c: Contact): string {
  const e = (c.email || "").trim().toLowerCase();
  const p = (c.phone || c.whatsappId || "").replace(/\D/g, "");
  return [e, p, c.name || "", c.tag || "", c.pipelineStage || ""].join("|");
}

function contactToLeadRow(c: Contact): HubSpotLeadRow {
  const email = c.email?.trim() || undefined;
  const phone =
    normalizePhoneForHubSpot(c.phone) ||
    normalizePhoneForHubSpot(c.whatsappId) ||
    undefined;
  const name = (c.name || "").trim() || "Lead";
  return {
    email: email || undefined,
    phone,
    name,
    pipelineStage: c.pipelineStage?.trim() || undefined,
    tag: c.tag?.trim() || undefined,
  };
}

function chatToLeadRow(chat: Chat): HubSpotLeadRow {
  const rawPhone = chat.whatsappPhone || "";
  const phoneField = isLegacyCalendlyWorkflowChat(rawPhone)
    ? rawPhone.slice(LEGACY_CHAT_CALENDLY_PREFIX.length)
    : rawPhone;
  const phone = normalizePhoneForHubSpot(phoneField) || undefined;
  const name = (chat.name || "").trim() || "WhatsApp lead";
  return {
    email: undefined,
    phone,
    name,
    pipelineStage: chat.pipelineStage?.trim() || undefined,
    tag: chat.tag?.trim() || undefined,
  };
}

function readHubSpotAutoCf(contact: Contact): HubSpotAutoCf {
  const cf = (contact.customFields as Record<string, unknown> | null) || {};
  const raw = cf[HUBSPOT_AUTO_CF_KEY];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    return {
      lastSyncAt: typeof o.lastSyncAt === "string" ? o.lastSyncAt : undefined,
      fingerprint: typeof o.fingerprint === "string" ? o.fingerprint : undefined,
    };
  }
  return {};
}

function shouldDebounceSkip(contact: Contact, nextFingerprint: string): boolean {
  const { lastSyncAt, fingerprint } = readHubSpotAutoCf(contact);
  if (!lastSyncAt || !fingerprint) return false;
  const t = new Date(lastSyncAt).getTime();
  if (Number.isNaN(t)) return false;
  if (Date.now() - t >= DEBOUNCE_MS) return false;
  return fingerprint === nextFingerprint;
}

async function persistContactHubSpotAutoMeta(contactId: string, fingerprint: string): Promise<void> {
  const fresh = await storage.getContact(contactId);
  if (!fresh) return;
  const prevCf = (fresh.customFields as Record<string, unknown> | null) || {};
  await storage.updateContact(contactId, {
    customFields: {
      ...prevCf,
      [HUBSPOT_AUTO_CF_KEY]: {
        lastSyncAt: new Date().toISOString(),
        fingerprint,
      },
    },
  });
}

async function persistIntegrationAutoSyncMeta(
  integrationId: string,
  rawConfig: Record<string, unknown>,
  patch: { lastHubSpotAutoSyncAt?: string; lastHubSpotAutoSyncError?: { at: string; message: string } | null }
): Promise<void> {
  try {
    const dec = decryptIntegrationConfig(rawConfig) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...dec };
    if (patch.lastHubSpotAutoSyncAt !== undefined) {
      next.lastHubSpotAutoSyncAt = patch.lastHubSpotAutoSyncAt;
    }
    if (patch.lastHubSpotAutoSyncError === null) {
      delete next.lastHubSpotAutoSyncError;
    } else if (patch.lastHubSpotAutoSyncError !== undefined) {
      next.lastHubSpotAutoSyncError = patch.lastHubSpotAutoSyncError;
    }
    await storage.updateIntegration(integrationId, {
      config: encryptIntegrationConfig(next) as Record<string, unknown>,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[HubSpotAutoSync] Failed to persist integration meta integrationId=${integrationId}: ${msg}`);
  }
}

/**
 * Fire-and-forget HubSpot auto-sync for a CRM contact (never throws to caller).
 * Uses `setImmediate` so inbound webhooks are not blocked.
 */
export function scheduleHubSpotAutoSync(userId: string, contactId: string): void {
  setImmediate(() => {
    void (async () => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact || contact.userId !== userId) return;
        await syncContactToHubSpotIfEnabled(userId, contact);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[HubSpotAutoSync] scheduleHubSpotAutoSync error userId=${userId} contactId=${contactId}: ${msg}`);
      }
    })();
  });
}

/**
 * One-way upsert of a WhachatCRM contact (or legacy chat row) to HubSpot when the integration is active.
 * Safe for background use: catches errors, never logs tokens.
 */
export async function syncContactToHubSpotIfEnabled(userId: string, contactOrChat: Contact | Chat): Promise<void> {
  if (!isCrmContact(contactOrChat)) {
    await syncChatToHubSpotIfEnabled(userId, contactOrChat as Chat);
    return;
  }

  let hubspotIntegrationId: string | undefined;
  try {
    const integrations = await storage.getIntegrations(userId);
    const hub = integrations.find(
      (i) =>
        i.type === "hubspot" &&
        i.isActive &&
        (i.config as Record<string, unknown>)?.connectionStatus === "connected"
    );
    if (!hub) return;

    const cfg = decryptIntegrationConfig((hub.config || {}) as Record<string, unknown>) as Record<string, unknown>;
    const syncOptions = (cfg.syncOptions as unknown[]) || [];
    if (!Array.isArray(syncOptions) || !syncOptions.includes("sync_contacts")) return;

    const token = typeof cfg.accessToken === "string" ? cfg.accessToken.trim() : "";
    if (!token) return;

    hubspotIntegrationId = hub.id;

    const fresh = await storage.getContact(contactOrChat.id);
    if (!fresh || fresh.userId !== userId) return;

    const fp = fingerprintForHubSpotFromContact(fresh);
    if (shouldDebounceSkip(fresh, fp)) return;

    const lead = contactToLeadRow(fresh);
    const outcome = await pushLeadsToHubSpot(token, [lead]);

    if (outcome.pushed >= 1) {
      await persistContactHubSpotAutoMeta(fresh.id, fp);
      const hubFresh = await storage.getIntegration(hub.id);
      if (hubFresh?.config) {
        await persistIntegrationAutoSyncMeta(hub.id, hubFresh.config as Record<string, unknown>, {
          lastHubSpotAutoSyncAt: new Date().toISOString(),
          lastHubSpotAutoSyncError: null,
        });
      }
      return;
    }

    if (outcome.skipped >= 1) {
      // No email/phone — do not set debounce so a later field fill can sync.
      return;
    }

    const errMsg = outcome.errors[0] || outcome.summary || "HubSpot auto-sync failed";
    console.warn(
      `[HubSpotAutoSync] userId=${userId} contactId=${fresh.id} hubspotIntegrationId=${hub.id} error=${errMsg.slice(0, 400)}`
    );
    const hubFresh = await storage.getIntegration(hub.id);
    if (hubFresh?.config) {
      await persistIntegrationAutoSyncMeta(hub.id, hubFresh.config as Record<string, unknown>, {
        lastHubSpotAutoSyncError: { at: new Date().toISOString(), message: errMsg.slice(0, 500) },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[HubSpotAutoSync] userId=${userId} contactOrChatId=${"id" in contactOrChat ? contactOrChat.id : "?"} error=${msg.slice(0, 400)}`
    );
    if (hubspotIntegrationId) {
      const hub = await storage.getIntegration(hubspotIntegrationId);
      if (hub?.config) {
        await persistIntegrationAutoSyncMeta(hubspotIntegrationId, hub.config as Record<string, unknown>, {
          lastHubSpotAutoSyncError: { at: new Date().toISOString(), message: msg.slice(0, 500) },
        });
      }
    }
  }
}

/** Best-effort: find unified contact for a legacy chat row (same user + phone). */
async function resolveContactFromChat(userId: string, chat: Chat): Promise<Contact | null> {
  const raw = chat.whatsappPhone || "";
  const digits = isLegacyCalendlyWorkflowChat(raw) ? "" : raw.replace(/\D/g, "");
  if (digits) {
    const byChannel = await storage.getContactByChannelId(userId, "whatsapp", digits);
    if (byChannel) return byChannel;
  }
  const contacts = await storage.getContacts(userId, 5000);
  const norm = (p: string) => p.replace(/\D/g, "");
  const phoneNorm = digits;
  return (
    contacts.find((c) => c.whatsappId && norm(c.whatsappId) === phoneNorm) ||
    contacts.find((c) => c.phone && norm(c.phone) === phoneNorm) ||
    null
  );
}

/**
 * Legacy chat list path: sync using chat-shaped lead if no unified contact match.
 */
export async function syncChatToHubSpotIfEnabled(userId: string, chat: Chat): Promise<void> {
  try {
    const linked = await resolveContactFromChat(userId, chat);
    if (linked) {
      await syncContactToHubSpotIfEnabled(userId, linked);
      return;
    }
    const integrations = await storage.getIntegrations(userId);
    const hub = integrations.find(
      (i) =>
        i.type === "hubspot" &&
        i.isActive &&
        (i.config as Record<string, unknown>)?.connectionStatus === "connected"
    );
    if (!hub) return;
    const cfg = decryptIntegrationConfig((hub.config || {}) as Record<string, unknown>) as Record<string, unknown>;
    const syncOptions = (cfg.syncOptions as unknown[]) || [];
    if (!Array.isArray(syncOptions) || !syncOptions.includes("sync_contacts")) return;
    const token = typeof cfg.accessToken === "string" ? cfg.accessToken.trim() : "";
    if (!token) return;

    const lead = chatToLeadRow(chat);
    // No unified contact row — debounce is not stored on chat; pushLeadsToHubSpot spaces requests lightly.
    const outcome = await pushLeadsToHubSpot(token, [lead]);
    const hubFresh = await storage.getIntegration(hub.id);
    const rawCfg = (hubFresh?.config || hub.config) as Record<string, unknown>;
    if (outcome.failed > 0 || outcome.pushed === 0) {
      const errMsg = outcome.errors[0] || outcome.summary || "HubSpot auto-sync failed";
      console.warn(`[HubSpotAutoSync] userId=${userId} chatId=${chat.id} error=${errMsg.slice(0, 400)}`);
      await persistIntegrationAutoSyncMeta(hub.id, rawCfg, {
        lastHubSpotAutoSyncError: { at: new Date().toISOString(), message: errMsg.slice(0, 500) },
      });
    } else {
      await persistIntegrationAutoSyncMeta(hub.id, rawCfg, {
        lastHubSpotAutoSyncAt: new Date().toISOString(),
        lastHubSpotAutoSyncError: null,
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[HubSpotAutoSync] syncChatToHubSpotIfEnabled userId=${userId} chatId=${chat.id} error=${msg.slice(0, 400)}`);
  }
}

export function scheduleHubSpotAutoSyncFromChat(userId: string, chatId: string): void {
  setImmediate(() => {
    void (async () => {
      try {
        const chat = await storage.getChat(chatId);
        if (!chat || chat.userId !== userId) return;
        await syncChatToHubSpotIfEnabled(userId, chat);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[HubSpotAutoSync] scheduleHubSpotAutoSyncFromChat error userId=${userId} chatId=${chatId}: ${msg}`);
      }
    })();
  });
}

/** True if PATCH body can affect HubSpot-mapped contact fields. */
export function contactPatchAffectsHubSpot(body: Record<string, unknown>): boolean {
  const keys = new Set(Object.keys(body));
  return ["name", "email", "phone", "tag", "pipelineStage", "whatsappId"].some((k) => keys.has(k));
}
