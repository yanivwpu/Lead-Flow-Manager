import type { Router, RequestHandler } from 'express';
import { verifyConsentProxy, consentStorefrontHtml } from './shopifyConsentStorefront';
import { isMerchantActivationPost } from './merchantActivationPolicy';
import type { EnrollmentView } from '../../shared/shopifyConsentEnrollment';
import type { ConsentThemeSetup } from '../../shared/shopifyConsentStorefront';

export function registerConsentProxyRoute(router: Router, deps: {
  secret: () => string; limiter: RequestHandler;
  enrollmentForShop: (shop: string) => Promise<EnrollmentView | null>;
}) {
  router.get('/consent-storefront', deps.limiter, async (req, res) => {
    res.set({ 'Cache-Control': 'no-store, private, max-age=0', 'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
    const verified = verifyConsentProxy(req.originalUrl.split('?')[1] ?? '', deps.secret());
    if (!verified) return res.status(403).end();
    try {
      const view = await deps.enrollmentForShop(verified.shop);
      if (!view || view.shop !== verified.shop) return res.status(404).end();
      const html = consentStorefrontHtml(view);
      return html ? res.type('html').send(html) : res.status(204).end();
    } catch { return res.status(503).end(); }
  });
}
export function registerConsentThemeRoutes(router: Router, deps: {
  setup: (id: string, verify?: boolean) => Promise<ConsentThemeSetup | null>;
  record: (id: string, action: 'open_editor' | 'confirm_saved') => Promise<boolean>;
  appOrigin: () => string; limiter: RequestHandler;
}) {
  router.get('/consent-theme', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = (req.user as { id?: string } | undefined)?.id;
    if (!id) return res.status(401).end();
    try { const setup = await deps.setup(id); return setup ? res.json(setup) : res.status(409).end(); }
    catch { return res.status(503).end(); }
  });
  router.post('/consent-theme', deps.limiter, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = (req.user as { id?: string } | undefined)?.id;
    if (!id) return res.status(401).end();
    if (!isMerchantActivationPost(req.get('origin'), req.get('content-type'), {}, deps.appOrigin())) return res.status(403).end();
    if (!req.body || Object.keys(req.body).length !== 1 || !['open_editor', 'confirm_saved', 'verify'].includes(req.body.action)) return res.status(400).end();
    try {
      const initial = await deps.setup(id);
      if (!initial?.editorUrl) return res.status(409).end();
      if (req.body.action !== 'verify' && !await deps.record(id, req.body.action)) return res.status(409).end();
      const setup = await deps.setup(id, req.body.action !== 'open_editor');
      return setup ? res.json({ ...setup, consentGranted: false, messagingEnabled: false }) : res.status(409).end();
    } catch { return res.status(503).end(); }
  });
}
