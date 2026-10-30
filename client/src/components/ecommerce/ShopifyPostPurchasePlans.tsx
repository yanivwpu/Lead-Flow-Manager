import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { JOURNEY_POLICY, POST_PURCHASE_JOURNEYS, readPostPurchasePlans, type PostPurchasePlans, type PostPurchaseJourney } from "@shared/postPurchase";

type MessageTemplate = { id: string; name: string; language: string | null; status: string; category: string; twilioSid: string; templateType: string | null; headerType: string | null; bodyText: string | null; buttons: unknown; carouselCards: unknown };
type TemplateBindings = Partial<Record<PostPurchaseJourney, string>>;

const copy = {
  en: {
    title: "Choose customer journeys", delay: "Delay (minutes)", choose: "Include in plan", save: "Save plan",
    saved: "Plan saved", error: "Could not save. Refresh and retry.", preview: "Message example",
    notice: "Examples only; these are not approved templates. Automatic sending is disabled.",
    readiness: "Before activation: verified Shopify customer and WhatsApp identity, separate consent for each journey, no STOP or deletion, current order status, approved matching templates and duplicate protection.",
    blocked: "Activation unavailable: delivery integration and acceptance are pending.",
    pause: "Uncheck a journey and save to pause its plan.", utility: "Approved utility template required",
    marketing: "Approved marketing template and separate marketing consent required",
    chooseMessage: "Choose approved message", noMessage: "Not selected — message disabled", saveMessage: "Save message", savedMessage: "Message selection saved", messageError: "Message selection could not be saved", editMessage: "Create or edit a message in Templates", messageHint: "Edit wording in Templates, submit to Meta and select the approved version. Choosing a message does not enable sending.", noApproved: "No matching approved text templates found.",
    labels: ["Order confirmation", "Shipping update", "Cancellation", "Review request", "Repeat-purchase offer", "Customer win-back"],
    examples: ["We received your order.", "Your order has been fulfilled.", "Your order was cancelled.", "Would you like to review your purchase?", "Ready for another purchase?", "We would love to welcome you back."],
  },
  es: {
    title: "Elige recorridos para clientes", delay: "Espera (minutos)", choose: "Incluir en el plan", save: "Guardar plan",
    saved: "Plan guardado", error: "No se pudo guardar. Actualiza y reintenta.", preview: "Ejemplo de mensaje",
    notice: "Solo ejemplos; no son plantillas aprobadas. El envío automático está desactivado.",
    readiness: "Antes de activar: identidad Shopify y WhatsApp verificada, consentimiento por recorrido, sin STOP ni eliminación, estado actual del pedido, plantillas aprobadas y protección contra duplicados.",
    blocked: "Activación no disponible: faltan integración de envío y validación.",
    pause: "Desmarca un recorrido y guarda para pausar su plan.", utility: "Requiere plantilla de utilidad aprobada",
    marketing: "Requiere plantilla de marketing aprobada y consentimiento de marketing separado",
    chooseMessage: "Elegir mensaje aprobado", noMessage: "Sin seleccionar — envío desactivado", saveMessage: "Guardar mensaje", savedMessage: "Selección guardada", messageError: "No se pudo guardar la selección", editMessage: "Crear o editar un mensaje en Plantillas", messageHint: "Edita el texto en Plantillas, solicita aprobación a Meta y elige la versión aprobada. Seleccionar no activa el envío.", noApproved: "No hay plantillas de texto aprobadas compatibles.",
    labels: ["Confirmación de pedido", "Actualización de envío", "Cancelación", "Solicitud de reseña", "Oferta de nueva compra", "Recuperación de clientes"],
    examples: ["Recibimos tu pedido.", "Tu pedido ha sido preparado.", "Tu pedido fue cancelado.", "¿Quieres dejar una reseña de tu compra?", "¿Listo para otra compra?", "Nos encantaría volver a recibirte."],
  },
  he: {
    title: "בחירת מסעות לקוח", delay: "השהיה (דקות)", choose: "כלול בתוכנית", save: "שמירת תוכנית",
    saved: "התוכנית נשמרה", error: "השמירה נכשלה. יש לרענן ולנסות שוב.", preview: "דוגמת הודעה",
    notice: "דוגמאות בלבד; אלו אינן תבניות מאושרות. שליחה אוטומטית מושבתת.",
    readiness: "לפני הפעלה: אימות זהות לקוח Shopify ו־WhatsApp, הסכמה נפרדת לכל מסע, ללא STOP או מחיקה, מצב הזמנה עדכני, תבניות מאושרות ומניעת כפילויות.",
    blocked: "הפעלה אינה זמינה: שילוב השליחה ובדיקות הקבלה טרם הושלמו.",
    pause: "להשהיית תוכנית מסע, יש לבטל את הסימון ולשמור.", utility: "נדרשת תבנית שירות מאושרת",
    marketing: "נדרשות תבנית שיווק מאושרת והסכמה נפרדת לשיווק",
    chooseMessage: "בחירת הודעה מאושרת", noMessage: "לא נבחרה הודעה — שליחה מושבתת", saveMessage: "שמירת הודעה", savedMessage: "בחירת ההודעה נשמרה", messageError: "לא ניתן לשמור את בחירת ההודעה", editMessage: "יצירה או עריכת הודעה בתבניות", messageHint: "עורכים הודעה בתבניות, שולחים לאישור Meta ובוחרים גרסה מאושרת. בחירה אינה מפעילה שליחה.", noApproved: "לא נמצאו תבניות טקסט מאושרות מתאימות.",
    labels: ["אישור הזמנה", "עדכון משלוח", "ביטול הזמנה", "בקשת חוות דעת", "הצעה לרכישה חוזרת", "החזרת לקוחות"],
    examples: ["קיבלנו את ההזמנה שלך.", "ההזמנה שלך טופלה.", "ההזמנה שלך בוטלה.", "רוצה לכתוב חוות דעת על הרכישה?", "מוכנים לרכישה נוספת?", "נשמח לראות אותך שוב."],
  },
} as const;

