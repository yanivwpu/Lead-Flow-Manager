/**
 * Spanish and Hebrew overlays for the public Pricing page content model.
 * Brand, product, plan, and channel names stay unchanged where approved.
 */

import type { PricingPageContent } from "./pricingPageContent";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const ES: DeepPartial<PricingPageContent> = {
  seo: {
    title: "Precios de WhachatCRM | Prospect AI, Unified Inbox y WhatsApp CRM",
    description:
      "Precios claros de WhachatCRM: Prospect AI, Unified Inbox, WhatsApp CRM, chatbot con IA y automatización de ventas. Empieza gratis con 50 descubrimientos de Prospect AI al mes.",
    ogTitle: "Precios de WhachatCRM | Prospect AI, Unified Inbox y WhatsApp CRM",
    ogDescription:
      "Bandeja multicanal, Prospect AI, chatbot con IA y automatización de flujos en una sola plataforma. Empieza gratis.",
    twitterTitle: "Precios de WhachatCRM | Unified Inbox y Prospect AI",
    twitterDescription:
      "Prospect AI, bandeja multicanal, chatbot con IA y automatización de ventas: planes claros de Free a Pro.",
  },
  trialBanner: "Cada cuenta nueva incluye una prueba completa de 14 días de Pro + AI Brain.",
  transparent: {
    title: "Precios transparentes",
    points: [
      "Sin precio por contactos activos",
      "0% de margen de WhachatCRM sobre las tarifas de conversación de Meta",
      "Mejora tu plan solo cuando tu negocio crece",
    ],
  },
  freeUpsell: "Mejora tu plan cuando necesites chatbot, automatización de campañas y más capacidad.",
  starterCallout: {
    title: "Chatbot con IA y widget web",
    body: "Captura, califica y responde a visitantes del sitio web de forma automática.",
  },
  proCallout: {
    title: "Listo para Growth Engines",
    body: "Activa Growth Engines de industria compatibles, como Realtor Growth Engine. Los Growth Engines pueden requerir una compra aparte.",
  },
  proBadge: "Más popular",
  compareTitle: "Compara planes",
  featureColumnHeader: "Función",
  aiBrain: {
    badge: "Complemento opcional",
    title: "AI Brain",
    intro: "Mejora WhachatCRM con el conocimiento de tu negocio—no es un plan de suscripción aparte.",
    cardDesc: "Añade AI Brain a Starter o Pro: mejora la plataforma, no es un plan independiente.",
    highlights: [
      "Aprende tu negocio",
      "Usa el conocimiento de la empresa",
      "Conecta ofertas y enlaces de pago",
      "Mejora la personalización de Prospect AI",
      "AI Copilot más inteligente",
      "Mejores recomendaciones",
    ],
  },
  prospectAi: {
    badge: "NUEVO",
    title: "Prospect AI incluido — gratis en todos los planes",
    body: "Encuentra negocios locales, califica oportunidades con IA y lanza campañas de outreach personalizadas—todo dentro de WhachatCRM.",
    quotaNote: "Descubrimientos mensuales de Prospect AI por plan",
    cta: "Explorar Prospect AI",
  },
  capabilities: {
    title: "Qué puedes hacer",
    cards: [
      {
        id: "prospect-ai",
        title: "Prospect AI",
        body: "Encuentra negocios, califica oportunidades y lanza outreach desde un solo espacio de trabajo.",
      },
      {
        id: "inbox",
        title: "Bandeja multicanal",
        body: "Responde en WhatsApp, Messenger, Instagram, Gmail, Telegram, SMS y chat del sitio web.",
      },
      {
        id: "chatbot",
        title: "Chatbot con IA y automatizaciones",
        body: "Captura, califica y responde a visitantes del sitio—luego automatiza el seguimiento.",
      },
      {
        id: "copilot",
        title: "AI Copilot",
        body: "Redacta respuestas, entiende conversaciones y ve las siguientes acciones recomendadas.",
      },
      {
        id: "brain",
        title: "AI Brain",
        body: "Enseña a WhachatCRM tu negocio para que Copilot, Prospect AI y las respuestas sean más inteligentes.",
      },
    ],
  },
  whyChoose: {
    title: "Por qué las empresas cambian a WhachatCRM",
    cards: [
      {
        title: "Prospect AI GRATIS",
        body: "Descubre y califica negocios locales en todos los planes—incluido Free.",
      },
      {
        title: "Sin precio por contactos activos",
        body: "Tu factura no sube solo porque haya más contactos en tu CRM.",
      },
      {
        title: "0% de margen de WhachatCRM sobre las tarifas de conversación de Meta",
        body: "Solo pagas las tarifas publicadas de conversación de WhatsApp de Meta.",
      },
      {
        title: "Unified Inbox para mensajería y correo",
        body: "Gestiona WhatsApp, Messenger, Instagram, Gmail y más en un solo lugar.",
      },
      {
        title: "Chatbot con IA y automatización de flujos",
        body: "Captura, califica y da seguimiento automáticamente en Starter y Pro.",
      },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    items: [
      {
        q: "¿Las integraciones están incluidas en Free?",
        a: "Sí. Los usuarios Free pueden abrir Integraciones y conectar herramientas compatibles como Gmail, Shopify, Calendly y GoHighLevel. Siguen aplicando los límites de conversaciones, usuarios y canales. La automatización de campañas y AI Brain siguen siendo capacidades de pago aparte.",
      },
      {
        q: "¿Las plantillas de WhatsApp están incluidas en Free?",
        a: "Sí. Free incluye mensajería básica de plantillas de WhatsApp: ver, sincronizar y enviar una plantilla aprobada a un contacto cuando Meta lo exige fuera de la ventana de 24 horas. Starter y Pro añaden plantillas de WhatsApp en la automatización de flujos.",
      },
      {
        q: "¿Puedo probar Pro y AI Brain antes de mejorar mi plan?",
        a: "Cada cuenta nueva recibe una prueba completa de 14 días de Pro + AI Brain. Sin restricciones de funciones durante la prueba.",
      },
      {
        q: "¿Qué es Prospect AI?",
        a: "Prospect AI te ayuda a encontrar negocios locales, calificar oportunidades con IA y lanzar campañas de outreach personalizadas sin salir de WhachatCRM. Aplican cuotas mensuales de descubrimiento según el plan.",
      },
      {
        q: "¿El chatbot está incluido?",
        a: "El chatbot con IA y el widget web están incluidos en Starter y Pro. Free no incluye el constructor visual de chatbots. El chatbot captura, califica y responde a visitantes del sitio; AI Brain es un complemento opcional que hace las conversaciones más inteligentes.",
      },
      {
        q: "¿Qué es AI Brain?",
        a: "AI Brain es un complemento opcional de $29/mes para Starter o Pro—no es un plan base. Aprende tu negocio, usa el conocimiento de la empresa y las ofertas y enlaces de pago, mejora la personalización de Prospect AI y potencia un AI Copilot más inteligente.",
      },
      {
        q: "¿Qué cuenta como conversación activa?",
        a: "Una conversación se cuenta una vez cuando un cliente te escribe de forma activa durante el período de facturación. Varios mensajes dentro de esa conversación no crean conversaciones adicionales.",
      },
      {
        q: "¿Qué son las tarifas de conversación de Meta?",
        a: "Meta define el precio de las conversaciones de WhatsApp. WhachatCRM añade un 0% de margen. Los clientes solo pagan las tarifas publicadas de Meta.",
      },
      {
        q: "¿Puedo mejorar mi plan en cualquier momento?",
        a: "Sí. Mejora tu plan a medida que crece tu negocio. Puedes cambiar de plan según tu proveedor de facturación (Stripe o Shopify).",
      },
    ],
  },
  bottomCta: {
    title: "Empieza a encontrar clientes antes de pagar",
    subtitle: "Obtén 50 descubrimientos de Prospect AI cada mes en Free.",
    startFree: "Empezar gratis",
    bookDemo: "Reservar demo",
  },
  compareLabels: {
    activeConversations: "Conversaciones activas",
    users: "Usuarios",
    whatsappNumbers: "Cuentas de WhatsApp Business",
    unifiedInbox: "Bandeja multicanal",
    supportedChannels: "Canales de mensajería compatibles",
    prospectDiscoveries: "Descubrimientos mensuales de Prospect AI",
    prospectReview: "Revisión / calificación con IA",
    prospectCampaigns: "Constructor de campañas",
    messageCreation: "Modos de creación de mensajes",
    prospectArchive: "Archivar / restaurar",
    chatbotWidget: "Chatbot con IA y widget web",
    workflowAutomation: "Automatización de flujos",
    followUps: "Seguimientos",
    aiBrainAddon: "Complemento AI Brain",
    assignment: "Asignación / colaboración",
    integrations: "Integraciones",
    templateMessaging: "Mensajería con plantillas de WhatsApp",
    growthEngines: "Growth Engines",
  },
  compareHints: {
    growthEngines: "Plan de plataforma requerido para activar Growth Engines compatibles.",
    templateMessaging:
      "Free incluye envíos 1:1 de plantillas aprobadas. Starter y Pro añaden plantillas en la automatización de flujos.",
    integrations: "Conecta herramientas de negocio compatibles. Siguen aplicando los límites de conversación y uso.",
  },
  compareGroups: {
    MESSAGING: "Mensajería",
    "PROSPECT AI": "Prospect AI",
    CHATBOT: "Chatbot",
    AUTOMATION: "Automatización",
    AI: "IA",
    TEAM: "Equipo",
    SUPPORT: "Soporte",
    "GROWTH ENGINES": "Growth Engines",
  },
  compareCells: {
    connectedChannels: "Canales conectados",
    notIncluded: "No incluido",
    addOn: "Complemento",
    growthEngineReady: "Listo para Growth Engines",
    unlimited: "Ilimitado",
    upTo: "Hasta {{n}}",
    perMonth: "/mes",
    user: "usuario",
    users: "usuarios",
    templateOneToOne: "Envíos 1:1 de plantillas aprobadas",
    templateAutomation: "Plantillas con automatización de flujos",
  },
  highlights: {
    prospectDiscoveries: "{{n}} descubrimientos de Prospect AI/mes",
    activeConversations: "{{n}} conversaciones activas",
    usersOne: "1 usuario",
    usersMany: "Hasta {{n}} usuarios",
    usersUnlimited: "Usuarios ilimitados",
    whatsappOne: "1 cuenta de WhatsApp Business",
    whatsappMany: "Hasta {{n}} cuentas de WhatsApp Business",
    multiChannelInbox: "Bandeja multicanal",
    connectIntegrations: "Conecta integraciones",
    basicWhatsappTemplates: "Plantillas básicas de WhatsApp",
    whatsappTemplatesAutomation: "Plantillas de WhatsApp + automatización",
    chatbotWidget: "Chatbot con IA y widget web",
    workflowAutomation: "Automatización de flujos",
    growthEnginesRequired: "Plan requerido para Growth Engines de industria",
  },
  ssr: {
    h1: "Precios de WhachatCRM",
    lead: "Planes transparentes para Prospect AI, Unified Inbox, chatbot con IA, automatización de flujos y AI Copilot. Empieza gratis con 50 descubrimientos de Prospect AI cada mes.",
    bullets: [
      "Planes Free, Starter y Pro con límites claros de conversaciones y usuarios",
      "Prospect AI incluido en todos los planes",
      "Integraciones y plantillas básicas de WhatsApp en Free",
      "Complemento opcional AI Brain para Starter y Pro",
      "0% de margen de WhachatCRM sobre las tarifas de conversación de Meta",
      "Prueba de 14 días de Pro + AI Brain en cuentas nuevas",
    ],
  },
};

const HE: DeepPartial<PricingPageContent> = {
  seo: {
    title: "מחירי WhachatCRM | Prospect AI, Unified Inbox ו-WhatsApp CRM",
    description:
      "תמחור שקוף של WhachatCRM: Prospect AI, Unified Inbox, WhatsApp CRM, צ׳אטבוט AI ואוטומציית מכירות. התחילו בחינם עם 50 גילויי Prospect AI בחודש.",
    ogTitle: "מחירי WhachatCRM | Prospect AI, Unified Inbox ו-WhatsApp CRM",
    ogDescription:
      "תיבת דואר רב-ערוצית, Prospect AI, צ׳אטבוט AI ואוטומציית תהליכים בפלטפורמה אחת. התחילו בחינם.",
    twitterTitle: "מחירי WhachatCRM | Unified Inbox ו-Prospect AI",
    twitterDescription:
      "Prospect AI, תיבה רב-ערוצית, צ׳אטבוט AI ואוטומציית מכירות—תוכניות ברורות מ-Free עד Pro.",
  },
  trialBanner: "כל חשבון חדש כולל ניסיון מלא של 14 יום ל-Pro + AI Brain.",
  transparent: {
    title: "תמחור שקוף",
    points: [
      "בלי תמחור לפי אנשי קשר פעילים",
      "0% תוספת של WhachatCRM על עמלות השיחה של Meta",
      "שדרגו רק כשהעסק שלכם גדל",
    ],
  },
  freeUpsell: "שדרגו כשאתם צריכים צ׳אטבוט, אוטומציית קמפיינים ויותר קיבולת.",
  starterCallout: {
    title: "צ׳אטבוט AI ווידג׳ט לאתר",
    body: "ללכוד, לסווג ולהשיב למבקרים באתר באופן אוטומטי.",
  },
  proCallout: {
    title: "מוכן ל-Growth Engines",
    body: "הפעילו Growth Engines תעשייתיים תואמים כמו Realtor Growth Engine. ייתכן ש-Growth Engines ידרשו רכישה נפרדת.",
  },
  proBadge: "הפופולרי ביותר",
  compareTitle: "השוואת תוכניות",
  featureColumnHeader: "יכולת",
  aiBrain: {
    badge: "תוסף אופציונלי",
    title: "AI Brain",
    intro: "משדרג את WhachatCRM עם הידע העסקי שלכם—לא תוכנית מנוי נפרדת.",
    cardDesc: "הוסיפו AI Brain ל-Starter או Pro — משדרג את הפלטפורמה, לא תוכנית עצמאית.",
    highlights: [
      "לומד את העסק שלכם",
      "משתמש בידע החברה",
      "מחבר הצעות וקישורי תשלום",
      "משפר התאמה אישית ב-Prospect AI",
      "AI Copilot חכם יותר",
      "המלצות טובות יותר",
    ],
  },
  prospectAi: {
    badge: "חדש",
    title: "Prospect AI כלול — בחינם בכל תוכנית",
    body: "מצאו עסקים מקומיים, סננו הזדמנויות עם AI והשיקו קמפיינים מותאמים אישית—הכל בתוך WhachatCRM.",
    quotaNote: "גילויי Prospect AI חודשיים לפי תוכנית",
    cta: "גלו את Prospect AI",
  },
  capabilities: {
    title: "מה אפשר לעשות",
    cards: [
      {
        id: "prospect-ai",
        title: "Prospect AI",
        body: "מצאו עסקים, סננו הזדמנויות והשיקו פנייה מתוך סביבת עבודה אחת.",
      },
      {
        id: "inbox",
        title: "תיבה רב-ערוצית",
        body: "השיבו ב-WhatsApp, Messenger, Instagram, Gmail, Telegram, SMS וצ׳אט באתר.",
      },
      {
        id: "chatbot",
        title: "צ׳אטבוט AI ואוטומציות",
        body: "ללכוד, לסווג ולהשיב למבקרים באתר—ואז להפוך מעקבים לאוטומטיים.",
      },
      {
        id: "copilot",
        title: "AI Copilot",
        body: "נסחו תשובות, הבינו שיחות וראו את הצעדים הבאים המומלצים.",
      },
      {
        id: "brain",
        title: "AI Brain",
        body: "למדו את WhachatCRM את העסק שלכם כדי ש-Copilot, Prospect AI והתשובות יהיו חכמים יותר.",
      },
    ],
  },
  whyChoose: {
    title: "למה עסקים עוברים ל-WhachatCRM",
    cards: [
      {
        title: "Prospect AI בחינם",
        body: "גלו וסננו עסקים מקומיים בכל תוכנית—כולל Free.",
      },
      {
        title: "בלי תמחור לפי אנשי קשר פעילים",
        body: "החיוב לא עולה רק כי יש יותר אנשי קשר ב-CRM.",
      },
      {
        title: "0% תוספת של WhachatCRM על עמלות השיחה של Meta",
        body: "אתם משלמים רק את תעריפי השיחה הרשמיים של WhatsApp מבית Meta.",
      },
      {
        title: "Unified Inbox למסרים ולדוא״ל",
        body: "נהלו WhatsApp, Messenger, Instagram, Gmail ועוד במקום אחד.",
      },
      {
        title: "צ׳אטבוט AI ואוטומציית תהליכים",
        body: "ללכוד, לסווג ולעקוב אוטומטית ב-Starter וב-Pro.",
      },
    ],
  },
  faq: {
    title: "שאלות נפוצות",
    items: [
      {
        q: "האם אינטגרציות כלולות ב-Free?",
        a: "כן. משתמשי Free יכולים לפתוח את אינטגרציות ולחבר כלים נתמכים כמו Gmail, Shopify, Calendly ו-GoHighLevel. מגבלות שיחה, משתמשים וערוצים עדיין חלות. אוטומציית קמפיינים ו-AI Brain נשארים יכולות בתשלום נפרדות.",
      },
      {
        q: "האם תבניות WhatsApp כלולות ב-Free?",
        a: "כן. Free כולל משלוח תבניות WhatsApp בסיסי: צפייה, סנכרון ושליחת תבנית מאושרת לאיש קשר כש-Meta דורשת זאת מחוץ לחלון 24 השעות. Starter ו-Pro מוסיפים תבניות WhatsApp באוטומציית תהליכים.",
      },
      {
        q: "אפשר לנסות את Pro ו-AI Brain לפני שדרוג?",
        a: "כל חשבון חדש מקבל ניסיון מלא של 14 יום ל-Pro + AI Brain. בלי הגבלות יכולות במהלך הניסיון.",
      },
      {
        q: "מה זה Prospect AI?",
        a: "Prospect AI עוזר למצוא עסקים מקומיים, לסנן הזדמנויות עם AI ולהשיק קמפיינים מותאמים אישית בלי לעזוב את WhachatCRM. חלות מכסות גילוי חודשיות לפי תוכנית.",
      },
      {
        q: "האם הצ׳אטבוט כלול?",
        a: "צ׳אטבוט AI ווידג׳ט לאתר כלולים ב-Starter וב-Pro. ב-Free אין בונה צ׳אטבוטים ויזואלי. הצ׳אטבוט לוכד, מסווג ומשיב למבקרים באתר; AI Brain הוא תוסף אופציונלי שהופך שיחות לחכמות יותר.",
      },
      {
        q: "מה זה AI Brain?",
        a: "AI Brain הוא תוסף אופציונלי ב-$29 לחודש ל-Starter או Pro—לא תוכנית בסיס. הוא לומד את העסק, משתמש בידע החברה ובהצעות וקישורי תשלום, משפר התאמה אישית ב-Prospect AI ומפעיל AI Copilot חכם יותר.",
      },
      {
        q: "מה נחשב לשיחה פעילה?",
        a: "שיחה נספרת פעם אחת כשלקוח כותב אליכם באופן פעיל במהלך תקופת החיוב. מספר הודעות באותה שיחה לא יוצרים שיחות נוספות.",
      },
      {
        q: "מהן עמלות השיחה של Meta?",
        a: "Meta קובעת את תמחור שיחות WhatsApp. WhachatCRM מוסיף 0% תוספת. הלקוחות משלמים רק את התעריפים הרשמיים של Meta.",
      },
      {
        q: "אפשר לשדרג בכל עת?",
        a: "כן. שדרגו כשהעסק גדל. אפשר לשנות תוכנית לפי ספק החיוב שלכם (Stripe או Shopify).",
      },
    ],
  },
  bottomCta: {
    title: "התחילו למצוא לקוחות לפני שאתם משלמים",
    subtitle: "קבלו 50 גילויי Prospect AI בכל חודש בתוכנית Free.",
    startFree: "התחילו בחינם",
    bookDemo: "קבעו הדגמה",
  },
  compareLabels: {
    activeConversations: "שיחות פעילות",
    users: "משתמשים",
    whatsappNumbers: "חשבונות WhatsApp Business",
    unifiedInbox: "תיבה רב-ערוצית",
    supportedChannels: "ערוצי מסרים נתמכים",
    prospectDiscoveries: "גילויי Prospect AI חודשיים",
    prospectReview: "סקירה / סינון עם AI",
    prospectCampaigns: "בונה קמפיינים",
    messageCreation: "מצבי יצירת הודעות",
    prospectArchive: "ארכוב / שחזור",
    chatbotWidget: "צ׳אטבוט AI ווידג׳ט לאתר",
    workflowAutomation: "אוטומציית תהליכים",
    followUps: "מעקבים",
    aiBrainAddon: "תוסף AI Brain",
    assignment: "הקצאה / שיתוף פעולה",
    integrations: "אינטגרציות",
    templateMessaging: "משלוח תבניות WhatsApp",
    growthEngines: "Growth Engines",
  },
  compareHints: {
    growthEngines: "תוכנית הפלטפורמה הנדרשת להפעלת Growth Engines תואמים.",
    templateMessaging:
      "Free כולל שליחות תבניות מאושרות 1:1. Starter ו-Pro מוסיפים תבניות באוטומציית תהליכים.",
    integrations: "חברו כלי עסק נתמכים. מגבלות שיחה ושימוש עדיין חלות.",
  },
  compareGroups: {
    MESSAGING: "מסרים",
    "PROSPECT AI": "Prospect AI",
    CHATBOT: "צ׳אטבוט",
    AUTOMATION: "אוטומציה",
    AI: "AI",
    TEAM: "צוות",
    SUPPORT: "תמיכה",
    "GROWTH ENGINES": "Growth Engines",
  },
  compareCells: {
    connectedChannels: "ערוצים מחוברים",
    notIncluded: "לא כלול",
    addOn: "תוסף",
    growthEngineReady: "מוכן ל-Growth Engines",
    unlimited: "ללא הגבלה",
    upTo: "עד {{n}}",
    perMonth: "/חודש",
    user: "משתמש",
    users: "משתמשים",
    templateOneToOne: "שליחות תבניות מאושרות 1:1",
    templateAutomation: "תבניות עם אוטומציית תהליכים",
  },
  highlights: {
    prospectDiscoveries: "{{n}} גילויי Prospect AI בחודש",
    activeConversations: "{{n}} שיחות פעילות",
    usersOne: "משתמש 1",
    usersMany: "עד {{n}} משתמשים",
    usersUnlimited: "משתמשים ללא הגבלה",
    whatsappOne: "חשבון WhatsApp Business אחד",
    whatsappMany: "עד {{n}} חשבונות WhatsApp Business",
    multiChannelInbox: "תיבה רב-ערוצית",
    connectIntegrations: "חיבור אינטגרציות",
    basicWhatsappTemplates: "תבניות WhatsApp בסיסיות",
    whatsappTemplatesAutomation: "תבניות WhatsApp + אוטומציה",
    chatbotWidget: "צ׳אטבוט AI ווידג׳ט לאתר",
    workflowAutomation: "אוטומציית תהליכים",
    growthEnginesRequired: "תוכנית נדרשת ל-Growth Engines תעשייתיים",
  },
  ssr: {
    h1: "מחירי WhachatCRM",
    lead: "תוכניות שקופות ל-Prospect AI, Unified Inbox, צ׳אטבוט AI, אוטומציית תהליכים ו-AI Copilot. התחילו בחינם עם 50 גילויי Prospect AI בכל חודש.",
    bullets: [
      "תוכניות Free, Starter ו-Pro עם מגבלות שיחה ומשתמשים ברורות",
      "Prospect AI כלול בכל תוכנית",
      "אינטגרציות ותבניות WhatsApp בסיסיות ב-Free",
      "תוסף AI Brain אופציונלי ל-Starter ו-Pro",
      "0% תוספת של WhachatCRM על עמלות השיחה של Meta",
      "ניסיון 14 יום ל-Pro + AI Brain בחשבונות חדשים",
    ],
  },
};

export const PRICING_PAGE_LOCALES: Record<"es" | "he", DeepPartial<PricingPageContent>> = {
  es: ES,
  he: HE,
};
