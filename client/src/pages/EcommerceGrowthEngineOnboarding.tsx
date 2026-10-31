import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, ShoppingBag } from "lucide-react";
import { EcommerceGrowthEngineDetails } from "./EcommerceGrowthEngineDetails";
import { useActivateEcommerceMerchant, useEcommerceMerchantActivationStatus } from "@/lib/ecommerceMerchantActivation";

type Mode = "setup" | "about";
const copy = {
  en: {
    back: "Back to Growth Engines", engine: "E-Commerce Growth Engine",
    title: "Install your E-Commerce Growth Engine", description: "One guided installation inside your WhachatCRM workspace—no extra sales pages.",
    aboutTitle: "One workspace for your Shopify customer journey",
    aboutDescription: "Shopper conversations, AI product discovery, orders and follow-ups together.",
    features: [
      ["Unified Inbox", "Manage shopper conversations in your connected channels."],
      ["AI Shopping", "Assist buyers using product and inventory context from Shopify."],
      ["Order support", "Track orders and create internal support follow-up tasks."],
      ["Customer journeys", "Prepare consent-based cart recovery and post-purchase follow-ups."],
    ],
    steps: [
      ["Connect Shopify", "Link a store that is not already owned by another WhachatCRM workspace."],
      ["Activate the engine", "Once Shopify and your plan are verified, activate the workspace."],
      ["Configure journeys", "Review catalog, order tasks, AI Shopping and approved message templates."],
    ],
    install: "Install Growth Engine", connect: "Connect Shopify", activate: "Activate Engine",
    activating: "Activating…", connected: "Shopify connected", ready: "Engine activated",
    configure: "Configure journeys", open: "Open Engine", details: "View features",
    waiting: "Connect Shopify first.", pro: "An eligible Pro plan or trial is required.", plan: "Review plan",
    unavailable: "Couldn't verify setup status. No changes were made.", retry: "Try again",
    failed: "Activation didn't complete. Verify Shopify connection and Pro access.",
    safe: "Installing this engine does not enable automatic WhatsApp messages, cart recovery or customer delivery.",
  },
  es: {
    back: "Volver a motores de crecimiento", engine: "Motor de comercio electrónico",
    title: "Instala tu motor de comercio electrónico", description: "Una instalación guiada dentro de WhachatCRM, sin páginas de venta adicionales.",
    aboutTitle: "Toda la experiencia Shopify en un solo espacio",
    aboutDescription: "Conversaciones, productos con IA, pedidos y seguimientos.",
    features: [
      ["Bandeja unificada", "Gestiona conversaciones de los canales conectados."],
      ["Compras con IA", "Ayuda con productos e inventario de Shopify."],
      ["Soporte de pedidos", "Consulta pedidos y crea tareas internas."],
      ["Recorridos del cliente", "Prepara recuperación de carritos y poscompra con consentimiento."],
    ],
    steps: [
      ["Conectar Shopify", "Conecta una tienda que no pertenezca a otro espacio WhachatCRM."],
      ["Activar el motor", "Activa después de verificar Shopify y el plan."],
      ["Configurar recorridos", "Revisa catálogo, pedidos, IA y plantillas aprobadas."],
    ],
    install: "Instalar motor", connect: "Conectar Shopify", activate: "Activar motor",
    activating: "Activando…", connected: "Shopify conectado", ready: "Motor activado",
    configure: "Configurar recorridos", open: "Abrir motor", details: "Ver funciones",
    waiting: "Primero conecta Shopify.", pro: "Se requiere Pro o prueba elegible.", plan: "Revisar plan",
    unavailable: "No se pudo verificar el estado. No hubo cambios.", retry: "Reintentar",
    failed: "La activación no se completó. Verifica Shopify y Pro.",
    safe: "Instalar el motor no habilita mensajes automáticos, recuperación de carritos ni envíos.",
  },
  he: {
    back: "חזרה למנועי הצמיחה", engine: "מנוע צמיחה למסחר אלקטרוני",
    title: "התקנת מנוע הצמיחה למסחר אלקטרוני", description: "התקנה מודרכת בתוך WhachatCRM, ללא דפי שיווק נוספים.",
    aboutTitle: "כל מסע הלקוח של Shopify במקום אחד",
    aboutDescription: "שיחות, המלצות AI, הזמנות ומעקב.",
    features: [
      ["תיבת הודעות מאוחדת", "ניהול שיחות מערוצים מחוברים."],
      ["קניות AI", "מענה ללקוחות לפי מוצרי Shopify והמלאי."],
      ["טיפול בהזמנות", "צפייה בהזמנות ויצירת משימות פנימיות."],
      ["מסעות לקוח", "הכנת שחזור עגלות ומעקב לאחר רכישה בכפוף להסכמה."],
    ],
    steps: [
      ["חיבור Shopify", "חיבור חנות שאינה משויכת לסביבת עבודה אחרת."],
      ["הפעלת המנוע", "הפעלה לאחר אימות Shopify וזכאות המנוי."],
      ["הגדרת מסעות", "סקירת מוצרים, משימות, AI ותבניות מאושרות."],
    ],
    install: "התקנת מנוע הצמיחה", connect: "חיבור Shopify", activate: "הפעלת המנוע",
    activating: "מפעילים…", connected: "Shopify מחובר", ready: "המנוע הופעל",
    configure: "הגדרת מסעות", open: "פתיחת המנוע", details: "הצגת יכולות",
    waiting: "תחילה יש לחבר את Shopify.", pro: "נדרש מנוי Pro או ניסיון מתאים.", plan: "בדיקת מנוי",
    unavailable: "לא ניתן לאמת את מצב ההגדרה. לא בוצעו שינויים.", retry: "לנסות שוב",
    failed: "ההפעלה נכשלה. יש לבדוק חיבור Shopify ומנוי Pro.",
    safe: "התקנת המנוע אינה מפעילה הודעות WhatsApp אוטומטיות או שחזור עגלות.",
  },
} as const;

