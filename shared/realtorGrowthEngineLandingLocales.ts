/**
 * Localized overlays for Realtor Growth Engine landing (/realtor-growth-engine).
 * English base: client/src/content/realtorGrowthEngineLandingContent.ts
 */

import type { MarketingLocale } from "./marketingLocale";
import { mergeMarketingContent } from "./marketingLocale";

export type RgeLandingSeoOverlay = {
  title: string;
  description: string;
  keywords: string;
  ogTitle: string;
  ogDescription: string;
};

export type RgeLandingUiOverlay = {
  faqTitle: string;
  relatedProductsTitle: string;
  manualWorkTitle: string;
  withRgeTitle: string;
  buyerIntelligenceEyebrow: string;
  propertyPresentationTitle: string;
  channelAwareNurtureEyebrow: string;
  copilotHelpsTitle: string;
  agentPageCapabilitiesTitle: string;
  seoFriendlyEyebrow: string;
  relatedLinks: Array<{ href: string; label: string }>;
};

type ScreenshotTextOverlay = { alt: string; caption: string };

export type RgeLandingLocaleOverlay = {
  seo: RgeLandingSeoOverlay;
  ui: RgeLandingUiOverlay;
  hero: {
    eyebrow: string;
    h1: string;
    support: string;
    capabilities: string[];
    cta: string;
    secondaryCta: string;
  };
  journey: {
    title: string;
    subtitle: string;
    steps: Array<{ label: string; detail: string }>;
  };
  timeProblem: {
    title: string;
    intro: string;
    manual: string[];
    withRge: string[];
    closer: string;
  };
  qualification: {
    title: string;
    exampleQuote: string;
    exampleNote: string;
    criteriaIntro: string;
    criteria: string[];
    powers: string[];
    powersIntro: string;
  };
  inventory: {
    title: string;
    subtitle: string;
    body: string[];
    criteriaIntro: string;
    criteria: string[];
    beforeTitle: string;
    before: string[];
    afterTitle: string;
    after: string[];
    accuracyNote: string;
  };
  flyer: {
    title: string;
    subtitle: string;
    body: string[];
    canInclude: string[];
    beforeTitle: string;
    before: string[];
    afterTitle: string;
    after: string[];
  };
  nurture: {
    title: string;
    body: string[];
    includes: string[];
    channelNote: string;
  };
  inbox: {
    title: string;
    body: string[];
    copilotHelps: string[];
  };
  scoring: {
    title: string;
    body: string;
    buckets: string[];
  };
  agentPage: {
    title: string;
    body: string[];
    capabilities: string[];
  };
  agentPageSeo: {
    title: string;
    body: string[];
    benefits: string[];
    disclaimer: string;
  };
  showing: {
    title: string;
    subtitle: string;
    flow: string[];
  };
  comparison: {
    title: string;
    beforeTitle: string;
    before: string[];
    afterTitle: string;
    after: string[];
  };
  stack: {
    title: string;
    body: string[];
    tools: string[];
  };
  included: {
    title: string;
    subtitle: string;
    items: string[];
  };
  whoFor: {
    title: string;
    subtitle: string;
    audiences: Array<{ title: string; desc: string }>;
  };
  pricing: {
    title: string;
    subtitle: string;
    layers: Array<{
      label: string;
      name: string;
      price: string;
      priceNote?: string;
      desc: string;
    }>;
    explain: string;
    metaNote: string;
    cta: string;
    viewPlans: string;
  };
  whiteGlove: {
    title: string;
    subtitle: string;
    items: string[];
  };
  faq: Array<{ q: string; a: string }>;
  finalCta: {
    title: string;
    subtitle: string;
    cta: string;
    viewPlans: string;
    note: string;
  };
  screenshots: {
    inventory: ScreenshotTextOverlay;
    inventoryDetail: ScreenshotTextOverlay;
    inbox: ScreenshotTextOverlay;
    copilot: ScreenshotTextOverlay;
    leadScore: ScreenshotTextOverlay;
    agentPage: ScreenshotTextOverlay;
    agentSettings: ScreenshotTextOverlay;
    workflows: ScreenshotTextOverlay;
    inventorySource: ScreenshotTextOverlay;
  };
};

const RGE_SCREENSHOTS_ES: RgeLandingLocaleOverlay["screenshots"] = {
  inventory: {
    alt: "Coincidencias de inventario de WhachatCRM clasificadas en la barra lateral del inbox según preferencias del comprador",
    caption: "Las coincidencias de inventario en vivo conectado aparecen junto a la conversación del comprador.",
  },
  inventoryDetail: {
    alt: "Recomendación de propiedad con IA de WhachatCRM con detalles del listado",
    caption: "Ve por qué un listado coincide con ubicación, presupuesto, habitaciones y criterios de estilo de vida.",
  },
  inbox: {
    alt: "Unified Inbox de WhachatCRM con conversación inmobiliaria multicanal",
    caption: "Cada conversación con compradores en un solo espacio de trabajo — en los canales compatibles.",
  },
  copilot: {
    alt: "AI Copilot de WhachatCRM con puntuación de lead y recomendaciones",
    caption: "Copilot muestra puntuación, preferencias y próximas acciones desde la conversación.",
  },
  leadScore: {
    alt: "Panel de puntuación de lead e insights del comprador de WhachatCRM",
    caption: "Criterios del comprador extraídos de conversación natural — no un formulario rígido.",
  },
  agentPage: {
    alt: "Agent Page pública de WhachatCRM con perfil del agente, áreas de mercado, CTAs e inventario de propiedades",
    caption: "Agent Page pública para presencia de marca, captura de leads e inventario donde esté habilitado.",
  },
  agentSettings: {
    alt: "Configuración de Agent Page de WhachatCRM con áreas de mercado",
    caption: "Configura bio, áreas de mercado y ajustes del perfil público.",
  },
  workflows: {
    alt: "Flujos de automatización de Realtor Growth Engine en WhachatCRM",
    caption: "Flujos inmobiliarios para calificación, nurture e intención de reserva.",
  },
  inventorySource: {
    alt: "Configuración de conexión de fuente de inventario de WhachatCRM",
    caption: "Conecta feeds de inventario en vivo donde esté soportado para coincidencia de propiedades con IA.",
  },
};

