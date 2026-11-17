import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { withUserQueryScope } from '@/lib/accountQueryScope';
import { ShopifyConsentThemeSetup } from './ShopifyConsentThemeSetup';
import { CONSENT_PURPOSES, CONSENT_LABELS, WHATSAPP_CONSENT_PHRASES, emptyEnrollment, enrollmentNotice, enrollmentDraftsEqual,
  type ConsentLocale, type EnrollmentDraft, type EnrollmentView } from '@shared/shopifyConsentEnrollment';

const copy = {
  en: {
    title: 'Customer WhatsApp consent', intro: 'Choose what customers can opt into, save your notices, then set up in Shopify.', help: 'How consent and messaging work',
    rules: 'Customers must choose freely and send the exact displayed WhatsApp text themselves. A click, saved setting, generic YES/OK, or Shopify email/SMS checkbox grants no consent. Never send an unsolicited WhatsApp message to request consent.',
    merchantName: 'Your business name shown to customers', pages: 'Open Shopify Pages', source: 'Store page where you will display these notices (HTTPS myshopify.com URL)', language: 'Customer notice language', select: 'Offer this purpose', extra: 'Additional merchant notice (optional)', save: 'Save changes', unsaved: 'Unsaved changes. Save before adding consent to your storefront.', selectPurpose: 'Select and save at least one consent purpose.', saving: 'Saving…', saved: 'Configuration saved; no customer consent was created.', error: 'Could not save or verify configuration. Check your connections and saved notice, then retry.', unavailable: 'Connect Shopify and WhatsApp and activate your Growth Engine workspace to configure consent.',
    share: 'Copy notice and opt-in link', copied: 'Copied', copyError: 'Copy failed. Select and copy the notice and link below.', notShared: 'Save this purpose before sharing. Check that Shopify and your WhatsApp Business number are connected and consent collection is available.',
    proof: 'Saving these notices prepares your store. Customers still need to send the exact text for the purpose they choose; only matching Shopify customers can qualify.',
    scopes: 'Consent collection and message sending are separate steps. Choose and enable each journey after setup, using Meta-approved templates. Customers can send STOP to opt out. Opt-outs, completed purchases and contact restrictions still prevent messages.',
    stale: 'The saved notice belongs to an earlier connection. Review and save again before sharing.', phone: 'The connected business phone is unavailable. Check the WhatsApp connection before sharing.',
    readiness: 'Journey readiness', purpose: 'Purpose', templates: 'Template setup', merchant: 'Merchant enabled', consent: 'Consent eligibility', release: 'Availability', ready: 'Verified', blocked: 'Blocked', on: 'Enabled', off: 'Paused', scoped: 'Available', perRecipient: 'Required for each recipient', captureBlocked: 'Consent capture unavailable; review required checks', selected: 'Journey selected', notSelected: 'Journey not selected', activationBlocked: 'Activation blocked', activationReady: 'Activation prerequisites verified',
    eligibility: 'Readiness describes your setup, not permission for every customer. Each recipient must give current permission for the specific message and meet the sending requirements.',
  },
  es: {
    title: 'Consentimiento del cliente para WhatsApp', intro: 'Elige las finalidades, guarda los avisos y configura en Shopify.', help: 'Cómo funcionan el consentimiento y los mensajes',
    rules: 'El cliente debe elegir libremente y enviar por sí mismo el texto exacto de WhatsApp. Un clic, una configuración guardada, YES/OK genérico o una casilla de email/SMS de Shopify no otorgan consentimiento. No envíes mensajes de WhatsApp no solicitados para pedirlo.',
    merchantName: 'Nombre del comercio mostrado al cliente', pages: 'Abrir Páginas de Shopify', source: 'Página de la tienda donde mostrarás los avisos (URL HTTPS myshopify.com)', language: 'Idioma del aviso al cliente', select: 'Ofrecer esta finalidad', extra: 'Aviso adicional del comercio (opcional)', save: 'Guardar cambios', unsaved: 'Cambios sin guardar. Guarda antes de añadir consentimiento a tu tienda.', selectPurpose: 'Selecciona y guarda al menos una finalidad.', saving: 'Guardando…', saved: 'Configuración guardada; no se creó consentimiento del cliente.', error: 'No se pudo guardar o verificar. Revisa las conexiones y el aviso guardado y reintenta.', unavailable: 'Conecta Shopify y WhatsApp y activa tu espacio de Growth Engine para configurar el consentimiento.',
    share: 'Copiar aviso y enlace de aceptación', copied: 'Copiado', copyError: 'No se pudo copiar. Selecciona y copia el aviso y el enlace de abajo.', notShared: 'Guarda esta finalidad antes de compartirla. Comprueba Shopify, el número de WhatsApp Business y la disponibilidad del consentimiento.',
    proof: 'Guardar los avisos prepara tu tienda. Cada cliente aún debe enviar el texto exacto de la finalidad elegida; solo pueden cumplir los requisitos los clientes Shopify coincidentes.',
    scopes: 'Recoger consentimiento y enviar mensajes son pasos separados. Elige y activa cada recorrido después de configurar, con plantillas aprobadas por Meta. Los clientes pueden enviar STOP para darse de baja. Las bajas, compras completadas y restricciones de contacto siguen impidiendo mensajes.',
    stale: 'El aviso guardado pertenece a una conexión anterior. Revísalo y vuelve a guardarlo antes de compartir.', phone: 'El teléfono comercial conectado no está disponible. Revisa la conexión WhatsApp.',
    readiness: 'Preparación de recorridos', purpose: 'Finalidad', templates: 'Configuración de plantilla', merchant: 'Activación del comercio', consent: 'Elegibilidad por consentimiento', release: 'Disponibilidad', ready: 'Verificada', blocked: 'Bloqueada', on: 'Activado', off: 'En pausa', scoped: 'Disponible', perRecipient: 'Obligatorio para cada destinatario', captureBlocked: 'Captura de consentimiento no disponible; revisa las comprobaciones', selected: 'Recorrido seleccionado', notSelected: 'Recorrido no seleccionado', activationBlocked: 'Activación bloqueada', activationReady: 'Requisitos de activación verificados',
    eligibility: 'La preparación describe tu configuración, no el permiso de todos los clientes. Cada destinatario debe dar permiso vigente para ese mensaje y cumplir los requisitos de envío.',
  },
  he: {
    title: 'הסכמת לקוחות ל-WhatsApp', intro: 'יש לבחור מטרות להסכמה, לשמור את ההודעות ולהגדיר ב-Shopify.', help: 'כיצד פועלים הסכמה ושליחת הודעות',
    rules: 'הלקוח חייב לבחור מרצונו ולשלוח בעצמו את הטקסט המדויק ב-WhatsApp. לחיצה, הגדרה שמורה, YES/OK כללי או תיבת הסכמה לאימייל/SMS ב-Shopify אינם מעניקים הסכמה. אין לשלוח הודעת WhatsApp לא רצויה כדי לבקש הסכמה.',
    merchantName: 'שם העסק המוצג ללקוחות', pages: 'פתיחת דפים ב-Shopify', source: 'דף החנות להצגת ההודעות (כתובת HTTPS ב-myshopify.com)', language: 'שפת הודעת ההסכמה ללקוח', select: 'הצעת מטרה זו', extra: 'הודעה נוספת מטעם העסק (רשות)', save: 'שמירת שינויים', unsaved: 'יש שינויים שלא נשמרו. יש לשמור לפני הוספת הסכמה לחנות.', selectPurpose: 'יש לבחור ולשמור לפחות מטרת הסכמה אחת.', saving: 'שומרים…', saved: 'ההגדרה נשמרה; לא נוצרה הסכמת לקוח.', error: 'לא ניתן לשמור או לאמת. יש לבדוק את החיבורים וההודעה השמורה ולנסות שוב.', unavailable: 'יש לחבר Shopify ו-WhatsApp ולהפעיל את סביבת Growth Engine כדי להגדיר הסכמה.',
    share: 'העתקת ההודעה וקישור ההסכמה', copied: 'הועתק', copyError: 'ההעתקה נכשלה. יש לבחור ולהעתיק את ההודעה והקישור למטה.', notShared: 'שמרו מטרה זו לפני שיתוף. בדקו שחיבור Shopify ומספר WhatsApp Business פעילים ושאיסוף הסכמה זמין.',
    proof: 'שמירת ההודעות מכינה את החנות. הלקוחות עדיין צריכים לשלוח את הטקסט המדויק למטרה שבחרו; רק לקוחות Shopify תואמים יכולים לעמוד בתנאים.',
    scopes: 'איסוף הסכמה ושליחת הודעות הם צעדים נפרדים. בחרו והפעילו כל מסע לאחר ההגדרה, באמצעות תבניות מאושרות של Meta. לקוחות יכולים לשלוח STOP כדי להסיר את עצמם. בקשות הסרה, רכישות שהושלמו והגבלות קשר עדיין מונעות הודעות.',
    stale: 'ההודעה השמורה שייכת לחיבור קודם. יש לבדוק ולשמור שוב לפני שיתוף.', phone: 'מספר העסק המחובר אינו זמין. יש לבדוק את חיבור WhatsApp.',
    readiness: 'מוכנות המסעות', purpose: 'מטרה', templates: 'הגדרת תבנית', merchant: 'הפעלת העסק', consent: 'זכאות לפי הסכמה', release: 'זמינות', ready: 'אומתה', blocked: 'חסום', on: 'מופעל', off: 'מושהה', scoped: 'זמין', perRecipient: 'נדרשת לכל נמען', captureBlocked: 'איסוף הסכמה אינו זמין; יש לעיין בבדיקות הנדרשות', selected: 'המסע נבחר', notSelected: 'המסע לא נבחר', activationBlocked: 'ההפעלה חסומה', activationReady: 'תנאי ההפעלה אומתו',
    eligibility: 'המוכנות מתארת את ההגדרה שלכם, ולא הסכמה של כל הלקוחות. כל נמען צריך לתת הסכמה עדכנית למטרת ההודעה ולעמוד בתנאי השליחה.',
  },
} as const;