/** Mounted only inside the existing authenticated, connected pilot preview. */
export function ShopifyPostPurchasePlans({ plans, bindings, locale, onSaved }: {
  plans: PostPurchasePlans | undefined; bindings?: TemplateBindings; locale: string; onSaved: () => Promise<unknown>;
}) {
  const lang = locale.split("-")[0];
  const t = copy[lang as keyof typeof copy] ?? copy.en;
  const { user, sessionAligned } = useAuth();
  // Reuse the existing account-owned message library; no new Meta sync or template creation.
  const library = useQuery<MessageTemplate[]>({
    queryKey: withUserQueryScope(["/api/templates"], user?.id),
    enabled: !!user?.id && sessionAligned,
    retry: false,
    queryFn: async () => {
      const response = await fetch("/api/templates", { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("template_library_unavailable");
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error("template_library_invalid");
      return rows as MessageTemplate[];
    },
  });
  const templates = Array.isArray(library.data) ? library.data : [];
  return <section dir={lang === "he" ? "rtl" : "ltr"} lang={locale} data-testid="post-purchase-plans" className="space-y-3 rounded-xl border bg-white p-4">
    <h3 className="font-semibold">{t.title}</h3>
    <p className="text-sm text-slate-600">{t.pause}</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {POST_PURCHASE_JOURNEYS.map((journey, index) => <PlanRow key={journey}
        journey={journey} initial={plans?.[journey] ?? readPostPurchasePlans(null)[journey]}
        label={t.labels[index]} example={t.examples[index]} t={t} onSaved={onSaved}
        templates={templates} initialTemplateId={bindings?.[journey] ?? ""}/>)}
    </div>
    <p className="text-sm text-slate-600">{t.readiness}</p>
    <p role="status" className="text-sm text-amber-800">{t.blocked}</p>
    <p className="text-xs text-slate-600">{t.notice}</p>
  </section>;
}

function PlanRow({ journey, initial, label, example, t, onSaved, templates, initialTemplateId }: {
  journey: PostPurchaseJourney; initial: PostPurchasePlans[PostPurchaseJourney];
  label: string; example: string; t: typeof copy[keyof typeof copy]; onSaved: () => Promise<unknown>;
  templates: MessageTemplate[]; initialTemplateId: string;
}) {
  const [selected, setSelected] = useState(initial.selected);
  const [delay, setDelay] = useState(String(initial.delayMinutes));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplateId);
  const [messageStatus, setMessageStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const approved = templates.filter(template =>
    template.id && template.twilioSid?.startsWith("meta_") &&
    template.status?.toLowerCase() === "approved" &&
    template.category?.toUpperCase() === JOURNEY_POLICY[journey].category &&
    template.bodyText && template.bodyText.length <= 4096 &&
    !/\{\{(?!1\}\})/.test(template.bodyText) &&
    (!template.templateType || template.templateType.toLowerCase() === "text") &&
    (!template.headerType || template.headerType.toLowerCase() === "none") &&
    (!template.buttons || (Array.isArray(template.buttons) && template.buttons.length === 0)) &&
    (!template.carouselCards || (Array.isArray(template.carouselCards) && template.carouselCards.length === 0)));
  const currentTemplate = approved.find(template => template.id === selectedTemplate);
  async function saveTemplate() {
    setMessageStatus("saving");
    try {
      const response = await fetch("/api/shopify/ecommerce/workflow-draft", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_post_purchase_template", journey, templateId: selectedTemplate || null }),
      });
      if (!response.ok) throw Error("binding_save_failed");
      const result = await response.json();
      if (result.ok !== true || result.messagingEnabled !== false || result.workflowActive !== false ||
          result.activationEligible !== false || result.postPurchaseTemplates?.[journey] !== (selectedTemplate || undefined))
        throw Error("unexpected_response");
      await onSaved();
      setMessageStatus("saved");
    } catch { setMessageStatus("error"); }
  }
  const valid = delay.trim() !== "" && Number.isInteger(Number(delay)) && Number(delay) >= 0 && Number(delay) <= 259200;
  async function save() {
    setStatus("saving");
    try {
      const response = await fetch("/api/shopify/ecommerce/workflow-draft", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_post_purchase_plan", journey, plan: { selected, delayMinutes: Number(delay) } }),
      });
      if (!response.ok) throw Error("save_failed");
      const result = await response.json();
      if (result.ok !== true || result.messagingEnabled !== false || result.workflowActive !== false ||
          result.activationEligible !== false) throw Error("unexpected_activation");
      await onSaved();
      setStatus("saved");
    } catch { setStatus("error"); }
  }
  return <form className="space-y-2 rounded-lg border p-3" onSubmit={e => { e.preventDefault(); if (valid && status !== "saving") void save(); }}>
    <h4 className="font-medium">{label}</h4>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={selected} disabled={status === "saving"}
      onChange={e => { setSelected(e.target.checked); setStatus("idle"); }}/>{t.choose}</label>
    <label className="block text-sm">{t.delay}<input className="ms-2 w-28 rounded border px-2" type="number"
      min={0} max={259200} step={1} value={delay} disabled={status === "saving"}
      onChange={e => { setDelay(e.target.value); setStatus("idle"); }}/></label>
    <p className="text-xs text-slate-600">{JOURNEY_POLICY[journey].category === "UTILITY" ? t.utility : t.marketing}</p>
    <details className="text-sm"><summary>{t.preview}</summary><p className="mt-2">{example}</p></details>
    <div className="space-y-2 rounded-md border border-slate-100 bg-slate-50/50 p-3" data-testid={`post-purchase-message-${journey}`}>
      <label className="block text-sm font-medium">{t.chooseMessage}
        <select aria-label={t.chooseMessage} className="mt-1 w-full rounded border bg-white p-2 text-sm"
          value={selectedTemplate} disabled={messageStatus === "saving"}
          onChange={e => { setSelectedTemplate(e.target.value); setMessageStatus("idle"); }}>
          <option value="">{t.noMessage}</option>
          {approved.map(template => <option key={template.id} value={template.id}>
            {template.name} ({template.language || "en"})
          </option>)}
        </select>
      </label>
      {currentTemplate && <p className="whitespace-pre-wrap text-xs text-slate-700">{currentTemplate.bodyText}</p>}
      {approved.length === 0 && <p className="text-xs text-slate-600">{t.noApproved}</p>}
      <a href="/app/templates" className="inline-block text-xs text-blue-700 underline">{t.editMessage}</a>
      <p className="text-xs text-slate-500">{t.messageHint}</p>
      <button type="button" onClick={() => void saveTemplate()} disabled={messageStatus === "saving"}
        className="rounded border bg-white px-3 py-1 text-sm text-blue-700 disabled:opacity-50">{t.saveMessage}</button>
      {messageStatus === "saved" && <p role="status" className="text-xs">{t.savedMessage}</p>}
      {messageStatus === "error" && <p role="alert" className="text-xs text-red-700">{t.messageError}</p>}
    </div>
    <button type="submit" disabled={!valid || status === "saving"} className="rounded border px-3 py-1 text-sm text-blue-700 disabled:opacity-50">{t.save}</button>
    {status === "saved" && <p role="status" className="text-xs">{t.saved}</p>}
    {status === "error" && <p role="alert" className="text-xs text-red-700">{t.error}</p>}
  </form>;
}
