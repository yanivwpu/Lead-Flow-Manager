/**
 * Spanish / Hebrew overlays for the public Homepage content model.
 */

import type { HomepageContent } from "./homepageContent";

export const HOMEPAGE_LOCALES: Record<"es" | "he", HomepageContent> = {
  es: {
    seo: {
      title: "WhatsApp y buzón unificado | WhachatCRM",
      description:
        "Gestiona WhatsApp, Instagram y SMS en un solo buzón unificado. El CRM simple para pymes y vendedores de Shopify.",
      ogTitle: "WhatsApp y buzón unificado | WhachatCRM",
      ogDescription:
        "Gestiona WhatsApp, Instagram y SMS en un solo buzón unificado. El CRM simple para pymes y vendedores de Shopify.",
      twitterTitle: "WhatsApp y buzón unificado | WhachatCRM",
      twitterDescription:
        "Gestiona WhatsApp, Instagram y SMS en un solo buzón unificado. El CRM simple para pymes y vendedores de Shopify.",
    },
    heroImageAlt: "Mockup de conversación de WhatsApp en WhachatCRM con AI Copilot y puntuación de lead",
    discovery: {
      sectionAria: "Elige cómo quieres crecer",
      findProspects: {
        eyebrow: "Encuentra prospectos",
        title: "Encuentra y califica los negocios adecuados",
        body: "Usa Prospect AI para descubrir oportunidades locales, evaluar el encaje e iniciar outreach personalizado.",
        cta: "Explorar Prospect AI",
        href: "/prospect-ai",
      },
      convertConversations: {
        eyebrow: "Convierte conversaciones",
        title: "Gestiona y convierte cada conversación",
        body: "Reúne canales en Unified Inbox, usa AI Copilot en el hilo y automatiza el seguimiento con plantillas.",
        cta: "Explorar Unified Inbox",
        href: "/unified-inbox",
      },
    },
    aiPlatform: {
      eyebrow: "Equipo de ventas con IA",
      title: "IA que encuentra oportunidades y guía cada siguiente paso",
      subtitle:
        "Prospect AI descubre a quién vender. AI Brain personaliza la estrategia y potencia las funciones de IA en WhachatCRM. AI Copilot ayuda a tu equipo a responder dentro de conversaciones en vivo.",
      prospectAi: {
        title: "Prospect AI",
        body: "Encuentra y califica negocios locales, lanza outreach personalizado y gestiona respuestas en un solo CRM.",
        cta: "Explorar Prospect AI",
        href: "/prospect-ai",
      },
      aiBrain: {
        title: "AI Brain",
        body: "Analiza el conocimiento del negocio, ayuda a crear campañas personalizadas, recomienda estrategia y potencia funciones de IA en la plataforma donde estén habilitadas.",
        cta: "Explorar AI Brain",
        href: "/ai-brain",
      },
      aiCopilot: {
        title: "AI Copilot",
        body: "Asiste dentro de las conversaciones con clientes con resúmenes, respuestas sugeridas y contexto del lead para que tu equipo avance más rápido sin perder calidad.",
        cta: "Explorar AI Copilot",
        href: "/ai-copilot",
      },
    },
    eyebrows: {
      businessOutcomes: "Resultados de negocio",
      integrations: "Integraciones",
      setup: "Configuración",
      useCases: "Casos de uso",
    },
    integrationsCta: "Explorar todas las integraciones",
    chromeA11y: {
      primaryNav: "Principal",
      siteNav: "Sitio",
      openMenu: "Abrir menú",
      closeMenu: "Cerrar menú",
      homeAria: "Inicio de WhachatCRM",
    },
    ssr: {
      h1: "Conoce a tu equipo de ventas con IA",
      lead:
        "WhachatCRM ayuda a las empresas a encontrar y calificar prospectos, gestionar conversaciones en varios canales, personalizar el siguiente paso con IA, automatizar el seguimiento y convertir más chats en ingresos.",
      channels: "API oficial de Meta · WhatsApp, Instagram, Facebook, SMS, Telegram, Email y más",
      productLine: "Prospect AI · AI Brain · AI Copilot · Unified Inbox · Growth Engines",
      exploreHeading: "Explorar WhachatCRM",
      pricingLabel: "Precios",
      startTrialLabel: "Empieza tu prueba gratis",
      findProspectsTitle: "Encuentra y califica prospectos",
      findProspectsBody:
        "Usa Prospect AI para descubrir negocios locales, calificar el encaje y lanzar outreach personalizado — luego gestiona las respuestas en Unified Inbox.",
      findProspectsCta: "Explorar Prospect AI",
      convertTitle: "Gestiona y convierte conversaciones",
      convertBody:
        "Lleva WhatsApp y los canales compatibles a un Unified Inbox. Usa AI Copilot en el hilo y automatiza el seguimiento con plantillas y chatbots.",
      convertLinks: {
        inbox: "Unified Inbox",
        automations: "Flujos de trabajo y automatizaciones",
        chatbot: "Chatbot Builder",
        copilot: "AI Copilot",
      },
      aiSectionTitle: "AI Brain y AI Copilot",
      aiBrainTitle: "AI Brain",
      aiBrainBody:
        "Analiza el conocimiento del negocio, ayuda a crear campañas personalizadas, recomienda estrategia y potencia funciones de IA en la plataforma donde estén habilitadas.",
      aiBrainCta: "Explorar AI Brain",
      aiCopilotTitle: "AI Copilot",
      aiCopilotBody:
        "Asiste dentro de las conversaciones con clientes con resúmenes, respuestas sugeridas y contexto del lead.",
      aiCopilotCta: "Explorar AI Copilot",
      siteNavHeading: "Navegación del sitio",
      footerCopyright: "© 2025 WhachatCRM. Todos los derechos reservados.",
      footerPrivacy: "Privacidad",
      footerTerms: "Términos",
    },
    staticShell: {
      trustPill: "Ventas y mensajería con IA para equipos en crecimiento",
      navProduct: "Producto",
      navSolutions: "Soluciones",
      navResources: "Recursos",
      navPricing: "Precios",
      navLogin: "Iniciar sesión",
      navStartTrial: "Empieza tu prueba gratis",
      homeAria: "Inicio de WhachatCRM",
      primaryNavAria: "Principal",
      h1: "Conoce a tu equipo de ventas con IA",
      subtitle:
        "WhachatCRM ayuda a las empresas a encontrar y calificar prospectos, gestionar conversaciones en varios canales, personalizar el siguiente paso con IA, automatizar el seguimiento y convertir más chats en ingresos.",
      channels: "API oficial de Meta · WhatsApp, Instagram, Facebook, SMS, Telegram, Email y más",
      ctaTrial: "Empieza tu prueba gratis →",
      ctaPricing: "Precios",
      ctaDemo: "Reservar una demo",
      noCreditCard: "No se requiere tarjeta de crédito",
      heroImageAlt: "Mockup de conversación de WhatsApp en WhachatCRM con AI Copilot y puntuación de lead",
      exploreNavAria: "Explorar WhachatCRM",
    },
  },
  he: {
    seo: {
      title: "WhatsApp ותיבת דואר מאוחדת | WhachatCRM",
      description:
        "נהלו WhatsApp, Instagram ו-SMS בתיבה מאוחדת אחת. ה-CRM הפשוט לעסקים קטנים ומוכרי Shopify.",
      ogTitle: "WhatsApp ותיבת דואר מאוחדת | WhachatCRM",
      ogDescription:
        "נהלו WhatsApp, Instagram ו-SMS בתיבה מאוחדת אחת. ה-CRM הפשוט לעסקים קטנים ומוכרי Shopify.",
      twitterTitle: "WhatsApp ותיבת דואר מאוחדת | WhachatCRM",
      twitterDescription:
        "נהלו WhatsApp, Instagram ו-SMS בתיבה מאוחדת אחת. ה-CRM הפשוט לעסקים קטנים ומוכרי Shopify.",
    },
    heroImageAlt: "מוקאפ שיחת WhatsApp ב-WhachatCRM עם AI Copilot וציון ליד",
    discovery: {
      sectionAria: "בחרו איך תרצו לצמוח",
      findProspects: {
        eyebrow: "מצאו לידים",
        title: "מצאו וסננו את העסקים הנכונים",
        body: "השתמשו ב-Prospect AI כדי לגלות הזדמנויות מקומיות, להעריך התאמה ולהתחיל פנייה מותאמת אישית.",
        cta: "גלו את Prospect AI",
        href: "/prospect-ai",
      },
      convertConversations: {
        eyebrow: "המירו שיחות",
        title: "נהלו והמירו כל שיחה",
        body: "אחדו ערוצים ב-Unified Inbox, השתמשו ב-AI Copilot בתוך השיחה ואוטומטו מעקב עם תבניות.",
        cta: "גלו את Unified Inbox",
        href: "/unified-inbox",
      },
    },
    aiPlatform: {
      eyebrow: "צוות מכירות AI",
      title: "AI שמוצא הזדמנויות ומנחה כל צעד הבא",
      subtitle:
        "Prospect AI מגלה למי למכור. AI Brain מתאים אסטרטגיה ומפעיל יכולות AI ב-WhachatCRM. AI Copilot עוזר לצוות שלכם להגיב בתוך שיחות חיות.",
      prospectAi: {
        title: "Prospect AI",
        body: "מצאו וסננו עסקים מקומיים, השיקו פנייה מותאמת אישית ונהלו תשובות ב-CRM אחד.",
        cta: "גלו את Prospect AI",
        href: "/prospect-ai",
      },
      aiBrain: {
        title: "AI Brain",
        body: "מנתח ידע עסקי, עוזר ליצור קמפיינים מותאמים, ממליץ על אסטרטגיה ומפעיל יכולות AI בפלטפורמה היכן שהן מופעלות.",
        cta: "גלו את AI Brain",
        href: "/ai-brain",
      },
      aiCopilot: {
        title: "AI Copilot",
        body: "מסייע בתוך שיחות לקוח עם סיכומים, הצעות תשובה והקשר ליד כדי שהצוות יתקדם מהר יותר בלי לאבד איכות.",
        cta: "גלו את AI Copilot",
        href: "/ai-copilot",
      },
    },
    eyebrows: {
      businessOutcomes: "תוצאות עסקיות",
      integrations: "אינטגרציות",
      setup: "הגדרה",
      useCases: "מקרי שימוש",
    },
    integrationsCta: "גלו את כל האינטגרציות",
    chromeA11y: {
      primaryNav: "ראשי",
      siteNav: "אתר",
      openMenu: "פתח תפריט",
      closeMenu: "סגור תפריט",
      homeAria: "דף הבית של WhachatCRM",
    },
    ssr: {
      h1: "הכירו את צוות המכירות מבוסס ה-AI שלכם",
      lead:
        "WhachatCRM עוזר לעסקים למצוא ולסנן לידים, לנהל שיחות בערוצים שונים, להמליץ על הצעד הבא עם AI, לאוטומציה של מעקב ולהמיר יותר שיחות להכנסות.",
      channels: "API רשמי של Meta · WhatsApp, Instagram, Facebook, SMS, Telegram, Email ועוד",
      productLine: "Prospect AI · AI Brain · AI Copilot · Unified Inbox · Growth Engines",
      exploreHeading: "גלו את WhachatCRM",
      pricingLabel: "מחירים",
      startTrialLabel: "התחל ניסיון חינם",
      findProspectsTitle: "מצאו וסננו לידים",
      findProspectsBody:
        "השתמשו ב-Prospect AI כדי לגלות עסקים מקומיים, לסנן התאמה ולהשיק פנייה מותאמת — ואז לנהל תשובות ב-Unified Inbox.",
      findProspectsCta: "גלו את Prospect AI",
      convertTitle: "נהלו והמירו שיחות",
      convertBody:
        "הביאו WhatsApp וערוצים נתמכים ל-Unified Inbox אחד. השתמשו ב-AI Copilot בתוך השיחה ואוטומטו מעקב עם תבניות וצ'אטבוטים.",
      convertLinks: {
        inbox: "Unified Inbox",
        automations: "זרימות עבודה ואוטומציות",
        chatbot: "Chatbot Builder",
        copilot: "AI Copilot",
      },
      aiSectionTitle: "AI Brain ו-AI Copilot",
      aiBrainTitle: "AI Brain",
      aiBrainBody:
        "מנתח ידע עסקי, עוזר ליצור קמפיינים מותאמים, ממליץ על אסטרטגיה ומפעיל יכולות AI בפלטפורמה היכן שהן מופעלות.",
      aiBrainCta: "גלו את AI Brain",
      aiCopilotTitle: "AI Copilot",
      aiCopilotBody: "מסייע בתוך שיחות לקוח עם סיכומים, הצעות תשובה והקשר ליד.",
      aiCopilotCta: "גלו את AI Copilot",
      siteNavHeading: "ניווט באתר",
      footerCopyright: "© 2025 WhachatCRM. כל הזכויות שמורות.",
      footerPrivacy: "פרטיות",
      footerTerms: "תנאים",
    },
    staticShell: {
      trustPill: "מכירות והודעות מבוססות AI לצוותים בצמיחה",
      navProduct: "מוצר",
      navSolutions: "פתרונות",
      navResources: "משאבים",
      navPricing: "מחירים",
      navLogin: "התחברות",
      navStartTrial: "התחל ניסיון חינם",
      homeAria: "דף הבית של WhachatCRM",
      primaryNavAria: "ראשי",
      h1: "הכירו את צוות המכירות מבוסס ה-AI שלכם",
      subtitle:
        "WhachatCRM עוזר לעסקים למצוא ולסנן לידים, לנהל שיחות בערוצים שונים, להמליץ על הצעד הבא עם AI, לאוטומציה של מעקב ולהמיר יותר שיחות להכנסות.",
      channels: "API רשמי של Meta · WhatsApp, Instagram, Facebook, SMS, Telegram, Email ועוד",
      ctaTrial: "התחל ניסיון חינם ←",
      ctaPricing: "מחירים",
      ctaDemo: "קבעו הדגמה",
      noCreditCard: "לא נדרש כרטיס אשראי",
      heroImageAlt: "מוקאפ שיחת WhatsApp ב-WhachatCRM עם AI Copilot וציון ליד",
      exploreNavAria: "גלו את WhachatCRM",
    },
  },
};
