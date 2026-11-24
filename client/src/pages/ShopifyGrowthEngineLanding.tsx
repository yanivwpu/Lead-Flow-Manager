import { Helmet } from "react-helmet";
import { ArrowRight, CheckCircle2, ShieldCheck, ShoppingBag } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { MARKETING_URL } from "@/lib/marketingUrl";
import { useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";
import { getMarketingChrome } from "@shared/localizeMarketingContent";
import { getCanonicalUrl, getHreflangLinks, localizedInternalHref } from "@shared/localeRoutes";

const PATH = "/shopify-growth-engine";
const SHOPIFY_APP = "https://apps.shopify.com/whachatcrm";
export const SHOPIFY_GROWTH_LANDING = {
  en: {
    title: "Shopify Growth Engine | AI Shopping & WhatsApp CRM | WhachatCRM",
    description: "Connect Shopify to verified AI product recommendations, order context and consent-based WhatsApp customer journeys. Included with eligible WhachatCRM plans.",
    eyebrow: "E-commerce Growth Engine · Included with eligible Pro plans",
    h1: "Turn Shopify conversations into better customer experiences",
    intro: "Bring your Shopify products, orders and shopper questions into one WhachatCRM workspace. Recommend real products with AI, support customers and configure consent-based WhatsApp updates without building your own API integration.",
    primary: "Install from Shopify", secondary: "See how it works", pricing: "See plans and pricing",
    featuresTitle: "Everything starts with your Shopify store",
    features: [
      { name: "Catalog-backed AI Shopping", detail: "Sync Shopify products, variants, prices and inventory. AI Shopping uses verified catalog data, not invented product details." },
      { name: "Shopper conversations and orders", detail: "Handle connected messaging channels beside Shopify purchases, CRM contacts, assigned teammates and order-support tasks." },
      { name: "Merchant-controlled WhatsApp", detail: "Set up Meta-approved templates, customer opt-ins and Post-Purchase journeys. Messages require explicit merchant activation and eligible customer consent." },
    ],
    stepsTitle: "Get started in four steps",
    steps: ["Install WhachatCRM from Shopify and activate the Growth Engine.", "Open Products, authorize catalog access and choose Sync products.", "Connect WhatsApp Business and set up templates and customer consent.", "Enable AI Shopping and eligible customer journeys when ready."],
    statusTitle: "Current feature availability",
    availableTitle: "Available to set up",
    available: "Shopify sync, AI Shopping, customer/order context, approved Meta template setup, consent capture and merchant-managed Post-Purchase journeys. Customer messages only send after separate consent and eligibility checks.",
    limitedTitle: "Still restricted",
    limited: "Automatic Cart Recovery delivery is pending Shopify protected-data approval and current recovery-URL eligibility. AI Checkout Assistance that creates new checkouts remains disabled until separate verification.",
    closing: "Ready to bring Shopify and WhatsApp together?",
  },
  es: {
    title: "Motor de crecimiento Shopify | Compras con IA y WhatsApp | WhachatCRM",
    description: "Conecta Shopify con recomendaciones de productos mediante IA, pedidos y recorridos de WhatsApp basados en el consentimiento del cliente.",
    eyebrow: "Motor de crecimiento e-commerce · Incluido en planes Pro elegibles",
    h1: "Convierte conversaciones de Shopify en mejores experiencias",
    intro: "Reúne productos, pedidos y preguntas de compradores en un solo espacio de WhachatCRM. Recomienda productos reales con IA, atiende clientes y configura WhatsApp con consentimiento sin desarrollar APIs.",
    primary: "Instalar desde Shopify", secondary: "Ver cómo funciona", pricing: "Ver planes y precios",
    featuresTitle: "Todo comienza con tu tienda Shopify",
    features: [
      { name: "Compras con IA basadas en catálogo", detail: "Sincroniza productos, variantes, precios e inventario. La IA usa datos reales verificados y no inventa detalles." },
      { name: "Conversaciones y pedidos", detail: "Gestiona mensajes junto a compras Shopify, contactos CRM, compañeros asignados y tareas de soporte." },
      { name: "WhatsApp bajo control del comercio", detail: "Configura plantillas aprobadas por Meta, consentimiento y recorridos poscompra. Los mensajes requieren activación expresa y consentimiento válido." },
    ],
    stepsTitle: "Empieza en cuatro pasos",
    steps: ["Instala WhachatCRM desde Shopify y activa el motor.", "Abre Productos, autoriza el catálogo y elige Sincronizar productos.", "Conecta WhatsApp Business y configura plantillas y consentimiento.", "Activa compras con IA y recorridos elegibles cuando quieras."],
    statusTitle: "Disponibilidad actual",
    availableTitle: "Disponible para configurar",
    available: "Sincronización Shopify, compras con IA, contexto de pedidos, plantillas Meta aprobadas, consentimiento y recorridos poscompra. Cada mensaje requiere consentimiento y comprobaciones.",
    limitedTitle: "Todavía limitado",
    limited: "La recuperación automática de carritos requiere la aprobación de Shopify y un enlace de recuperación válido. La creación de checkouts con IA sigue desactivada hasta su verificación.",
    closing: "¿Listo para conectar Shopify y WhatsApp?",
  },
  he: {
    title: "מנוע הצמיחה ל-Shopify | קניות AI ו-WhatsApp | WhachatCRM",
    description: "חיבור Shopify להמלצות מוצרים מבוססות AI, הזמנות ומסעות לקוח ב-WhatsApp עם הסכמה מאומתת.",
    eyebrow: "מנוע צמיחה למסחר מקוון · כלול בתוכניות Pro מתאימות",
    h1: "הופכים שיחות מחנות Shopify לחוויית לקוח טובה יותר",
    intro: "מרכזים מוצרים, הזמנות ושאלות לקוחות של Shopify בסביבת עבודה אחת ב-WhachatCRM. ממליצים על מוצרים אמיתיים באמצעות AI, נותנים שירות ומגדירים הודעות WhatsApp בהסכמה — בלי פיתוח API.",
    primary: "התקנה דרך Shopify", secondary: "איך זה עובד?", pricing: "תוכניות ומחירים",
    featuresTitle: "הכול מתחיל בחנות Shopify שלכם",
    features: [
      { name: "קניות AI לפי קטלוג", detail: "מסנכרנים מוצרים, גרסאות, מחירים ומלאי. ה-AI משתמש בנתונים מאומתים ולא ממציא פרטי מוצרים." },
      { name: "שיחות והזמנות במקום אחד", detail: "מנהלים הודעות לצד רכישות Shopify, אנשי קשר, חברי צוות ומשימות שירות לקוחות." },
      { name: "WhatsApp בשליטת העסק", detail: "מגדירים תבניות שאושרו ב-Meta, הסכמה ומסעות לאחר רכישה. הודעות נשלחות רק לאחר הפעלה מפורשת והסכמת הלקוח." },
    ],
    stepsTitle: "מתחילים בארבעה שלבים",
    steps: ["מתקינים WhachatCRM דרך Shopify ומפעילים את מנוע הצמיחה.", "נכנסים למוצרים, מאשרים גישה לקטלוג ובוחרים בסנכרון.", "מחברים WhatsApp Business ומגדירים תבניות והסכמת לקוח.", "מפעילים קניות AI ומסעות לקוח מתאימים לפי הצורך."],
    statusTitle: "זמינות התכונות כרגע",
    availableTitle: "זמין להגדרה",
    available: "סנכרון Shopify, קניות AI, פרטי הזמנות, תבניות Meta מאושרות, הסכמה ומסעות לאחר רכישה. כל הודעה מחייבת בדיקות הרשאה והסכמה.",
    limitedTitle: "עדיין מוגבל",
    limited: "שליחה אוטומטית לשחזור עגלות כפופה לאישור Shopify ולאימות קישור השחזור. יצירת checkout באמצעות AI עדיין מושבתת עד להשלמת האימות.",
    closing: "מוכנים לחבר Shopify ו-WhatsApp?",
  },
} as const;

export function ShopifyGrowthEngineLanding() {
  const locale = useMarketingUrlLocale();
  const copy = SHOPIFY_GROWTH_LANDING[locale];
  const chrome = getMarketingChrome(locale);
  const { user } = useAuth();
  const canonical = getCanonicalUrl(PATH, locale, MARKETING_URL)!;
  const rtl = locale === "he";
  return (
    <div dir={rtl ? "rtl" : "ltr"} className="min-h-screen bg-white text-gray-900">
      <Helmet>
        <title>{copy.title}</title>
        <meta name="description" content={copy.description} />
        <link rel="canonical" href={canonical} />
        {getHreflangLinks(PATH, MARKETING_URL).map(a => <link key={a.hreflang} rel="alternate" hrefLang={a.hreflang} href={a.href} />)}
        <meta property="og:title" content={copy.title} />
        <meta property="og:description" content={copy.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
      </Helmet>
      <MarketingHeader isLoggedIn={!!user} startTrialLabel={chrome.startFreeTrial} startTrialShortLabel={chrome.startFree} />
      <main>
        <section className="bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div>
              <p className="mb-5 text-sm font-semibold tracking-wide text-emerald-800">{copy.eyebrow}</p>
              <h1 className="max-w-3xl font-display text-4xl font-bold tracking-tight md:text-5xl">{copy.h1}</h1>
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-gray-600">{copy.intro}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={SHOPIFY_APP} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800">{copy.primary}<ArrowRight className={rtl ? "h-4 w-4 rotate-180" : "h-4 w-4"} /></a>
                <a href="#how-it-works" className="rounded-full border border-gray-300 bg-white px-6 py-3 font-semibold hover:border-emerald-500">{copy.secondary}</a>
              </div>
            </div>
            <div className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-xl">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-5">
                <div className="rounded-xl bg-emerald-100 p-3"><ShoppingBag className="h-7 w-7 text-emerald-700" /></div>
                <div><p className="font-bold">Shopify Growth Engine</p><p className="text-sm text-gray-500">Products · Orders · WhatsApp</p></div>
              </div>
              <div className="mt-5 space-y-3">{copy.features.map((f, index) => <div key={f.name} className="flex gap-3 rounded-xl bg-gray-50 p-3"><span className="font-bold text-emerald-700">{index + 1}.</span><span className="font-medium">{f.name}</span></div>)}</div>
            </div>
          </div>
        </section>
        <section className="px-5 py-16 md:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-3xl font-bold">{copy.featuresTitle}</h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">{copy.features.map(f => <article key={f.name} className="rounded-2xl border border-gray-200 p-6 shadow-sm"><CheckCircle2 className="mb-4 h-6 w-6 text-emerald-600" /><h3 className="text-lg font-bold">{f.name}</h3><p className="mt-3 leading-relaxed text-gray-600">{f.detail}</p></article>)}</div>
          </div>
        </section>
        <section id="how-it-works" className="scroll-mt-20 bg-gray-50 px-5 py-16 md:py-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-display text-3xl font-bold">{copy.stepsTitle}</h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2">{copy.steps.map((step, i) => <li key={step} className="flex gap-4 rounded-2xl bg-white p-5 ring-1 ring-gray-200"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-700 font-bold text-white">{i + 1}</span><p className="leading-relaxed text-gray-700">{step}</p></li>)}</ol>
          </div>
        </section>
        <section className="px-5 py-16 md:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-emerald-700" /><h2 className="font-display text-3xl font-bold">{copy.statusTitle}</h2></div>
            <div className="mt-7 grid gap-5 md:grid-cols-2">
              <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"><h3 className="text-xl font-bold text-emerald-900">{copy.availableTitle}</h3><p className="mt-3 leading-relaxed text-emerald-950">{copy.available}</p></article>
              <article className="rounded-2xl border border-gray-200 bg-gray-50 p-6"><h3 className="text-xl font-bold">{copy.limitedTitle}</h3><p className="mt-3 leading-relaxed text-gray-700">{copy.limited}</p></article>
            </div>
          </div>
        </section>
        <section className="border-t border-gray-100 px-5 py-16 text-center">
          <h2 className="font-display text-3xl font-bold">{copy.closing}</h2>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <a href={SHOPIFY_APP} target="_blank" rel="noopener noreferrer" className="rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white hover:bg-emerald-800">{copy.primary}</a>
            <a href={localizedInternalHref("/pricing", locale)} className="rounded-full border border-gray-300 px-6 py-3 font-semibold hover:bg-gray-50">{copy.pricing}</a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
