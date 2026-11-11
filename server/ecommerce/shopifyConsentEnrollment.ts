import { createHash } from 'node:crypto';
import { type EnrollmentDraft, type SavedEnrollment, parseEnrollmentDraft, enrollmentSourceAllowed } from '../../shared/shopifyConsentEnrollment';
import { postPurchasePreparationEnabled } from './postPurchaseGate';
import { recoveryConsentCaptureEnabled } from './checkoutRecoveryInboundConsentGate';
import { productionRecoveryEvidenceScope } from './checkoutRecoveryProductionRelease';

/** Mirrors the existing capture gates; production recovery is still one recipient only. */
export function enrollmentCaptureReadiness(env: Record<string, string | undefined>, accountId: string, shop: string) {
  const strongKey = (env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length ?? 0) >= 32;
  const scope = productionRecoveryEvidenceScope(env);
  return {
    postPurchase: strongKey && postPurchasePreparationEnabled(env, accountId),
    checkoutRecovery: strongKey && (recoveryConsentCaptureEnabled(env) || !!scope &&
      scope.accountId === accountId && scope.shop === shop &&
      env.ECOMMERCE_RECOVERY_PRODUCTION_CONSENT_APPROVED === 'true' && env.ECOMMERCE_RECOVERY_CONSENT_CAPTURE_ENABLED === 'true'),
  };
}
export function savedEnrollment(value: unknown): SavedEnrollment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as SavedEnrollment;
  const draft = parseEnrollmentDraft({ locale: v.locale, sourceUrl: v.sourceUrl, merchantName: v.merchantName, purposes: v.purposes });
  return draft && v.version === 1 && /^[a-f0-9]{64}$/.test(v.revision ?? '') &&
    /^[a-f0-9]{64}$/.test(v.connection ?? '') && typeof v.savedBy === 'string' && Number.isFinite(Date.parse(v.savedAt)) ? v : null;
}
export function stampEnrollment(draft: EnrollmentDraft, accountId: string, shop: string, connection: string, now: number): SavedEnrollment | null {
  if (!parseEnrollmentDraft(draft) || !enrollmentSourceAllowed(draft.sourceUrl, shop)) return null;
  return { ...draft, version: 1, connection, savedBy: accountId, savedAt: new Date(now).toISOString(),
    revision: createHash('sha256').update(JSON.stringify({ draft, accountId, shop, connection, now })).digest('hex') };
}
