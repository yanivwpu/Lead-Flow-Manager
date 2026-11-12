import { createHash } from 'node:crypto';
import { type EnrollmentDraft, type SavedEnrollment, parseEnrollmentDraft, enrollmentSourceAllowed } from '../../shared/shopifyConsentEnrollment';
import { postPurchasePreparationEnabled } from './postPurchaseGate';
import { recoveryConsentCaptureEnabled } from './checkoutRecoveryInboundConsentGate';
import { productionConsentCaptureBlocker } from './consentCaptureGate';
import { productionRecoveryEvidenceScope } from './checkoutRecoveryProductionRelease';

/** Capture permission is independent of outbound preparation and delivery. */
export function enrollmentCaptureReadiness(env: Record<string, string | undefined>, accountId: string, shop: string, connection?: string) {
  const strongKey = (env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length ?? 0) >= 32;
  const scope = productionRecoveryEvidenceScope(env);
  const pilot = productionConsentCaptureBlocker(env, accountId, shop, connection) === null;
  return {
    postPurchase: strongKey && (pilot || postPurchasePreparationEnabled(env, accountId)),
    checkoutRecovery: strongKey && (pilot || recoveryConsentCaptureEnabled(env) || !!scope &&
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

export function enrollmentCaptureBlocker(env: Record<string, string | undefined>, accountId: string, shop: string, connection: string): string {
  if ((env.ECOMMERCE_WHATSAPP_RECOVERY_CONSENT_HMAC_KEY?.length ?? 0) < 32) return 'consent_capture_signing_key_required';
  return productionConsentCaptureBlocker(env, accountId, shop, connection) ?? 'consent_capture_release_required';
}