const blockerCopy = {
  en: { consent_capture_environment_required: 'Consent collection is unavailable. Contact support.', consent_capture_pilot_required: 'Consent collection is not yet available for this store. Contact support.', consent_capture_merchant_required: 'Ask support to verify this store’s access to consent collection.', consent_capture_connection_required: 'Review your Shopify and WhatsApp connections with support.', consent_capture_signing_key_required: 'Consent collection needs attention from support.', title: 'Required checks', controlled_journey_release_required: 'This journey is not available for this store. Contact support.', journey_not_selected: 'Select this journey', template_verification_required: 'Verify an approved matching template', operator_release_required: 'Sending is not yet available for this store. Contact support.', consent_capture_release_required: 'Consent collection is not available for this store. Contact support.', consent_schema_required: 'Consent setup needs attention from support.', schema_required: 'Message setup needs attention from support.', verification_required: 'Verify current templates and WhatsApp connection', journeys_and_templates_required: 'Select journeys and assign approved templates', merchant_activation_required: 'Enable delivery separately', recipient_consent_required: 'Each customer needs permission for this purpose and must meet the sending requirements.' },
  es: { consent_capture_environment_required: 'El consentimiento no está disponible. Contacta con soporte.', consent_capture_pilot_required: 'El consentimiento aún no está disponible para esta tienda. Contacta con soporte.', consent_capture_merchant_required: 'Solicita a soporte verificar el acceso de la tienda al consentimiento.', consent_capture_connection_required: 'Revisa las conexiones Shopify y WhatsApp con soporte.', consent_capture_signing_key_required: 'La recogida de consentimiento requiere atención de soporte.', title: 'Comprobaciones necesarias', controlled_journey_release_required: 'Este recorrido no está disponible para la tienda. Contacta con soporte.', journey_not_selected: 'Selecciona este recorrido', template_verification_required: 'Verifica una plantilla aprobada compatible', operator_release_required: 'El envío aún no está disponible para la tienda. Contacta con soporte.', consent_capture_release_required: 'El consentimiento no está disponible para esta tienda. Contacta con soporte.', consent_schema_required: 'La configuración del consentimiento requiere atención de soporte.', schema_required: 'La configuración de mensajes requiere atención de soporte.', verification_required: 'Verifica las plantillas actuales y la conexión WhatsApp', journeys_and_templates_required: 'Selecciona recorridos y asigna plantillas aprobadas', merchant_activation_required: 'Activa el envío por separado', recipient_consent_required: 'Cada cliente debe dar permiso para esta finalidad y cumplir los requisitos de envío.' },
  he: { consent_capture_environment_required: 'איסוף הסכמה אינו זמין. פנו לתמיכה.', consent_capture_pilot_required: 'איסוף הסכמה עדיין אינו זמין לחנות זו. פנו לתמיכה.', consent_capture_merchant_required: 'בקשו מהתמיכה לבדוק את הגישה של החנות לאיסוף הסכמה.', consent_capture_connection_required: 'בדקו את חיבורי Shopify ו-WhatsApp עם התמיכה.', consent_capture_signing_key_required: 'איסוף ההסכמה דורש טיפול של התמיכה.', title: 'בדיקות נדרשות', controlled_journey_release_required: 'המסע אינו זמין לחנות זו. פנו לתמיכה.', journey_not_selected: 'יש לבחור מסע זה', template_verification_required: 'יש לאמת תבנית מאושרת מתאימה', operator_release_required: 'השליחה עדיין אינה זמינה לחנות זו. פנו לתמיכה.', consent_capture_release_required: 'איסוף הסכמה אינו זמין לחנות זו. פנו לתמיכה.', consent_schema_required: 'הגדרת ההסכמה דורשת טיפול של התמיכה.', schema_required: 'הגדרת ההודעות דורשת טיפול של התמיכה.', verification_required: 'יש לאמת תבניות עדכניות וחיבור WhatsApp', journeys_and_templates_required: 'יש לבחור מסעות ולשייך תבניות מאושרות', merchant_activation_required: 'יש להפעיל שליחה בנפרד', recipient_consent_required: 'כל לקוח צריך לתת הסכמה למטרה זו ולעמוד בתנאי השליחה.' },
} as const;

