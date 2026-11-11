import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { SHOPIFY_GROWTH_TEMPLATES, type ShopifyTemplateSetup as Setup, type ShopifySetupStatus } from "@shared/shopifyGrowthTemplates";
import {POST_PURCHASE_JOURNEYS,type PostPurchaseJourney} from "@shared/postPurchase";

const copy = {
  en: {
    title: "Automatic WhatsApp message setup", detail: "We check your connected WhatsApp Business Account, reuse compatible approved messages, and submit missing English messages to Meta for review.",
    permission: "Set up order confirmations, shipping updates, cancellations and checkout reminders. This authorizes template setup only. Choose and enable your journeys separately; customers need consent for each message purpose.",
    authorize: "Set up my messages", working: "Saving…", connect: "Connect WhatsApp", refresh: "Refresh template status", refreshing:"Checking Meta status…", refreshed:"Status updated", lastChecked:"Last checked", pendingHint:"Meta approval may take additional time. You can leave this page while we keep checking.", error: "Setup status is unavailable. Try again.",
    waiting: "Setup is running. You can leave this page; we keep checking Meta approval.", rollout: "Automatic setup is not available for this store yet.",
    safe: "Template approval does not turn on customer messages. Each journey needs your permission and must pass its delivery checks.",
    labels: ["Order confirmation", "Shipping update", "Order cancellation", "Checkout reminder"],
    statuses: { ready: "Ready", awaiting_approval: "Awaiting Meta approval", action_required: "Action required", unavailable: "Unavailable", active: "Active", paused: "Paused" },
    reasons: { merchant_template_paused: "You cleared this message selection. Select an approved message in Post-Purchase to resume.", connect_whatsapp: "Connect your WhatsApp Business Account to continue.", authorize_template_setup: "Allow automatic message setup to begin.",
      operator_release_required: "Sending is awaiting a controlled release.", verification_required: "We need to check the current Meta status.",
      approved_and_bound: "Approved in your account and assigned to this journey.", meta_review_pending: "Meta is reviewing this message.", setup_queued: "Automatic setup is queued.", submission_pending: "Submitting this message for review.",
      meta_template_paused: "Meta paused or disabled this message. Sending is blocked.", meta_template_rejected: "Meta rejected this message. Review it in your WhatsApp Library.",
      meta_category_changed: "Meta changed the message category. This journey needs a matching category.",
      meta_credentials_expired: "Renew your WhatsApp connection to continue.", meta_management_permission_required: "Your WhatsApp connection needs permission to manage message templates.",
      selected_template_requires_attention: "Your selected message is preserved, but its approval, content or category needs attention.",
      existing_template_conflict: "A message with this name has different content or settings. Your message has been preserved.",
      submission_uncertain: "Meta has not confirmed this submission. We will check its status without submitting it again.",
      submitted_template_not_visible: "The submitted message is not visible in Meta yet.", meta_connection_changed: "Your WhatsApp account changed. Review the connection and authorize setup again.",
      meta_template_inventory_incomplete: "We could not check all your messages. No new message was submitted.", meta_rate_limited: "Meta asked us to wait. We will check again later.",
      meta_temporarily_unavailable: "Meta is temporarily unavailable. We will check again later.", template_changed: "The current message no longer matches this journey." },
    library: "Open WhatsApp Library",include:"Include this journey",enablePost:"Enable selected post-purchase journeys",pausePost:"Pause post-purchase journeys",
    enableRecovery:"Enable checkout reminders",pauseRecovery:"Pause checkout reminders",release:"Sending is unavailable until the controlled release and all delivery checks pass.",
    selected:"Selected post-purchase purposes",extraLabels:["Review request","Repeat-purchase offer","Customer win-back"],
  },
  es: {
    title: "Configuración automática de mensajes WhatsApp", detail: "Comprobamos tu cuenta de WhatsApp Business, reutilizamos mensajes aprobados compatibles y enviamos los que faltan en inglés a Meta para su revisión.",
    permission: "Configura confirmaciones, envíos, cancelaciones y recordatorios de checkout. Esto autoriza solo las plantillas. Elige y activa los recorridos por separado; cada finalidad requiere consentimiento del cliente.",
    authorize: "Configurar mis mensajes", working: "Guardando…", connect: "Conectar WhatsApp", refresh: "Actualizar estado de plantillas", refreshing:"Consultando el estado de Meta…", refreshed:"Estado actualizado", lastChecked:"Última comprobación", pendingHint:"La aprobación de Meta puede tardar. Puedes salir de esta página mientras seguimos comprobando.", error: "Estado no disponible. Inténtalo de nuevo.",
    waiting: "La configuración continúa aunque salgas de esta página. Comprobamos la aprobación de Meta.", rollout: "La configuración automática aún no está disponible para esta tienda.",
    safe: "La aprobación no activa mensajes a clientes. Cada recorrido requiere tu permiso y las comprobaciones de envío.",
    labels: ["Confirmación de pedido", "Actualización de envío", "Cancelación de pedido", "Recordatorio de checkout"],
    statuses: { ready: "Listo", awaiting_approval: "Pendiente de aprobación de Meta", action_required: "Acción requerida", unavailable: "No disponible", active: "Activo", paused: "En pausa" },
    reasons: { merchant_template_paused: "Eliminaste la selección de este mensaje. Elige un mensaje aprobado en Poscompra para continuar.", connect_whatsapp: "Conecta tu cuenta de WhatsApp Business.", authorize_template_setup: "Autoriza la configuración automática.",
      operator_release_required: "El envío espera un lanzamiento controlado.", verification_required: "Debemos comprobar el estado actual en Meta.",
      approved_and_bound: "Aprobado en tu cuenta y asignado a este recorrido.", meta_review_pending: "Meta está revisando el mensaje.", setup_queued: "Configuración en cola.", submission_pending: "Enviando a revisión.",
      meta_template_paused: "Meta pausó o desactivó el mensaje. Envío bloqueado.", meta_template_rejected: "Meta rechazó el mensaje. Revísalo en tu biblioteca WhatsApp.",
      meta_category_changed: "Meta cambió la categoría. Este recorrido necesita una categoría compatible.",
      meta_credentials_expired: "Renueva la conexión de WhatsApp.", meta_management_permission_required: "La conexión necesita permiso para gestionar plantillas.",
      selected_template_requires_attention: "Conservamos tu selección; revisa su aprobación, contenido o categoría.", existing_template_conflict: "Ya existe un mensaje con este nombre y otro contenido o formato. Lo conservamos.",
      submission_uncertain: "Meta no confirmó el envío a revisión. Consultaremos su estado sin enviarlo otra vez.", submitted_template_not_visible: "Meta aún no muestra el mensaje enviado.",
      meta_connection_changed: "Cambió la cuenta de WhatsApp. Revisa la conexión y autoriza de nuevo.", meta_template_inventory_incomplete: "No se pudieron consultar todos los mensajes. No se envió ninguno nuevo.",
      meta_rate_limited: "Meta pidió esperar. Lo comprobaremos más tarde.", meta_temporarily_unavailable: "Meta no está disponible temporalmente. Lo comprobaremos después.", template_changed: "El mensaje actual ya no es compatible con este recorrido." },
    library: "Abrir biblioteca WhatsApp",include:"Incluir este recorrido",enablePost:"Activar recorridos poscompra seleccionados",pausePost:"Pausar recorridos poscompra",
    enableRecovery:"Activar recordatorios de checkout",pauseRecovery:"Pausar recordatorios de checkout",release:"Envío no disponible hasta el lanzamiento controlado y todas las verificaciones.",
    selected:"Finalidades poscompra seleccionadas",extraLabels:["Solicitud de reseña","Oferta de nueva compra","Recuperación de clientes"],
  },
  he: {
    title: "הגדרה אוטומטית של הודעות WhatsApp", detail: "נבדוק את חשבון WhatsApp Business המחובר, נשתמש בהודעות מאושרות מתאימות ונגיש ל-Meta הודעות חסרות באנגלית לבדיקה.",
    permission: "הגדרת אישורי הזמנה, עדכוני משלוח, ביטולים ותזכורות תשלום. האישור מתייחס להגדרת תבניות בלבד. בוחרים ומפעילים מסעות בנפרד; נדרשת הסכמת הלקוח לכל מטרת הודעה.",
    authorize: "הגדרת ההודעות שלי", working: "שומרים…", connect: "חיבור WhatsApp", refresh: "רענון מצב התבניות", refreshing:"בודקים את המצב מול Meta…", refreshed:"המצב עודכן", lastChecked:"נבדק לאחרונה", pendingHint:"אישור Meta עשוי להימשך זמן נוסף. ניתן לצאת מהדף בזמן שאנו ממשיכים לבדוק.", error: "מצב ההגדרה אינו זמין. יש לנסות שוב.",
    waiting: "ההגדרה ממשיכה גם לאחר יציאה מהדף. נמשיך לבדוק את האישור של Meta.", rollout: "ההגדרה האוטומטית עדיין אינה זמינה לחנות זו.",
    safe: "אישור תבנית אינו מפעיל שליחה ללקוחות. כל מסע דורש את אישורכם ואת בדיקות הזכאות לשליחה.",
    labels: ["אישור הזמנה", "עדכון משלוח", "ביטול הזמנה", "תזכורת לתשלום"],
    statuses: { ready: "מוכן", awaiting_approval: "ממתין לאישור Meta", action_required: "נדרשת פעולה", unavailable: "לא זמין", active: "פעיל", paused: "מושהה" },
    reasons: { merchant_template_paused: "בחירת ההודעה הוסרה. להמשך יש לבחור הודעה מאושרת באזור לאחר רכישה.", connect_whatsapp: "יש לחבר את חשבון WhatsApp Business.", authorize_template_setup: "יש לאשר הגדרה אוטומטית.", operator_release_required: "השליחה ממתינה לפתיחה מבוקרת.",
      verification_required: "נדרשת בדיקת המצב העדכני ב-Meta.", approved_and_bound: "אושר בחשבון שלכם ושויך למסע.", meta_review_pending: "Meta בודקת את ההודעה.", setup_queued: "ההגדרה ממתינה בתור.", submission_pending: "מגישים את ההודעה לבדיקה.",
      meta_template_paused: "Meta השהתה או השביתה את ההודעה. השליחה חסומה.", meta_template_rejected: "Meta דחתה את ההודעה. יש לבדוק אותה בספריית WhatsApp.",
      meta_category_changed: "Meta שינתה את קטגוריית ההודעה. נדרשת קטגוריה מתאימה למסע.", meta_credentials_expired: "יש לחדש את חיבור WhatsApp.",
      meta_management_permission_required: "נדרשת הרשאה לניהול תבניות בחיבור WhatsApp.", selected_template_requires_attention: "בחירתכם נשמרה, אך יש לבדוק את האישור, התוכן או הקטגוריה.",
      existing_template_conflict: "כבר קיימת הודעה בשם זה עם תוכן או מבנה אחרים. ההודעה נשמרה.", submission_uncertain: "Meta טרם אישרה את ההגשה. נבדוק את המצב בלי להגיש שוב.",
      submitted_template_not_visible: "ההודעה שהוגשה עדיין אינה מופיעה ב-Meta.", meta_connection_changed: "חשבון WhatsApp השתנה. יש לבדוק את החיבור ולאשר מחדש.",
      meta_template_inventory_incomplete: "לא ניתן לבדוק את כל ההודעות. לא הוגשה הודעה חדשה.", meta_rate_limited: "Meta ביקשה להמתין. נבדוק שוב בהמשך.",
      meta_temporarily_unavailable: "Meta אינה זמינה כרגע. נבדוק שוב בהמשך.", template_changed: "ההודעה הנוכחית אינה מתאימה עוד למסע." },
    library: "פתיחת ספריית WhatsApp",include:"הכללת המסע",enablePost:"הפעלת המסעות הנבחרים לאחר רכישה",pausePost:"השהיית המסעות לאחר רכישה",
    enableRecovery:"הפעלת תזכורות לתשלום",pauseRecovery:"השהיית תזכורות לתשלום",release:"השליחה אינה זמינה עד לפתיחה מבוקרת והשלמת כל בדיקות הזכאות.",
    selected:"מטרות נבחרות לאחר רכישה",extraLabels:["בקשת חוות דעת","הצעה לרכישה חוזרת","החזרת לקוחות"],
  },
} as const;

