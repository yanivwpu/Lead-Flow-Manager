import { useEcommercePilot } from "@/lib/ecommercePilot";
import { useEcommerceTaskCopy } from "@/lib/ecommerceTaskCopy";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCcw } from "lucide-react";

/**
 * Merchant-owned post-purchase PREVIEW only, reusing the existing event inbox
 * and workflow-draft endpoints. A prepared draft NEVER enables execution or a
 * customer send. No message templates, recipient payloads or checkout URLs.
 */
type DraftJourney = "fulfillmentSupport" | "orderCancelled";
type PostPurchaseStatus = {
  ok: true;
  mode: "paused" | "recording";
  journeys: {
    orderSupport: number;
    fulfillmentSupport: number;
    orderCancelled: number;
  };
  workflowDrafts: {
    orderSupport: boolean;
    fulfillmentSupport: boolean;
    orderCancelled: boolean;
    abandonedCart: boolean;
  };
  messagingEnabled: false;
};

const copy = {
  en: {
    title: "Post-purchase journeys", intro: "Review Shopify events and prepare a journey draft. Nothing sends to customers.",
    notAvailable: "Post-purchase previews are not available for this workspace yet.",
    disconnected: "Connect Shopify to see post-purchase events.",
    loading: "Checking Shopify events…", unavailable: "Event preview unavailable.", retry: "Retry",
    recorded: "Recorded events", order: "New orders", fulfillment: "Fulfillment updates",
    cancelled: "Cancelled orders", support: "Internal order-support tasks use the existing Order Support setup.",
    prepare: "Prepare draft", undo: "Clear draft", prepared: "Draft prepared", notPrepared: "Not prepared",
    planned: "Planned", review: "Review request", repeat: "Repeat purchase",
    reviewDescription: "A customer review request needs its own timing, consent and template acceptance.",
    repeatDescription: "Win-back and upsell journeys need separate segmentation, consent and suppression checks.",
    notice: "Preview only. Saving a draft never enables order messages, Shopify operations, or WhatsApp sends.",
    saveError: "Couldn't save draft. Refresh and retry.",
    paused: "Event recording is paused; historical counts may still appear."
  },
  es: {
    title: "Recorridos poscompra", intro: "Consulta eventos de Shopify y prepara borradores. No se envían mensajes a clientes.",
    notAvailable: "La vista previa poscompra aún no está disponible en este espacio.",
    disconnected: "Conecta Shopify para ver los eventos poscompra.",
    loading: "Consultando eventos de Shopify…", unavailable: "Vista previa no disponible.", retry: "Reintentar",
    recorded: "Eventos registrados", order: "Nuevos pedidos", fulfillment: "Actualizaciones de envío",
    cancelled: "Pedidos cancelados", support: "Las tareas internas utilizan la configuración de Soporte de pedidos.",
    prepare: "Preparar borrador", undo: "Quitar borrador", prepared: "Borrador preparado", notPrepared: "Sin preparar",
    planned: "Planificado", review: "Solicitud de reseña", repeat: "Nueva compra",
    reviewDescription: "Las reseñas requieren reglas de tiempo, consentimiento y plantillas verificadas.",
    repeatDescription: "Las campañas de regreso y ventas adicionales necesitan segmentación, consentimiento y exclusiones.",
    notice: "Solo vista previa. Guardar borradores no activa mensajes, operaciones de Shopify ni envíos de WhatsApp.",
    saveError: "No se pudo guardar. Actualiza y reintenta.",
    paused: "El registro de eventos está pausado; pueden aparecer cifras anteriores."
  },
  he: {
    title: "מסעות לאחר רכישה", intro: "סקירת אירועי Shopify והכנת טיוטות. לא נשלחות הודעות ללקוחות.",
    notAvailable: "תצוגת מסעות לאחר רכישה אינה זמינה כרגע בסביבת עבודה זו.",
    disconnected: "יש לחבר Shopify להצגת אירועי רכישה.",
    loading: "בודקים אירועי Shopify…", unavailable: "תצוגת האירועים אינה זמינה.", retry: "נסה שוב",
    recorded: "אירועים שנרשמו", order: "הזמנות חדשות", fulfillment: "עדכוני משלוח",
    cancelled: "הזמנות שבוטלו", support: "משימות פנימיות מנוהלות בהגדרת טיפול בהזמנות.",
    prepare: "הכן טיוטה", undo: "נקה טיוטה", prepared: "הטיוטה הוכנה", notPrepared: "טרם הוכנה",
    planned: "מתוכנן", review: "בקשת חוות דעת", repeat: "רכישה חוזרת",
    reviewDescription: "בקשת חוות דעת דורשת תזמון, הסכמה ותבנית מאושרת בנפרד.",
    repeatDescription: "מסעות חזרה ומכירה נוספת דורשים פילוח, הסכמה ומניעת שליחה.",
    notice: "תצוגה בלבד. שמירת טיוטה אינה מפעילה הודעות, פעולות Shopify או שליחת WhatsApp.",
    saveError: "לא ניתן לשמור. רענן ונסה שוב.",
    paused: "רישום האירועים מושהה; ייתכן שיוצגו נתונים קודמים."
  }
} as const;