const RGE_SCREENSHOTS_HE: RgeLandingLocaleOverlay["screenshots"] = {
  inventory: {
    alt: "התאמות מלאי WhachatCRM מדורגות בסרגל הצד של ה-inbox לפי העדפות הקונה",
    caption: "התאמות מלאי חי מחובר מופיעות לצד שיחת הקונה.",
  },
  inventoryDetail: {
    alt: "המלצת נכס AI של WhachatCRM עם פרטי רישום",
    caption: "ראו למה רישום מתאים למיקום, תקציב, חדרים וקריטריוני אורח חיים.",
  },
  inbox: {
    alt: "Unified Inbox של WhachatCRM עם שיחת נדל\"ן רב-ערוצית",
    caption: "כל שיחת קונה במרחב עבודה אחד — בערוצים נתמכים.",
  },
  copilot: {
    alt: "AI Copilot של WhachatCRM עם ניקוד ליד והמלצות",
    caption: "Copilot מציג ניקוד, העדפות ופעולות הבאות מהשיחה.",
  },
  leadScore: {
    alt: "לוח ניקוד ליד ותובנות קונה של WhachatCRM",
    caption: "קריטריוני קונה שחולצו משיחה טבעית — לא טופס נוקשה.",
  },
  agentPage: {
    alt: "Agent Page ציבורית של WhachatCRM עם פרופיל סוכן, אזורי שוק, CTAs ומלאי נכסים",
    caption: "Agent Page ציבורית לנוכחות מותג, לכידת לידים ומלאי כשמופעל.",
  },
  agentSettings: {
    alt: "הגדרות Agent Page של WhachatCRM עם אזורי שוק",
    caption: "הגדירו bio, אזורי שוק והגדרות פרופיל ציבורי.",
  },
  workflows: {
    alt: "זרימות אוטומציה של Realtor Growth Engine ב-WhachatCRM",
    caption: "זרימות נדל\"ן לסינון, nurture וכוונת הזמנה.",
  },
  inventorySource: {
    alt: "הגדרות חיבור מקור מלאי של WhachatCRM",
    caption: "חברו feeds מלאי חי כשנתמך להתאמת נכסים AI.",
  },
};

export const RGE_LANDING_LOCALES: Record<
  Exclude<MarketingLocale, "en">,
  RgeLandingLocaleOverlay
