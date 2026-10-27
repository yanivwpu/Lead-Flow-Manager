import { Router, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { users, integrations } from "@shared/schema";
import { db } from "./drizzle/db";
import { storage } from "./storage";
import { isEcommercePilotOwner } from "./ecommerce/pilotAccess";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { getEffectivePlanForUser } from "@shared/trialEntitlements";
import {
  canActivateMerchantWorkspace,
  merchantWorkspaceActivated,
  isMerchantActivationPost,
} from "./ecommerce/merchantActivationPolicy";

/**
 * Merchant workspace enrollment, NEVER an outbound automation, cart or order permission.
 * This router intentionally does not use the private Shopping pilot allowance.
 */
const router = Router();

type Current = {
  accountId: string;
  shop: string | null;
  integrationId: string | null;
  eligible: boolean;
  activated: boolean;
  connected: boolean;
  planEligible: boolean;
};

async function currentForAccount(accountId: string): Promise<Current | null> {
  const owner = await storage.getUserForSession(accountId);
  if (!owner || owner.id !== accountId || owner.deletionRequestedAt) return null;
  const shop = normalizeShopifyShopDomain(owner.shopifyShop);
  const installations = await db.select().from(integrations).where(and(
    eq(integrations.userId, accountId), eq(integrations.type, "shopify"),
    eq(integrations.isActive, true),
  )).limit(2);
  const installation = installations.length === 1 ? installations[0] : null;
  const cfg = (installation?.config ?? {}) as Record<string, unknown>;
  const configMatches = [cfg.shop, cfg.shopUrl].every(value => value == null ||
    (typeof value === "string" && normalizeShopifyShopDomain(value) === shop));
  const hasToken = typeof owner.shopifyAccessToken === "string" &&
    owner.shopifyAccessToken.trim().length > 0;
  const connected = !!(shop && installation?.isActive && configMatches && hasToken &&
    isShopifyContactInstallationActive(owner));
  const planEligible = getEffectivePlanForUser(owner) === "pro";
  const eligible = canActivateMerchantWorkspace({
    accountId, sessionAccountId: owner.id, sessionAligned: true,
    connectedShop: connected ? shop : null,
    hasInstalledToken: connected && hasToken,
    isShopifyOwner: !!installation && installation.userId === accountId,
    planEligible,
  });
  return {
    accountId, shop, integrationId: installation?.id ?? null,
    connected, planEligible, eligible,
    activated: eligible && !!shop && !!installation && await (async () => {
      const records = await db.execute(sql`
        SELECT activated_at FROM ecommerce_shopify_workspace_activations
        WHERE account_id = ${accountId} AND installation_id = ${installation.id} AND shop = ${shop}
        LIMIT 1
      `);
      return merchantWorkspaceActivated(records.rows[0]?.activated_at as Date | string | null | undefined);
    })(),
  };
}

router.get("/status", async (req: Request, res: Response) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const state = await currentForAccount(accountId);
    if (!state) return res.status(404).json({ error: "Account unavailable" });
    return res.json({
      activated: state.activated, eligible: state.eligible,
      connected: state.connected, planEligible: state.planEligible,
      cartExecutionEnabled: false, outboundMessagingEnabled: false,
    });
  } catch {
    return res.status(503).json({ error: "E-Commerce activation status unavailable" });
  }
});

router.post("/activate", async (req: Request, res: Response) => {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) return res.status(401).json({ error: "Unauthorized" });
  const appOrigin = (process.env.APP_URL || "https://app.whachatcrm.com").replace(/\/$/, "");
  if (!isMerchantActivationPost(req.get("origin"), req.get("content-type"), req.body, appOrigin)) {
    return res.status(403).json({ error: "Invalid activation request" });
  }

  try {
    const result = await db.transaction(async tx => {
      const owner = await storage.getUserForSession(accountId);
      const shop = normalizeShopifyShopDomain(owner?.shopifyShop);
      if (!owner || !shop || owner.deletionRequestedAt) return null;
      // Same lock used by OAuth uninstall/redaction and Shopify tenant workflows.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop}, 0))`);
      const [liveOwner] = await tx.select().from(users).where(
        and(eq(users.id, accountId), eq(users.shopifyShop, shop)),
      ).for("update").limit(1);
      if (!liveOwner || !isShopifyContactInstallationActive(liveOwner)) return null;
      const installations = await tx.select().from(integrations).where(and(
        eq(integrations.userId, accountId), eq(integrations.type, "shopify"),
        eq(integrations.isActive, true),
      )).limit(2);
      if (installations.length !== 1 || !installations[0].isActive) return null;
      const installation = installations[0];
      const cfg = (installation.config ?? {}) as Record<string, unknown>;
      if (![cfg.shop, cfg.shopUrl].every(value => value == null ||
          (typeof value === "string" && normalizeShopifyShopDomain(value) === shop))) return null;
      if (!canActivateMerchantWorkspace({
        accountId, sessionAccountId: liveOwner.id, sessionAligned: true,
        isShopifyOwner: installation.userId === accountId,
        connectedShop: shop, hasInstalledToken: typeof liveOwner.shopifyAccessToken === "string" &&
          liveOwner.shopifyAccessToken.trim().length > 0,
        planEligible: getEffectivePlanForUser(liveOwner) === "pro",
      })) return null;
      // Idempotent for this exact installation. A new installation requires
      // a new, explicit merchant action; old activation is never transferred.
      const written = await tx.execute(sql`
        INSERT INTO ecommerce_shopify_workspace_activations
          (account_id, installation_id, shop)
        VALUES (${accountId}, ${installation.id}, ${shop})
        ON CONFLICT (account_id) DO UPDATE SET
          installation_id = EXCLUDED.installation_id,
          shop = EXCLUDED.shop,
          activated_at = CASE
            WHEN ecommerce_shopify_workspace_activations.installation_id = EXCLUDED.installation_id
             AND ecommerce_shopify_workspace_activations.shop = EXCLUDED.shop
            THEN ecommerce_shopify_workspace_activations.activated_at
            ELSE NOW() END
        RETURNING activated_at
      `);
      if (written.rows.length !== 1) return null;
      return { activated: true };
    });
    if (!result) return res.status(403).json({ error: "Eligible Shopify owner and Pro access required" });
    return res.json({ ...result, cartExecutionEnabled: false, outboundMessagingEnabled: false });
  } catch {
    return res.status(503).json({ error: "E-Commerce activation unavailable" });
  }
});

/** Actual server route authorization; do not trust the sidebar or persisted flag alone. */
export async function requireEcommerceWorkspace(req: Request, res: Response, next: () => void) {
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
  const accountId = (req.user as { id?: string } | undefined)?.id;
  if (!accountId) { res.status(401).end(); return; }
  try {
    const owner = await storage.getUserForSession(accountId);
    if (owner && isEcommercePilotOwner(owner, process.env)) { next(); return; }
    const state = await currentForAccount(accountId);
    if (state?.activated) { next(); return; }
    res.status(404).end();
  } catch {
    res.status(503).end();
  }
}

export default router;
