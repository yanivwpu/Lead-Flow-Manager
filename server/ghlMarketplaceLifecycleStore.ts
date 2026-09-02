/**
 * Persistence boundary for GHL Marketplace lifecycle events.
 * Tests inject an in-memory store so route tests never write to production.
 */

import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls, ghlMarketplaceWebhookDedup, ghlOAuthPendingHandoffs } from "@shared/schema";
import { and, isNull, sql } from "drizzle-orm";
import { isUnknownGhlCompanyId } from "@shared/ghlMarketplaceUninstallMatch";

export type GhlMarketplaceInstallRecord = typeof ghlMarketplaceInstalls.$inferSelect;

export type GhlLifecycleInstallPatch = {
  agency?: string | null;
  companyId: string;
  locationId: string | null;
  appId: string | null;
  marketplacePlanId: string | null;
  paymentStatus: string | null;
  ghlUserId: string | null;
  previousVersionId: string | null;
  versionId: string | null;
  ghlTrialOnTrial: boolean | null;
  ghlTrialDuration: number | null;
  ghlTrialStartDate: Date | null;
  lastWebhookId: string | null;
  lastEventOccurredAt: Date | null;
  lastEventType: string | null;
  unknownPlanWarning: string | null;
  installationStatus: string | null;
  uninstallDate: Date | null;
  pricePlan: string | null;
  billingStatus: string | null;
  source: string | null;
  rawPayload: Record<string, unknown>;
  lastSyncedAt: Date;
  updatedAt: Date;
  installDate: Date | null;
  integrationId?: string | null;
  whachatUserId?: string | null;
};

export type GhlPendingHandoffRecord = {
  id: string;
  companyId: string;
  locationId: string | null;
  appId: string | null;
  consumedAt: Date | null;
};

export type GhlLifecyclePersistence = {
  listInstalls(): Promise<GhlMarketplaceInstallRecord[]>;
  updateInstall(id: string, patch: GhlLifecycleInstallPatch): Promise<void>;
  insertInstall(values: GhlLifecycleInstallPatch): Promise<{ id: string }>;
  findDedup(webhookId: string): Promise<boolean>;
  insertDedup(values: {
    webhookId: string;
    eventType: string;
    companyId: string;
    locationId: string | null;
    occurredAt: Date | null;
  }): Promise<void>;
  listHandoffs(): Promise<GhlPendingHandoffRecord[]>;
  revokeHandoffs(params: {
    locationId: string | null;
    companyId: string | null;
  }): Promise<{ revokedCount: number }>;
};

function createDbGhlLifecyclePersistence(): GhlLifecyclePersistence {
  return {
    async listInstalls() {
      return db.select().from(ghlMarketplaceInstalls);
    },
    async updateInstall(id, patch) {
      await db.update(ghlMarketplaceInstalls).set(patch).where(eq(ghlMarketplaceInstalls.id, id));
    },
    async insertInstall(values) {
      const [created] = await db
        .insert(ghlMarketplaceInstalls)
        .values({
          ...values,
          integrationId: values.integrationId ?? null,
          whachatUserId: values.whachatUserId ?? null,
        })
        .returning({ id: ghlMarketplaceInstalls.id });
      return { id: created?.id ?? "" };
    },
    async findDedup(webhookId) {
      const existing = await db
        .select({ webhookId: ghlMarketplaceWebhookDedup.webhookId })
        .from(ghlMarketplaceWebhookDedup)
        .where(eq(ghlMarketplaceWebhookDedup.webhookId, webhookId))
        .limit(1);
      return Boolean(existing[0]);
    },
    async insertDedup(values) {
      await db
        .insert(ghlMarketplaceWebhookDedup)
        .values(values)
        .onConflictDoNothing();
    },
    async listHandoffs() {
      const rows = await db.select().from(ghlOAuthPendingHandoffs);
      return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        locationId: row.locationId,
        appId: row.appId,
        consumedAt: row.consumedAt,
      }));
    },
    async revokeHandoffs(params) {
      const locationId = params.locationId?.trim() || null;
      const companyId = isUnknownGhlCompanyId(params.companyId) ? null : params.companyId?.trim() || null;
      if (!locationId && !companyId) return { revokedCount: 0 };

      const now = new Date();
      let revokedCount = 0;

      if (locationId) {
        const updated = await db
          .update(ghlOAuthPendingHandoffs)
          .set({ expiresAt: now, consumedAt: now })
          .where(
            and(eq(ghlOAuthPendingHandoffs.locationId, locationId), isNull(ghlOAuthPendingHandoffs.consumedAt)),
          )
          .returning({ id: ghlOAuthPendingHandoffs.id });
        revokedCount += updated.length;
      }

      if (companyId) {
        const updated = await db
          .update(ghlOAuthPendingHandoffs)
          .set({ expiresAt: now, consumedAt: now })
          .where(
            and(
              eq(ghlOAuthPendingHandoffs.companyId, companyId),
              sql`${ghlOAuthPendingHandoffs.locationId} IS NULL`,
              isNull(ghlOAuthPendingHandoffs.consumedAt),
            ),
          )
          .returning({ id: ghlOAuthPendingHandoffs.id });
        revokedCount += updated.length;
      }

      return { revokedCount };
    },
  };
}