export function ShopifyTemplateSetupPanel({ locale, data, saving = false, failed = false, refreshing = false, refreshedAt = null, onAuthorize, onRefresh,onPlan,onDelivery }: {
  locale: string; data?: Setup; saving?: boolean; failed?: boolean; refreshing?: boolean; refreshedAt?: number|null; onAuthorize: () => void; onRefresh: () => void;
  onPlan?:(journey:PostPurchaseJourney,selected:boolean)=>void;
  onDelivery?:(journey:'postPurchase'|'checkoutRecovery',enabled:boolean)=>void;
}) {
  const language = locale.split("-")[0], t = copy[language as keyof typeof copy] ?? copy.en;
  const connectionAttention=data?.rows.find(row=>['meta_credentials_expired','meta_management_permission_required','meta_connection_changed'].includes(row.reason));
  return <section lang={language} dir={language === "he" ? "rtl" : "ltr"} data-testid="shopify-template-setup"
    className="space-y-4 rounded-xl border border-blue-100 bg-white p-5">
    <h2 className="font-semibold text-slate-950">{t.title}</h2>
    <p className="text-sm text-slate-600">{t.detail}</p>
    {!data && <p role="status" className="text-sm text-slate-600">{t.error}</p>}
    {data && !data.available && <p role="status" className="text-sm text-slate-600">{t.rollout}</p>}
    {connectionAttention&&<p role="status" className="text-sm text-amber-800">{(t.reasons as Record<string,string>)[connectionAttention.reason]}</p>}
    {data && (!data.connected||connectionAttention) && <a href="/app/settings?tab=channels" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{t.connect}</a>}
    {data?.available && data.connected && !data.authorized && !connectionAttention && <div className="space-y-3">
      <p className="text-sm text-slate-600">{t.permission}</p>
      <button type="button" disabled={saving} onClick={onAuthorize} data-testid="authorize-template-setup"
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t.working : t.authorize}</button>
    </div>}
    {data?.authorized && <ul className="grid gap-3 sm:grid-cols-2" aria-live="polite">
      {SHOPIFY_GROWTH_TEMPLATES.map((template, index) => {
        const row = data.rows.find(item => item.journey === template.journey);
        const status: ShopifySetupStatus = row?.status ?? "unavailable";
        const reasons = t.reasons as Record<string, string>;
        return <li key={template.journey} className="space-y-1 rounded-lg border p-3" data-testid={`template-progress-${template.journey}`}>
          <h3 className="text-sm font-medium">{t.labels[index]}</h3>
          <p className={"text-sm font-semibold " + (status === "ready" ? "text-emerald-700" : "text-slate-700")}>{t.statuses[status]}</p>
          <p className="text-xs text-slate-600">{reasons[row?.reason ?? ""] ?? t.error}</p>
          {template.journey!=='checkoutRecovery'&&onPlan&&<label className="flex items-center gap-2 pt-2 text-sm">
            <input type="checkbox" checked={data.postPurchasePlans?.[template.journey]?.selected??false} disabled={saving||data.delivery?.postPurchase.merchantEnabled}
              onChange={event=>onPlan(template.journey as PostPurchaseJourney,event.target.checked)}/>{t.include}
          </label>}
        </li>;
      })}
    </ul>}
    {data?.authorized && data.rows.some(row => row.status === "awaiting_approval") && <p className="text-sm text-slate-600">{t.waiting}</p>}
    {data?.delivery&&onDelivery&&<div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm text-slate-600">{t.release}</p>
      <p className="text-sm">{t.selected}: {POST_PURCHASE_JOURNEYS.filter(j=>data.postPurchasePlans?.[j]?.selected).map(j=>
        j==='reviewRequest'?t.extraLabels[0]:j==='repeatPurchase'?t.extraLabels[1]:j==='winBack'?t.extraLabels[2]:
        t.labels[SHOPIFY_GROWTH_TEMPLATES.findIndex(template=>template.journey===j)]).join(', ')||'—'}</p>
      {(['postPurchase','checkoutRecovery'] as const).map(kind=>{
        const state=data.delivery![kind];
        return <div key={kind} className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" data-testid={`activate-${kind}`} disabled={saving||(!state.merchantEnabled&&!state.canActivate)}
            className="rounded border px-3 py-2 font-medium disabled:opacity-50" onClick={()=>onDelivery(kind,!state.merchantEnabled)}>
            {kind==='postPurchase'?(state.merchantEnabled?t.pausePost:t.enablePost):(state.merchantEnabled?t.pauseRecovery:t.enableRecovery)}
          </button>
          <span role="status">{state.deliveryEnabled?t.statuses.active:state.merchantEnabled?t.statuses.paused:state.canActivate?t.statuses.ready:t.statuses.unavailable}</span>
        </div>;
      })}
    </div>}
    {failed && <p role="alert" className="text-sm text-red-700">{t.error}</p>}
    {saving&&data?.authorized&&<p role="status" className="text-sm text-slate-600">{t.working}</p>}
    <div className="flex flex-wrap items-center gap-4 text-sm text-blue-700">
      <button type="button" disabled={saving || refreshing} aria-busy={refreshing}
        data-testid="refresh-template-status" onClick={onRefresh}
        className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-3 py-2 font-medium hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
        {refreshing && <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />}
        {refreshing ? t.refreshing : t.refresh}
      </button>
      {data?.rows.some(row => row.status === "action_required" || row.status === "paused") && <a href="/app/templates?tab=templates" className="underline">{t.library}</a>}
    </div>
    <p role="status" aria-live="polite" data-testid="template-refresh-feedback" className="text-xs text-slate-600">
      {refreshing ? t.refreshing : refreshedAt != null ? `${t.refreshed}: ${new Date(refreshedAt).toLocaleTimeString(language)}` : ""}
      {data?.rows.some(row => row.status === "awaiting_approval") && ` ${t.pendingHint}`}
    </p>
    <p className="text-xs text-slate-600">{t.safe}</p>
  </section>;
}

