import { POST_PURCHASE_JOURNEYS, type PostPurchaseJourney } from './postPurchase';

export const CONSENT_PURPOSES = [...POST_PURCHASE_JOURNEYS, 'checkoutRecovery'] as const;
export type ConsentPurpose = typeof CONSENT_PURPOSES[number];
export type ConsentLocale = 'en' | 'es' | 'he';
/** Shared with the existing signed inbound parsers. Never translate these commands. */
export const WHATSAPP_CONSENT_PHRASES: Record<ConsentPurpose, string> = {
  orderConfirmation: 'YES WHATSAPP ORDER CONFIRMATIONS', fulfillmentUpdate: 'YES WHATSAPP SHIPPING UPDATES',
  cancellation: 'YES WHATSAPP CANCELLATION NOTICES', reviewRequest: 'YES WHATSAPP REVIEW REQUESTS',
  repeatPurchase: 'YES WHATSAPP REPEAT PURCHASE OFFERS', winBack: 'YES WHATSAPP WIN BACK OFFERS',
  checkoutRecovery: 'YES WHATSAPP CHECKOUT REMINDERS',
};
export const CONSENT_LABELS = {
  en: ['Order confirmations', 'Shipping updates', 'Cancellation notices', 'Review requests', 'Repeat purchase offers', 'Win-back offers', 'Checkout reminders'],
  es: ['Confirmaciones de pedido', 'Actualizaciones de envío', 'Avisos de cancelación', 'Solicitudes de reseña', 'Ofertas de nueva compra', 'Ofertas de recuperación de clientes', 'Recordatorios de checkout'],
  he: ['אישורי הזמנה', 'עדכוני משלוח', 'הודעות ביטול', 'בקשות חוות דעת', 'הצעות לרכישה חוזרת', 'הצעות להחזרת לקוחות', 'תזכורות לתשלום'],
} as const;
export type EnrollmentDraft = {
  locale: ConsentLocale; sourceUrl: string; merchantName: string;
  purposes: Record<ConsentPurpose, { selected: boolean; additionalText: string }>;
};
export type SavedEnrollment = EnrollmentDraft & {
  version: 1; revision: string; savedAt: string; savedBy: string; connection: string;
};
export type EnrollmentReadiness = {
  purpose: ConsentPurpose; selected: boolean; templateReady: boolean; merchantEnabled: boolean;
  operatorReleased: boolean; captureReady: boolean; activationBlocked: boolean;
  blockers: string[]; recipientConsent: 'required_per_recipient';
};
export type EnrollmentView = {
  shop: string; draft: EnrollmentDraft | null; revision: string | null; savedAt: string | null;
  connectionCurrent: boolean; phoneAvailable: boolean;
  rows: Array<EnrollmentReadiness & { notice: string | null; link: string | null }>;
};
export function emptyEnrollment(locale: ConsentLocale = 'en'): EnrollmentDraft {
  return { locale, sourceUrl: '', merchantName: '', purposes: Object.fromEntries(CONSENT_PURPOSES.map(p =>
    [p, { selected: false, additionalText: '' }])) as EnrollmentDraft['purposes'] };
}
const record = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
/** Exact shape prevents callers supplying identities, a destination phone or consent grants. */
export function parseEnrollmentDraft(value: unknown): EnrollmentDraft | null {
  const v = record(value), purposes = record(v?.purposes);
  if (!v || Object.keys(v).sort().join(',') !== 'locale,merchantName,purposes,sourceUrl' ||
      !['en', 'es', 'he'].includes(String(v.locale)) || typeof v.sourceUrl !== 'string' ||
      typeof v.merchantName !== 'string' || !v.merchantName.trim() || v.merchantName.length > 120 || /[<>\x00-\x1f]/.test(v.merchantName) ||
      v.sourceUrl.length > 500 || !purposes || Object.keys(purposes).length !== CONSENT_PURPOSES.length) return null;
  for (const p of CONSENT_PURPOSES) {
    const row = record(purposes[p]);
    if (!row || Object.keys(row).sort().join(',') !== 'additionalText,selected' || typeof row.selected !== 'boolean' ||
        typeof row.additionalText !== 'string' || row.additionalText.length > 500 || /[<>\x00-\x08\x0b\x0c\x0e-\x1f]/.test(row.additionalText)) return null;
  }
  return v as EnrollmentDraft;
}
/** A merchant-declared placement on this shop, never an asserted customer view. */
export function enrollmentSourceAllowed(source: string, shop: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === 'https:' && url.hostname === shop && !url.port && !url.username && !url.password &&
      !url.search && !url.hash;
  } catch { return false; }
}
export function enrollmentNotice(shop: string, purpose: ConsentPurpose, draft: EnrollmentDraft): string {
  const label = CONSENT_LABELS[draft.locale][CONSENT_PURPOSES.indexOf(purpose)];
  const merchant = draft.merchantName.trim() ? `${draft.merchantName.trim()} (${shop})` : shop;
  const text = draft.locale === 'es' ? `Acepto recibir mensajes de ${merchant} por WhatsApp para: ${label}. Es opcional. Envía STOP para darte de baja. Abre WhatsApp y envía el texto indicado para aceptar.` :
    draft.locale === 'he' ? `אני מסכים/ה לקבל מ-${merchant} הודעות ב-WhatsApp למטרה: ${label}. הבחירה אינה חובה. לביטול יש לשלוח STOP. לאישור יש לפתוח WhatsApp ולשלוח את הטקסט המוצג.` :
    `I agree to receive WhatsApp messages from ${merchant} for: ${label}. This is optional. Reply STOP to opt out. Open WhatsApp and send the displayed text to opt in.`;
  return `${text}${draft.purposes[purpose].additionalText.trim() ? '\n' + draft.purposes[purpose].additionalText.trim() : ''}`;
}
export function enrollmentLink(displayPhone: unknown, purpose: ConsentPurpose): string | null {
  if (typeof displayPhone !== 'string' || !/^\+?[1-9][0-9 ()-]{7,24}$/.test(displayPhone)) return null;
  const phone = displayPhone.replace(/[+ ()-]/g, '');
  return /^[1-9][0-9]{7,14}$/.test(phone) ? `https://wa.me/${phone}?text=${encodeURIComponent(WHATSAPP_CONSENT_PHRASES[purpose])}` : null;
}
export function isPostPurchasePurpose(p: ConsentPurpose): p is PostPurchaseJourney { return p !== 'checkoutRecovery'; }
