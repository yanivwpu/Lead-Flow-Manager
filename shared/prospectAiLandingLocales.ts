/**
 * Localized overlays for Prospect AI landing (/prospect-ai).
 * English base: client/src/content/prospectAiLandingContent.ts
 */

import type { MarketingLocale } from "./marketingLocale";
import { mergeMarketingContent } from "./marketingLocale";

export type ProspectAiLandingSeoOverlay = {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
};

export type ProspectAiLandingUiOverlay = {
  faqTitle: string;
  relatedResourcesTitle: string;
  heroImageAlt: string;
  breadcrumbHome: string;
};

export type ProspectAiLandingLocaleOverlay = {
  seo: ProspectAiLandingSeoOverlay;
  ui: ProspectAiLandingUiOverlay;
  h1: string;
  subheadlineLines: string[];
  primaryCta: string;
  secondaryCta: string;
  pain: {
    title: string;
    paragraphs: string[];
  };
  meetTeam: {
    title: string;
    paragraphs: string[];
    image: { alt: string; caption: string };
  };
  howItWorks: {
    title: string;
    subtitle: string;
    steps: Array<{ label: string; detail: string }>;
  };
  featureSections: Array<{
    title: string;
    paragraphs: string[];
    bullets: string[];
    image: { alt: string; caption: string };
  }>;
  platform: {
    title: string;
    subtitle: string;
    items: string[];
  };
  whyChoose: {
    title: string;
    items: Array<{ title: string; body: string }>;
  };
  faqs: Array<{ question: string; answer: string }>;
  relatedLinks: Array<{ href: string; label: string }>;
  finalCta: {
    headline: string;
    subtext: string;
  };
};

export const PROSPECT_AI_LANDING_LOCALES: Record<
  Exclude<MarketingLocale, "en">,
  ProspectAiLandingLocaleOverlay
