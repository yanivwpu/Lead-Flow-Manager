import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { withUserQueryScope } from '@/lib/accountQueryScope';
import { ShopifyConsentThemeSetup } from './ShopifyConsentThemeSetup';
import { CONSENT_PURPOSES, CONSENT_LABELS, WHATSAPP_CONSENT_PHRASES, emptyEnrollment, enrollmentNotice, enrollmentDraftsEqual,
  type ConsentLocale, type EnrollmentDraft, type EnrollmentView } from '@shared/shopifyConsentEnrollment';

const copy = {
  en: {
    title: 'Customer WhatsApp consent', intro: 'Choose each purpose separately and save your notices. Add the consent section through the Shopify theme editor, preview it and save your theme. Your saved notices appear automatically; no page creation or code copying is needed.',
    rules: 'Customers must choose freely and send the exact displayed WhatsApp text themselves. A click, saved setting, generic YES/OK, or Shopify email/SMS checkbox grants no consent. Never send an unsolicited WhatsApp message to request consent.',
    merchantName: 'Your business name shown to customers', pages: 'Open Shopify Pages', source: 'Store page where you will display these notices (HTTPS myshopify.com URL)', language: 'Customer notice language', select: 'Offer this purpose', extra: 'Additional merchant notice (optional)', save: 'Save enrollment configuration', saving: 'Saving…', saved: 'Configuration saved; no customer consent was created.', error: 'Could not save or verify configuration. Check your store URL and connections, then retry.', unavailable: 'Connect Shopify and WhatsApp and activate your Growth Engine workspace to configure consent.',
    share: 'Copy notice and opt-in link', copied: 'Copied', copyError: 'Copy failed. Select and copy the notice and link below.', notShared: 'Save this purpose before sharing. A current connection, connected business phone and authorized consent capture scope are required.',
    proof: 'Configuration records the owner, time, notice revision and declared store page. It does not prove a customer viewed that page. Consent evidence comes only from a fresh signed Meta reply, matched to the same Shopify customer, shop and WhatsApp phone. Unknown or mismatched customers remain ineligible.',
    scopes: 'Capture and delivery are separately controlled. Production release covers only the approved pilot recipient and journey; it does not authorize a merchant cohort. STOP, purchase, do-not-contact and privacy checks still apply before sending.',
    stale: 'The saved notice belongs to an earlier connection. Review and save again before sharing.', phone: 'The connected business phone is unavailable. Check the WhatsApp connection before sharing.',
    readiness: 'Journey readiness', purpose: 'Purpose', templates: 'Template setup', merchant: 'Merchant enabled', consent: 'Consent eligibility', release: 'Operator release', ready: 'Verified', blocked: 'Blocked', on: 'Enabled', off: 'Paused', scoped: 'Controlled scope only', perRecipient: 'Required for each recipient', captureBlocked: 'Consent capture unavailable; review required checks', selected: 'Journey selected', notSelected: 'Journey not selected', activationBlocked: 'Activation blocked', activationReady: 'Activation prerequisites verified',
    eligibility: 'No recipient is declared eligible here. At send time, consent must match this exact purpose and pass identity, freshness, STOP, DNC, purchase and privacy checks.',
  },
  es: {
    title: 'Consentimiento del cliente para WhatsApp', intro: 'Elige cada finalidad y guarda los avisos. Añade la sección desde el editor de temas de Shopify, revísala y guarda el tema. Los avisos aparecen automáticamente, sin crear páginas ni copiar código.',
    rules: 'El cliente debe elegir libremente y enviar por sí mismo el texto exacto de WhatsApp. Un clic, una configuración guardada, YES/OK genérico o una casilla de email/SMS de Shopify no otorgan consentimiento. No envíes mensajes de WhatsApp no solicitados para pedirlo.',
    merchantName: 'Nombre del comercio mostrado al cliente', pages: 'Abrir Páginas de Shopify', source: 'Página de la tienda donde mostrarás los avisos (URL HTTPS myshopify.com)', language: 'Idioma del aviso al cliente', select: 'Ofrecer esta finalidad', extra: 'Aviso adicional del comercio (opcional)', save: 'Guardar configuración de consentimiento', saving: 'Guardando…', saved: 'Configuración guardada; no se creó consentimiento del cliente.', error: 'No se pudo guardar o verificar. Revisa la URL y las conexiones y reintenta.', unavailable: 'Conecta Shopify y WhatsApp y activa tu espacio de Growth Engine para configurar el consentimiento.',
    share: 'Copiar aviso y enlace de aceptación', copied: 'Copiado', copyError: 'No se pudo copiar. Selecciona y copia el aviso y el enlace de abajo.', notShared: 'Guarda esta finalidad antes de compartir. Se requieren conexión actual, teléfono comercial conectado y autorización para capturar consentimiento.',
    proof: 'La configuración registra propietario, fecha, revisión del aviso y página declarada. No prueba que el cliente viera esa página. La evidencia requiere una respuesta reciente con firma de Meta vinculada al mismo cliente Shopify, tienda y teléfono WhatsApp. Clientes desconocidos o sin coincidencia siguen sin ser elegibles.',
    scopes: 'La captura y el envío se autorizan por separado. El lanzamiento en producción cubre solo el destinatario y recorrido piloto aprobados; no autoriza un grupo de comercios. Antes del envío se comprueban STOP, compra, no contactar y privacidad.',
    stale: 'El aviso guardado pertenece a una conexión anterior. Revísalo y vuelve a guardarlo antes de compartir.', phone: 'El teléfono comercial conectado no está disponible. Revisa la conexión WhatsApp.',
    readiness: 'Preparación de recorridos', purpose: 'Finalidad', templates: 'Configuración de plantilla', merchant: 'Activación del comercio', consent: 'Elegibilidad por consentimiento', release: 'Autorización del operador', ready: 'Verificada', blocked: 'Bloqueada', on: 'Activado', off: 'En pausa', scoped: 'Solo alcance controlado', perRecipient: 'Obligatorio para cada destinatario', captureBlocked: 'Captura de consentimiento no disponible; revisa las comprobaciones', selected: 'Recorrido seleccionado', notSelected: 'Recorrido no seleccionado', activationBlocked: 'Activación bloqueada', activationReady: 'Requisitos de activación verificados',
    eligibility: 'Aquí no se declara elegible a ningún destinatario. Al enviar, el consentimiento debe coincidir con la finalidad y superar las comprobaciones de identidad, vigencia, STOP, no contactar, compra y privacidad.',
  },
  he: {
    title: 'הסכמת לקוחות ל-WhatsApp', intro: 'יש לבחור כל מטרה ולשמור את ההודעות. מוסיפים את מקטע ההסכמה בעורך ערכות העיצוב של Shopify, בודקים תצוגה מקדימה ושומרים. ההודעות מופיעות אוטומטית ללא יצירת דפים או העתקת קוד.',
    rules: 'הלקוח חייב לבחור מרצונו ולשלוח בעצמו את הטקסט המדויק ב-WhatsApp. לחיצה, הגדרה שמורה, YES/OK כללי או תיבת הסכמה לאימייל/SMS ב-Shopify אינם מעניקים הסכמה. אין לשלוח הודעת WhatsApp לא רצויה כדי לבקש הסכמה.',
    merchantName: 'שם העסק המוצג ללקוחות', pages: 'פתיחת דפים ב-Shopify', source: 'דף החנות להצגת ההודעות (כתובת HTTPS ב-myshopify.com)', language: 'שפת הודעת ההסכמה ללקוח', select: 'הצעת מטרה זו', extra: 'הודעה נוספת מטעם העסק (רשות)', save: 'שמירת הגדרת הסכמה', saving: 'שומרים…', saved: 'ההגדרה נשמרה; לא נוצרה הסכמת לקוח.', error: 'לא ניתן לשמור או לאמת. יש לבדוק את כתובת החנות והחיבורים ולנסות שוב.', unavailable: 'יש לחבר Shopify ו-WhatsApp ולהפעיל את סביבת Growth Engine כדי להגדיר הסכמה.',
    share: 'העתקת ההודעה וקישור ההסכמה', copied: 'הועתק', copyError: 'ההעתקה נכשלה. יש לבחור ולהעתיק את ההודעה והקישור למטה.', notShared: 'יש לשמור מטרה זו לפני שיתוף. נדרשים חיבור עדכני, מספר עסק מחובר והרשאה לאיסוף הסכמה.',
    proof: 'ההגדרה מתעדת בעלים, זמן, גרסת הודעה ודף חנות מוצהר. היא אינה מוכיחה שהלקוח צפה בדף. ראיית ההסכמה מחייבת תשובה עדכנית חתומה מ-Meta המשויכת לאותו לקוח Shopify, חנות ומספר WhatsApp. לקוחות לא מזוהים או לא תואמים אינם זכאים.',
    scopes: 'איסוף הסכמה ושליחה מאושרים בנפרד. האישור בייצור מוגבל לנמען ולמסע הפיילוט שאושרו; הוא אינו מאשר קבוצת חנויות. לפני שליחה נבדקים STOP, רכישה, איסור יצירת קשר ופרטיות.',
    stale: 'ההודעה השמורה שייכת לחיבור קודם. יש לבדוק ולשמור שוב לפני שיתוף.', phone: 'מספר העסק המחובר אינו זמין. יש לבדוק את חיבור WhatsApp.',
    readiness: 'מוכנות המסעות', purpose: 'מטרה', templates: 'הגדרת תבנית', merchant: 'הפעלת העסק', consent: 'זכאות לפי הסכמה', release: 'אישור מפעיל', ready: 'אומתה', blocked: 'חסום', on: 'מופעל', off: 'מושהה', scoped: 'היקף מבוקר בלבד', perRecipient: 'נדרשת לכל נמען', captureBlocked: 'איסוף הסכמה אינו זמין; יש לעיין בבדיקות הנדרשות', selected: 'המסע נבחר', notSelected: 'המסע לא נבחר', activationBlocked: 'ההפעלה חסומה', activationReady: 'תנאי ההפעלה אומתו',
    eligibility: 'מסך זה אינו מצהיר על זכאות נמען. בעת שליחה ההסכמה חייבת להתאים למטרה ולעבור בדיקות זהות, תוקף, STOP, איסור יצירת קשר, רכישה ופרטיות.',
  },
} as const;

