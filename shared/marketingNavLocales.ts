/**
 * Localized marketing nav overlays (es / he).
 * English remains authoritative in marketingNav.ts; hrefs and branded labels stay fixed.
 */

import {
  MARKETING_NAV_DROPDOWNS,
  type MarketingNavDropdown,
} from "./marketingNav";

export const MARKETING_NAV_LOCALES: Record<
  "es" | "he",
  {
    product: MarketingNavDropdown;
    solutions: MarketingNavDropdown;
    resources: MarketingNavDropdown;
  }
> = {
  es: {
    product: {
      id: "product",
      label: "Producto",
      groups: [
        {
          title: "Equipo de ventas con IA",
          items: [
            {
              label: "Prospect AI",
              href: "/prospect-ai",
              description: "Encuentra y califica negocios locales a los que vender",
            },
            {
              label: "AI Brain",
              href: "/ai-brain",
              description: "Conocimiento del negocio e inteligencia de la plataforma",
            },
            {
              label: "AI Copilot",
              href: "/ai-copilot",
              description: "Asiste respuestas y siguientes pasos dentro de las conversaciones",
            },
          ],
        },
        {
          title: "Mensajería y automatización",
          items: [
            {
              label: "Unified Inbox",
              href: "/unified-inbox",
              description: "Canales de mensajería con clientes en un solo espacio de trabajo",
            },
            {
              label: "Flujos de trabajo y automatizaciones",
              href: "/automations",
              description: "Flujos de seguimiento y plantillas listas para usar",
            },
            {
              label: "Chatbot Builder",
              href: "/chatbot-builder",
              description: "Recorridos visuales para WhatsApp y mensajería",
            },
            {
              label: "Campañas",
              href: "/campaigns",
              description: "Secuencias personalizadas de nurturing y reactivación",
            },
          ],
        },
        {
          title: "Growth Engines",
          items: [
            {
              label: "Realtor Growth Engine",
              href: "/realtor-growth-engine",
              description: "Growth Engine en vivo para equipos inmobiliarios",
            },
          ],
        },
        {
          title: "Plataforma",
          items: [
            {
              label: "Integraciones",
              href: "/integrations",
              description: "Meta, Shopify, Gmail, Stripe y más",
            },
            {
              label: "Colaboración en equipo",
              href: "/shared-team-inbox",
              description: "Propiedad compartida, notas y asignaciones",
            },
          ],
        },
      ],
    },
    solutions: {
      id: "solutions",
      label: "Soluciones",
      groups: [
        {
          title: "Industrias",
          items: [
            {
              label: "Bienes raíces",
              href: "/real-estate-crm",
              description: "Captura, califica y convierte compradores y vendedores",
            },
            {
              label: "E-commerce",
              href: "/solutions/ecommerce",
              description: "Convierte conversaciones de compradores en clientes recurrentes",
            },
            {
              label: "Negocios locales y de servicios",
              href: "/solutions/local-service-businesses",
              description: "Encuentra leads, agenda trabajos y automatiza el seguimiento",
            },
            {
              label: "Agencias de marketing",
              href: "/solutions/marketing-agencies",
              description: "Entrega mensajería, automatización e IA para tus clientes",
            },
            {
              label: "Med spas y bienestar",
              href: "/solutions/med-spas",
              description: "Convierte consultas en citas reservadas",
            },
          ],
        },
      ],
    },
    resources: {
      id: "resources",
      label: "Recursos",
      groups: [
        {
          title: "Aprende",
          items: [
            {
              label: "Blog",
              href: "/blog",
              description: "Guías y novedades del producto",
            },
            {
              label: "Centro de ayuda",
              href: "/help",
              description: "Respuestas y soporte del producto",
            },
            {
              label: "Guía de usuario",
              href: "/user-guide",
              description: "Aprendizaje del producto paso a paso",
            },
          ],
        },
        {
          title: "Compara WhachatCRM",
          items: [
            {
              label: "Mejor CRM de WhatsApp 2026",
              href: "/best-whatsapp-crm-2026",
              description: "Guía de compra y comparación de plataformas",
            },
            {
              label: "Alternativa a WATI",
              href: "/wati-alternative",
              description: "Compara herramientas de WhatsApp centradas en operaciones",
            },
            {
              label: "Alternativa a ManyChat",
              href: "/manychat-alternative",
              description: "Compara automatización social frente al inbox CRM",
            },
            {
              label: "Alternativa a Respond.io",
              href: "/respond-io-alternative",
              description: "Compara plataformas omnicanal",
            },
            {
              label: "Más alternativas",
              href: "/best-whatsapp-crm-2026",
              description: "Interakt, Zoko, Pabbly, 360dialog y más",
            },
          ],
        },
        {
          title: "Partners",
          items: [
            {
              label: "Programa de partners",
              href: "/partner-program",
              description: "Crece con WhachatCRM como partner",
            },
          ],
        },
      ],
    },
  },
  he: {
    product: {
      id: "product",
      label: "מוצר",
      groups: [
        {
          title: "צוות מכירות עם AI",
          items: [
            {
              label: "Prospect AI",
              href: "/prospect-ai",
              description: "מצאו וסננו עסקים מקומיים למכירה",
            },
            {
              label: "AI Brain",
              href: "/ai-brain",
              description: "ידע עסקי ואינטליגנציה של הפלטפורמה",
            },
            {
              label: "AI Copilot",
              href: "/ai-copilot",
              description: "מסייע בתשובות ובצעדים הבאים בתוך השיחות",
            },
          ],
        },
        {
          title: "הודעות ואוטומציה",
          items: [
            {
              label: "Unified Inbox",
              href: "/unified-inbox",
              description: "ערוצי הודעות ללקוחות במקום עבודה אחד",
            },
            {
              label: "זרימות עבודה ואוטומציות",
              href: "/automations",
              description: "זרימות מעקב ותבניות מוכנות לשימוש",
            },
            {
              label: "Chatbot Builder",
              href: "/chatbot-builder",
              description: "מסעות ויזואליים ל-WhatsApp ולהודעות",
            },
            {
              label: "קמפיינים",
              href: "/campaigns",
              description: "רצפי טיפוח והפעלה מחדש מותאמים אישית",
            },
          ],
        },
        {
          title: "Growth Engines",
          items: [
            {
              label: "Realtor Growth Engine",
              href: "/realtor-growth-engine",
              description: "Growth Engine חי לצוותי נדל״ן",
            },
          ],
        },
        {
          title: "פלטפורמה",
          items: [
            {
              label: "אינטגרציות",
              href: "/integrations",
              description: "Meta, Shopify, Gmail, Stripe ועוד",
            },
            {
              label: "שיתוף פעולה בצוות",
              href: "/shared-team-inbox",
              description: "בעלות משותפת, הערות והקצאות",
            },
          ],
        },
      ],
    },
    solutions: {
      id: "solutions",
      label: "פתרונות",
      groups: [
        {
          title: "תעשיות",
          items: [
            {
              label: "נדל״ן",
              href: "/real-estate-crm",
              description: "לכודו, סננו והמירו קונים ומוכרים",
            },
            {
              label: "מסחר אלקטרוני",
              href: "/solutions/ecommerce",
              description: "הפכו שיחות קונים ללקוחות חוזרים",
            },
            {
              label: "עסקים מקומיים ושירותים",
              href: "/solutions/local-service-businesses",
              description: "מצאו לידים, קבעו עבודות ואוטומטו מעקב",
            },
            {
              label: "סוכנויות שיווק",
              href: "/solutions/marketing-agencies",
              description: "ספקו הודעות, אוטומציה ו-AI ללקוחות",
            },
            {
              label: "מדיספא ווולנס",
              href: "/solutions/med-spas",
              description: "הפכו פניות לייעוצים שנקבעו",
            },
          ],
        },
      ],
    },
    resources: {
      id: "resources",
      label: "משאבים",
      groups: [
        {
          title: "למידה",
          items: [
            {
              label: "בלוג",
              href: "/blog",
              description: "מדריכים ועדכוני מוצר",
            },
            {
              label: "מרכז עזרה",
              href: "/help",
              description: "תשובות ותמיכת מוצר",
            },
            {
              label: "מדריך למשתמש",
              href: "/user-guide",
              description: "למידת המוצר שלב אחר שלב",
            },
          ],
        },
        {
          title: "השוו את WhachatCRM",
          items: [
            {
              label: "ה-CRM הטוב ביותר ל-WhatsApp 2026",
              href: "/best-whatsapp-crm-2026",
              description: "מדריך קנייה והשוואת פלטפורמות",
            },
            {
              label: "חלופה ל-WATI",
              href: "/wati-alternative",
              description: "השוו כלי WhatsApp ממוקדי תפעול",
            },
            {
              label: "חלופה ל-ManyChat",
              href: "/manychat-alternative",
              description: "השוו אוטומציה חברתית מול תיבת CRM",
            },
            {
              label: "חלופה ל-Respond.io",
              href: "/respond-io-alternative",
              description: "השוו פלטפורמות אומניצ׳אנל",
            },
            {
              label: "עוד חלופות",
              href: "/best-whatsapp-crm-2026",
              description: "Interakt, Zoko, Pabbly, 360dialog ועוד",
            },
          ],
        },
        {
          title: "שותפים",
          items: [
            {
              label: "תוכנית שותפים",
              href: "/partner-program",
              description: "צמחו עם WhachatCRM כשותפים",
            },
          ],
        },
      ],
    },
  },
};

export function getLocalizedMarketingNav(
  locale: "en" | "es" | "he",
): MarketingNavDropdown[] {
  if (locale === "en") return MARKETING_NAV_DROPDOWNS;
  const localized = MARKETING_NAV_LOCALES[locale];
  return [localized.product, localized.solutions, localized.resources];
}
