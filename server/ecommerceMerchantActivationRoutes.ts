import { Router, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { users, integrations } from "@shared/schema";
import { db } from "./drizzle/db";
import { storage } from "./storage";
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
  )).limit(2);
  const installation = installations.length === 1 ? installations[0] : null;
  const cfg = (installation?.config ?? {}) as Record<string, unknown>;
  const configMatches = cfg.shop == null || (
    typeof cfg.shop === "string" && normalizeShopifyShopDomain(cfg.shop) === shop
  );
  const connected = !!(shop && installation?.isActive && configMatches &&
    isShopifyContactInstallationActive(owner));
  const planEligible = getEffectivePlanForUser(owner) === "pro";
  const eligible = canActivateMerchantWorkspace({
    accountId, sessionAccountId: owner.id, sessionAligned: true,
    connectedShop: connected ? shop : null,
    hasInstalledToken: connected && !!owner.shopifyAccessToken,
    isShopifyOwner: !!installation && installation.userId === accountId,
    planEligible,
  });
  return {
    accountId, shop, integrationId: installation?.id ?? null,
    connected, planEligible, eligible,
    activated: eligible && merchantWorkspaceActivated(owner.ecommerceGrowthEngineActivatedAt) &&
      owner.ecommerceGrowthEngineActivationShop === shop &&
      owner.ecommerceGrowthEngineActivationIntegrationId === installation?.id,
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
      )).limit(2);
      if (installations.length !== 1 || !installations[0].isActive) return null;
      const installation = installations[0];
      const cfg = (installation.config ?? {}) as Record<string, unknown>;
      if (cfg.shop != null && (typeof cfg.shop !== "string" ||
          normalizeShopifyShopDomain(cfg.shop) !== shop)) return null;
      if (!canActivateMerchantWorkspace({
        accountId, sessionAccountId: liveOwner.id, sessionAligned: true,
        isShopifyOwner: installation.userId === accountId,
        connectedShop: shop, hasInstalledToken: !!liveOwner.shopifyAccessToken,
        planEligible: getEffectivePlanForUser(liveOwner) === "pro",
      })) return null;
      const stillActivated = merchantWorkspaceActivated(liveOwner.ecommerceGrowthEngineActivatedAt) &&
        liveOwner.ecommerceGrowthEngineActivationShop === shop &&
        liveOwner.ecommerceGrowthEngineActivationIntegrationId === installation.id;
      if (!stillActivated) {
        await tx.update(users).set({
          ecommerceGrowthEngineActivatedAt: new Date(),
          ecommerceGrowthEngineActivationShop: shop,
          ecommerceGrowthEngineActivationIntegrationId: installation.id,
        }).where(and(eq(users.id, accountId), eq(users.shopifyShop, shop)));
      }
      return { activated: true };
    });
    if (!result) return res.status(403).json({ error: "Eligible Shopify owner and Pro access required" });
    return res.json({ ...result, cartExecutionEnabled: false, outboundMessagingEnabled: false });
  } catch {
    return res.status(503).json({ error: "E-Commerce activation unavailable" });
  }
});

export default router;
