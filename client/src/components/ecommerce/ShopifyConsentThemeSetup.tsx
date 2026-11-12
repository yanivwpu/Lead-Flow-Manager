import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { withUserQueryScope } from '@/lib/accountQueryScope';
import type { ConsentThemeSetup } from '@shared/shopifyConsentStorefront';

const copy = {
  en: { stepTitle: 'Storefront setup actions', next:'Next step', step1:'Add to Shopify',step2:'Confirm theme save',step3:'Verify storefront',step4:'Approve access', done:'Completed', add: 'Add consent to my storefront', confirm: 'I previewed and saved in Shopify', verify: 'Check published theme', approve: 'Approve theme read access in Shopify', approveProxy: 'Approve storefront proxy access in Shopify',
    help: 'Preview the consent section in Shopify, then save the theme yourself. Notices stay in sync with your saved configuration. This does not grant consent or enable messaging.',
    save: 'Save your notices and check consent capture readiness first.', confirmed: 'Your preview/save confirmation is recorded.', error: 'Storefront setup could not be verified. Retry the published-theme check.',
    states: { unreleased: 'Storefront extension awaiting a separate Shopify app version release.', configured: 'Configured; storefront activation not verified.', editor_opened: 'Editor opened; preview and save are not yet verified.', merchant_confirmed_saved: 'You confirmed preview and save; published activation is not verified.', enabled_verified: 'Consent embed enabled on the published theme (verified).', disabled_verified: 'Consent embed is not enabled on the published theme (verified).', not_supported: 'No supported Online Store theme found. Existing engine functions remain available.', proxy_permission_required: 'Shopify requires your approval for storefront notice access before adding this section.', permission_required: 'Published state is unverified. Optional merchant approval is needed to read theme settings.', unverified: 'Published state could not be verified.' } },
  es: { stepTitle: 'Acciones de instalación en la tienda', next:'Siguiente paso', step1:'Añadir a Shopify',step2:'Confirmar guardado',step3:'Verificar la tienda',step4:'Aprobar acceso',done:'Completado', add: 'Añadir consentimiento a mi tienda', confirm: 'Revisé y guardé en Shopify', verify: 'Comprobar tema publicado', approve: 'Aprobar lectura del tema en Shopify', approveProxy: 'Aprobar acceso de la tienda en Shopify',
    help: 'Revisa la sección en Shopify y guarda el tema tú mismo. Los avisos se actualizan con la configuración guardada. Esto no otorga consentimiento ni activa mensajes.',
    save: 'Guarda los avisos y revisa la captura de consentimiento primero.', confirmed: 'Se registró tu confirmación de revisión y guardado.', error: 'No se pudo verificar la instalación. Reintenta comprobar el tema publicado.',
    states: { unreleased: 'La extensión requiere un lanzamiento separado de versión en Shopify.', configured: 'Configurado; activación sin verificar.', editor_opened: 'Editor abierto; vista previa y guardado sin verificar.', merchant_confirmed_saved: 'Confirmaste revisión y guardado; activación publicada sin verificar.', enabled_verified: 'Sección activada en el tema publicado (verificado).', disabled_verified: 'Sección no activada en el tema publicado (verificado).', not_supported: 'No hay tema de tienda compatible. Las funciones existentes siguen disponibles.', proxy_permission_required: 'Shopify requiere tu aprobación de acceso a los avisos antes de añadir la sección.', permission_required: 'Estado publicado sin verificar. Se necesita aprobación opcional para leer el tema.', unverified: 'No se pudo verificar el estado publicado.' } },
  he: { stepTitle: 'שלבי ההתקנה בחנות', next:'השלב הבא', step1:'הוספה ל-Shopify',step2:'אישור שמירה',step3:'בדיקת החנות',step4:'אישור גישה',done:'הושלם', add: 'הוספת הסכמה לחנות שלי', confirm: 'בדקתי תצוגה מקדימה ושמרתי ב-Shopify', verify: 'בדיקת ערכת העיצוב שפורסמה', approve: 'אישור קריאת ערכת העיצוב ב-Shopify', approveProxy: 'אישור גישה לחנות ב-Shopify',
    help: 'יש לבדוק את מקטע ההסכמה ב-Shopify ולשמור את ערכת העיצוב בעצמך. ההודעות מתעדכנות לפי ההגדרות השמורות. הפעולה אינה מעניקה הסכמה ואינה מפעילה הודעות.',
    save: 'יש לשמור תחילה את ההודעות ולבדוק מוכנות לאיסוף הסכמה.', confirmed: 'אישורך על בדיקה ושמירה תועד.', error: 'לא ניתן לאמת את ההתקנה. יש לנסות שוב את בדיקת ערכת העיצוב.',
    states: { unreleased: 'התוסף ממתין לשחרור נפרד של גרסת יישום Shopify.', configured: 'הוגדר; ההפעלה בחנות לא אומתה.', editor_opened: 'העורך נפתח; תצוגה מקדימה ושמירה טרם אומתו.', merchant_confirmed_saved: 'אישרת בדיקה ושמירה; ההפעלה שפורסמה לא אומתה.', enabled_verified: 'מקטע ההסכמה מופעל בערכת העיצוב שפורסמה (אומת).', disabled_verified: 'מקטע ההסכמה אינו מופעל בערכת העיצוב שפורסמה (אומת).', not_supported: 'לא נמצאה ערכת עיצוב נתמכת. התכונות הקיימות ממשיכות לפעול.', proxy_permission_required: 'Shopify דורש את אישורך לגישה להודעות בחנות לפני הוספת המקטע.', permission_required: 'המצב שפורסם לא אומת. נדרש אישור רשות לקריאת ההגדרות.', unverified: 'לא ניתן לאמת את המצב שפורסם.' } },
};
export function ConsentThemePanel({ locale, setup, blocked, blockedReason, busy, failed, action }: {
  locale: string; setup?: ConsentThemeSetup; blocked: boolean; blockedReason?: string; busy: boolean; failed: boolean;
  action: (action: 'open_editor' | 'confirm_saved' | 'verify') => void;
}) {
  const lang = locale.startsWith('he') ? 'he' : locale.startsWith('es') ? 'es' : 'en', t = copy[lang];
  const approvalRequired = !!setup?.approvalUrl &&
    (setup?.state === 'permission_required' || setup?.state === 'proxy_permission_required');
  const storefrontVerified = setup?.state === 'enabled_verified';
  const hasEditor = !!setup?.editorUrl;
  const editorOpened = !!setup?.editorOpenedAt;
  const merchantConfirmed = !!setup?.merchantConfirmedAt;
  const nextAction = approvalRequired ? 'approve' :
    blocked || !hasEditor ? 'setup' :
    storefrontVerified ? 'done' :
    !editorOpened ? 'add' :
    !merchantConfirmed ? 'confirm' : 'verify';
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45';
  const primary = 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800';
  const secondary = 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50';
  const actionClass = (name: string) => `${base} ${name === nextAction ? primary : secondary}`;
  const step = (name: string, heading: string, body: ReactNode, complete = false) =>
    <div className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`consent-action-${name}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <strong className="text-sm">{heading}</strong>
        {name === nextAction && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">{t.next}</span>}
        {complete && <span className="text-xs font-medium text-emerald-700">✓ {t.done}</span>}
      </div>
      {body}
    </div>;
  return <div lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} className="space-y-3 rounded border p-3" data-testid="consent-theme-setup">
    <p className="text-sm">{t.help}</p>
    {setup && <p role="status">{t.states[setup.state]}</p>}
    {setup?.merchantConfirmedAt && <p className="text-sm">{t.confirmed}</p>}
    {setup?.checkedAt && <time className="block text-xs" dateTime={setup.checkedAt}>{new Date(setup.checkedAt).toLocaleString(lang)}</time>}
    {blocked && <p id="consent-storefront-blocker" role="status">{blockedReason ?? t.save}</p>}
    <h3 className="font-semibold">{t.stepTitle}</h3>
    <div className="grid gap-3 sm:grid-cols-2">
      {step('add', t.step1, <button type="button" data-testid="consent-add-storefront" className={actionClass('add')} aria-describedby={blocked ? 'consent-storefront-blocker' : undefined}
        disabled={blocked || busy || !hasEditor} onClick={() => action('open_editor')}>{t.add} <span aria-hidden="true">↗</span></button>, editorOpened)}
      {step('confirm', t.step2, <button type="button" className={actionClass('confirm')} disabled={blocked || busy || !hasEditor || !editorOpened}
        onClick={() => action('confirm_saved')}>{t.confirm}</button>, merchantConfirmed)}
      {step('verify', t.step3, <button type="button" className={actionClass('verify')} disabled={busy || !hasEditor}
        onClick={() => action('verify')}>{t.verify}</button>, storefrontVerified)}
      {approvalRequired && step('approve', t.step4, <a className={actionClass('approve')} target="_blank" rel="noopener noreferrer"
        href={setup!.approvalUrl!}>{setup?.state === 'proxy_permission_required' ? t.approveProxy : t.approve} <span aria-hidden="true">↗</span></a>)}
    </div>
    {failed && <p role="alert">{t.error}</p>}
  </div>;
}
export function ShopifyConsentThemeSetup({ locale, blocked, blockedReason }: { locale: string; blocked: boolean; blockedReason?: string }) {
  const { user, sessionAligned } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const endpoint = '/api/shopify/merchant-engine/consent-theme';
  const query = useQuery<ConsentThemeSetup>({ queryKey: withUserQueryScope([endpoint], user?.id), enabled: !!user?.id && sessionAligned,
    retry: false, queryFn: async () => { const r = await fetch(endpoint, { credentials: 'include', cache: 'no-store' }); if (!r.ok) throw Error('setup'); return r.json(); } });
  const setup = sessionAligned && !query.isError ? query.data : undefined;
  async function act(action: 'open_editor' | 'confirm_saved' | 'verify') {
    if (busy || !sessionAligned || !user?.id) return;
    // Create a tab inside the gesture to avoid popup blockers, then navigate
    // only to the authenticated server's validated Shopify destination.
    const tab = action === 'open_editor' ? window.open('about:blank', '_blank') : null;
    if (tab) tab.opener = null;
    setBusy(true); setFailed(false);
    try {
      const r = await fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!r.ok) throw Error('setup');
      const next = await r.json();
      if (next.consentGranted !== false || next.messagingEnabled !== false) throw Error('unsafe_setup');
      if (action === 'open_editor' && next.state === 'proxy_permission_required') {
        tab?.close();
      } else if (action === 'open_editor') {
        if (!next.editorUrl || next.editorUrl !== setup?.editorUrl || !tab) throw Error('editor');
        tab.location.href = next.editorUrl;
      }
      // Preserve the just-read published-state result without automatic API polling.
      client.setQueryData(withUserQueryScope([endpoint], user.id), next);
    } catch { tab?.close(); setFailed(true); } finally { setBusy(false); }
  }
  return <ConsentThemePanel locale={locale} setup={setup} blocked={blocked} blockedReason={blockedReason} busy={busy} failed={failed || query.isError} action={a => void act(a)}/>;
}
