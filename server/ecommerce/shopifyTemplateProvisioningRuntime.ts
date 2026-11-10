import { db } from "../../drizzle/db";
import { getMetaMessageTemplates, createMetaShopifyMessageTemplate } from "../userMeta";
import { createShopifyTemplateProvisioner, shopifyTemplateSetupAllowed,dueShopifyTemplateSetupsQuery } from "./shopifyTemplateProvisioning";

export const shopifyTemplateProvisioner = createShopifyTemplateProvisioner({
  database: db, env: process.env,
  provider: {
    // Permission failures stop before any creation attempt.
    list: m => getMetaMessageTemplates(m.accountId, { expectedWabaId: m.wabaId, maxPages: 5, signal: AbortSignal.timeout(40_000) }),
    create: (m, t) => createMetaShopifyMessageTemplate(m.accountId, m.wabaId, t),
  },
});

/** At most three merchants and one submission per merchant per minute.
 * Committed leases protect replicas. No import-time work or customer sender.
 */
export function startShopifyTemplateReconciliation(): null | (() => void) {
  if (process.env.ECOMMERCE_TEMPLATE_PROVISIONING_ENABLED !== "true") return null;
  let busy = false, stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const ids=(process.env.ECOMMERCE_TEMPLATE_PROVISIONING_ACCOUNT_IDS??'').split(',');
      const general=process.env.ECOMMERCE_TEMPLATE_PROVISIONING_STAGE==='general'&&process.env.ECOMMERCE_TEMPLATE_PUBLIC_RELEASE_APPROVED==='true';
      const due = await db.execute(dueShopifyTemplateSetupsQuery(Date.now(),ids,general));
      for (const row of due.rows) {
        if (stopped) break;
        const accountId = String(row.user_id);
        if (shopifyTemplateSetupAllowed(process.env, accountId)){
          try{await shopifyTemplateProvisioner.reconcile(accountId);}
          catch{console.error("[ShopifyTemplateSetup] merchant_reconciliation_unavailable");}
        }
      }
    } catch { console.error("[ShopifyTemplateSetup] reconciliation_unavailable"); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 60_000);
  timer.unref?.();
  return () => { stopped = true; clearInterval(timer); };
}