export function ShopifyPostPurchasePreview({ connected }: { connected: boolean }) {
  const { locale, dir } = useEcommerceTaskCopy();
  const lang = locale.split("-")[0] as keyof typeof copy;
  const t = copy[lang] ?? copy.en;
  const { available } = useEcommercePilot();
  const { user, sessionAligned } = useAuth();
  const client = useQueryClient();
  const queryKey = withUserQueryScope(["/api/shopify/ecommerce/event-inbox-preview"], user?.id);

  const { data, isLoading, isError, refetch } = useQuery<PostPurchaseStatus>({
    queryKey,
    enabled: available && connected && !!user?.id && sessionAligned,
    retry: false,
    staleTime: 15_000,
    queryFn: async () => {
      const response = await fetch("/api/shopify/ecommerce/event-inbox-preview", { credentials: "include" });
      if (!response.ok) throw Error("post_purchase_preview_unavailable");
      return response.json() as Promise<PostPurchaseStatus>;
    }
  });

  const save = useMutation({
    mutationFn: async ({ journey, prepared }: { journey: DraftJourney; prepared: boolean }) => {
      const response = await fetch("/api/shopify/ecommerce/workflow-draft", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_draft", journey, prepared })
      });
      if (!response.ok) throw Error("post_purchase_draft_save_failed");
      const result = await response.json() as { ok?: boolean; workflowActive?: boolean; messagingEnabled?: boolean };
      if (result.ok !== true || result.workflowActive !== false || result.messagingEnabled !== false)
        throw Error("post_purchase_draft_unexpected_response");
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey }); }
  });

  if (!available || !user?.id || !sessionAligned)
    return <p role="status" className="text-sm text-slate-600">{t.notAvailable}</p>;
  if (!connected)
    return <p role="status" className="text-sm text-slate-600">{t.disconnected}</p>;
  if (isLoading)
    return <p role="status" className="text-sm text-slate-600">{t.loading}</p>;
  if (isError || !data?.ok)
    return <div className="flex flex-wrap items-center gap-3">
      <p role="alert" className="text-sm text-slate-600">{t.unavailable}</p>
      <button type="button" onClick={() => void refetch()} className="rounded-lg border px-3 py-1.5 text-sm text-blue-700">{t.retry}</button>
    </div>;

  const rows: Array<{ title: string; count: number; journey?: DraftJourney }> = [
    { title: t.order, count: data.journeys?.orderSupport ?? 0 },
    { title: t.fulfillment, count: data.journeys?.fulfillmentSupport ?? 0, journey: "fulfillmentSupport" },
    { title: t.cancelled, count: data.journeys?.orderCancelled ?? 0, journey: "orderCancelled" }
  ];
  return <section data-testid="shopify-post-purchase-preview" dir={dir} lang={locale} className="space-y-4">
    <div className="rounded-xl border border-blue-100 bg-white p-4 sm:p-5">
      <h3 className="font-semibold text-slate-900">{t.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      {data.mode === "paused" && <p className="mt-2 text-xs text-amber-800">{t.paused}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map(({ title, count, journey }) => {
          const prepared = journey ? data.workflowDrafts?.[journey] === true : false;
          return <div key={title} className="rounded-xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-800">{title}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{count}</p>
            <p className="text-xs text-slate-500">{t.recorded}</p>
            {journey ? <div className="mt-3 space-y-2">
              <span className="flex items-center gap-1 text-xs text-slate-600">
                {prepared && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600"/>}
                {prepared ? t.prepared : t.notPrepared}
              </span>
              <button type="button" disabled={save.isPending} data-testid={`shopify-post-purchase-draft-${journey}`}
                onClick={() => save.mutate({ journey, prepared: !prepared })}
                className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 disabled:opacity-50">
                {prepared ? t.undo : t.prepare}
              </button>
            </div> : <p className="mt-3 text-xs text-slate-500">{t.support}</p>}
          </div>;
        })}
      </div>
      {save.isError && <p role="alert" className="mt-3 text-xs text-red-700">{t.saveError}</p>}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {[{ title: t.review, description: t.reviewDescription }, { title: t.repeat, description: t.repeatDescription }]
        .map(item => <div key={item.title} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2"><h4 className="font-semibold text-slate-900">{item.title}</h4>
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{t.planned}</span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{item.description}</p>
        </div>)}
    </div>
    <p role="note" className="text-xs text-slate-600">{t.notice}</p>
  </section>;
}
