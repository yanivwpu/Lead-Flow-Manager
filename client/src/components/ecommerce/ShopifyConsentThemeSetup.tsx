import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { withUserQueryScope } from '@/lib/accountQueryScope';
import type { ConsentThemeSetup } from '@shared/shopifyConsentStorefront';

const copy = {
  en: { setup: 'Set up in Shopify', instruction: 'Enable the consent section and save your theme in Shopify. We’ll check when you return.',
    notEnabled: 'Not enabled on published theme', diagnostic: 'Verification result', notSet: 'Not set up', ready: 'Ready to install', live: 'Live on store', checking: 'Checking store…', unavailable: 'Setup unavailable', verification: 'Verification needed',
    save: 'Save your notices first.', unreleased: 'Storefront setup is not available yet. Contact support.', unsupported: 'This store has no supported Online Store theme.',
    proxy: 'Approve access in Shopify to continue setup.', permission: 'Automatic verification needs theme read access. You can still set up in Shopify.',
    unverified: 'We couldn’t verify the published theme. Try again.', help: 'Setup help', approve: 'Allow automatic verification in Shopify', retry: 'Check again',
    detail: 'Only the published theme can confirm installation. Opening the editor or saving notices does not prove it is live. This checks theme activation, not whether notices rendered. Setup does not grant customer consent or enable messaging.',
    error: 'Couldn’t complete setup. Allow pop-ups for Shopify and try again.' },
  es: { setup: 'Configurar en Shopify', instruction: 'Activa la sección de consentimiento y guarda el tema en Shopify. Lo comprobaremos cuando vuelvas.',
    notEnabled: 'No activado en el tema publicado', diagnostic: 'Resultado de verificación', notSet: 'Sin configurar', ready: 'Listo para instalar', live: 'Activo en la tienda', checking: 'Comprobando tienda…', unavailable: 'Configuración no disponible', verification: 'Verificación pendiente',
    save: 'Guarda tus avisos primero.', unreleased: 'La instalación aún no está disponible. Contacta con soporte.', unsupported: 'Esta tienda no tiene un tema de tienda online compatible.',
    proxy: 'Aprueba el acceso en Shopify para continuar.', permission: 'La verificación automática necesita acceso de lectura al tema. Puedes configurar en Shopify igualmente.',
    unverified: 'No pudimos verificar el tema publicado. Reintenta.', help: 'Ayuda de instalación', approve: 'Permitir verificación automática en Shopify', retry: 'Comprobar de nuevo',
    detail: 'Solo el tema publicado confirma la instalación. Abrir el editor o guardar avisos no demuestra que esté activo. Se comprueba la activación del tema, no si se mostraron los avisos. La instalación no otorga consentimiento ni activa mensajes.',
    error: 'No se pudo completar la instalación. Permite ventanas emergentes de Shopify y reintenta.' },
  he: { setup: 'הגדרה ב-Shopify', instruction: 'יש להפעיל את מקטע ההסכמה ולשמור את ערכת העיצוב ב-Shopify. נבדוק כשתחזרו.',
    notEnabled: 'לא מופעל בערכת העיצוב שפורסמה', diagnostic: 'תוצאת האימות', notSet: 'לא הוגדר', ready: 'מוכן להתקנה', live: 'פעיל בחנות', checking: 'בודקים את החנות…', unavailable: 'ההגדרה אינה זמינה', verification: 'נדרש אימות',
    save: 'יש לשמור תחילה את ההודעות.', unreleased: 'ההתקנה עדיין אינה זמינה. יש לפנות לתמיכה.', unsupported: 'אין בחנות ערכת עיצוב נתמכת של חנות מקוונת.',
    proxy: 'יש לאשר גישה ב-Shopify כדי להמשיך בהגדרה.', permission: 'אימות אוטומטי דורש הרשאת קריאה לערכת העיצוב. עדיין ניתן להגדיר ב-Shopify.',
    unverified: 'לא ניתן לאמת את ערכת העיצוב שפורסמה. יש לנסות שוב.', help: 'עזרה בהגדרה', approve: 'אישור אימות אוטומטי ב-Shopify', retry: 'בדיקה חוזרת',
    detail: 'רק ערכת העיצוב שפורסמה מאשרת התקנה. פתיחת העורך או שמירת ההודעות אינן מוכיחות שהמקטע פעיל. הבדיקה מאמתת הפעלת ערכת עיצוב, ולא הצגת הודעות בפועל. ההגדרה אינה מעניקה הסכמת לקוח ואינה מפעילה הודעות.',
    error: 'לא ניתן להשלים את ההגדרה. יש לאפשר חלונות קופצים עבור Shopify ולנסות שוב.' },
};
export function ConsentThemePanel({ locale, setup, blocked, blockedReason, busy, failed, checking = false, action }: {
  locale: string; setup?: ConsentThemeSetup; blocked: boolean; blockedReason?: string; busy: boolean; failed: boolean; checking?: boolean;
  action: (action: 'open_editor' | 'verify') => void;
}) {
  const lang = locale.startsWith('he') ? 'he' : locale.startsWith('es') ? 'es' : 'en', t = copy[lang];
  const state = setup?.state;
  const unavailable = !setup || state === 'unreleased' || state === 'not_supported';
  const verification = state === 'permission_required' || state === 'unverified' || state === 'editor_opened' || state === 'merchant_confirmed_saved';
  const status = checking ? t.checking : failed ? t.verification : unavailable ? t.unavailable :
    state === 'enabled_verified' ? t.live : state === 'disabled_verified' ? t.notEnabled : blocked ? t.notSet : verification ? t.verification : t.ready;
  const reason = state === 'unreleased' ? t.unreleased : state === 'not_supported' ? t.unsupported :
    state === 'proxy_permission_required' ? t.proxy : state === 'permission_required' ? t.permission : verification ? t.unverified : null;
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45';
  return <div lang={lang} dir={lang === 'he' ? 'rtl' : 'ltr'} className="space-y-3 rounded border p-3" data-testid="consent-theme-setup">
    <p role="status" aria-live="polite" className="font-semibold">{status}</p>
    <p className="text-sm">{t.instruction}</p>
    {reason && <p className="text-sm">{reason}</p>}
    {blocked && <p id="consent-storefront-blocker" role="status">{blockedReason ?? t.save}</p>}
    <button type="button" data-testid="consent-add-storefront" className={`${base} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`}
      aria-describedby={blocked ? 'consent-storefront-blocker' : undefined} aria-busy={busy}
      disabled={blocked || busy || unavailable || !(setup?.editorUrl || (state === 'proxy_permission_required' && setup.approvalUrl))}
      onClick={() => action('open_editor')}>{t.setup} <span aria-hidden="true">↗</span></button>
    <details className="text-sm" data-testid="consent-theme-help">
      <summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">{t.help}</summary>
      <p className="my-2">{t.detail}</p>
      {setup?.verificationReason && <p data-testid="consent-verification-reason">{t.diagnostic}: <code dir="ltr">{setup.verificationReason}</code></p>}
      {state === 'permission_required' && setup?.approvalUrl && <a className={`${base} border-slate-300`} target="_blank" rel="noopener noreferrer" href={setup.approvalUrl}>{t.approve} ↗</a>}
      <button type="button" className={`${base} border-slate-300`} disabled={busy || checking} onClick={() => action('verify')}>{t.retry}</button>
      {setup?.checkedAt && <time className="block text-xs" dateTime={setup.checkedAt}>{new Date(setup.checkedAt).toLocaleString(lang)}</time>}
    </details>
    {failed && <p role="alert">{t.error}</p>}
  </div>;
}
export function ShopifyConsentThemeSetup({ locale, blocked, blockedReason }: { locale: string; blocked: boolean; blockedReason?: string }) {
  const { user, sessionAligned } = useAuth();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const activeAccount = useRef<string | undefined>(undefined), acting = useRef(false);
  activeAccount.current = sessionAligned ? user?.id : undefined;
  const endpoint = '/api/shopify/merchant-engine/consent-theme';
  const query = useQuery<ConsentThemeSetup>({ queryKey: withUserQueryScope([endpoint], user?.id), enabled: !!user?.id && sessionAligned,
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => { const r = await fetch(endpoint, { credentials: 'include', cache: 'no-store' }); if (!r.ok) throw Error('setup'); return r.json(); } });
  const { refetch } = query;
  useEffect(() => {
    activeAccount.current = sessionAligned ? user?.id : undefined;
    if (!sessionAligned || !user?.id) return;
    const accountId = user.id;
    let lastReturn = 0;
    const check = () => {
      // Both events can fire for one return. Coalesce them and any running read;
      // there is no polling and no merchant declaration of preview/save.
      if (document.visibilityState === 'hidden' || acting.current || Date.now() - lastReturn < 1000) return;
      lastReturn = Date.now();
      void refetch({ cancelRefetch: false }).then(result => {
        if (!result.isError && activeAccount.current === accountId) setFailed(false);
      });
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      activeAccount.current = undefined;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [user?.id, sessionAligned, refetch]);
  const setup = sessionAligned && !query.isError ? query.data : undefined;
  async function act(action: 'open_editor' | 'verify') {
    if (acting.current || !sessionAligned || !user?.id || (action === 'open_editor' && blocked)) return;
    if (action === 'verify') { setFailed(false); await refetch({ cancelRefetch: false }); return; }
    const accountId = user.id;
    // Open during the gesture, then use only the authenticated server's
    // validated destination. Shopify retains control of approval and saving.
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setFailed(true); return; }
    tab.opener = null;
    acting.current = true; setBusy(true); setFailed(false);
    try {
      const r = await fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      if (!r.ok) throw Error('setup');
      const next = await r.json();
      if (activeAccount.current !== accountId || next.consentGranted !== false || next.messagingEnabled !== false) throw Error('unsafe_setup');
      const destination = next.state === 'proxy_permission_required' ? next.approvalUrl : next.editorUrl;
      // Destination must match the current server-read setup. If permissions
      // changed, show the new state and let the merchant retry explicitly.
      const expected = next.state === 'proxy_permission_required' ? setup?.approvalUrl : setup?.editorUrl;
      client.setQueryData(withUserQueryScope([endpoint], accountId), next);
      if (!destination || destination !== expected) throw Error('destination_changed');
      tab.location.href = destination;
    } catch { tab.close(); if (activeAccount.current === accountId) setFailed(true); }
    finally { acting.current = false; if (activeAccount.current === accountId) setBusy(false); }
  }
  return <ConsentThemePanel locale={locale} setup={setup} blocked={blocked} blockedReason={blockedReason} busy={busy}
    checking={query.isFetching} failed={failed || query.isError} action={a => void act(a)}/>;
}