export function ShopifyConsentEnrollmentPanel({ locale, data, onSave, saving = false, saved = false, failed = false, themeSetup }: {
  locale: string; data?: EnrollmentView; onSave: (draft: EnrollmentDraft) => void; saving?: boolean; saved?: boolean; failed?: boolean;
  themeSetup?: (blocked: boolean, reason?: string) => React.ReactNode;
}) {
  const lang = (locale.split('-')[0] in copy ? locale.split('-')[0] : 'en') as ConsentLocale, t = copy[lang];
  const [draft, setDraft] = useState<EnrollmentDraft>(() => data?.draft ?? { ...emptyEnrollment(lang), sourceUrl: data ? `https://${data.shop}/` : '' });
  const [copied, setCopied] = useState<string | null>(null), [copyFailed, setCopyFailed] = useState(false);
  const dirty = !enrollmentDraftsEqual(draft, data?.draft);
  const captureRows = data?.rows.filter(row => row.notice) ?? [];
  const captureReason = captureRows.flatMap(row => row.blockers).find(reason => reason.startsWith('consent_'));
  const storefrontReason = saving ? t.saving : dirty ? t.unsaved : !data?.connectionCurrent ? t.stale :
    !data.phoneAvailable ? t.phone : !captureRows.length ? t.selectPurpose :
    !captureRows.some(row => row.link && row.captureReady) ?
      (captureReason ? (blockerCopy[lang] as Record<string, string>)[captureReason] : undefined) ?? t.captureBlocked : undefined;
  return <section lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} data-testid="shopify-consent-enrollment" className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 shadow-sm sm:p-6">
    <h2 className="text-base font-semibold text-slate-950">{t.title}</h2>
    <p className="text-sm text-slate-600">{t.intro}</p>
    {!data ? <p role="status">{t.unavailable}</p> : <>
      {!data.connectionCurrent && data.draft && <p role="status">{t.stale}</p>}
      {!data.phoneAvailable && <p role="status">{t.phone}</p>}
      {themeSetup?.(!!storefrontReason, storefrontReason)}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (dirty && !saving) onSave(draft); }}>
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-lg border bg-white p-3 shadow-sm" data-testid="consent-save-bar">
          <button type="submit" disabled={saving || !dirty} aria-busy={saving}
            className={`rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-default ${dirty && !saving ? 'bg-green-700 text-white hover:bg-green-800' : 'border bg-slate-100 text-slate-600'}`}>
            {saving ? t.saving : t.save}
          </button>
          <p role="status" aria-live="polite" className="text-sm">{saving ? t.saving : dirty ? t.unsaved : data.draft ? t.saved : ''}</p>
          {failed && <p role="alert" className="text-sm text-red-700">{t.error}</p>}
        </div>
        <label className="block text-sm">{t.merchantName}<input required type="text" maxLength={120} className="mt-1 w-full rounded border p-2" value={draft.merchantName}
          disabled={saving} onChange={e => setDraft({ ...draft, merchantName: e.target.value })}/></label>
        <label className="block text-sm">{t.language}<select className="ms-2 rounded border p-2" value={draft.locale} disabled={saving}
          onChange={e => setDraft({ ...draft, locale: e.target.value as ConsentLocale })}>
          <option value="en">English</option><option value="es">Español</option><option value="he">עברית</option>
        </select></label>
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-3 md:grid-cols-2 sm:p-4">{CONSENT_PURPOSES.map((purpose, i) => {
          const row = draft.purposes[purpose], committed = data.rows.find(r => r.purpose === purpose);
          const shareable = !dirty && committed?.link && committed.notice;
          const asset = `${committed?.notice}\n${WHATSAPP_CONSENT_PHRASES[purpose]}\n${committed?.link}`;
          return <fieldset key={purpose} className={`min-w-0 space-y-3 rounded-xl border p-4 shadow-sm transition-colors ${row.selected ? 'border-blue-300 bg-blue-50/80' : 'border-slate-300 bg-white'}`} data-testid={`enroll-${purpose}`}>
            <legend className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-950">{CONSENT_LABELS[lang][i]}</legend>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input type="checkbox" checked={row.selected} disabled={saving}
              onChange={e => setDraft({ ...draft, purposes: { ...draft.purposes, [purpose]: { ...row, selected: e.target.checked } } })}/>{t.select}</label>
            {row.selected && <>
              <label className="block text-sm">{t.extra}<textarea maxLength={500} className="mt-2 min-h-20 w-full rounded-md border border-slate-300 bg-white p-2.5 text-sm" value={row.additionalText} disabled={saving}
                onChange={e => setDraft({ ...draft, purposes: { ...draft.purposes, [purpose]: { ...row, additionalText: e.target.value } } })}/></label>
              <p lang={draft.locale} dir={draft.locale === 'he' ? 'rtl' : 'ltr'} className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white/85 p-3 text-sm leading-relaxed text-slate-700">{enrollmentNotice(data.shop, purpose, draft)}</p>
              <code dir="ltr" className="block break-words rounded-md bg-slate-200/70 px-2 py-1 text-xs text-slate-700">{WHATSAPP_CONSENT_PHRASES[purpose]}</code>
              {shareable ? <>
                <input aria-label={t.share} readOnly dir="ltr" className="w-full rounded-md border border-slate-300 bg-white p-2 text-xs" value={committed.link!}/>
                <button type="button" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50" onClick={() => {
                  setCopyFailed(false); void navigator.clipboard.writeText(asset).then(() => setCopied(purpose)).catch(() => setCopyFailed(true));
                }}>{copied === purpose ? t.copied : t.share}</button>
              </> : <p className="text-xs text-amber-800">{t.notShared}</p>}
            </>}
          </fieldset>;
        })}</div>
      </form>
      {copyFailed && <p role="alert">{t.copyError}</p>}
      <h3 className="pt-2 text-base font-semibold text-slate-950">{t.readiness}</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm"><table className="w-full text-start text-sm" data-testid="consent-readiness"><thead className="bg-slate-100 text-slate-700"><tr>
        {[t.purpose, t.templates, t.merchant, t.consent, t.release].map(label => <th key={label} className="p-2 text-start">{label}</th>)}
      </tr></thead><tbody>{data.rows.map(row => <tr key={row.purpose} data-testid={`readiness-${row.purpose}`} className="border-t border-slate-200 hover:bg-slate-50">
        <th scope="row" className="p-2 text-start">{CONSENT_LABELS[lang][CONSENT_PURPOSES.indexOf(row.purpose)]}<span className="block text-xs font-normal">{row.selected ? t.selected : t.notSelected}</span>
          <details className="mt-1 text-xs font-normal"><summary>{blockerCopy[lang].title}</summary><ul className="list-inside list-disc">{[...new Set(row.blockers)].map(reason =>
            <li key={reason}>{(blockerCopy[lang] as Record<string, string>)[reason] ?? t.blocked}</li>)}</ul></details></th>
        <td className="p-2">{row.templateReady ? t.ready : t.blocked}</td><td className="p-2">{row.merchantEnabled ? t.on : t.off}<span className="block text-xs">{row.activationBlocked ? t.activationBlocked : t.activationReady}</span></td>
        <td className="p-2">{t.perRecipient}{!row.captureReady && <span className="block text-xs">{t.captureBlocked}</span>}</td><td className="p-2">{row.operatorReleased ? t.scoped : t.blocked}</td>
      </tr>)}</tbody></table></div>
    </>}
    <details className="space-y-2 text-sm" data-testid="consent-compliance-help"><summary className="cursor-pointer">{t.help}</summary>
      <p>{t.rules}</p><p>{t.proof}</p><p>{t.scopes}</p><p>{t.eligibility}</p>
    </details>
  </section>;
}