const blockerCopy = {
  en: { title: 'Required checks', controlled_journey_release_required: 'Select only the journey authorized by the controlled release', journey_not_selected: 'Select this journey', template_verification_required: 'Verify an approved matching template', operator_release_required: 'Obtain controlled operator release', consent_capture_release_required: 'Consent capture scope is not authorized', consent_schema_required: 'Consent database setup is incomplete', schema_required: 'Delivery database setup is incomplete', verification_required: 'Verify current templates and WhatsApp connection', journeys_and_templates_required: 'Select journeys and assign approved templates', merchant_activation_required: 'Enable delivery separately', recipient_consent_required: 'Verify consent and suppression for each recipient before sending' },
  es: { title: 'Comprobaciones necesarias', controlled_journey_release_required: 'Selecciona solo el recorrido autorizado para el lanzamiento controlado', journey_not_selected: 'Selecciona este recorrido', template_verification_required: 'Verifica una plantilla aprobada compatible', operator_release_required: 'Se requiere autorización controlada del operador', consent_capture_release_required: 'Captura de consentimiento sin autorizar', consent_schema_required: 'Configuración de base de datos de consentimiento incompleta', schema_required: 'Configuración de base de datos de envío incompleta', verification_required: 'Verifica las plantillas actuales y la conexión WhatsApp', journeys_and_templates_required: 'Selecciona recorridos y asigna plantillas aprobadas', merchant_activation_required: 'Activa el envío por separado', recipient_consent_required: 'Verifica consentimiento y supresión por destinatario antes de enviar' },
  he: { title: 'בדיקות נדרשות', controlled_journey_release_required: 'יש לבחור רק את המסע שאושר לפתיחה המבוקרת', journey_not_selected: 'יש לבחור מסע זה', template_verification_required: 'יש לאמת תבנית מאושרת מתאימה', operator_release_required: 'נדרש אישור מפעיל בהיקף מבוקר', consent_capture_release_required: 'היקף איסוף ההסכמה אינו מאושר', consent_schema_required: 'הגדרת מסד הנתונים להסכמה אינה מלאה', schema_required: 'הגדרת מסד הנתונים לשליחה אינה מלאה', verification_required: 'יש לאמת תבניות עדכניות וחיבור WhatsApp', journeys_and_templates_required: 'יש לבחור מסעות ולשייך תבניות מאושרות', merchant_activation_required: 'יש להפעיל שליחה בנפרד', recipient_consent_required: 'לפני שליחה יש לאמת הסכמה ומניעת שליחה לכל נמען' },
} as const;

