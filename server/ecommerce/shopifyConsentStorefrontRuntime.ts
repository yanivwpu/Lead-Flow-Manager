import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../../drizzle/db';
import { shopifyTemplateProvisioner } from './shopifyTemplateProvisioningRuntime';
import { createConsentThemeService } from './shopifyConsentThemeService';
import { registerConsentProxyRoute } from './shopifyConsentStorefrontRoutes';
import { shopifyCatalogRequest } from '../salesCatalog/shopify/api';

export const consentThemeSetup = createConsentThemeService({
  installation: shopifyTemplateProvisioner.consentInstallation, env: process.env,
  request: (shop, token, query) => shopifyCatalogRequest(shop, token)(query),
});
export const consentProxyRouter = Router();
registerConsentProxyRoute(consentProxyRouter, {
  secret: () => process.env.SHOPIFY_API_SECRET ?? '',
  enrollmentForShop: async shop => {
    // Shopify signs the shop. Never accept account/phone/customer selectors.
    // Ambiguous/reassigned/deleted installations fail closed in the reused
    // locked enrollment view, which also enforces WABA/capture readiness.
    const owners = await db.execute(sql`SELECT id FROM users WHERE shopify_shop=${shop} LIMIT 2`);
    if (owners.rows.length !== 1) return null;
    const view = await shopifyTemplateProvisioner.enrollmentView(String(owners.rows[0].id));
    return view?.shop === shop ? view : null;
  },
});