export function ShopifyTemplateSetup({ locale }: { locale: string }) {
  const { user, sessionAligned } = useAuth(), client = useQueryClient();
  const [saving, setSaving] = useState(false), [failed, setFailed] = useState(false);
  const [refreshing,setRefreshing]=useState(false), [refreshedAt,setRefreshedAt]=useState<number|null>(null);
  const endpoint = "/api/shopify/merchant-engine/template-setup";
  const query = useQuery<Setup>({
    queryKey: withUserQueryScope([endpoint], user?.id), enabled: !!user?.id && sessionAligned, retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const response = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw Error("template_setup_unavailable");
      return response.json();
    },
  });
  const setupData=Array.isArray(query.data?.rows)?query.data:undefined;
  const bindingVersion = setupData?.rows.map(row => `${row.journey}:${row.status}:${row.templateId ?? ""}`).join("|");
  useEffect(() => {
    if (!user?.id || !sessionAligned || !bindingVersion) return;
    void client.invalidateQueries({ queryKey: withUserQueryScope(["/api/templates"], user.id) });
    void client.invalidateQueries({ queryKey: withUserQueryScope(["/api/shopify/ecommerce/event-inbox-preview"], user.id) });
  }, [bindingVersion, user?.id, sessionAligned, client]);
  async function authorize() {
    if (!sessionAligned || saving) return;
    setSaving(true); setFailed(false);
    try {
      const response = await fetch(endpoint, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authorize_template_setup", packageVersion: 1 }) });
      if (!response.ok) throw Error("template_setup_unavailable");
      await query.refetch();
      await client.invalidateQueries({ queryKey: withUserQueryScope(["/api/templates"], user?.id) });
    } catch { setFailed(true); } finally { setSaving(false); }
  }
  async function refreshStatus(){
    if(refreshing || saving || !sessionAligned)return;
    setRefreshing(true);setFailed(false);
    try {
      const result=await query.refetch();
      if(result.isError || !result.data)throw Error("template_setup_unavailable");
      setRefreshedAt(Date.now());
    } catch { setFailed(true); } finally { setRefreshing(false); }
  }
  async function update(path:string,body:unknown){
    if(!user?.id||!sessionAligned||saving)return;
    setSaving(true);setFailed(false);
    try{
      const response=await fetch('/api/shopify/merchant-engine/'+path,{method:'POST',credentials:'include',
        headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!response.ok)throw Error('journey_update_failed');
      await query.refetch();
      await client.invalidateQueries({queryKey:withUserQueryScope(['/api/shopify/ecommerce/event-inbox-preview'],user.id)});
    }catch{setFailed(true);}finally{setSaving(false);}
  }
  return <ShopifyTemplateSetupPanel locale={locale} data={sessionAligned && !query.isError ? setupData : undefined}
    saving={saving} failed={failed || query.isError} refreshing={refreshing} refreshedAt={refreshedAt} onAuthorize={() => void authorize()}
    onRefresh={() => { void refreshStatus(); }}
    onPlan={(journey,selected)=>void update('journey-plan',{action:'save_post_purchase_plan',journey,
      plan:{selected,delayMinutes:query.data?.postPurchasePlans?.[journey].delayMinutes??0}})}
    onDelivery={(journey,enabled)=>void update('journey-activation',{action:'set_journey_delivery',journey,enabled})}/>
}