const setupPath = "/app/ecommerce-growth-engine?view=setup";
const aboutPath = "/app/ecommerce-growth-engine?view=about";
const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

export function EcommerceGrowthEngineOnboarding({ mode }: { mode: Mode }) {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const locale = language === "he" || language === "es" ? language : "en";
  const t = copy[locale];
  const [, navigate] = useLocation();
  const status = useEcommerceMerchantActivationStatus();
  const activate = useActivateEcommerceMerchant();
  const connected = status.data?.connected === true;
  const activated = status.data?.activated === true;
  const eligible = status.data?.eligible === true;
  const planEligible = status.data?.planEligible === true;
  const loading = status.isLoading || status.isFetching;
  const unavailable = status.isError || (!loading && !status.data);
  return (
    <main dir={locale === "he" ? "rtl" : "ltr"} lang={locale}
      className={"mx-auto w-full space-y-6 p-4 pb-16 sm:p-8 " + (mode === "about" ? "max-w-6xl" : "max-w-5xl")}
      data-testid="ecommerce-growth-engine-onboarding">
      <Link href="/app/templates?tab=growth-engines" className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-700">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180"/>{t.back}
      </Link>
      {mode === "setup" && <header className="rounded-2xl border border-blue-100 bg-white p-6 sm:p-8">
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
          <ShoppingBag className="h-4 w-4"/>{t.engine}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{mode === "about" ? t.aboutTitle : t.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{mode === "about" ? t.aboutDescription : t.description}</p>
      </header>}
      {mode === "about" ? (
        <EcommerceGrowthEngineDetails locale={locale} activated={activated}/>
      ) : (
        <section className="space-y-4" data-testid="ecommerce-engine-install-steps">
          {t.steps.map(([title, detail], index) => (
            <article key={title} className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                {(index === 0 && connected) || (index > 0 && activated) ?
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600"/> :
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">{index+1}</span>}
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-slate-950">{title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{detail}</p>
                  {index === 0 && !loading && !unavailable && (
                    connected ? <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">{t.connected}</p> :
                      <Link href="/app/integrations?setup=shopify" data-testid="ecommerce-install-connect-shopify" className={"mt-4 "+actionClass}>{t.connect}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link>
                  )}
                  {index === 1 && !loading && !unavailable && (
                    activated ? <p className="mt-3 text-sm font-semibold text-emerald-700" role="status">{t.ready}</p> :
                      !connected ? <p className="mt-3 text-sm text-slate-500"><LockKeyhole className="me-1 inline h-4 w-4"/>{t.waiting}</p> :
                      !planEligible ? <p className="mt-3 text-sm text-amber-800">{t.pro} <Link href="/app/settings?tab=billing" className="font-semibold underline">{t.plan}</Link></p> :
                      <button type="button" data-testid="ecommerce-install-activate" className={"mt-4 "+actionClass}
                        disabled={!eligible || activate.isPending} onClick={() => activate.mutate(undefined, {onSuccess: () => navigate("/app/ecommerce-growth-engine")})}>
                        {activate.isPending ? t.activating : t.activate}
                      </button>
                  )}
                  {index === 1 && activate.isError && <p role="alert" className="mt-2 text-sm text-red-700">{t.failed}</p>}
                  {index === 2 && activated && <Link href="/app/ecommerce-growth-engine?view=post" className={"mt-4 "+actionClass}>{t.configure}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link>}
                </div>
              </div>
            </article>
          ))}
          {unavailable && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {t.unavailable} <button type="button" onClick={() => void status.refetch()} className="ms-2 font-semibold underline">{t.retry}</button>
          </p>}
        </section>
      )}
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <LockKeyhole className="me-2 inline h-4 w-4"/>{t.safe}
      </p>
      {mode === "setup" && <Link href={aboutPath} className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">{t.details}<ArrowRight className="h-4 w-4 rtl:rotate-180"/></Link>}
    </main>
  );
}