export function ShopifyConsentEnrollment({ locale }: { locale: string }) {
  const { user, sessionAligned } = useAuth();
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [failed, setFailed] = useState(false);
  const endpoint = '/api/shopify/merchant-engine/consent-enrollment';
  const query = useQuery<EnrollmentView>({ queryKey: withUserQueryScope([endpoint], user?.id), enabled: !!user?.id && sessionAligned,
    // A missing Meta/WhatsApp prerequisite returns 409. Show the existing
    // unavailable state instead of repeating that failed request every 15s.
    retry: false, refetchInterval: current => current.state.status === 'error' ? false : 15_000, queryFn: async () => {
      const response = await fetch(endpoint, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw Error('enrollment_unavailable'); return response.json();
    } });
  const data = sessionAligned && !query.isError && typeof query.data?.shop === 'string' && Array.isArray(query.data.rows) ? query.data : undefined;
  async function save(draft: EnrollmentDraft) {
    if (!user?.id || !sessionAligned || saving) return;
    setSaving(true); setSaved(false); setFailed(false);
    try {
      const response = await fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      if (!response.ok) throw Error('enrollment_save_failed');
      const result = await response.json();
      if (result.ok !== true || result.consentGranted !== false || result.messagingEnabled !== false) throw Error('unexpected_consent');
      const check = await query.refetch();
      if (check.isError || !check.data?.connectionCurrent || !enrollmentDraftsEqual(check.data.draft, draft)) throw Error('enrollment_not_persisted');
      setSaved(true);
    } catch { setFailed(true); } finally { setSaving(false); }
  }
  return <ShopifyConsentEnrollmentPanel key={`${user?.id}:${data?.shop ?? 'loading'}:${data?.revision ?? 'new'}`} locale={locale} data={data} saving={saving}
    saved={saved} failed={failed} onSave={draft => void save(draft)} themeSetup={(blocked, reason) => <ShopifyConsentThemeSetup locale={locale} blocked={blocked} blockedReason={reason}/>} />;
}