> = {
  es: {
    seo: {
      title: "Realtor Growth Engine | CRM con IA para agentes inmobiliarios | WhachatCRM",
      description:
        "De nuevo lead a visita programada — automáticamente. Calificación de compradores con IA, coincidencia de inventario en vivo donde esté soportado, presentaciones de propiedades personalizadas, seguimiento consciente del canal, Agent Page y Unified Inbox + Copilot.",
      keywords:
        "CRM con IA para agentes inmobiliarios, CRM inmobiliario con IA, IA para agentes inmobiliarios, automatización de seguimiento de leads inmobiliarios, calificación de leads inmobiliarios, CRM inmobiliario con integración MLS, coincidencia de propiedades con IA, CRM para agentes inmobiliarios, seguimiento inmobiliario automatizado, software de gestión de leads inmobiliarios",
      ogTitle: "Realtor Growth Engine — De nuevo lead a visita programada",
      ogDescription:
        "Califica compradores, coincide inventario en vivo conectado, presenta propiedades, haz seguimiento automáticamente y avanza las conversaciones hacia una visita — en un espacio inmobiliario con IA.",
    },
    ui: {
      faqTitle: "Preguntas frecuentes",
      relatedProductsTitle: "Productos relacionados de WhachatCRM",
      manualWorkTitle: "Lo que los agentes aún hacen manualmente",
      withRgeTitle: "Con Realtor Growth Engine",
      buyerIntelligenceEyebrow: "Inteligencia del comprador",
      propertyPresentationTitle: "Qué puede incluir una presentación de propiedad",
      channelAwareNurtureEyebrow: "Nurture consciente del canal",
      copilotHelpsTitle: "AI Copilot puede ayudar a mostrar",
      agentPageCapabilitiesTitle: "Capacidades de Agent Page",
      seoFriendlyEyebrow: "Presencia optimizada para SEO",
      relatedLinks: [
        { href: "/real-estate-crm", label: "Solución inmobiliaria" },
        { href: "/ai-brain", label: "AI Brain" },
        { href: "/ai-copilot", label: "AI Copilot" },
        { href: "/automations", label: "Flujos de trabajo y automatizaciones" },
        { href: "/unified-inbox", label: "Unified Inbox" },
      ],
    },
    hero: {
      eyebrow: "Realtor Growth Engine",
      h1: "De nuevo lead a visita programada — automáticamente.",
      support:
        "Califica compradores, entiende exactamente lo que buscan, haz coincidencias con inventario en vivo, crea presentaciones de propiedades personalizadas, haz seguimiento automáticamente y avanza las conversaciones hacia una visita — desde un espacio inmobiliario con IA.",
      capabilities: [
        "Calificación de compradores con IA",
        "Coincidencia de inventario en vivo",
        "Folletos de propiedad personalizados",
        "Seguimiento automatizado",
        "Agent Page",
        "Unified Inbox + Copilot",
      ],
      cta: "Instalar Realtor Growth Engine",
      secondaryCta: "Ver cómo funciona",
    },
    journey: {
      title: "El recorrido de lead a visita",
      subtitle: "Entiende el producto en segundos — del primer mensaje a la cita.",
      steps: [
        { label: "Nuevo lead", detail: "La consulta llega por un canal conectado" },
        { label: "La IA califica", detail: "Intención, presupuesto y disposición desde la conversación" },
        { label: "Preferencias del comprador", detail: "Criterios capturados como contexto estructurado" },
        { label: "Coincidencia de inventario en vivo", detail: "Inventario conectado evaluado donde esté soportado" },
        { label: "Folleto de propiedad", detail: "Presentación pulida lista para compartir" },
        { label: "Seguimiento inteligente", detail: "Reengancha mientras el hilo sigue siendo accionable" },
        { label: "Visita", detail: "La conversación avanza hacia una reserva" },
      ],
    },
    timeProblem: {
      title: "Dedica menos tiempo gestionando leads. Más tiempo vendiendo inmuebles.",
      intro:
        "La mayoría de agentes aún hacen el trabajo repetitivo del medio a mano — incluso cuando el lead ya les está escribiendo.",
      manual: [
        "Responder a cada consulta",
        "Hacer las mismas preguntas de calificación",
        "Recordar criterios del comprador",
        "Abrir el MLS y reconstruir búsquedas",
        "Copiar enlaces y detalles de propiedades",
        "Armar presentaciones de propiedades",
        "Recordar quién necesita seguimiento",
        "Saltar entre herramientas de mensajería",
        "Perseguir citas y visitas",
      ],
      withRge: [
        "La IA ayuda a calificar desde conversación natural",
        "Las preferencias se capturan como contexto estructurado",
        "El inventario conectado puede coincidirse",
        "Las presentaciones de propiedades pueden generarse",
        "El seguimiento se ejecuta automáticamente",
        "Las conversaciones se organizan en un solo inbox",
        "Te enfocas en la relación y la transacción",
      ],
      closer: "Deja que la IA maneje el trabajo repetitivo para que te enfoques en clientes, negociaciones y cierres.",
    },
    qualification: {
      title: "IA que entiende lo que tu comprador realmente quiere",
      exampleQuote:
        "Necesito un apartamento de 3 habitaciones al este de Federal por menos de $700K. Una piscina sería genial, y no quiero una HOA alta.",
      exampleNote: "Conversación normal — no un formulario rígido de chatbot.",
      criteriaIntro: "RGE convierte esa conversación en preferencias estructuradas del comprador como:",
      criteria: [
        "Compra / Alquiler",
        "Zonas",
        "Tipo de propiedad",
        "Habitaciones",
        "Baños",
        "Presupuesto",
        "Piscina",
        "Frente al agua",
        "Metros cuadrados",
        "HOA",
        "Año de construcción",
        "Otros criterios soportados",
      ],
      powers: [
        "Calificación",
        "Puntuación de leads",
        "Coincidencia de inventario",
        "Seguimiento",
        "Recomendaciones de Copilot",
      ],
      powersIntro: "Esa inteligencia del comprador luego impulsa:",
    },
    inventory: {
      title: "Tu inventario en vivo se encuentra con la IA",
      subtitle: "Convierte preferencias del comprador en coincidencias de propiedades relevantes",
      body: [
        "Una vez que WhachatCRM entiende lo que busca un comprador, Realtor Growth Engine puede comparar esas preferencias con tu inventario en vivo conectado y mostrar propiedades relevantes.",
        "Dedica menos tiempo buscando y más tiempo vendiendo. Convierte conversaciones con compradores en opciones relevantes sin reconstruir la misma búsqueda manualmente.",
      ],
      criteriaIntro: "Los criterios de coincidencia soportados incluyen:",
      criteria: [
        "Compra / alquiler",
        "Ubicación",
        "Tipo de propiedad",
        "Habitaciones y baños",
        "Presupuesto",
        "Piscina",
        "Frente al agua",
        "Metros cuadrados",
        "HOA",
        "Año de construcción",
        "Inventario activo",
        "Próximamente donde esté soportado",
      ],
      beforeTitle: "Proceso manual antiguo",
      before: [
        "El comprador explica criterios",
        "El agente los anota",
        "Abre el MLS",
        "Aplica filtros",
        "Busca listados",
        "Envía opciones",
        "Repite cuando cambian los criterios",
      ],
      afterTitle: "Con RGE",
      after: [
        "El comprador explica criterios",
        "La IA captura preferencias",
        "Se evalúa el inventario conectado",
        "Surgen propiedades relevantes",
        "El agente revisa y comparte",
        "La conversación avanza",
      ],
      accuracyNote:
        "La coincidencia de inventario usa tu inventario en vivo conectado / feed MLS donde esté soportado — WhachatCRM no es un MLS, y la cobertura depende de tus proveedores conectados y mercado.",
    },
    flyer: {
      title: "De coincidencia de propiedad a presentación profesional",
      subtitle: "Coincídela. Preséntala. Mantén la conversación en movimiento.",
      body: [
        "Encontrar el listado correcto es solo parte del trabajo. WhachatCRM puede convertir inventario relevante en una experiencia de folleto de propiedad pulida y compartible para usar con el comprador.",
        "Ofrece a cada comprador una experiencia de propiedad pulida sin reconstruirla a mano.",
      ],
      canInclude: [
        "Imagen de la propiedad",
        "Precio",
        "Habitaciones y baños",
        "Metros cuadrados",
        "HOA",
        "Año de construcción",
        "Información de la propiedad",
        "Experiencia QR / compartir",
      ],
      beforeTitle: "Sin RGE",
      before: [
        "Encontrar listado",
        "Copiar información",
        "Copiar enlaces",
        "Armar mensaje o presentación",
        "Enviar manualmente",
      ],
      afterTitle: "Con RGE",
      after: [
        "Coincidir propiedad",
        "Generar presentación de propiedad pulida",
        "Compartir con el comprador",
        "Continuar hacia una visita",
      ],
    },
    nurture: {
      title: "Haz seguimiento mientras la conversación sigue siendo accionable",
      body: [
        "Ningún lead debería desaparecer solo porque tu día se llenó.",
        "WhachatCRM puede reenganchar automáticamente leads silenciosos respetando las reglas de mensajería del canal usado — para que el seguimiento sea útil, no imprudente.",
      ],
      includes: [
        "Reenganche al día siguiente",
        "Nurture de leads silenciosos",
        "Nurture semanal",
        "Gestión de opt-out",
        "Puntuación con IA",
        "Elegibilidad de mensajería consciente del canal",
      ],
      channelNote:
        "En WhatsApp y otros canales Meta, la automatización de texto libre solo envía cuando la elegibilidad de mensajería lo permite. Los pasos de nurture posteriores no fuerzan envíos de texto libre no elegibles fuera de la ventana de servicio al cliente.",
    },
    inbox: {
      title: "Cada conversación con compradores. Un espacio de trabajo.",
      body: [
        "RGE no es otro sistema de leads aislado. Las conversaciones conectadas viven en el Unified Inbox de WhachatCRM en los canales soportados.",
        "El agente no debería tener que recordar todo lo que un comprador dijo hace tres días.",
      ],
      copilotHelps: [
        "Puntuación de lead",
        "Intención del comprador",
        "Preferencias del comprador",
        "Estado de calificación",
        "Acciones de inventario relevantes",
        "Recomendaciones de seguimiento",
        "Acciones de reserva / visita",
        "Contexto del contacto",
      ],
    },
    scoring: {
      title: "Sabe a quién darle atención primero",
      body: "RGE te ayuda a priorizar la atención en lugar de tratar cada consulta igual. Los leads pueden aparecer conceptualmente como Hot, Warm, New, Low o Unqualified — para que las conversaciones serias te lleguen más rápido.",
      buckets: ["Hot", "Warm", "New", "Low", "Unqualified"],
    },
    agentPage: {
      title: "Tu presencia inmobiliaria, integrada en tu Growth Engine",
      body: [
        "Los agentes a menudo dependen de perfiles de corretaje, páginas de portales, redes sociales y herramientas genéricas de enlaces. La Agent Page de WhachatCRM te da otro destino con marca conectado directamente a tu sistema de crecimiento.",
        "Ofrece a los prospectos un lugar útil para conocerte, explorar tu presencia inmobiliaria, ver inventario disponible donde esté habilitado y convertirse en lead.",
      ],
      capabilities: [
        "Agent Page pública",
        "URL / slug personalizado",
        "Perfil de negocio / agente",
        "Bio personalizada",
        "Áreas de mercado / servicio",
        "Visibilidad de inventario conectado donde esté habilitado",
        "Captura de leads",
        "Captura de leads de valor de vivienda donde esté habilitado",
        "Fuentes de inventario",
        "Presencia pública con marca",
      ],
    },
    agentPageSeo: {
      title: "Construye una presencia inmobiliaria más buscable",
      body: [
        "Una Agent Page pública configurada correctamente crea otro destino rastreable específico del agente con contexto útil de negocio, inmobiliario y de mercado.",
        "Puede fortalecer tu presencia de búsqueda con marca y darte otra URL optimizada para SEO para compartir desde redes sociales, Google Business Profile, email y outreach — con menos dependencia solo de páginas de perfil de terceros.",
      ],
      benefits: [
        "Contenido inmobiliario indexable adicional",
        "Presencia de búsqueda con marca más fuerte",
        "Relevancia local / de mercado",
        "Otra URL para redes y outreach",
        "Otro destino desde Google Business Profile",
        "Menos dependencia de perfiles de terceros",
      ],
      disclaimer:
        "Optimizado para SEO e indexable no significa rankings garantizados ni leads SEO garantizados. Los resultados varían según mercado, calidad del contenido y competencia de búsqueda.",
    },
    showing: {
      title: "No te detengas en la calificación. Avanza hacia la visita.",
      subtitle: "Las respuestas de IA no son el objetivo final — la conversión lo es.",
      flow: [
        "Conversación",
        "Calificación",
        "Preferencias del comprador",
        "Coincidencias de propiedades",
        "Presentación de propiedad",
        "Seguimiento",
        "Visita / Cita",
      ],
    },
    comparison: {
      title: "Antes de RGE vs con RGE",
      beforeTitle: "Antes de RGE",
      before: [
        "Responder manualmente preguntas repetitivas",
        "Rastrear manualmente criterios del comprador",
        "Buscar manualmente en el MLS",
        "Copiar enlaces y detalles de listados",
        "Armar presentaciones de propiedades",
        "Recordar seguimientos",
        "Saltar entre herramientas de mensajería",
        "Priorizar leads manualmente",
        "Perseguir citas",
      ],
      afterTitle: "Con RGE",
      after: [
        "Calificación asistida por IA",
        "Captura automática de preferencias del comprador",
        "Coincidencia de inventario en vivo donde esté soportado",
        "Folletos de propiedad personalizados",
        "Nurture consciente del canal",
        "Unified Inbox",
        "Priorización de leads con IA",
        "Recomendaciones de Copilot",
        "Flujo de visita / cita",
      ],
    },
    stack: {
      title: "Deja de unir a mano tu stack tecnológico inmobiliario",
      body: [
        "Los agentes a menudo combinan un CRM, chatbot, herramienta de seguimiento, búsqueda MLS/propiedades, compartir propiedades, calendario, sitio web/perfil y múltiples apps de mensajería — y luego reconectan el mismo contexto del lead a mano.",
        "Realtor Growth Engine conecta estas funciones alrededor del mismo lead y conversación. No reemplaza tu MLS.",
      ],
      tools: [
        "CRM",
        "Chatbot",
        "Herramienta de seguimiento",
        "Búsqueda MLS / propiedades",
        "Compartir propiedades",
        "Calendario",
        "Sitio web / perfil",
        "Apps de mensajería",
      ],
    },
    included: {
      title: "Qué incluye",
      subtitle: "Un sistema de conversión inmobiliaria especializado — no un paquete genérico de chatbot.",
      items: [
        "Calificación inmobiliaria con IA",
        "Captura de preferencias del comprador",
        "Puntuación de leads con IA",
        "Coincidencia de inventario en vivo conectado donde esté soportado",
        "Flujo de folleto / compartir propiedad personalizado",
        "Nurture automatizado consciente del canal",
        "Flujo de conversión de visita / cita",
        "Agent Page",
        "Herramientas de captura de leads",
        "Unified Inbox",
        "AI Copilot",
        "Pipeline inmobiliario",
        "Campos predefinidos",
        "Etiquetas predefinidas",
        "Flujos inmobiliarios",
        "Lanzamiento / configuración white-glove",
      ],
    },
    whoFor: {
      title: "Para quién es",
      subtitle:
        "Diseñado para agentes y equipos que quieren un proceso repetible de lead a visita. La disponibilidad de inventario aún depende de tus feeds conectados y mercado.",
      audiences: [
        {
          title: "Agentes individuales",
          desc: "Ahorra tiempo y crea un proceso repetible de lead a visita.",
        },
        {
          title: "Agentes de compradores",
          desc: "Convierte conversaciones con compradores en criterios estructurados y coincidencias de inventario relevantes.",
        },
        {
          title: "Agentes enfocados en listados",
          desc: "Captura y nutre oportunidades de vendedores / valor de vivienda donde esté habilitado.",
        },
        {
          title: "Equipos",
          desc: "Estandariza el manejo de leads y seguimiento entre agentes.",
        },
        {
          title: "Corretajes",
          desc: "Ofrece a los agentes un marco de conversión inmobiliaria con IA repetible.",
        },
      ],
    },
    pricing: {
      title: "Qué impulsa Realtor Growth Engine",
      subtitle: "Tres capas con funciones claras — no tres cargos por lo mismo.",
      layers: [
        {
          label: "Plataforma core",
          name: "WhachatCRM Pro",
          price: "$49/mo",
          desc: "CRM core, mensajería y plataforma.",
        },
        {
          label: "Capa de inteligencia",
          name: "AI Brain",
          price: "Incluido con Pro",
          desc: "La capa de inteligencia para calificación más profunda y contexto inmobiliario con IA.",
        },
        {
          label: "Sistema inmobiliario",
          name: "Realtor Growth Engine",
          price: "$199",
          priceNote: "pago único",
          desc: "Flujos inmobiliarios especializados, calificación, campos, pipeline, recorrido del comprador basado en inventario, configuración de Agent Page y ajustes.",
        },
      ],
      explain:
        "Pro incluye AI Brain. Realtor Growth Engine añade el sistema inmobiliario especializado construido encima.",
      metaNote: "Las tarifas de mensajería de WhatsApp las factura Meta directamente sin recargo.",
      cta: "Instalar Realtor Growth Engine",
      viewPlans: "Ver todos los planes",
    },
    whiteGlove: {
      title: "Configuración white-glove — no adivinar por tu cuenta",
      subtitle:
        "RGE no es “compra una plantilla y descúbrelo”. El lanzamiento guiado te ayuda a salir en vivo con confianza.",
      items: [
        "Sesión en vivo con un especialista de configuración",
        "Asistencia con WhatsApp Business API / verificación Meta",
        "Flujos de automatización configurados y probados",
        "Pipeline CRM y campos inmobiliarios listos",
        "Soporte de conexión de calendario / reservas",
        "Verificación de extremo a extremo antes de salir en vivo",
      ],
    },
    faq: [
      {
        q: "¿WhachatCRM reemplaza mi MLS?",
        a: "No. RGE funciona con inventario en vivo conectado / feeds MLS donde esté soportado. WhachatCRM no es un MLS y no reclama cobertura MLS universal.",
      },
      {
        q: "¿Qué necesito para ejecutar Realtor Growth Engine?",
        a: "WhachatCRM Pro (AI Brain incluido) y la licencia de pago único de $199 de Realtor Growth Engine. La conexión WhatsApp Business forma parte de la activación para flujos de mensajería.",
      },
      {
        q: "¿Cómo funciona el seguimiento en WhatsApp?",
        a: "RGE incluye reenganche al día siguiente y nurture de varios pasos con elegibilidad consciente del canal. La automatización de texto libre solo envía cuando la ventana de mensajería lo permite — no fuerza envíos de texto libre no elegibles fuera de la ventana de servicio al cliente de Meta.",
      },
      {
        q: "¿Qué es Agent Page?",
        a: "Un destino público con marca del agente con perfil, áreas de mercado, captura de leads e inventario visible donde esté habilitado — conectado al mismo sistema de crecimiento que maneja tus conversaciones.",
      },
      {
        q: "¿Agent Page garantizará rankings en Google?",
        a: "No. Una Agent Page configurada es optimizada para SEO e indexable, lo que puede fortalecer tu presencia online — pero rankings y leads SEO nunca están garantizados.",
      },
      {
        q: "¿La configuración está incluida?",
        a: "Sí. El lanzamiento white-glove / guiado ayuda con configuración, prueba de flujos y salir en vivo — para que no te quedes armando el sistema solo.",
      },
    ],
    finalCta: {
      title: "Convierte más conversaciones en coincidencias y visitas",
      subtitle:
        "Del primer mensaje a coincidencia de propiedad a visita, Realtor Growth Engine ayuda a manejar el trabajo repetitivo entre cada paso.",
      cta: "Instalar Realtor Growth Engine",
      viewPlans: "Ver todos los planes",
      note: "Se requiere un plan Pro activo. Licencia RGE de $199 pago único. Sin garantías de conversión no soportadas.",
    },
    screenshots: RGE_SCREENSHOTS_ES,
  },
  he: {
    seo: {
      title: "Realtor Growth Engine | CRM AI לסוכני נדל\"ן | WhachatCRM",
      description:
        "מליד חדש לסיור שנקבע — אוטומטית. סינון קונים AI, התאמת מלאי חי כשנתמך, מצגות נכסים מותאמות, מעקב מודע לערוץ, Agent Page ו-Unified Inbox + Copilot.",
      keywords:
        "CRM AI לסוכני נדל\"ן, CRM נדל\"ן AI, AI לסוכני נדל\"ן, אוטומציית מעקב לידים נדל\"ן, סינון לידים נדל\"ן, CRM נדל\"ן עם אינטגרציית MLS, התאמת נכסים AI, CRM לסוכני נדל\"ן, מעקב נדל\"ן אוטומטי, תוכנת ניהול לידים נדל\"ן",
      ogTitle: "Realtor Growth Engine — מליד חדש לסיור שנקבע",
      ogDescription:
        "סננו קונים, התאימו מלאי חי מחובר, הציגו נכסים, המשיכו מעקב אוטומטית והעבירו שיחות לכיוון סיור — במרחב נדל\"ן אחד מונע AI.",
    },
    ui: {
      faqTitle: "שאלות נפוצות",
      relatedProductsTitle: "מוצרי WhachatCRM קשורים",
      manualWorkTitle: "מה שסוכנים עדיין עושים ידנית",
      withRgeTitle: "עם Realtor Growth Engine",
      buyerIntelligenceEyebrow: "מודיעין קונה",
      propertyPresentationTitle: "מה שמצגת נכס יכולה לכלול",
      channelAwareNurtureEyebrow: "Nurture מודע לערוץ",
      copilotHelpsTitle: "AI Copilot יכול לעזור להציג",
      agentPageCapabilitiesTitle: "יכולות Agent Page",
      seoFriendlyEyebrow: "נוכחות ידידותית ל-SEO",
      relatedLinks: [
        { href: "/real-estate-crm", label: "פתרון נדל\"ן" },
        { href: "/ai-brain", label: "AI Brain" },
        { href: "/ai-copilot", label: "AI Copilot" },
        { href: "/automations", label: "זרימות עבודה ואוטומציות" },
        { href: "/unified-inbox", label: "Unified Inbox" },
      ],
    },
    hero: {
      eyebrow: "Realtor Growth Engine",
      h1: "מליד חדש לסיור שנקבע — אוטומטית.",
      support:
        "סננו קונים, הבינו בדיוק מה הם רוצים, התאימו למלאי חי, צרו מצגות נכסים מותאמות, המשיכו מעקב אוטומטית והעבירו שיחות לכיוון סיור — ממרחב נדל\"ן אחד מונע AI.",
      capabilities: [
        "סינון קונים AI",
        "התאמת מלאי חי",
        "פליירים מותאמים לנכס",
        "מעקב אוטומטי",
        "Agent Page",
        "Unified Inbox + Copilot",
      ],
      cta: "התקינו Realtor Growth Engine",
      secondaryCta: "ראו איך זה עובד",
    },
    journey: {
      title: "מסע מליד לסיור",
      subtitle: "הבינו את המוצר בשניות — מההודעה הראשונה ועד לפגישה.",
      steps: [
        { label: "ליד חדש", detail: "פנייה מגיעה בערוץ מחובר" },
        { label: "AI מסנן", detail: "כוונה, תקציב ומוכנות מהשיחה" },
        { label: "העדפות קונה", detail: "קריטריונים נלכדים כהקשר מובנה" },
        { label: "התאמת מלאי חי", detail: "מלאי מחובר מוערך כשנתמך" },
        { label: "פלייר נכס", detail: "מצגת מלוטשת מוכנה לשיתוף" },
        { label: "מעקב חכם", detail: "חוזרים לשיחה בזמן שהיא עדיין actionable" },
        { label: "סיור", detail: "השיחה מתקדמת לכיוון הזמנה" },
      ],
    },
    timeProblem: {
      title: "פחות זמן בניהול לידים. יותר זמן במכירת נדל\"ן.",
      intro:
        "רוב הסוכנים עדיין עושים את העבודה החוזרת באמצע ידנית — גם כשהליד כבר מצ'וטט איתם.",
      manual: [
        "להגיב לכל פנייה",
        "לשאול את אותן שאלות סינון",
        "לזכור קריטריוני קונה",
        "לפתוח את ה-MLS ולבנות חיפושים מחדש",
        "להעתיק קישורי נכסים ופרטים",
        "להרכיב מצגות נכסים",
        "לזכור מי צריך מעקב",
        "לקפוץ בין כלי הודעות",
        "לרדוף אחרי פגישות וסיורים",
      ],
      withRge: [
        "AI עוזר לסנן משיחה טבעית",
        "העדפות נלכדות כהקשר מובנה",
        "מלאי מחובר יכול להתאים",
        "מצגות נכסים יכולות להיווצר",
        "מעקב רץ אוטומטית",
        "שיחות נשארות מאורגנות ב-inbox אחד",
        "אתם מתמקדים ביחסים ובעסקה",
      ],
      closer: "תנו ל-AI לטפל בעבודה החוזרת כדי שתתמקדו בלקוחות, משא ומתן וסגירות.",
    },
    qualification: {
      title: "AI שמבין מה הקונה שלכם באמת רוצה",
      exampleQuote:
        "אני צריך 3 חדרים מזרחית ל-Federal מתחת ל-$700K. בריכה תהיה נהדר, ואני לא רוצה HOA גבוה.",
      exampleNote: "שיחה רגילה — לא טופס צ'אטבוט נוקשה.",
      criteriaIntro: "RGE הופך את השיחה להעדפות קונה מובנות כמו:",
      criteria: [
        "קנייה / שכירות",
        "אזורים",
        "סוג נכס",
        "חדרים",
        "חדרי רחצה",
        "תקציב",
        "בריכה",
        "חוף ים",
        "שטח במ\"ר",
        "HOA",
        "שנת בנייה",
        "קריטריונים נתמכים נוספים",
      ],
      powers: [
        "סינון",
        "ניקוד לידים",
        "התאמת מלאי",
        "מעקב",
        "המלצות Copilot",
      ],
      powersIntro: "מודיעין הקונה הזה מניע אחר כך:",
    },
    inventory: {
      title: "המלאי החי שלכם פוגש AI",
      subtitle: "הפכו העדפות קונה להתאמות נכסים רלוונטיות",
      body: [
        "ברגע ש-WhachatCRM מבין מה קונה רוצה, Realtor Growth Engine יכול להשוות את ההעדפות למלאי החי המחובר שלכם ולהציג נכסים רלוונטיים.",
        "פחות זמן בחיפוש, יותר זמן במכירה. הפכו שיחות קונה לאפשרויות רלוונטיות בלי לבנות את אותו חיפוש ידנית.",
      ],
      criteriaIntro: "קריטריוני התאמה נתמכים כוללים:",
      criteria: [
        "קנייה / שכירות",
        "מיקום",
        "סוג נכס",
        "חדרים וחדרי רחצה",
        "תקציב",
        "בריכה",
        "חוף ים",
        "שטח במ\"ר",
        "HOA",
        "שנת בנייה",
        "מלאי פעיל",
        "בקרוב כשנתמך",
      ],
      beforeTitle: "תהליך ידני ישן",
      before: [
        "קונה מסביר קריטריונים",
        "סוכן רושם",
        "פותח MLS",
        "מפעיל מסננים",
        "מחפש רישומים",
        "שולח אפשרויות",
        "חוזר כשהקריטריונים משתנים",
      ],
      afterTitle: "עם RGE",
      after: [
        "קונה מסביר קריטריונים",
        "AI לוכד העדפות",
        "מלאי מחובר מוערך",
        "נכסים רלוונטיים עולים",
        "סוכן בודק ומשתף",
        "השיחה מתקדמת",
      ],
      accuracyNote:
        "התאמת מלאי משתמשת במלאי החי המחובר / feed MLS כשנתמך — WhachatCRM אינו MLS, והכיסוי תלוי בספקים המחוברים ובשוק.",
    },
    flyer: {
      title: "מהתאמת נכס למצגת מקצועית",
      subtitle: "התאימו. הציגו. המשיכו את השיחה.",
      body: [
        "מציאת הרישום הנכון היא רק חלק מהעבודה. WhachatCRM יכול להפוך מלאי רלוונטי לחוויית פלייר נכס מלוטשת וניתנת לשיתוף לשימוש עם הקונה.",
        "תנו לכל קונה חוויית נכס מלוטשת בלי לבנות אותה ידנית.",
      ],
      canInclude: [
        "תמונת נכס",
        "מחיר",
        "חדרים וחדרי רחצה",
        "שטח במ\"ר",
        "HOA",
        "שנת בנייה",
        "מידע על הנכס",
        "חוויית QR / שיתוף",
      ],
      beforeTitle: "בלי RGE",
      before: [
        "מצאו רישום",
        "העתיקו מידע",
        "העתיקו קישורים",
        "הרכיבו הודעה או מצגת",
        "שלחו ידנית",
      ],
      afterTitle: "עם RGE",
      after: [
        "התאימו נכס",
        "צרו מצגת נכס מלוטשת",
        "שתפו עם הקונה",
        "המשיכו לכיוון סיור",
      ],
    },
    nurture: {
      title: "המשיכו מעקב בזמן שהשיחה עדיין actionable",
      body: [
        "אף ליד לא צריך להיעלם רק כי היום שלכם התמלא.",
        "WhachatCRM יכול לחזור אוטומטית ללידים שקטים תוך כיבוד כללי ההודעות של הערוץ — כדי שהמעקב יישאר שימושי, לא פזיז.",
      ],
      includes: [
        "חזרה למחרת",
        "Nurture ללידים שקטים",
        "Nurture שבועי",
        "טיפול ב-opt-out",
        "ניקוד AI",
        "זכאות הודעות מודעת ערוץ",
      ],
      channelNote:
        "ב-WhatsApp ובערוצי Meta אחרים, אוטומציית טקסט חופשי נשלחת רק כשזכאות ההודעות מאפשרת. שלבי nurture מאוחרים לא כופים שליחות טקסט חופשי לא זכאיות מחוץ לחלון שירות הלקוח.",
    },
    inbox: {
      title: "כל שיחת קונה. מרחב עבודה אחד.",
      body: [
        "RGE אינו עוד מערכת לידים מבודדת. שיחות מחוברות חיות ב-Unified Inbox של WhachatCRM בערוצים נתמכים.",
        "הסוכן לא צריך לזכור כל מה שקונה אמר לפני שלושה ימים.",
      ],
      copilotHelps: [
        "ניקוד ליד",
        "כוונת קונה",
        "העדפות קונה",
        "סטטוס סינון",
        "פעולות מלאי רלוונטיות",
        "המלצות מעקב",
        "פעולות הזמנה / סיור",
        "הקשר איש קשר",
      ],
    },
    scoring: {
      title: "דעו למי לתת תשומת לב קודם",
      body: "RGE עוזר לעדף תשומת לב במקום לטפל בכל פנייה באותה צורה. לידים יכולים להופיע כ-Hot, Warm, New, Low או Unqualified — כדי ששיחות רציניות יגיעו אליכם מהר יותר.",
      buckets: ["Hot", "Warm", "New", "Low", "Unqualified"],
    },
    agentPage: {
      title: "הנוכחות הנדל\"נית שלכם, מובנית ב-Growth Engine",
      body: [
        "סוכנים לעיתים קרובות תלויים בפרופילי תיווך, דפי פורטלים, רשתות חברתיות וכלי קישורים גנריים. Agent Page של WhachatCRM נותנת יעד ממותג נוסף המחובר ישירות למערכת הצמיחה.",
        "תנו ל-prospectים מקום שימושי ללמוד עליכם, לחקור את הנוכחות הנדל\"נית, לראות מלאי זמין כשמופעל ולהפוך לליד.",
      ],
      capabilities: [
        "Agent Page ציבורית",
        "URL / slug מותאם",
        "פרופיל עסק / סוכן",
        "Bio מותאם",
        "אזורי שוק / שירות",
        "נראות מלאי מחובר כשמופעל",
        "לכידת לידים",
        "לכידת לידים ערך בית כשמופעל",
        "מקורות מלאי",
        "נוכחות ציבורית ממותגת",
      ],
    },
    agentPageSeo: {
      title: "בנו נוכחות נדל\"ן יותר ניתנת לחיפוש",
      body: [
        "Agent Page ציבורית מוגדרת נכון יוצרת יעד נוסף שניתן לסרוק, ספציפי לסוכן, עם הקשר עסקי, נדל\"ן ושוק שימושי.",
        "היא יכולה לחזק את נוכחות החיפוש הממותגת ולתת URL ידידותי ל-SEO נוסף לשיתוף מרשתות, Google Business Profile, אימייל ו-outreach — עם פחות תלות בדפי פרופיל של צד שלישי בלבד.",
      ],
      benefits: [
        "תוכן נדל\"ן נוסף שניתן לאינדוקס",
        "נוכחות חיפוש ממותגת חזקה יותר",
        "רלוונטיות מקומית / שוק",
        "URL נוסף לרשתות ו-outreach",
        "יעד נוסף מ-Google Business Profile",
        "פחות תלות בפרופילי צד שלישי",
      ],
      disclaimer:
        "ידידותי ל-SEO וניתן לאינדוקס לא אומר דירוגים מובטחים או לידים SEO מובטחים. התוצאות משתנות לפי שוק, איכות תוכן ותחרות חיפוש.",
    },
    showing: {
      title: "אל תעצרו בסינון. התקדמו לכיוון הסיור.",
      subtitle: "תגובות AI אינן המטרה — ההמרה היא.",
      flow: [
        "שיחה",
        "סינון",
        "העדפות קונה",
        "התאמות נכסים",
        "מצגת נכס",
        "מעקב",
        "סיור / פגישה",
      ],
    },
    comparison: {
      title: "לפני RGE מול עם RGE",
      beforeTitle: "לפני RGE",
      before: [
        "לענות ידנית על שאלות חוזרות",
        "לעקוב ידנית אחרי קריטריוני קונה",
        "לחפש ידנית ב-MLS",
        "להעתיק קישורי רישום ופרטים",
        "להרכיב מצגות נכסים",
        "לזכור מעקבים",
        "לקפוץ בין כלי הודעות",
        "לעדף לידים ידנית",
        "לרדוף אחרי פגישות",
      ],
      afterTitle: "עם RGE",
      after: [
        "סינון מסייע AI",
        "לכידת העדפות קונה אוטומטית",
        "התאמת מלאי חי כשנתמך",
        "פליירים מותאמים לנכס",
        "Nurture מודע לערוץ",
        "Unified Inbox",
        "עדיפות לידים AI",
        "המלצות Copilot",
        "זרימת סיור / פגישה",
      ],
    },
    stack: {
      title: "הפסיקו לחבר ידנית את stack הטכנולוגיה הנדל\"ני",
      body: [
        "סוכנים לעיתים קרובות משלבים CRM, צ'אטבוט, כלי מעקב, חיפוש MLS/נכסים, שיתוף נכסים, לוח שנה, אתר/פרופיל ואפליקציות הודעות מרובות — ואז מחברים מחדש את אותו הקשר ליד ידנית.",
        "Realtor Growth Engine מחבר את הפונקציות האלה סביב אותו ליד ושיחה. הוא לא מחליף את ה-MLS שלכם.",
      ],
      tools: [
        "CRM",
        "צ'אטבוט",
        "כלי מעקב",
        "חיפוש MLS / נכסים",
        "שיתוף נכסים",
        "לוח שנה",
        "אתר / פרופיל",
        "אפליקציות הודעות",
      ],
    },
    included: {
      title: "מה כלול",
      subtitle: "מערכת המרה נדל\"נית מיוחדת — לא חבילת צ'אטבוט גנרית.",
      items: [
        "סינון נדל\"ן AI",
        "לכידת העדפות קונה",
        "ניקוד לידים AI",
        "התאמת מלאי חי מחובר כשנתמך",
        "זרימת פלייר / שיתוף נכס מותאמת",
        "Nurture אוטומטי מודע לערוץ",
        "זרימת המרת סיור / פגישה",
        "Agent Page",
        "כלי לכידת לידים",
        "Unified Inbox",
        "AI Copilot",
        "Pipeline נדל\"ן",
        "שדות מוכנים מראש",
        "תגיות מוכנות מראש",
        "זרימות נדל\"ן",
        "השקה / הגדרה white-glove",
      ],
    },
    whoFor: {
      title: "למי זה מיועד",
      subtitle:
        "נבנה לסוכנים וצוותים שרוצים תהליך חוזר מליד לסיור. זמינות מלאי עדיין תלויה ב-feeds המחוברים ובשוק.",
      audiences: [
        {
          title: "סוכנים עצמאיים",
          desc: "חסכו זמן וצרו תהליך חוזר מליד לסיור.",
        },
        {
          title: "סוכני קונים",
          desc: "הפכו שיחות קונה לקריטריונים מובנים והתאמות מלאי רלוונטיות.",
        },
        {
          title: "סוכנים ממוקדי רישום",
          desc: "לכדו וטפחו הזדמנויות מוכרים / ערך בית כשמופעל.",
        },
        {
          title: "צוותים",
          desc: "סטנדרטיזציה של טיפול בלידים ומעקב בין סוכנים.",
        },
        {
          title: "משרדי תיווך",
          desc: "תנו לסוכנים מסגרת המרה נדל\"נית AI חוזרת.",
        },
      ],
    },
    pricing: {
      title: "מה מניע את Realtor Growth Engine",
      subtitle: "שלוש שכבות עם תפקידים ברורים — לא שלושה חיובים על אותו דבר.",
      layers: [
        {
          label: "פלטפורמת core",
          name: "WhachatCRM Pro",
          price: "$49/mo",
          desc: "CRM core, הודעות ופלטפורמה.",
        },
        {
          label: "שכבת מודיעין",
          name: "AI Brain",
          price: "כלול ב-Pro",
          desc: "שכבת המודיעין לסינון עמוק יותר והקשר נדל\"ן AI.",
        },
        {
          label: "מערכת נדל\"ן",
          name: "Realtor Growth Engine",
          price: "$199",
          priceNote: "חד-פעמי",
          desc: "זרימות נדל\"ן מיוחדות, סינון, שדות, pipeline, מסע קונה מונע מלאי, הגדרת Agent Page ותצורה.",
        },
      ],
      explain:
        "Pro נותן את הפלטפורמה. AI Brain מספק את המודיעין. Realtor Growth Engine מוסיף את מערכת הנדל\"ן המיוחדת שנבנית מעל.",
      metaNote: "עמלות הודעות WhatsApp מחויבות ישירות על ידי Meta ללא markup.",
      cta: "התקינו Realtor Growth Engine",
      viewPlans: "צפו בכל התוכניות",
    },
    whiteGlove: {
      title: "הגדרה white-glove — לא ניחוש DIY",
      subtitle:
        "RGE אינו \"קנו תבנית וגלו לבד\". השקה מודרכת עוזרת לצאת live בביטחון.",
      items: [
        "מפגש live עם מומחה הגדרה",
        "סיוע WhatsApp Business API / אימות Meta",
        "זרימות אוטומציה מוגדרות ונבדקות",
        "Pipeline CRM ושדות נדל\"ן מוכנים",
        "תמיכה בחיבור לוח שנה / הזמנות",
        "בדיקת end-to-end לפני יציאה live",
      ],
    },
    faq: [
      {
        q: "האם WhachatCRM מחליף את ה-MLS שלי?",
        a: "לא. RGE עובד עם מלאי חי מחובר / feeds MLS כשנתמך. WhachatCRM אינו MLS ולא טוען לכיסוי MLS אוניברסלי.",
      },
      {
        q: "מה צריך כדי להריץ Realtor Growth Engine?",
        a: "WhachatCRM Pro (AI Brain כלול) ורישיון Realtor Growth Engine חד-פעמי ב-$199. חיבור WhatsApp Business הוא חלק מההפעלה לזרימות הודעות.",
      },
      {
        q: "איך מעקב עובד ב-WhatsApp?",
        a: "RGE כולל חזרה למחרת ו-nurture רב-שלבי עם זכאות מודעת ערוץ. אוטומציית טקסט חופשי נשלחת רק כשחלון ההודעות מאפשר — לא כופה שליחות לא זכאיות מחוץ לחלון שירות הלקוח של Meta.",
      },
      {
        q: "מה זה Agent Page?",
        a: "יעד סוכן ציבורי ממותג עם פרופיל, אזורי שוק, לכידת לידים ונראות מלאי כשמופעל — מחובר לאותה מערכת צמיחה שמנהלת את השיחות.",
      },
      {
        q: "האם Agent Page תבטיח דירוגים ב-Google?",
        a: "לא. Agent Page מוגדרת היא ידידותית ל-SEO וניתנת לאינדוקס, מה שיכול לחזק את הנוכחות המקוונת — אבל דירוגים ולידים SEO לעולם לא מובטחים.",
      },
      {
        q: "האם ההגדרה כלולה?",
        a: "כן. השקה white-glove / מודרכת עוזרת בהגדרה, בדיקת זרימות ויציאה live — כדי שלא תישארו לבנות את המערכת לבד.",
      },
    ],
    finalCta: {
      title: "הפכו יותר שיחות להתאמות וסיורים",
      subtitle:
        "מההודעה הראשונה להתאמת נכס ועד סיור, Realtor Growth Engine עוזר לטפל בעבודה החוזרת בין כל שלב.",
      cta: "התקינו Realtor Growth Engine",
      viewPlans: "צפו בכל התוכניות",
      note: "נדרש תוכנית Pro פעילה. רישיון RGE חד-פעמי $199. ללא ערבויות המרה לא נתמכות.",
    },
    screenshots: RGE_SCREENSHOTS_HE,
  },
};

