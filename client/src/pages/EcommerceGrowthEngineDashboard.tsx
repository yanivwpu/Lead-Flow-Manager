import { EcommerceWorkspaceBoundary } from "@/lib/ecommercePilot";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ShoppingBag, MessageSquare, Brain, ListTodo, Workflow, ArrowRight, Plug } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { ShopifySimpleSetup } from "@/components/integrations/ShopifySimpleSetup";

const copy = {
  en: {
    title:"E-Commerce Growth Engine", subtitle:"Your Shopify store, customer conversations and order follow-ups in one place.",
    connected:"Shopify connected", notConnected:"Connect your Shopify store", loading:"Checking Shopify connection…", sync:"Customer and order sync", ready:"Connected", off:"Not connected",
    connect:"Open Shopify setup", inbox:"Unified Inbox", inboxDetail:"Manage conversations from your connected channels.",
    ai:"AI Brain", aiDetail:"Configure AI assistance for customer replies.", tasks:"Order support", tasksDetail:"View and complete internal follow-up tasks.",
    workflows:"Automations", workflowsDetail:"Manage existing workflows and settings.", preview:"See the storefront preview",
    upcoming:"Coming next", cart:"Abandoned-cart messaging", post:"Post-purchase customer journeys", note:"Customer-facing Shopify automations are not active in this preview. Messaging requires supported events, appropriate consent and an enabled channel.",
    unavailable:"Shopify status unavailable. Refresh to try again.", unknown:"Unavailable", paused:"Sync paused", action:"Open", shop:"Store", details:"Shopify status reflects the connected integration, not live messaging automation.",
  },
  es: {
    title:"Motor de crecimiento para comercio electrónico",subtitle:"Tu tienda Shopify, conversaciones con clientes y seguimientos de pedidos en un solo lugar.",
    connected:"Shopify conectado",notConnected:"Conecta tu tienda Shopify",loading:"Comprobando la conexión de Shopify…",sync:"Sincronización de clientes y pedidos",ready:"Conectado",off:"Sin conectar",
    connect:"Configurar Shopify",inbox:"Bandeja de entrada unificada",inboxDetail:"Gestiona conversaciones de tus canales conectados.",
    ai:"AI Brain",aiDetail:"Configura la asistencia de IA para responder a clientes.",tasks:"Soporte de pedidos",tasksDetail:"Consulta y completa tareas internas de seguimiento.",
    workflows:"Automatizaciones",workflowsDetail:"Gestiona flujos de trabajo y ajustes existentes.",preview:"Ver vista previa para tiendas",
    upcoming:"Próximamente",cart:"Mensajes de recuperación de carritos abandonados",post:"Seguimiento poscompra",note:"Las automatizaciones de mensajes para clientes de Shopify aún no están activas. Requieren eventos compatibles, consentimiento adecuado y un canal habilitado.",
    unavailable:"El estado de Shopify no está disponible. Actualiza para intentarlo de nuevo.",unknown:"No disponible",paused:"Sincronización pausada",action:"Abrir",shop:"Tienda",details:"El estado de Shopify indica la integración conectada, no la automatización de mensajes en vivo.",
  },
  he: {
    title:"מנוע הצמיחה למסחר אלקטרוני",subtitle:"חנות Shopify, שיחות עם לקוחות ומעקב אחר הזמנות — במקום אחד.",
    connected:"Shopify מחובר",notConnected:"חיבור חנות Shopify",loading:"בודקים את חיבור Shopify…",sync:"סנכרון לקוחות והזמנות",ready:"מחובר",off:"לא מחובר",
    connect:"הגדרת Shopify",inbox:"תיבת הודעות מאוחדת",inboxDetail:"ניהול שיחות מכל הערוצים המחוברים.",
    ai:"AI Brain",aiDetail:"הגדרת סיוע בינה מלאכותית למענה ללקוחות.",tasks:"טיפול בהזמנות",tasksDetail:"צפייה והשלמה של משימות מעקב פנימיות.",
    workflows:"אוטומציות",workflowsDetail:"ניהול תהליכי עבודה והגדרות קיימות.",preview:"צפייה בתצוגה המקדימה לחנות",
    upcoming:"בקרוב",cart:"הודעות לשחזור עגלות נטושות",post:"מסעות לקוח לאחר רכישה",note:"אוטומציות הודעות ללקוחות Shopify אינן פעילות בתצוגה מקדימה זו. נדרשים אירועים נתמכים, הסכמה מתאימה וערוץ הודעות פעיל.",
    unavailable:"סטטוס Shopify אינו זמין. רעננו כדי לנסות שוב.",unknown:"לא זמין",paused:"הסנכרון מושהה",action:"פתיחה",shop:"חנות",details:"סטטוס Shopify מציג חיבור חנות בלבד, ולא הפעלה של הודעות אוטומטיות.",
  }
} as const;