> = {
  es: {
    seo: {
      title: "Prospect AI — Equipo de ventas con IA para prospección y outreach | WhachatCRM",
      description:
        "Prospect AI es tu equipo de ventas con IA: descubre negocios locales, califica oportunidades, lanza outreach por email personalizado y gestiona cada respuesta en un solo CRM. Empieza gratis.",
      ogTitle: "Prospect AI — Conoce tu equipo de ventas con IA | WhachatCRM",
      ogDescription:
        "Descubre negocios, califica oportunidades, lanza outreach personalizado y gestiona respuestas — todo desde una sola plataforma.",
    },
    ui: {
      faqTitle: "Preguntas frecuentes",
      relatedResourcesTitle: "Recursos relacionados",
      heroImageAlt:
        "Prospect AI growth engine — descubre negocios, califica con IA y lanza outreach",
      breadcrumbHome: "Inicio",
    },
    h1: "Conoce tu equipo de ventas con IA",
    subheadlineLines: [
      "Descubre negocios.",
      "Califica oportunidades.",
      "Lanza outreach personalizado.",
      "Gestiona cada respuesta —",
      "todo desde una plataforma.",
    ],
    primaryCta: "Empieza tu prueba gratis",
    secondaryCta: "Ver demo",
    pain: {
      title: "Deja de prospectar en frío",
      paragraphs: [
        "La prospección tradicional sigue significando horas de búsquedas en Google, caos en hojas de cálculo y adivinar quién podría comprar. Los equipos rastrean directorios, persiguen datos de contacto incompletos y envían mensajes genéricos que nunca reciben respuesta.",
        "Mientras tanto, los negocios locales que necesitan tu oferta están a una búsqueda de distancia — si solo tuvieras un asistente de ventas con IA para encontrarlos, calificar el encaje y empezar una conversación real.",
        "Prospect AI sustituye ese trabajo repetitivo por software de prospección con IA pensado para generación de leads locales, calificación y engagement comercial — dentro del CRM que ya usas para las respuestas.",
      ],
    },
    meetTeam: {
      title: "Conoce tu equipo de ventas con IA",
      paragraphs: [
        "Piensa en Prospect AI como un empleado con IA para adquisición de clientes — no una base de datos estática. Descubre negocios en tu mercado, investiga información pública disponible, recomienda a quién vale la pena dedicar tiempo y te ayuda a lanzar outreach personalizado.",
        "Tú mantienes el control: revisa y acepta encajes, edita cada mensaje y pulsa Enviar cuando estés listo. Las respuestas llegan a tu Unified Inbox junto a WhatsApp, Messenger, Instagram y más.",
      ],
      image: {
        alt: "Espacio de trabajo Prospect AI Review de WhachatCRM con prospectos calificados por IA listos para campaña.",
        caption:
          "El espacio de trabajo real de Prospect AI Review — prospectos calificados por IA listos para outreach.",
      },
    },
    howItWorks: {
      title: "Cómo funciona Prospect AI",
      subtitle: "Un flujo de ventas claro desde el primer descubrimiento hasta el cliente ganado.",
      steps: [
        { label: "Descubrir", detail: "Encuentra negocios locales por industria y ubicación." },
        { label: "Revisión IA", detail: "La IA califica oportunidades según tus objetivos." },
        { label: "Campaña", detail: "Lanza outreach personalizado con IA según tu calendario." },
        { label: "Inbox", detail: "Continúa cada respuesta con AI Copilot." },
        { label: "Cliente", detail: "Mueve las victorias a tu pipeline." },
      ],
    },
    featureSections: [
      {
        title: "Descubre negocios",
        paragraphs: [
          "Elige un tipo de negocio y ubicación, define tu radio y empieza el descubrimiento. Prospect AI busca información pública de negocios para encontrar prospectos nuevos en tu mercado.",
          "Úsalo como generación de leads locales y software de prospección en un solo paso — sin alquilar otra lista de cold email.",
        ],
        bullets: [
          "Segmentación por industria y ubicación",
          "Descubrimiento público de negocios",
          "Envía resultados prometedores directo a Revisión",
        ],
        image: {
          alt: "Herramienta de descubrimiento Prospect AI de WhachatCRM para encontrar prospectos por tipo de negocio y ubicación.",
          caption:
            "Descubre negocios locales por industria y ubicación — luego envía encajes a Revisión IA.",
        },
      },
      {
        title: "Calificación con IA",
        paragraphs: [
          "La IA de calificación de leads revisa cada negocio y muestra resultados como Calificado, Necesita revisión, Email faltante y No calificado — con razonamiento en el que puedes confiar.",
          "El enriquecimiento busca datos de contacto públicos cuando existe un sitio web. Puedes añadir manualmente un email verificado en cualquier momento para dejar un prospecto listo para campaña.",
        ],
        bullets: [
          "Calificación impulsada por IA",
          "Enriquecimiento desde fuentes públicas",
          "Revisar y aceptar antes del outreach",
        ],
        image: {
          alt: "Espacio Prospect AI Review de WhachatCRM con prospectos calificados por IA y estado de campaña.",
          caption:
            "La IA califica leads para que tu equipo revise excepciones — no cada listado en bruto.",
        },
      },
      {
        title: "Outreach personalizado",
        paragraphs: [
          "Creación de mensajes deja que la IA redacte outreach, use tus plantillas o combine ambos. Edita cada asunto y cuerpo antes de pulsar Enviar.",
          "Prospect AI es software de outreach con IA y controles de ritmo — para que la automatización comercial se sienta personal, no spam.",
        ],
        bullets: [
          "Modos IA escribe / Plantilla / Personalización",
          "Editar antes de enviar",
          "Iniciar, pausar y reanudar envíos",
        ],
        image: {
          alt: "Editor de mensajes Prospect AI de WhachatCRM para crear y revisar outreach personalizado.",
          caption:
            "Campañas de email personalizadas con controles claros de listo para enviar.",
        },
      },
      {
        title: "Unified Inbox",
        paragraphs: [
          "Cuando un negocio responde, la conversación se abre en tu Unified Inbox — el mismo lugar donde gestionas conversaciones de WhatsApp CRM, Messenger, Instagram y chat web.",
          "AI Copilot te ayuda a responder más rápido mientras tu flujo de ventas permanece en un solo CRM de prospección.",
        ],
        bullets: [
          "Respuestas junto a cada canal",
          "AI Copilot en cada hilo",
          "Marca victorias sin cambiar de herramienta",
        ],
        image: {
          alt: "Unified Inbox donde las respuestas de Prospect AI continúan junto a WhatsApp y Messenger",
          caption:
            "Gestiona cada respuesta de Prospect AI en la misma Unified Inbox que WhatsApp y redes sociales.",
        },
      },
    ],
    platform: {
      title: "Todo en una plataforma",
      subtitle: "Automatización de prospección más los canales que tus clientes ya usan.",
      items: [
        "Prospect AI",
        "Unified Inbox",
        "AI Copilot",
        "Chatbot",
        "Automatización de flujos",
        "Gmail",
        "WhatsApp",
        "Facebook",
        "Instagram",
        "Telegram",
        "Chat web",
        "Formularios de leads de TikTok",
      ],
    },
    whyChoose: {
      title: "Por qué las empresas eligen Prospect AI",
      items: [
        {
          title: "Sin precio por contacto activo",
          body: "Haz crecer tu pipeline sin pagar por contactos que ya te pertenecen.",
        },
        {
          title: "Sin recargo de Meta",
          body: "Conecta canales oficiales de mensajería sin markup de BSP en mensajes.",
        },
        {
          title: "Descubrimientos Prospect AI gratis",
          body: "Cada plan incluye descubrimientos Prospect AI — la generación de leads con IA no queda bloqueada en un complemento.",
        },
        {
          title: "Funciona dentro de tu CRM",
          body: "Descubrimiento, campañas y respuestas permanecen en WhachatCRM — no en otra maraña de pestañas.",
        },
        {
          title: "Calificación impulsada por IA",
          body: "Software de calificación de leads que explica encajes antes de invertir tiempo en outreach.",
        },
        {
          title: "Unified Inbox",
          body: "Cierra el ciclo desde el primer descubrimiento hasta la conversación en una sola plataforma de engagement comercial.",
        },
      ],
    },
    faqs: [
      {
        question: "¿Qué es Prospect AI?",
        answer:
          "Prospect AI es el equipo de ventas con IA de WhachatCRM para descubrir negocios locales, calificar oportunidades con información pública, lanzar outreach personalizado y gestionar respuestas en una Unified Inbox. Funciona como software de prospección con IA y herramienta de ventas dentro de tu CRM.",
      },
      {
        question: "¿Cómo encuentra negocios Prospect AI?",
        answer:
          "En Descubrir eliges industria y ubicación (y radio opcional). Prospect AI busca información pública de negocios para encontrar clientes potenciales — listados locales reales, no contactos inventados.",
      },
      {
        question: "¿La IA contacta negocios automáticamente?",
        answer:
          "No. Revisas y aceptas prospectos, configuras la creación de mensajes y pulsas explícitamente Iniciar envío. Prospect AI no envía cold email sin tu aprobación.",
      },
      {
        question: "¿Puedo revisar negocios antes del outreach?",
        answer:
          "Sí. Tras el descubrimiento, envía resultados a Revisión. Ves recomendaciones de IA como Calificado, Necesita revisión, Email faltante y No calificado antes de encolar una campaña.",
      },
      {
        question: "¿Puedo editar los mensajes?",
        answer:
          "Sí. Cada asunto y cuerpo de outreach puede editarse antes del envío. Mantienes el control de tono, ofertas y personalización.",
      },
      {
        question: "¿Puedo usar mis propias plantillas?",
        answer:
          "Sí. Creación de mensajes admite tus plantillas, dejar que la IA escriba el mensaje o combinar personalización con IA y plantilla.",
      },
      {
        question: "¿Puedo actualizar manualmente emails faltantes?",
        answer:
          "Sí. Muchos negocios locales no publican un email claro. Puedes añadir un email verificado del sitio web, perfiles sociales o Google Business Profile para dejar un prospecto listo para campaña.",
      },
      {
        question: "¿Prospect AI funciona con Gmail?",
        answer:
          "Sí. Conecta Gmail (o Google Workspace) en Configuración de canales para enviar email de campaña y mantener el outreach en tu propio buzón.",
      },
      {
        question: "¿Prospect AI funciona con WhatsApp?",
        answer:
          "Las campañas de outreach de Prospect AI envían email. Cuando las conversaciones continúan — o ya usas WhatsApp para ventas — las respuestas y chats de WhatsApp viven en la misma Unified Inbox y espacio WhatsApp CRM.",
      },
      {
        question: "¿Qué pasa cuando un negocio responde?",
        answer:
          "La respuesta se abre en tu Unified Inbox. Puedes continuar con AI Copilot, asignar compañeros y marcar el prospecto como Ganado cuando se convierta en cliente.",
      },
    ],
    relatedLinks: [
      { href: "/solutions/local-service-businesses", label: "Negocios locales y de servicios" },
      { href: "/ai-brain", label: "AI Brain" },
      { href: "/campaigns", label: "Campañas" },
      { href: "/unified-inbox", label: "Unified Inbox" },
      { href: "/ai-lead-scoring", label: "Puntuación de leads con IA" },
      { href: "/whatsapp-crm", label: "WhatsApp CRM" },
      { href: "/automations", label: "Flujos de trabajo y automatizaciones" },
      { href: "/realtor-growth-engine", label: "Realtor Growth Engine" },
      { href: "/pricing", label: "Precios" },
      { href: "/user-guide", label: "Guía del centro de ayuda" },
    ],
    finalCta: {
      headline: "Pon un equipo de ventas con IA en la generación de leads locales",
      subtext: "Empieza tu prueba gratis y ejecuta tu primer descubrimiento en minutos.",
    },
  },
  he: {
    seo: {
      title: "Prospect AI — צוות מכירות AI ליצירת לידים ו-outreach | WhachatCRM",
      description:
        "Prospect AI הוא צוות המכירות AI שלך: גלה עסקים מקומיים, סנן הזדמנויות, הפעל outreach באימייל מותאם אישית ונהל כל תשובה ב-CRM אחד. התחל בחינם.",
      ogTitle: "Prospect AI — הכירו את צוות המכירות AI שלכם | WhachatCRM",
      ogDescription:
        "גלו עסקים, סננו הזדמנויות, הפעילו outreach מותאם ונהלו תשובות — הכל מפלטפורמה אחת.",
    },
    ui: {
      faqTitle: "שאלות נפוצות",
      relatedResourcesTitle: "משאבים קשורים",
      heroImageAlt: "Prospect AI growth engine — גילוי עסקים, סינון AI והפעלת outreach",
      breadcrumbHome: "בית",
    },
    h1: "הכירו את צוות המכירות AI שלכם",
    subheadlineLines: [
      "גלו עסקים.",
      "סננו הזדמנויות.",
      "הפעילו outreach מותאם אישית.",
      "נהלו כל תשובה —",
      "הכל מפלטפורמה אחת.",
    ],
    primaryCta: "התחל ניסיון חינם",
    secondaryCta: "צפה בהדגמה",
    pain: {
      title: "הפסיקו prospecting בקור",
      paragraphs: [
        "פרוסpecting מסורתי עדיין אומר שעות של חיפושים בגוגל, כאוס בגיליונות וניחוש מי עשוי לקנות. צוותים שואבים מדריכים, רודפים אחרי פרטי קשר חלקיים ושולחים הודעות גנריות שלא מקבלות מענה.",
        "בינתיים, עסקים מקומיים שזקוקים להצעה שלכם נמצאים במרחק חיפוש אחד — אם רק היה לכם עוזר מכירות AI למצוא אותם, לסנן התאמה ולפתוח שיחה אמיתית.",
        "Prospect AI מחליף את העבודה הזו בתוכנת prospecting AI ליצירת לידים מקומיים, סינון והתקשרות מכירתית — בתוך ה-CRM שכבר משמש אתכם לתשובות.",
      ],
    },
    meetTeam: {
      title: "הכירו את צוות המכירות AI שלכם",
      paragraphs: [
        "חשבו על Prospect AI כעובד AI לרכישת לקוחות — לא מסד נתונים סטטי. הוא מגלה עסקים בשוק שלכם, חוקר מידע ציבורי, ממליץ למי שווה את הזמן ועוזר להפעיל outreach מותאם.",
        "אתם שולטים: סקירה ואישור התאמות, עריכת כל הודעה, ואז התחלת שליחה כשאתם מוכנים. תשובות נכנסות ל-Unified Inbox לצד WhatsApp, Messenger, Instagram ועוד.",
      ],
      image: {
        alt: "סביבת Prospect AI Review של WhachatCRM עם prospectים מסוננים ב-AI ומוכנים לקמפיין.",
        caption: "סביבת Prospect AI Review האמיתית — prospectים מסוננים ב-AI ומוכנים ל-outreach.",
      },
    },
    howItWorks: {
      title: "איך Prospect AI עובד",
      subtitle: "זרימת מכירות ברורה מהגילוי הראשון ועד לקוח שנסגר.",
      steps: [
        { label: "גילוי", detail: "מצאו עסקים מקומיים לפי תעשייה ומיקום." },
        { label: "סקירת AI", detail: "AI מסנן הזדמנויות לפי היעדים שלכם." },
        { label: "קמפיין", detail: "הפעילו outreach מותאם AI לפי לוח הזמנים שלכם." },
        { label: "Inbox", detail: "המשיכו כל תשובה עם AI Copilot." },
        { label: "לקוח", detail: "העבירו ניצחונות ל-pipeline." },
      ],
    },
    featureSections: [
      {
        title: "גילוי עסקים",
        paragraphs: [
          "בחרו סוג עסק ומיקום, הגדירו רדיוס והתחילו גילוי. Prospect AI סורק מידע עסקי ציבורי כדי למצוא prospectים חדשים בשוק שלכם.",
          "השתמשו בזה ליצירת לידים מקומיים ותוכנת prospecting בצעד אחד — בלי לשכור עוד רשימת cold email.",
        ],
        bullets: [
          "מיקוד לפי תעשייה ומיקום",
          "גילוי עסקים ציבורי",
          "שלחו תוצאות מבטיחות ישירות לסקירה",
        ],
        image: {
          alt: "כלי גילוי Prospect AI של WhachatCRM למציאת prospectים לפי סוג עסק ומיקום.",
          caption: "גלו עסקים מקומיים לפי תעשייה ומיקום — ואז שלחו התאמות לסקירת AI.",
        },
      },
      {
        title: "סינון AI",
        paragraphs: [
          "AI לסינון לידים בודק כל עסק ומציג תוצאות כמו מסונן, דורש סקירה, חסר אימייל ולא מסונן — עם נימוק שאפשר לסמוך עליו.",
          "העשרה מחפשת פרטי קשר ציבוריים כשיש אתר. אפשר להוסיף ידנית אימייל מאומת בכל עת כדי להפוך prospect למוכן לקמפיין.",
        ],
        bullets: [
          "סינון מונע AI",
          "העשרה ממקורות ציבוריים",
          "סקירה ואישור לפני outreach",
        ],
        image: {
          alt: "סביבת Prospect AI Review של WhachatCRM עם prospectים מסוננים ב-AI ומוכנות לקמפיין.",
          caption: "AI מסנן לידים כדי שהצוות יסקור חריגים — לא כל רשימה גולמית.",
        },
      },
      {
        title: "Outreach מותאם אישית",
        paragraphs: [
          "יצירת הודעות מאפשרת ל-AI לכתוב outreach, להשתמש בתבניות שלכם או לשלב. ערכו כל נושא וגוף לפני התחלת שליחה.",
          "Prospect AI הוא תוכנת outreach AI עם בקרת קצב — כדי שהאוטומציה המכירתית תישאר אישית, לא ספאם.",
        ],
        bullets: [
          "מצבי AI כותב / תבנית / התאמה אישית",
          "עריכה לפני שליחה",
          "התחלה, השהיה והמשך שליחה",
        ],
        image: {
          alt: "עורך הודעות Prospect AI של WhachatCRM ליצירה וסקירת outreach עסקי מותאם.",
          caption: "קמפייני אימייל מותאמים עם בקרות ברורות של מוכן לשליחה.",
        },
      },
      {
        title: "Unified Inbox",
        paragraphs: [
          "כשעסק עונה, השיחה נפתחת ב-Unified Inbox — אותו מקום שבו אתם מנהלים שיחות WhatsApp CRM, Messenger, Instagram וצ'אט באתר.",
          "AI Copilot עוזר לענות מהר יותר בעוד שזרימת המכירות נשארת ב-CRM prospecting אחד.",
        ],
        bullets: [
          "תשובות לצד כל ערוץ",
          "AI Copilot בכל שיחה",
          "סמנו ניצחונות בלי לעבור כלים",
        ],
        image: {
          alt: "Unified Inbox שבו תשובות Prospect AI ממשיכות לצד WhatsApp ו-Messenger",
          caption: "נהלו כל תשובת Prospect AI באותה Unified Inbox כמו WhatsApp ורשתות.",
        },
      },
    ],
    platform: {
      title: "הכל בפלטפורמה אחת",
      subtitle: "אוטומציית prospecting יחד עם הערוצים שהלקוחות שלכם כבר משתמשים בהם.",
      items: [
        "Prospect AI",
        "Unified Inbox",
        "AI Copilot",
        "צ'אטבוט",
        "אוטומציית זרימות",
        "Gmail",
        "WhatsApp",
        "Facebook",
        "Instagram",
        "Telegram",
        "צ'אט באתר",
        "טפסי לידים TikTok",
      ],
    },
    whyChoose: {
      title: "למה עסקים בוחרים ב-Prospect AI",
      items: [
        {
          title: "ללא תמחור לפי contact פעיל",
          body: "הגדילו pipeline בלי לשלם על contacts שכבר שלכם.",
        },
        {
          title: "ללא markup של Meta",
          body: "חברו ערוצי הודעות רשמיים בלי markup של BSP על הודעות.",
        },
        {
          title: "גילויי Prospect AI חינם",
          body: "כל תוכנית כוללת גילויי Prospect AI — יצירת לידים AI לא ננעלת מאחורי תוסף.",
        },
        {
          title: "עובד בתוך ה-CRM שלכם",
          body: "גילוי, קמפיינים ותשובות נשארים ב-WhachatCRM — לא בג'ונגל טאבים נוסף.",
        },
        {
          title: "סינון מונע AI",
          body: "תוכנת סינון לידים שמסבירה התאמות לפני שאתם משקיעים זמן outreach.",
        },
        {
          title: "Unified Inbox",
          body: "סגרו את המעגל מהגילוי הראשון ועד השיחה בפלטפורמת engagement מכירתית אחת.",
        },
      ],
    },
    faqs: [
      {
        question: "מה זה Prospect AI?",
        answer:
          "Prospect AI הוא צוות המכירות AI של WhachatCRM לגילוי עסקים מקומיים, סינון הזדמנויות עם מידע ציבורי, הפעלת outreach מותאם וניהול תשובות ב-Unified Inbox. הוא פועל כתוכנת prospecting AI וכלי מכירות בתוך ה-CRM.",
      },
      {
        question: "איך Prospect AI מוצא עסקים?",
        answer:
          "בגילוי בוחרים תעשייה ומיקום (ורדיוס אופציונלי). Prospect AI סורק מידע עסקי ציבורי כדי למצוא לקוחות פוטנציאליים — רשימות מקומיות אמיתיות, לא contacts מומצאים.",
      },
      {
        question: "האם AI פונה לעסקים אוטומטית?",
        answer:
          "לא. אתם סוקרים ומאשרים prospectים, מגדירים יצירת הודעות ואז לוחצים במפורש על התחל שליחה. Prospect AI לא שולח cold email בלי אישורכם.",
      },
      {
        question: "האם אפשר לסקור עסקים לפני outreach?",
        answer:
          "כן. אחרי הגילוי, שלחו תוצאות לסקירה. תראו המלצות AI כמו מסונן, דורש סקירה, חסר אימייל ולא מסונן לפני שמשהו נכנס לתור קמפיין.",
      },
      {
        question: "האם אפשר לערוך הודעות?",
        answer:
          "כן. כל נושא וגוף outreach ניתנים לעריכה לפני שליחה. אתם שולטים בטון, הצעות והתאמה אישית.",
      },
      {
        question: "האם אפשר להשתמש בתבניות שלי?",
        answer:
          "כן. יצירת הודעות תומכת בתבניות שלכם, בכתיבת AI או בשילוב התאמה אישית AI עם התבנית.",
      },
      {
        question: "האם אפשר לעדכן ידנית אימיילים חסרים?",
        answer:
          "כן. לעסקים מקומיים רבים אין אימייל ציבורי ברור. אפשר להוסיף אימייל מאומת מהאתר, פרופילים חברתיים או Google Business Profile כדי להפוך prospect למוכן לקמפיין.",
      },
      {
        question: "האם Prospect AI עובד עם Gmail?",
        answer:
          "כן. חברו Gmail (או Google Workspace) בהגדרות ערוצים כדי לשלוח אימייל קמפיין ולשמור outreach בתיבה שלכם.",
      },
      {
        question: "האם Prospect AI עובד עם WhatsApp?",
        answer:
          "קמפייני outreach של Prospect AI שולחים אימייל. כששיחות ממשיכות — או שכבר משתמשים ב-WhatsApp למכירות — תשובות וצ'אטי WhatsApp חיים באותה Unified Inbox וסביבת WhatsApp CRM.",
      },
      {
        question: "מה קורה כשעסק עונה?",
        answer:
          "התשובה נפתחת ב-Unified Inbox. אפשר להמשיך עם AI Copilot, להקצות חברי צוות ולסמן prospect כנ Won כשהוא הופך ללקוח.",
      },
    ],
    relatedLinks: [
      { href: "/solutions/local-service-businesses", label: "עסקים מקומיים ושירותים" },
      { href: "/ai-brain", label: "AI Brain" },
      { href: "/campaigns", label: "קמפיינים" },
      { href: "/unified-inbox", label: "Unified Inbox" },
      { href: "/ai-lead-scoring", label: "ניקוד לידים AI" },
      { href: "/whatsapp-crm", label: "WhatsApp CRM" },
      { href: "/automations", label: "זרימות עבודה ואוטומציות" },
      { href: "/realtor-growth-engine", label: "Realtor Growth Engine" },
      { href: "/pricing", label: "מחירים" },
      { href: "/user-guide", label: "מדריך מרכז העזרה" },
    ],
    finalCta: {
      headline: "שימו צוות מכירות AI על יצירת לידים מקומית",
      subtext: "התחילו ניסיון חינם והריצו את הגילוי הראשון שלכם בדקות.",
    },
  },
};