export const RGE_LANDING_UI_EN: RgeLandingUiOverlay = {
  faqTitle: "Frequently asked questions",
  relatedProductsTitle: "Related WhachatCRM products",
  manualWorkTitle: "What agents still do manually",
  withRgeTitle: "With the Realtor Growth Engine",
  buyerIntelligenceEyebrow: "Buyer intelligence",
  propertyPresentationTitle: "What a property presentation can include",
  channelAwareNurtureEyebrow: "Channel-aware nurture",
  copilotHelpsTitle: "AI Copilot can help surface",
  agentPageCapabilitiesTitle: "Agent Page capabilities",
  seoFriendlyEyebrow: "SEO-friendly presence",
  relatedLinks: [
    { href: "/real-estate-crm", label: "Real Estate Solution" },
    { href: "/ai-brain", label: "AI Brain" },
    { href: "/ai-copilot", label: "AI Copilot" },
    { href: "/automations", label: "Workflows & Automations" },
    { href: "/unified-inbox", label: "Unified Inbox" },
  ],
};

export type LocalizedRgeLandingBundle<T> = T & {
  seo: RgeLandingSeoOverlay;
  ui: RgeLandingUiOverlay;
};

export function getLocalizedRgeLanding<T extends Record<string, unknown>>(
  base: T,
  seoBase: RgeLandingSeoOverlay,
  locale: MarketingLocale,
): LocalizedRgeLandingBundle<T> {
  if (locale === "en") {
    return {
      ...base,
      seo: seoBase,
      ui: RGE_LANDING_UI_EN,
    } as LocalizedRgeLandingBundle<T>;
  }
  const overlay = RGE_LANDING_LOCALES[locale];
  const { seo, ui, ...contentOverlay } = overlay;
  const merged = mergeMarketingContent(base, contentOverlay) as T;
  return { ...merged, seo, ui } as LocalizedRgeLandingBundle<T>;
}
