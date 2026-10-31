import { Link } from "wouter";
import {
  ArrowRight, Bot, CheckCircle2, Inbox, MessageCircle,
  PackageCheck, Repeat2, ShieldCheck, ShoppingBag, ShoppingCart,
  Sparkles, Workflow, type LucideIcon,
} from "lucide-react";

/**
 * Full, in-dashboard product presentation. This page is intentionally available
 * *before* installation and is separate from merchant activation and any sends.
 */
const copy = {
  en: {
    eyebrow: "THE E-COMMERCE GROWTH ENGINE",
    hero: "Recover missed sales. Turn every shopper conversation into an opportunity.",
    intro: "Bring Shopify, WhatsApp and your customer conversations together. Help shoppers find the right product, bring interested buyers back to abandoned carts, and keep supporting them after checkout.",
    cta: "Install Growth Engine",
    open: "Open Growth Engine",
    secondary: "Explore capabilities",
    heroCardTitle: "An abandoned checkout shouldn't be the end.",
    heroCardIntro: "Illustrative customer journey",
    cart: "Checkout abandoned",
    cartDescription: "A shopper leaves before completing an order.",
    gate: "Consent & template check",
    gateDescription: "Only eligible, approved messages can be prepared.",
    reminder: "Cart recovery follow-up",
    reminderDescription: "Bring the customer back to their checkout.",
    sample: "Example workflow — not a live message",
    benefits: [
      ["Recover more opportunities", "Stay connected with interested buyers after an abandoned checkout."],
      ["Sell with better context", "Bring Shopify products, inventory and messages into the conversation."],
      ["Keep customers engaged", "Support orders, follow up and build repeat-purchase opportunities."],
    ],
    capabilityEyebrow: "WHAT'S INCLUDED",
    capabilityTitle: "Everything your Shopify team needs to convert and retain shoppers.",
    capabilityIntro: "Not just a chatbot. A connected customer journey that combines messaging, commerce context, AI and automation.",
    features: [
      ["Abandoned Cart Recovery", "Reconnect with shoppers who leave before completing checkout. Prepare timely, relevant WhatsApp recovery journeys with consent, approved templates, opt-out handling and delivery safeguards."],
      ["AI Shopping Assistant", "Help customers discover products, compare options and check relevant product or inventory context without leaving the conversation."],
      ["Unified Customer Inbox", "Bring connected WhatsApp and supported social or web messaging into one workspace for human replies and AI assistance."],
      ["Shopify Orders & Support", "See recorded orders alongside customer context, organize fulfillment-related questions and assign follow-up tasks to the right team member."],
      ["Post-Purchase Journeys", "Plan order updates, follow-up assistance, win-back and repeat-purchase outreach, subject to each channel's consent and messaging requirements."],
      ["Customizable Automations", "Start with ready-to-configure journeys, review message content and timing, and tailor follow-ups to your store instead of building every step from scratch."],
    ],
    featureTag: "Featured capability",
    journeyEyebrow: "HOW THE PIECES WORK TOGETHER",
    journeyTitle: "From first question to the next purchase.",
    journeyIntro: "A connected journey keeps the context, so a shopper doesn't have to start again with every interaction.",
    journey: [
      ["A shopper asks", "Questions arrive through a connected channel."],
      ["AI assists", "Product discovery and inventory-aware answers."],
      ["A checkout is abandoned", "A recovery journey can prepare a relevant follow-up."],
      ["An order arrives", "Order context and support tasks are available."],
      ["The relationship continues", "Plan useful post-purchase communication."],
    ],
    journeyDisclaimer: "Illustrative sequence. Recovery and other outbound messages require store event availability, customer consent, approved templates and separate delivery enablement.",
    scenarioEyebrow: "REAL STORE SCENARIOS",
    scenarioTitle: "See what this looks like for a merchant.",
    scenarios: [
      ["The abandoned cart", "A buyer leaves a product in their checkout. With the right permission and approved template, a recovery journey can help them return instead of disappearing."],
      ["The unanswered product question", "Someone asks about a size or availability. Your team and AI can use the Shopify catalog context to guide the conversation."],
      ["The customer who already ordered", "A shopper asks where their order stands. Your team can find recorded order context and create or assign a follow-up."],
    ],
    activationEyebrow: "GET STARTED",
    activationTitle: "From install to a connected sales workspace.",
    activationDescription: "Start from your WhachatCRM dashboard. Connect your store, activate the engine and customize the customer journeys you want to use.",
    activationSteps: [
      ["Connect your Shopify store", "Securely link the store to this WhachatCRM workspace."],
      ["Activate Growth Engine", "Confirm your connected store and eligible Pro access."],
      ["Choose & customize journeys", "Review products, tasks, AI Shopping and message plans. Enable outbound delivery separately when ready."],
    ],
    footerTitle: "More conversations. More opportunities to convert.",
    footerDescription: "Bring Shopify and customer messaging together, then configure the journeys that fit your business.",
    requirements: "Requires a connected Shopify store and eligible Pro plan or trial. WhatsApp delivery requires a connected account, valid consent, approved templates and separate enablement.",
  },
  es: {
    eyebrow: "MOTOR DE CRECIMIENTO PARA COMERCIO ELECTRÓNICO",
    hero: "Recupera oportunidades perdidas. Convierte cada conversación en una oportunidad de venta.",
    intro: "Une Shopify, WhatsApp y las conversaciones con tus clientes. Ayúdales a descubrir productos, recupera carritos abandonados y acompáñalos después de comprar.",
    cta: "Instalar motor de crecimiento",
    open: "Abrir motor de crecimiento",
    secondary: "Explorar funciones",
    heroCardTitle: "Un checkout abandonado no tiene por qué ser el final.",
    heroCardIntro: "Recorrido ilustrativo",
    cart: "Checkout abandonado",
    cartDescription: "Una persona abandona la compra antes de terminar.",
    gate: "Verificar consentimiento y plantilla",
    gateDescription: "Solo mensajes elegibles y aprobados.",
    reminder: "Seguimiento del carrito",
    reminderDescription: "Invita a volver al proceso de compra.",
    sample: "Ejemplo ilustrativo; no se envía ningún mensaje",
    benefits: [
      ["Recupera oportunidades", "Conecta con compradores interesados tras un checkout abandonado."],
      ["Vende con contexto", "Integra productos, inventario y mensajes de Shopify."],
      ["Fideliza clientes", "Atiende pedidos y crea oportunidades de recompra."],
    ],
    capabilityEyebrow: "QUÉ INCLUYE",
    capabilityTitle: "Todo para convertir y fidelizar a los compradores de Shopify.",
    capabilityIntro: "Más que un chatbot: mensajería, información comercial, IA y automatización conectadas.",
    features: [
      ["Recuperación de carritos abandonados", "Retoma el contacto con compradores que no completan su compra. Prepara mensajes oportunos de WhatsApp con consentimiento, plantillas aprobadas, bajas y controles de entrega."],
      ["Asistente de compras con IA", "Ayuda a descubrir productos, comparar opciones y consultar información de catálogo e inventario."],
      ["Bandeja de entrada unificada", "Reúne WhatsApp y otros canales compatibles conectados para respuestas humanas y asistencia de IA."],
      ["Pedidos y soporte Shopify", "Consulta pedidos registrados y contexto del cliente; asigna preguntas y tareas de seguimiento."],
      ["Recorridos poscompra", "Prepara actualizaciones, soporte, recuperación de clientes y nuevas compras, conforme a los permisos de cada canal."],
      ["Automatizaciones personalizables", "Configura recorridos, revisa contenidos y horarios y adapta los seguimientos a tu tienda."],
    ],
    featureTag: "Función destacada",
    journeyEyebrow: "CÓMO FUNCIONA",
    journeyTitle: "Desde la primera pregunta hasta la siguiente compra.",
    journeyIntro: "Un recorrido conectado conserva el contexto en cada conversación.",
    journey: [
      ["El cliente pregunta", "La consulta llega por un canal conectado."],
      ["La IA ayuda", "Respuestas con contexto de productos e inventario."],
      ["Abandona el carrito", "Se puede preparar un seguimiento relevante."],
      ["Llega un pedido", "Información del pedido y tareas de soporte."],
      ["La relación continúa", "Planifica comunicaciones después de la compra."],
    ],
    journeyDisclaimer: "Secuencia ilustrativa. Los mensajes salientes requieren eventos disponibles, consentimiento, plantillas aprobadas y habilitación independiente.",
    scenarioEyebrow: "EJEMPLOS REALES",
    scenarioTitle: "Así puede ayudar a tu tienda.",
    scenarios: [
      ["El carrito abandonado", "Un cliente deja un producto antes de pagar. Con permiso y plantilla aprobada, un seguimiento puede invitarlo a volver."],
      ["La pregunta sin responder", "Alguien pregunta por talla o disponibilidad. La IA y el equipo consultan el catálogo Shopify."],
      ["El pedido existente", "Un cliente pregunta por su pedido. El equipo consulta el contexto registrado y asigna una tarea."],
    ],
    activationEyebrow: "EMPEZAR",
    activationTitle: "De la instalación a un espacio de ventas conectado.",
    activationDescription: "Conecta Shopify, activa el motor y personaliza los recorridos desde tu dashboard.",
    activationSteps: [
      ["Conecta Shopify", "Vincula tu tienda a este espacio WhachatCRM."],
      ["Activa el motor", "Confirma la tienda y tu acceso Pro elegible."],
      ["Personaliza los recorridos", "Revisa productos, IA y tareas. Habilita el envío por separado."],
    ],
    footerTitle: "Más conversaciones. Más oportunidades de convertir.",
    footerDescription: "Conecta Shopify con tus canales y prepara los recorridos adecuados.",
    requirements: "Requiere Shopify y Pro o prueba elegible. El envío WhatsApp necesita cuenta conectada, consentimiento, plantillas aprobadas y habilitación independiente.",
  },
  he: {
    eyebrow: "מנוע הצמיחה למסחר אלקטרוני",
    hero: "מחזירים הזדמנויות שהתפספסו. הופכים כל שיחת קנייה להזדמנות מכירה.",
    intro: "Shopify, WhatsApp ושיחות הלקוחות במקום אחד. עזרו ללקוחות למצוא מוצרים, החזירו מתעניינים לעגלות נטושות ולוו אותם גם אחרי הקנייה.",
    cta: "התקנת מנוע הצמיחה",
    open: "פתיחת מנוע הצמיחה",
    secondary: "הצגת היכולות",
    heroCardTitle: "עגלה נטושה לא חייבת להיות סוף הסיפור.",
    heroCardIntro: "המחשה של מסע לקוח",
    cart: "הקופה ננטשה",
    cartDescription: "הלקוח עזב לפני השלמת ההזמנה.",
    gate: "בדיקת הסכמה ותבנית",
    gateDescription: "רק הודעות מתאימות ומאושרות.",
    reminder: "מעקב אחר עגלה נטושה",
    reminderDescription: "מאפשרים ללקוח לחזור לקופה.",
    sample: "תהליך להמחשה — לא נשלחת הודעה",
    benefits: [
      ["מחזירים הזדמנויות", "שומרים על קשר עם לקוחות שהתעניינו אך לא השלימו רכישה."],
      ["מוכרים עם מידע", "משלבים מוצרים, מלאי ושיחות של Shopify."],
      ["בונים קשר ארוך טווח", "מטפלים בהזמנות ומעודדים קנייה חוזרת."],
    ],
    capabilityEyebrow: "מה כלול",
    capabilityTitle: "כל מה שצוות Shopify צריך כדי להפוך פניות ללקוחות חוזרים.",
    capabilityIntro: "לא רק צ׳אטבוט. מסע לקוח המחבר הודעות, נתוני מסחר, AI ואוטומציה.",
    features: [
      ["שחזור עגלות נטושות", "יוצרים קשר מחדש עם לקוחות שנטשו את הקופה. מתכננים תזכורות WhatsApp רלוונטיות בכפוף להסכמה, תבניות מאושרות, הסרה מרשימות ובקרות משלוח."],
      ["עוזר קניות מבוסס AI", "מסייעים למצוא מוצרים, להשוות אפשרויות ולקבל מידע על קטלוג ומלאי."],
      ["תיבת הודעות מאוחדת", "מנהלים שיחות WhatsApp וערוצים נתמכים נוספים במקום אחד, עם תמיכה אנושית ובינה מלאכותית."],
      ["הזמנות ותמיכת Shopify", "צופים בהזמנות שנרשמו ובהיסטוריית הלקוח ומקצים משימות מעקב לצוות."],
      ["מסעות לאחר רכישה", "מתכננים עדכונים, תמיכה, חידוש קשר והזדמנויות לקנייה חוזרת בהתאם להרשאות."],
      ["אוטומציות בהתאמה אישית", "בוחרים תהליכים מוכנים להגדרה, עורכים תוכן ותזמון ומתאימים את המעקב לחנות."],
    ],
    featureTag: "יכולת מרכזית",
    journeyEyebrow: "כך הכול מתחבר",
    journeyTitle: "מהשאלה הראשונה ועד לקנייה הבאה.",
    journeyIntro: "מסע מחובר שומר את ההקשר של כל שיחה.",
    journey: [
      ["הלקוח שואל", "פנייה מגיעה מערוץ מחובר."],
      ["AI מסייע", "המלצות ותשובות עם נתוני מוצרים."],
      ["עגלה ננטשת", "אפשר להכין תהליך שחזור מותאם."],
      ["הזמנה מתקבלת", "פרטי הזמנה ומשימות לצוות."],
      ["הקשר נמשך", "מתכננים הודעות לאחר הרכישה."],
    ],
    journeyDisclaimer: "המסע להמחשה בלבד. הודעות יוצאות מחייבות אירועים זמינים, הסכמה, תבניות מאושרות ואישור הפעלה נפרד.",
    scenarioEyebrow: "דוגמאות מהחנות",
    scenarioTitle: "כך זה נראה בעסק.",
    scenarios: [
      ["עגלה נטושה", "לקוח עוזב את הקופה. בהינתן אישור ותבנית מתאימה, תהליך שחזור יכול להזמין אותו לחזור."],
      ["שאלת מוצר", "לקוח שואל על מידה או זמינות. הצוות וה-AI נעזרים בקטלוג Shopify."],
      ["שירות לאחר הזמנה", "לקוח מבקש עדכון. הצוות מוצא מידע על ההזמנה ופותח משימת מעקב."],
    ],
    activationEyebrow: "מתחילים כאן",
    activationTitle: "מהתקנה לסביבת מכירות מחוברת.",
    activationDescription: "מחברים Shopify, מפעילים את המנוע ומתאימים את מסעות הלקוח מתוך המערכת.",
    activationSteps: [
      ["חיבור Shopify", "מקשרים את החנות לסביבת העבודה."],
      ["הפעלת המנוע", "מאמתים חיבור ומנוי Pro מתאים."],
      ["התאמת התהליכים", "בודקים מוצרים, AI ומשימות. שליחת הודעות מופעלת בנפרד."],
    ],
    footerTitle: "יותר שיחות. יותר הזדמנויות מכירה.",
    footerDescription: "מחברים Shopify והודעות לקוחות ומגדירים את התהליכים המתאימים לעסק.",
    requirements: "נדרשים חיבור Shopify ומנוי Pro או ניסיון מתאים. שליחת WhatsApp מחייבת חשבון מחובר, הסכמה, תבניות מאושרות והפעלה נפרדת.",
  },
} as const;

