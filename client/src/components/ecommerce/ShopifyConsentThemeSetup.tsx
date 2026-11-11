import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { withUserQueryScope } from '@/lib/accountQueryScope';
import type { ConsentThemeSetup } from '@shared/shopifyConsentStorefront';

const copy = {
  en: { add: 'Add consent to my storefront', confirm: 'I previewed and saved in Shopify', verify: 'Check published theme', approve: 'Approve theme read access in Shopify',
    help: 'Preview the consent section in Shopify, then save the theme yourself. Notices stay in sync with your saved configuration. This does not grant consent or enable messaging.',
    save: 'Save your notice configuration first.', error: 'Storefront setup could not be verified. Retry the published-theme check.',
    states: { unreleased: 'Storefront extension awaiting a separate Shopify app version release.', configured: 'Configured; storefront activation not verified.', editor_opened: 'Editor opened; preview and save are not yet verified.', merchant_confirmed_saved: 'You confirmed preview and save; published activation is not verified.', enabled_verified: 'Consent embed enabled on the published theme (verified).', disabled_verified: 'Consent embed is not enabled on the published theme (verified).', not_supported: 'No supported Online Store theme found. Existing engine functions remain available.', permission_required: 'Published state is unverified. Optional merchant approval is needed to read theme settings.', unverified: 'Published state could not be verified.' } },
  es: { add: 'Añadir consentimiento a mi tienda', confirm: 'Revisé y guardé en Shopify', verify: 'Comprobar tema publicado', approve: 'Aprobar lectura del tema en Shopify',
    help: 'Revisa la sección en Shopify y guarda el tema tú mismo. Los avisos se actualizan con la configuración guardada. Esto no otorga consentimiento ni activa mensajes.',
    save: 'Guarda primero la configuración de avisos.', error: 'No se pudo verificar la instalación. Reintenta comprobar el tema publicado.',
    states: { unreleased: 'La extensión requiere un lanzamiento separado de versión en Shopify.', configured: 'Configurado; activación sin verificar.', editor_opened: 'Editor abierto; vista previa y guardado sin verificar.', merchant_confirmed_saved: 'Confirmaste revisión y guardado; activación publicada sin verificar.', enabled_verified: 'Sección activada en el tema publicado (verificado).', disabled_verified: 'Sección no activada en el tema publicado (verificado).', not_supported: 'No hay tema de tienda compatible. Las funciones existentes siguen disponibles.', permission_required: 'Estado publicado sin verificar. Se necesita aprobación opcional para leer el tema.', unverified: 'No se pudo verificar el estado publicado.' } },
  he: { add: 'הוספת הסכמה לחנות שלי', confirm: 'בדקתי תצוגה מקדימה ושמרתי ב-Shopify', verify: 'בדיקת ערכת העיצוב שפורסמה', approve: 'אישור קריאת ערכת העיצוב ב-Shopify',
    help: 'יש לבדוק את מקטע ההסכמה ב-Shopify ולשמור את ערכת העיצוב בעצמך. ההודעות מתעדכנות לפי ההגדרות השמורות. הפעולה אינה מעניקה הסכמה ואינה מפעילה הודעות.',
    save: 'יש לשמור תחילה את הגדרות ההודעות.', error: 'לא ניתן לאמת את ההתקנה. יש לנסות שוב את בדיקת ערכת העיצוב.',
    states: { unreleased: 'התוסף ממתין לשחרור נפרד של גרסת יישום Shopify.', configured: 'הוגדר; ההפעלה בחנות לא אומתה.', editor_opened: 'העורך נפתח; תצוגה מקדימה ושמירה טרם אומתו.', merchant_confirmed_saved: 'אישרת בדיקה ושמירה; ההפעלה שפורסמה לא אומתה.', enabled_verified: 'מקטע ההסכמה מופעל בערכת העיצוב שפורסמה (אומת).', disabled_verified: 'מקטע ההסכמה אינו מופעל בערכת העיצוב שפורסמה (אומת).', not_supported: 'לא נמצאה ערכת עיצוב נתמכת. התכונות הקיימות ממשיכות לפעול.', permission_required: 'המצב שפורסם לא אומת. נדרש אישור רשות לקריאת ההגדרות.', unverified: 'לא ניתן לאמת את המצב שפורסם.' } },
};
export function ConsentThemePanel({ locale, setup, blocked, busy, failed, action }: {
  locale: string; setup?: ConsentThemeSetup; blocked: boolean; busy: boolean; failed: boolean;
  action: (action: 'open_editor' | 'confirm_saved' | 'verify') => void;
}) {
  const lang = locale.startsWith('he') ? 'he' : locale.startsWith('es') ? 'es' : 'en', t = copy[lang];
  return <div lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} className="space-y-2 rounded border p-3" data-testid="consent-theme-setup">
    <p className="text-sm">{t.help}</p>
    {setup && <p role="status">{t.states[setup.state]}</p>}
    {blocked && <p>{t.save}</p>}
    <button type="button" className="rounded border px-4 py-2 disabled:opacity-50" disabled={blocked || busy || !setup?.editorUrl} onClick={() => action('open_editor')}>{t.add}</button>
    {setup?.editorUrl && <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded border p-2" disabled={blocked || busy} onClick={() => action('confirm_saved')}>{t.confirm}</button>
      <button type="button" className="rounded border p-2" disabled={busy} onClick={() => action('verify')}>{t.verify}</button>
    </div>}
    {setup?.approvalUrl && <a className="block underline" target="_blank" rel="noopener noreferrer" href={setup.approvalUrl}>{t.approve}</a>}
    {failed && <p role="alert">{t.error}</p>}
  </div>;
}
export function ShopifyConsentThemeSetup({ locale, blocked }: { locale: string; blocked: boolean }) {
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
      if (action === 'open_editor') {
        if (!next.editorUrl || next.editorUrl !== setup?.editorUrl || !tab) throw Error('editor');
        tab.location.href = next.editorUrl;
      }
      // Preserve the just-read published-state result without automatic API polling.
      client.setQueryData(withUserQueryScope([endpoint], user.id), next);
    } catch { tab?.close(); setFailed(true); } finally { setBusy(false); }
  }
  return <ConsentThemePanel locale={locale} setup={setup} blocked={blocked} busy={busy} failed={failed || query.isError} action={a => void act(a)}/>;
}
