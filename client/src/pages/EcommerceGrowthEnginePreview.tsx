import { useEcommerceMerchantActivationStatus, useActivateEcommerceMerchant } from "@/lib/ecommerceMerchantActivation";
import { ArrowRight, CheckCircle2, CircleDot, ShoppingBag, Users, ClipboardCheck, LockKeyhole, MessageCircle, Sparkles, ShoppingCart, PackageCheck, Repeat2 } from "lucide-react";
import { Helmet } from "react-helmet";
import { useAuth } from "@/lib/auth-context";
import { useTranslation } from "react-i18next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * PRIVATE PILOT PREVIEW. Deliberately noindexed and absent from the public navigation
 * and Growth Engines catalog until production Shopify activation is accepted.
 */
export function EcommerceGrowthEnginePreviewContent() {
  const { user } = useAuth();
  const activation = useEcommerceMerchantActivationStatus();
  const activate = useActivateEcommerceMerchant();
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const translations = {
    en: ["Turn Shopify conversations into more sales.", "Set up Shopify", "Everything important. Nothing complicated.", "Start simple. Expand when it's ready."],
    es: ["Convierte las conversaciones de Shopify en más ventas.", "Configurar Shopify", "Todo lo importante, sin complicaciones.", "Empieza fácilmente. Amplía cuando esté listo."],
    he: ["הופכים שיחות בחנות Shopify ליותר מכירות.", "הגדרת Shopify", "כל מה שחשוב. בלי סיבוכים.", "מתחילים בקלות. מתרחבים כשהכול מוכן."],
  };
  const l = translations[locale as keyof typeof translations] || translations.en;
  const pageCopy = {"en":{"badge":"Shopify first · Private pilot","about":"About E-commerce CRM","notice":"Order-support tasks are currently a private pilot. No automatic customer messages are sent.","workflow":"Illustrative Shopify task workflow","support":"Order support","sample":"Sample","connected":"Shopify connected","synced":"Customers & orders synced","recorded":"New order recorded","history":"Customer purchase history stays in Contacts","created":"Team task created","track":"Track, assign, complete — from Follow-Ups","illustration":"Illustration only. A task is not an order payment or fulfillment update.","features":[["One connected store","Bring Shopify customers and recorded orders into WhachatCRM."],["Tasks for the team","Keep new order-support follow-up in a clear task list."],["Customer context","Open the customer’s purchase record directly from a task."]],"journey":"Built around the customer journey","scenarioHead":"Less busywork for your store team. More opportunities to convert.","scenarioIntro":"See how one connected workspace can support the journey from a shopper’s first question to their next purchase. Availability varies by capability; upcoming automations are labeled below.","scenarios":[["Unified Inbox","Platform capability","A customer asks about sizing on WhatsApp or Instagram. Your team sees the conversation in one place and can respond without switching tabs.","One conversation workspace across supported connected channels."],["AI Brain","Platform capability","A shopper needs product help. AI-assisted suggestions can help your team write clearer, quicker replies using available context.","AI assistance depends on configured channels, knowledge and permissions."],["Shopify order support","Shopify private pilot","A new order arrives. WhachatCRM records it with the customer and prepares an internal follow-up task for your team.","Order-support tasks appear in Follow-Ups; purchase history stays with Contacts."],["Abandoned-cart recovery","Planned automation","A shopper leaves checkout. A future consent-aware journey could remind them about their cart and make it easy to return.","Not active: event coverage, consent, channel delivery and opt-out handling require acceptance."],["Post-purchase journeys","Planned automation","After an order, a future workflow could send an approved check-in or relevant offer to encourage a repeat purchase.","Outbound messaging and fulfillment journeys are not active in this preview."],["Ready-to-run workflows","In progress","Choose a simple order-support setup, keep advanced technical settings out of the way, and manage your team’s next actions.","One-click internal order-support activation is staged; other journeys remain gated."]],"simple":"A simple workflow you can preview today","steps":["Connect Shopify","Record customer + order","Create internal support task","Review in Follow-Ups"],"step":"STEP","workflowNote":"Illustrative sequence for the pilot order-support experience; no customer message is sent by this workflow.","private":"Private preview","warning":"Automated customer messaging, fulfillment and cancellation journeys, and abandoned-cart recovery are not active in this preview.","viewSetup":"View Shopify setup"},"es":{"badge":"Primero Shopify · Vista previa","about":"Acerca del CRM para comercio electrónico","notice":"Las tareas de soporte de pedidos están en vista previa. No se envían mensajes automáticos a clientes.","workflow":"Flujo ilustrativo de tareas de Shopify","support":"Soporte de pedidos","sample":"Ejemplo","connected":"Shopify conectado","synced":"Clientes y pedidos sincronizados","recorded":"Nuevo pedido registrado","history":"El historial de compras permanece en Contactos","created":"Tarea de equipo creada","track":"Sigue, asigna y completa tareas en Seguimientos","illustration":"Solo ilustración. Una tarea no confirma pagos ni actualiza envíos.","features":[["Una tienda conectada","Sincroniza clientes y pedidos registrados de Shopify con WhachatCRM."],["Tareas para el equipo","Organiza el seguimiento de pedidos nuevos en una lista clara."],["Contexto del cliente","Consulta el historial de compras desde una tarea."]],"journey":"Pensado para el recorrido del cliente","scenarioHead":"Menos trabajo manual. Más oportunidades de conversión.","scenarioIntro":"Desde la primera pregunta hasta la siguiente compra, todo en un mismo espacio. Indicamos qué funciones están disponibles y cuáles siguen en desarrollo.","scenarios":[["Bandeja unificada","Función de la plataforma","Un cliente pregunta por una talla en WhatsApp o Instagram. Tu equipo atiende la conversación sin cambiar de pestaña.","Conversaciones de los canales compatibles conectados en un solo lugar."],["AI Brain","Función de la plataforma","La IA puede sugerir respuestas útiles a preguntas sobre productos según el contexto disponible.","La asistencia depende de canales, conocimientos y permisos configurados."],["Soporte de pedidos Shopify","Vista previa","Llega un pedido nuevo. WhachatCRM lo registra junto al cliente y prepara una tarea interna.","Tareas en Seguimientos; historial de compras en Contactos."],["Recuperación de carritos","Automatización planificada","Si un comprador abandona el pago, un flujo futuro podría recordarle su carrito con el consentimiento apropiado.","No activo: faltan validar eventos, consentimiento, entrega y bajas."],["Seguimiento poscompra","Automatización planificada","Un flujo futuro podría enviar un mensaje aprobado o una oferta pertinente después de la compra.","Los mensajes salientes y flujos de envío no están activos."],["Flujos listos para usar","En desarrollo","Configura el soporte básico de pedidos y gestiona las próximas acciones del equipo.","La activación con un clic está en pruebas; otros flujos siguen bloqueados."]],"simple":"Un flujo sencillo que puedes explorar hoy","steps":["Conectar Shopify","Registrar cliente y pedido","Crear tarea interna","Revisar en Seguimientos"],"step":"PASO","workflowNote":"Secuencia ilustrativa en pruebas; este flujo no envía mensajes al cliente.","private":"Vista previa privada","warning":"Los mensajes automáticos, las operaciones de envío o cancelación y la recuperación de carritos aún no están activos.","viewSetup":"Ver configuración de Shopify"},"he":{"badge":"Shopify תחילה · תצוגה מקדימה","about":"מידע על CRM למסחר אלקטרוני","notice":"משימות התמיכה בהזמנות נמצאות בתצוגת ניסיון. לא נשלחות הודעות אוטומטיות ללקוחות.","workflow":"המחשה של תהליך הטיפול בהזמנות","support":"טיפול בהזמנות","sample":"דוגמה","connected":"Shopify מחובר","synced":"לקוחות והזמנות סונכרנו","recorded":"הזמנה חדשה נרשמה","history":"היסטוריית הרכישות נשמרת באנשי קשר","created":"נוצרה משימה לצוות","track":"מעקב, שיוך והשלמה באזור המשימות","illustration":"המחשה בלבד. משימה אינה אישור תשלום או עדכון משלוח.","features":[["חנות מחוברת אחת","ייבוא לקוחות והזמנות רשומות מ-Shopify אל WhachatCRM."],["משימות לצוות","ריכוז משימות מעקב להזמנות חדשות ברשימה ברורה."],["מידע על הלקוח","פתיחת היסטוריית הרכישות מתוך המשימה."]],"journey":"בנוי סביב מסע הלקוח","scenarioHead":"פחות עבודה ידנית. יותר הזדמנויות מכירה.","scenarioIntro":"מהשאלה הראשונה של הלקוח ועד הרכישה הבאה — סביבת עבודה מאוחדת. כל יכולת מסומנת לפי זמינותה.","scenarios":[["תיבת הודעות מאוחדת","יכולת פלטפורמה","לקוח שואל על מידה ב-WhatsApp או Instagram. הצוות יכול לנהל את השיחה במקום אחד.","שיחות מערוצים נתמכים ומחוברים בסביבה אחת."],["AI Brain","יכולת פלטפורמה","הבינה המלאכותית יכולה להציע תשובות מועילות לשאלות על מוצרים בהתאם למידע הזמין.","הסיוע תלוי בערוצים, במידע ובהרשאות שהוגדרו."],["טיפול בהזמנות Shopify","תצוגת ניסיון","הזמנה חדשה מתקבלת. WhachatCRM מתעד אותה עם הלקוח ומכין משימת מעקב פנימית.","המשימות באזור המעקב והיסטוריית הרכישות באנשי קשר."],["שחזור עגלות נטושות","אוטומציה מתוכננת","אם לקוח עוזב את הקופה, תהליך עתידי יוכל להזכיר לו את העגלה בכפוף להסכמה מתאימה.","לא פעיל: דרושה בדיקת אירועים, הסכמה, שליחה והסרה מרשימות."],["תהליכים לאחר רכישה","אוטומציה מתוכננת","תהליך עתידי יוכל לשלוח הודעת מעקב מאושרת או הצעה רלוונטית לאחר הרכישה.","שליחת הודעות ותהליכי משלוח אינם פעילים בתצוגה זו."],["תהליכים מוכנים להפעלה","בפיתוח","הגדירו טיפול בסיסי בהזמנות ונהלו את המשימות הבאות של הצוות.","הפעלה בלחיצה אחת נמצאת בבדיקות; שאר התהליכים עדיין חסומים."]],"simple":"תהליך פשוט שאפשר להכיר כבר עכשיו","steps":["חיבור Shopify","רישום לקוח והזמנה","יצירת משימה פנימית","בדיקה במשימות מעקב"],"step":"שלב","workflowNote":"המחשת התהליך בסביבת הבדיקות; לא נשלחת הודעה ללקוח.","private":"תצוגה מקדימה פרטית","warning":"הודעות אוטומטיות ללקוחות, תהליכי משלוח וביטול ושחזור עגלות נטושות עדיין אינם פעילים.","viewSetup":"פתיחת הגדרות Shopify"}};
  const tr = pageCopy[locale as keyof typeof pageCopy] || pageCopy.en;
  const setupPath = "/app/integrations?setup=shopify";
  const setupHref = user ? setupPath : `/auth?redirect=${encodeURIComponent(setupPath)}`;
  const isActivated = activation.data?.activated === true && activation.data?.eligible === true;
  const primaryHref = isActivated ? "/app/ecommerce-growth-engine" : setupHref;
  const activateLabel = locale === "he" ? "הפעלת מנוע הצמיחה" : locale === "es" ? "Activar motor de crecimiento" : "Activate Growth Engine";
  const openLabel = locale === "he" ? "פתיחת מנוע הצמיחה" : locale === "es" ? "Abrir motor de crecimiento" : "Open Growth Engine";
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900" data-testid="ecommerce-growth-engine-preview" lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      <Helmet>
        <title>E-commerce Growth Engine Preview | WhachatCRM</title>
        <meta name="description" content="Preview Shopify customer and order sync with internal order-support tasks in WhachatCRM. Customer messaging automation is not yet active." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <MarketingHeader isLoggedIn={!!user} startTrialLabel="Get started" startTrialShortLabel="Start" />

      <main>
        <section className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-b from-indigo-50/70 via-white to-white px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1fr_0.85fr]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800">
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                {tr.badge}
              </div>
              <h1 className="mt-6 max-w-2xl font-display text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                {l[0]}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
                {locale === "he" ? "חברו את החנות, רכזו לקוחות והזמנות ונהלו משימות מעקב במקום אחד. גלו את הכלים הקיימים ואת האוטומציות שבפיתוח." : locale === "es" ? "Conecta tu tienda, reúne clientes y pedidos, y organiza las tareas de seguimiento. Descubre las funciones disponibles y las automatizaciones en desarrollo." : "Connect your store, bring customers and orders together, and organize internal follow-up tasks. Explore available tools and upcoming automation."}
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center" id="install-engine">
                {user && !isActivated && activation.data?.eligible === true ? (
                  <button type="button" data-testid="ecommerce-activate-engine"
                    disabled={activate.isPending} onClick={() => activate.mutate()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 sm:w-auto">
                    {activate.isPending ? (locale === "he" ? "מפעילים…" : locale === "es" ? "Activando…" : "Activating…") : activateLabel}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </button>
                ) : (
                  <a href={primaryHref} data-testid="ecommerce-preview-primary-cta"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 sm:w-auto">
                    {isActivated ? openLabel : l[1]} <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                  </a>
                )}
                {user && !isActivated && activation.data?.eligible === true && (
                  <a href={setupHref} data-testid="ecommerce-preview-primary-cta"
                    className="inline-flex items-center justify-center px-3 py-3 text-sm font-medium text-slate-600 hover:text-blue-700">
                    {l[1]}
                  </a>
                )}
                {user && !isActivated && activation.data?.connected && !activation.data?.planEligible &&
                  <a href="/app/settings?tab=billing" className="text-sm font-medium text-blue-700 underline">
                    {locale === "he" ? "נדרש מנוי Pro" : locale === "es" ? "Se requiere Pro" : "Requires Pro"}
                  </a>}
                <a href="/solutions/ecommerce"
                  className="inline-flex items-center justify-center px-3 py-3 text-sm font-medium text-slate-600 underline-offset-4 hover:underline">
                  {tr.about}
                </a>
              </div>
              {activate.isError && <p role="alert" className="mt-2 text-sm text-red-700">
                {locale === "he" ? "ההפעלה נכשלה. בדקו את החיבור והמנוי." : locale === "es" ? "No se pudo activar. Revisa la conexión y el plan." : "Activation unavailable. Check your Shopify connection and Pro plan."}
              </p>
              <p className="mt-4 text-xs text-slate-500">{tr.notice}</p>
            </div>
            <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-[0_24px_70px_-35px_rgba(79,70,229,0.18)] sm:p-7" aria-label={tr.workflow}>
              <div className="mb-6 flex items-center justify-between">
                <p className="text-sm font-semibold">{tr.support}</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-800">
                  <CircleDot className="h-3 w-3" /> {tr.sample}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                <div className="rounded-lg bg-indigo-50 p-2"><ShoppingBag className="h-5 w-5 text-blue-700" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tr.connected}</p>
                  <p className="text-xs text-slate-500">{tr.synced}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <div className="mx-7 h-7 border-l border-dashed border-indigo-200" aria-hidden="true" />
              <div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5">
                <div className="rounded-lg bg-slate-50 p-2"><Users className="h-5 w-5 text-slate-700" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tr.recorded}</p>
                  <p className="text-xs text-slate-500">{tr.history}</p>
                </div>
              </div>
              <div className="mx-7 h-7 border-l border-dashed border-indigo-200" aria-hidden="true" />
              <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3.5">
                <div className="rounded-lg bg-blue-100 p-2"><ClipboardCheck className="h-5 w-5 text-indigo-800" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{tr.created}</p>
                  <p className="text-xs text-slate-600">{tr.track}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
              </div>
              <p className="mt-4 text-xs text-slate-400">{tr.illustration}</p>
            </div>
          </div>
        </section>

        <section className="px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">{l[2]}</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {tr.features.map(([heading, text]) =><article key={heading} className="rounded-2xl border border-slate-200 p-5">
                <CheckCircle2 className="mb-4 h-5 w-5 text-blue-700" />
                <h3 className="font-semibold">{heading}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
              </article>)}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-gradient-to-b from-white to-indigo-50/40 px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-600">{tr.journey}</p>
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">{tr.scenarioHead}</h2>
              <p className="mt-3 text-slate-600">{tr.scenarioIntro}</p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {tr.scenarios.map(([title, tag, story, detail]) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-950">{title}</h3>
                    <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">{tag}</span>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-slate-700">{story}</p>
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">{detail}</p>
                </article>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border border-indigo-100 bg-white p-5 sm:p-7">
              <h3 className="font-semibold">{tr.simple}</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {tr.steps.map((step, index) => (
                  <div key={step} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                    <span className="mb-2 block text-xs font-bold text-blue-600">{tr.step} {index + 1}</span>
                    <span className="font-medium">{step}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">{tr.workflowNote}</p>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-100 bg-slate-50 px-4 py-12 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <LockKeyhole className="h-4 w-4" /> {tr.private}
              </div>
              <h2 className="mt-2 text-xl font-bold">{l[3]}</h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                {tr.warning}
              </p>
            </div>
            <a href={setupHref} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700">
              {tr.viewSetup} <ArrowRight className="h-4 w-4 rtl:rotate-180"/>
            </a>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export function EcommerceGrowthEnginePreview() {
  return <EcommerceGrowthEnginePreviewContent />;
}