export function ShopifyConsentEnrollmentPanel({ locale, data, onSave, saving = false, saved = false, failed = false, themeSetup }: {
  locale: string; data?: EnrollmentView; onSave: (draft: EnrollmentDraft) => void; saving?: boolean; saved?: boolean; failed?: boolean;
  themeSetup?: (blocked: boolean) => React.ReactNode;
}) {
  const lang = (locale.split('-')[0] in copy ? locale.split('-')[0] : 'en') as ConsentLocale, t = copy[lang];
  const [draft, setDraft] = useState<EnrollmentDraft>(() => data?.draft ?? { ...emptyEnrollment(lang), sourceUrl: data ? `https://${data.shop}/` : '' });
  const [copied, setCopied] = useState<string | null>(null), [copyFailed, setCopyFailed] = useState(false);
  const dirty = !enrollmentDraftsEqual(draft, data?.draft);
  return <section lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} data-testid="shopify-consent-enrollment" className="space-y-4 rounded-xl border bg-white p-5">
    <h2 className="font-semibold">{t.title}</h2>
    <p className="text-sm text-slate-600">{t.intro}</p><p className="text-sm">{t.rules}</p>
    {!data ? <p role="status">{t.unavailable}</p> : <>
      {!data.connectionCurrent && data.draft && <p role="status">{t.stale}</p>}
      {!data.phoneAvailable && <p role="status">{t.phone}</p>}
      {themeSetup?.(dirty || saving || !data.connectionCurrent || !data.rows.some(row => row.link && row.captureReady))}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); onSave(draft); }}>
        <label className="block text-sm">{t.merchantName}<input required type="text" maxLength={120} className="mt-1 w-full rounded border p-2" value={draft.merchantName}
          disabled={saving} onChange={e => setDraft({ ...draft, merchantName: e.target.value })}/></label>
        <label className="block text-sm">{t.language}<select className="ms-2 rounded border p-2" value={draft.locale} disabled={saving}
          onChange={e => setDraft({ ...draft, locale: e.target.value as ConsentLocale })}>
          <option value="en">English</option><option value="es">Español</option><option value="he">עברית</option>
        </select></label>
        <div className="grid gap-3 md:grid-cols-2">{CONSENT_PURPOSES.map((purpose, i) => {
          const row = draft.purposes[purpose], committed = data.rows.find(r => r.purpose === purpose);
          const shareable = !dirty && committed?.link && committed.notice;
          const asset = `${committed?.notice}\n${WHATSAPP_CONSENT_PHRASES[purpose]}\n${committed?.link}`;
          return <fieldset key={purpose} className="space-y-2 rounded border p-3" data-testid={`enroll-${purpose}`}>
            <legend className="px-1 font-medium">{CONSENT_LABELS[lang][i]}</legend>
            <label className="flex gap-2 text-sm"><input type="checkbox" checked={row.selected} disabled={saving}
              onChange={e => setDraft({ ...draft, purposes: { ...draft.purposes, [purpose]: { ...row, selected: e.target.checked } } })}/>{t.select}</label>
            {row.selected && <>
              <label className="block text-sm">{t.extra}<textarea maxLength={500} className="mt-1 w-full rounded border p-2" value={row.additionalText} disabled={saving}
                onChange={e => setDraft({ ...draft, purposes: { ...draft.purposes, [purpose]: { ...row, additionalText: e.target.value } } })}/></label>
              <p lang={draft.locale} dir={draft.locale === 'he' ? 'rtl' : 'ltr'} className="whitespace-pre-wrap text-sm">{enrollmentNotice(data.shop, purpose, draft)}</p>
              <code dir="ltr" className="block break-words text-xs">{WHATSAPP_CONSENT_PHRASES[purpose]}</code>
              {shareable ? <>
                <input aria-label={t.share} readOnly dir="ltr" className="w-full rounded border p-2 text-xs" value={committed.link!}/>
                <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => {
                  setCopyFailed(false); void navigator.clipboard.writeText(asset).then(() => setCopied(purpose)).catch(() => setCopyFailed(true));
                }}>{copied === purpose ? t.copied : t.share}</button>
              </> : <p className="text-xs text-amber-800">{t.notShared}</p>}
            </>}
          </fieldset>;
        })}</div>
        <button type="submit" disabled={saving} className="rounded border px-4 py-2 text-sm disabled:opacity-50">{saving ? t.saving : t.save}</button>
      </form>
      {saved && !dirty && <p role="status">{t.saved}</p>}{failed && <p role="alert">{t.error}</p>}{copyFailed && <p role="alert">{t.copyError}</p>}
      <h3 className="font-semibold">{t.readiness}</h3>
      <div className="overflow-x-auto"><table className="w-full text-start text-sm" data-testid="consent-readiness"><thead><tr>
        {[t.purpose, t.templates, t.merchant, t.consent, t.release].map(label => <th key={label} className="p-2 text-start">{label}</th>)}
      </tr></thead><tbody>{data.rows.map(row => <tr key={row.purpose} data-testid={`readiness-${row.purpose}`} className="border-t">
        <th scope="row" className="p-2 text-start">{CONSENT_LABELS[lang][CONSENT_PURPOSES.indexOf(row.purpose)]}<span className="block text-xs font-normal">{row.selected ? t.selected : t.notSelected}</span>
          <details className="mt-1 text-xs font-normal"><summary>{blockerCopy[lang].title}</summary><ul className="list-inside list-disc">{[...new Set(row.blockers)].map(reason =>
            <li key={reason}>{(blockerCopy[lang] as Record<string, string>)[reason] ?? t.blocked}</li>)}</ul></details></th>
        <td className="p-2">{row.templateReady ? t.ready : t.blocked}</td><td className="p-2">{row.merchantEnabled ? t.on : t.off}<span className="block text-xs">{row.activationBlocked ? t.activationBlocked : t.activationReady}</span></td>
        <td className="p-2">{t.perRecipient}{!row.captureReady && <span className="block text-xs">{t.captureBlocked}</span>}</td><td className="p-2">{row.operatorReleased ? t.scoped : t.blocked}</td>
      </tr>)}</tbody></table></div><p className="text-sm">{t.eligibility}</p>
    </>}
    <p className="text-xs text-slate-600">{t.proof}</p><p className="text-xs text-slate-600">{t.scopes}</p>
  </section>;
}

export function ShopifyConsentEnrollment({ locale }: { locale: string }) {
  const { user, sessionAligned } = useAuth();
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [failed, setFailed] = useState(false);
  const endpoint = '/api/shopify/merchant-engine/consent-enrollment';
  const query = useQuery<EnrollmentView>({ queryKey: withUserQueryScope([endpoint], user?.id), enabled: !!user?.id && sessionAligned,
    retry: false, refetchInterval: 15_000, queryFn: async () => {
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
    saved={saved} failed={failed} onSave={draft => void save(draft)} themeSetup={blocked => <ShopifyConsentThemeSetup locale={locale} blocked={blocked}/>}/>;
}
