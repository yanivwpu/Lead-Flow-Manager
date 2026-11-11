import type { Router, RequestHandler } from 'express';
import { parseEnrollmentDraft, type EnrollmentDraft, type EnrollmentView } from '../../shared/shopifyConsentEnrollment';
import { isMerchantActivationPost } from './merchantActivationPolicy';

/** Mounted at the existing authenticated merchant-engine boundary. No public
 * grant endpoint: a customer opt-in still comes through signed Meta inbound. */
export function registerConsentEnrollmentRoutes(router: Router, deps: {
  appOrigin: () => string; writeLimiter: RequestHandler;
  service: { enrollmentView: (id: string) => Promise<EnrollmentView | null>;
    saveEnrollment: (id: string, draft: EnrollmentDraft) => Promise<boolean> };
}) {
  router.get('/consent-enrollment', async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const accountId = (req.user as { id?: string } | undefined)?.id;
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });
    try {
      const view = await deps.service.enrollmentView(accountId);
      return view ? res.json(view) : res.status(409).json({ error: 'Connect Shopify and WhatsApp and activate the workspace' });
    } catch { return res.status(503).json({ error: 'Consent enrollment unavailable' }); }
  });
  router.post('/consent-enrollment', deps.writeLimiter, async (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    const accountId = (req.user as { id?: string } | undefined)?.id;
    if (!accountId) return res.status(401).json({ error: 'Unauthorized' });
    if (!isMerchantActivationPost(req.get('origin'), req.get('content-type'), {}, deps.appOrigin()))
      return res.status(403).json({ error: 'Invalid request' });
    const draft = parseEnrollmentDraft(req.body);
    if (!draft) return res.status(400).json({ error: 'Invalid enrollment configuration' });
    try {
      if (!await deps.service.saveEnrollment(accountId, draft))
        return res.status(409).json({ error: 'Use an HTTPS placement URL on your connected myshopify.com store; check workspace connections' });
      return res.json({ ok: true, messagingEnabled: false, consentGranted: false });
    } catch { return res.status(503).json({ error: 'Consent enrollment unavailable' }); }
  });
}