export function EcommerceGrowthEngineDashboardContent() {
  const { i18n } = useTranslation();
  const { user, sessionAligned } = useAuth();
  const locale = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0] as keyof typeof copy;
  const t = copy[locale] || copy.en;
  const { data, isLoading, isError } = useQuery<{ connected: boolean; shop: string | null; syncEnabled: boolean }>({
    queryKey: withUserQueryScope(["/api/shopify/connection-status"], user?.id),
    queryFn: async () => {
      const r = await fetch("/api/shopify/connection-status", { credentials: "include" });
      if (!r.ok) throw new Error("Shopify status unavailable");
      return r.json();
    },
    enabled: !!user?.id && sessionAligned,
    retry: false,
  });
  const checking = !sessionAligned || !user?.id || isLoading;
  const unavailable = !checking && (isError || !data);
  const connected = !checking && !unavailable && !!data?.connected;
  const modules = [
    { id: "overview", label: locale === "he" ? "סקירה" : locale === "es" ? "Resumen" : "Overview" },
    { id: "shopping", label: locale === "he" ? "קניות AI" : locale === "es" ? "Compras con IA" : "AI Shopping" },
    { id: "order-support", label: t.tasks },
    { id: "recovery", label: locale === "he" ? "שחזור עגלות" : locale === "es" ? "Recuperación de carritos" : "Cart Recovery" },
    { id: "post-purchase", label: locale === "he" ? "לאחר רכישה" : locale === "es" ? "Poscompra" : "Post-Purchase" },
    { id: "settings", label: locale === "he" ? "הגדרות" : locale === "es" ? "Configuración" : "Settings" },
  ];
  const cards = [
    { title:t.inbox, description:t.inboxDetail, icon:MessageSquare, href:"/app/inbox" },
    { title:t.ai, description:t.aiDetail, icon:Brain, href:"/app/ai-brain" },
    { title:t.tasks, description:t.tasksDetail, icon:ListTodo, href:"/app/followups" },
    { title:t.workflows, description:t.workflowsDetail, icon:Workflow, href:"/app/workflows" },
  ];
  return <main data-testid="ecommerce-growth-engine-dashboard" lang={locale} dir={locale === "he" ? "rtl" : "ltr"} className="mx-auto w-full max-w-6xl space-y-7 p-4 pb-16 sm:p-8">
    <header className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6 sm:p-9">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700"><ShoppingBag className="h-4 w-4" /> Shopify</div>
      <h1 className="text-2xl font-bold text-slate-950 sm:text-4xl">{t.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">{t.subtitle}</p>
      <Link asChild href="/app/integrations?setup=shopify"><a className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"><Plug className="h-4 w-4" />{t.connect}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></a></Link>
    </header>
    <nav aria-label={locale === "he" ? "ניווט מנוע" : locale === "es" ? "Navegación del motor" : "Engine navigation"} className="flex flex-wrap gap-2" data-testid="ecommerce-module-navigation">
      {modules.map((module) => <a key={module.id} href={`#${module.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-300 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{module.label}</a>)}
    </nav>
    <section id="overview" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label={t.sync}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h2 className="text-lg font-semibold">{t.sync}</h2><p className="mt-1 text-sm text-slate-600">{checking ? t.loading : unavailable ? t.unavailable : connected ? t.connected : t.notConnected}</p>{connected && data?.shop && <p className="mt-2 break-all text-xs text-slate-500">{t.shop}: <span dir="ltr">{data.shop}</span></p>}</div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{checking ? "…" : unavailable ? t.unknown : connected ? (data?.syncEnabled ? t.ready : t.paused) : t.off}</span>
      </div>
      <p className="mt-4 text-xs text-slate-500">{t.details}</p>
    </section>
    <div id="settings" className="scroll-mt-6">{connected && <ShopifySimpleSetup syncEnabled={data?.syncEnabled === true} />}</div>
    <section id="shopping" className="scroll-mt-6 grid gap-4 sm:grid-cols-2">
      {cards.map(({title,description,icon:Icon,href})=><Link asChild key={href} href={href}><a className="group flex min-h-40 flex-col rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm"><Icon className="mb-3 h-6 w-6 text-blue-600" /><h2 className="font-semibold text-slate-950">{title}</h2><p className="mt-2 flex-1 text-sm text-slate-600">{description}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue-700">{t.action}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></span></a></Link>)}
    </section>
    <section id="order-support" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold">{t.tasks}</h2><p className="mt-2 text-sm text-slate-600">{t.tasksDetail}</p><Link asChild href="/app/followups"><a className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">{t.action}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></a></Link></section>
    <section id="recovery" className="scroll-mt-6 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 sm:p-6"><h2 className="text-lg font-semibold">{t.upcoming}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{[t.cart,t.post].map(label=><div key={label} className="rounded-xl border border-indigo-100 bg-white p-4 text-sm font-medium">{label}</div>)}</div><p className="mt-4 text-sm leading-relaxed text-slate-600">{t.note}</p></section>
    <div id="post-purchase" className="scroll-mt-6 text-sm text-slate-600">{t.post}: {t.upcoming}</div>
    <Link asChild href="/ecommerce-growth-engine"><a className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline">{t.preview}<ArrowRight className="h-4 w-4 rtl:rotate-180" /></a></Link>
  </main>;
}

export function EcommerceGrowthEngineDashboard() {
  return <EcommerceWorkspaceBoundary><EcommerceGrowthEngineDashboardContent /></EcommerceWorkspaceBoundary>;
}