const featureIcons: LucideIcon[] = [ShoppingCart, Sparkles, Inbox, PackageCheck, Repeat2, Workflow];
const journeyIcons: LucideIcon[] = [MessageCircle, Bot, ShoppingCart, PackageCheck, Repeat2];
const scenarioIcons: LucideIcon[] = [ShoppingCart, Sparkles, PackageCheck];
const installHref = "/app/ecommerce-growth-engine?view=setup";
const ctaClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";

export function EcommerceGrowthEngineDetails({ locale, activated }: { locale: "en" | "es" | "he"; activated: boolean }) {
  const c = copy[locale];
  const dest = activated ? "/app/ecommerce-growth-engine" : installHref;
  const label = activated ? c.open : c.cta;
  const direction = locale === "he" ? "rtl" : "ltr";
  const Action = ({ testId }: { testId: string }) => (
    <Link href={dest} data-testid={testId} className={ctaClass}>
      {label}<ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true"/>
    </Link>
  );

  return (
    <div dir={direction} lang={locale} className="space-y-9" data-testid="ecommerce-engine-in-app-details">
      <section className="grid items-center gap-7 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 via-white to-white p-6 sm:p-8 lg:grid-cols-[1.05fr_.95fr]" data-testid="ecommerce-engine-sales-hero">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold tracking-wide text-blue-700">
            <ShoppingBag className="h-4 w-4"/>{c.eyebrow}
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">{c.hero}</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600">{c.intro}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Action testId="ecommerce-details-install"/>
            <a className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline" href="#ecommerce-capabilities">
              {c.secondary}
            </a>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm" role="group" aria-label={c.heroCardIntro}>
          <p className="text-sm font-bold text-slate-900">{c.heroCardTitle}</p>
          <p className="mb-4 mt-1 text-xs text-slate-500">{c.heroCardIntro}</p>
          {[
            { icon: ShoppingCart, title: c.cart, description: c.cartDescription },
            { icon: ShieldCheck, title: c.gate, description: c.gateDescription },
            { icon: MessageCircle, title: c.reminder, description: c.reminderDescription },
          ].map(({ icon: Icon, title, description }, index) => (
            <div key={title}>
              {index > 0 && <div className="ms-5 h-5 border-s-2 border-dashed border-blue-200" aria-hidden="true"/>}
              <div className={"flex items-start gap-3 rounded-xl border p-3 " + (index === 2 ? "border-blue-200 bg-blue-50/70" : "border-slate-100 bg-white")}>
                <span className="rounded-lg bg-blue-100 p-2 text-blue-700"><Icon className="h-5 w-5"/></span>
                <div>
                  <p className="text-sm font-semibold text-slate-950">{title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
                </div>
                {index === 1 && <CheckCircle2 className="ms-auto h-5 w-5 shrink-0 text-blue-600"/>}
              </div>
            </div>
          ))}
          <p className="mt-4 text-xs text-slate-500">{c.sample}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3" data-testid="ecommerce-sales-benefits">
        {c.benefits.map(([title, description]) => (
          <article key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <CheckCircle2 className="h-5 w-5 text-blue-600"/>
            <h2 className="mt-3 text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
          </article>
        ))}
      </section>

      <section className="space-y-5" id="ecommerce-capabilities" data-testid="ecommerce-engine-capabilities">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{c.capabilityEyebrow}</p>
          <h2 className="mt-2 max-w-3xl text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{c.capabilityTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{c.capabilityIntro}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {c.features.map(([title, description], index) => {
            const Icon = featureIcons[index];
            return (
              <article key={title} className={"rounded-xl border p-5 sm:p-6 " +
                (index === 0 ? "border-blue-200 bg-blue-50/70 md:col-span-2" : "border-slate-200 bg-white")}
                data-testid={index === 0 ? "ecommerce-abandoned-cart-feature" : undefined}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 rounded-xl bg-white p-2.5 text-blue-700 shadow-sm"><Icon className="h-6 w-6"/></div>
                  <div>
                    {index === 0 && <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-blue-700">{c.featureTag}</span>}
                    <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-6 sm:p-8" data-testid="ecommerce-sales-customer-journey">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{c.journeyEyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{c.journeyTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.journeyIntro}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {c.journey.map(([title, description], index) => {
            const Icon = journeyIcons[index];
            return <article key={title} className="relative rounded-xl border border-blue-100 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Icon className="h-5 w-5"/></span>
                <span className="text-xs font-bold text-blue-500">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-slate-950">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
              {index < c.journey.length - 1 && <ArrowRight className="absolute -end-4 top-1/2 z-10 hidden h-5 w-5 rounded-full bg-white text-blue-500 rtl:rotate-180 md:block" aria-hidden="true"/>}
            </article>;
          })}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">{c.journeyDisclaimer}</p>
      </section>

      <section className="space-y-5" data-testid="ecommerce-sales-scenarios">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{c.scenarioEyebrow}</p>
          <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{c.scenarioTitle}</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {c.scenarios.map(([title, description], index) => {
            const Icon = scenarioIcons[index];
            return <article key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <Icon className="h-6 w-6 text-blue-700"/>
              <h3 className="mt-4 text-base font-semibold text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
            </article>;
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8" data-testid="ecommerce-sales-activation-guide">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">{c.activationEyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">{c.activationTitle}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{c.activationDescription}</p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {c.activationSteps.map(([title, description], index) => (
            <div key={title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">{index + 1}</span>
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-6 sm:p-8" data-testid="ecommerce-sales-final-cta">
        <h2 className="text-2xl font-bold text-slate-950 sm:text-3xl">{c.footerTitle}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{c.footerDescription}</p>
        <div className="mt-5"><Action testId="ecommerce-details-install-bottom"/></div>
        <p className="mt-4 text-xs leading-relaxed text-slate-500"><ShieldCheck className="me-1 inline h-4 w-4"/>{c.requirements}</p>
      </section>
    </div>
  );
}