export function createMemoryGhlLifecyclePersistence(
  seed?: {
    installs?: GhlMarketplaceInstallRecord[];
    handoffs?: GhlPendingHandoffRecord[];
  },
): GhlLifecyclePersistence & {
  installs: GhlMarketplaceInstallRecord[];
  handoffs: GhlPendingHandoffRecord[];
  dedup: Set<string>;
} {
  const installs: GhlMarketplaceInstallRecord[] = [...(seed?.installs ?? [])];
  const handoffs: GhlPendingHandoffRecord[] = [...(seed?.handoffs ?? [])];
  const dedup = new Set<string>();

  const store: GhlLifecyclePersistence & {
    installs: GhlMarketplaceInstallRecord[];
    handoffs: GhlPendingHandoffRecord[];
    dedup: Set<string>;
  } = {
    installs,
    handoffs,
    dedup,
    async listInstalls() {
      return [...installs];
    },
    async updateInstall(id, patch) {
      const idx = installs.findIndex((row) => row.id === id);
      if (idx < 0) return;
      installs[idx] = { ...installs[idx], ...patch };
    },
    async insertInstall(values) {
      const id = crypto.randomUUID();
      const now = new Date();
      installs.push({
        id,
        agency: values.agency ?? null,
        companyId: values.companyId,
        locationId: values.locationId,
        subAccountName: null,
        whiteLabeled: null,
        agencyOwner: null,
        agencyEmail: null,
        installDate: values.installDate,
        installationStatus: values.installationStatus,
        uninstallDate: values.uninstallDate,
        pricePlan: values.pricePlan,
        billingStatus: values.billingStatus,
        appId: values.appId,
        marketplacePlanId: values.marketplacePlanId,
        paymentStatus: values.paymentStatus,
        ghlUserId: values.ghlUserId,
        previousVersionId: values.previousVersionId,
        versionId: values.versionId,
        ghlTrialOnTrial: values.ghlTrialOnTrial,
        ghlTrialDuration: values.ghlTrialDuration,
        ghlTrialStartDate: values.ghlTrialStartDate,
        lastWebhookId: values.lastWebhookId,
        lastEventOccurredAt: values.lastEventOccurredAt,
        lastEventType: values.lastEventType,
        unknownPlanWarning: values.unknownPlanWarning,
        integrationId: values.integrationId ?? null,
        whachatUserId: values.whachatUserId ?? null,
        lastSyncedAt: values.lastSyncedAt,
        source: values.source,
        rawPayload: values.rawPayload,
        createdAt: now,
        updatedAt: values.updatedAt,
      });
      return { id };
    },
    async findDedup(webhookId) {
      return dedup.has(webhookId);
    },
    async insertDedup(values) {
      dedup.add(values.webhookId);
    },
    async listHandoffs() {
      return [...handoffs];
    },
    async revokeHandoffs(params) {
      const locationId = params.locationId?.trim() || null;
      const companyId = isUnknownGhlCompanyId(params.companyId) ? null : params.companyId?.trim() || null;
      if (!locationId && !companyId) return { revokedCount: 0 };
      const now = new Date();
      let revokedCount = 0;
      for (const row of handoffs) {
        if (row.consumedAt) continue;
        const rowLoc = (row.locationId || "").trim() || null;
        if (locationId && rowLoc === locationId) {
          row.consumedAt = now;
          revokedCount += 1;
          continue;
        }
        if (companyId && (row.companyId || "").trim() === companyId && !rowLoc) {
          row.consumedAt = now;
          revokedCount += 1;
        }
      }
      return { revokedCount };
    },
  };

  return store;
}

const dbPersistence = createDbGhlLifecyclePersistence();
let activePersistence: GhlLifecyclePersistence = dbPersistence;

export function getGhlLifecyclePersistence(): GhlLifecyclePersistence {
  return activePersistence;
}

export function setGhlLifecyclePersistenceForTests(persistence: GhlLifecyclePersistence | null): void {
  activePersistence = persistence ?? dbPersistence;
}