const PROSPECT_AI_LANDING_UI_EN: ProspectAiLandingUiOverlay = {
  faqTitle: "Frequently Asked Questions",
  relatedResourcesTitle: "Related resources",
  heroImageAlt:
    "Prospect AI growth engine — discover businesses, qualify with AI, and launch outreach",
  breadcrumbHome: "Home",
};

export type LocalizedProspectAiLandingBundle<T> = T & {
  seo: ProspectAiLandingSeoOverlay;
  ui: ProspectAiLandingUiOverlay;
};

export function getLocalizedProspectAiContent<T extends Record<string, unknown>>(
  base: T,
  seoBase: ProspectAiLandingSeoOverlay,
  locale: MarketingLocale,
): LocalizedProspectAiLandingBundle<T> {
  if (locale === "en") {
    return {
      ...base,
      seo: seoBase,
      ui: PROSPECT_AI_LANDING_UI_EN,
    } as LocalizedProspectAiLandingBundle<T>;
  }
  const overlay = PROSPECT_AI_LANDING_LOCALES[locale];
  const { seo, ui, ...contentOverlay } = overlay;
  const merged = mergeMarketingContent(base, contentOverlay) as T;
  return { ...merged, seo, ui } as LocalizedProspectAiLandingBundle<T>;
}
