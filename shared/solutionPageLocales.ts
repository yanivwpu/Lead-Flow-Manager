/**
 * Localized solution page overlays (es / he).
 * English base: shared/solutionPages.ts — hrefs and branded product names stay fixed.
 */

import type { SolutionPageContent } from "./solutionPages";

export const SOLUTION_PAGE_LOCALES = {
  es: {
    "/real-estate-crm": {
      industryLabel: "Bienes raíces",
      breadcrumbLabel: "Bienes raíces",
      title: "CRM inmobiliario para agentes y equipos | WhachatCRM",
      metaDescription:
        "CRM inmobiliario con WhatsApp, Unified Inbox, calificación con IA, matching MLS y automatización de seguimiento. Captura leads de compradores y vendedores y lleva las conversaciones hacia visitas reservadas.",
      ogTitle: "CRM inmobiliario — Captura, califica y convierte | WhachatCRM",
      h1: "Captura, califica y convierte leads inmobiliarios en todos los canales",
      heroIntro:
        "WhachatCRM reúne mensajería, calificación con IA, contexto de inventario y automatización de seguimiento para que agentes y equipos pasen de una nueva consulta a una visita reservada sin perder el hilo.",
      heroVisual: {
        inquiryLabel: "Consulta de comprador",
        inquiryMessage: "Busco en Miami por debajo de $750k — 3 habitaciones, mudanza en 2 meses.",
        suggestionLabel: "Sugerencia de AI Copilot",
        suggestionMessage: "Confirma presupuesto y plazo, califica el lead y comparte listados que encajen.",
        stageLabel: "Comprador calificado",
        nextStep: "Siguiente: compartir propiedades",
      },
      challengesHeading: "Lo que les cuesta a los equipos inmobiliarios",
      secondaryCta: {
        label: "Explorar Realtor Growth Engine",
        href: "/realtor-growth-engine",
      },
      challenges: [
        {
          title: "Los leads llegan por todas partes",
          description:
            "Consultas de portales, registros en open house, DMs de Instagram y WhatsApp se reparten entre teléfonos y apps.",
        },
        {
          title: "La calificación llega demasiado tarde",
          description:
            "Presupuesto, plazo y preferencias de ubicación se pierden en hilos largos, y los agentes persiguen las conversaciones equivocadas.",
        },
        {
          title: "El seguimiento se cae",
          description:
            "Cuando un comprador se queda en silencio, los recordatorios manuales fallan — y gana la visita quien responda primero.",
        },
        {
          title: "El inventario vive fuera del chat",
          description:
            "Emparejar listados con preferencias del comprador suele implicar cambiar de herramienta y perder el contexto de la conversación.",
        },
      ],
      helpsIntro:
        "WhachatCRM trata cada mensaje como parte de un flujo inmobiliario — no como un chat aislado.",
      helpsPoints: [
        {
          title: "Un inbox para todos los canales",
          description:
            "WhatsApp, Messenger, Instagram, Email y más llegan a Unified Inbox con propiedad compartida y notas.",
        },
        {
          title: "IA que entiende la intención de comprador y vendedor",
          description:
            "AI Brain y AI Copilot ayudan a capturar preferencias, calificar leads y sugerir la siguiente respuesta o seguimiento.",
        },
        {
          title: "Inventario junto a la conversación",
          description:
            "Donde MLS está conectado, empareja listados con preferencias y comparte siguientes pasos sin salir del hilo.",
        },
        {
          title: "Automatización Growth Engine para bienes raíces",
          description:
            "Realtor Growth Engine empaqueta flujos de seguimiento, plantillas e inteligencia del sector para agentes y equipos.",
        },
      ],
      workflowTitle: "De una nueva consulta a una visita reservada",
      workflowSteps: [
        {
          label: "Nueva consulta de comprador o vendedor",
          description: "Un lead escribe por WhatsApp, Instagram, Messenger o tu página de agente.",
        },
        {
          label: "Captura preferencias e intención",
          description: "Ubicación, presupuesto, plazo y necesidades de la propiedad quedan registrados junto al chat.",
        },
        {
          label: "Calificación y scoring con IA",
          description: "AI Brain y Copilot ayudan a priorizar oportunidades calientes y recomendar siguientes acciones.",
        },
        {
          label: "Empareja inventario relevante",
          description: "Donde esté conectado, sugiere listados que encajen y mantiene el contexto en la conversación.",
        },
        {
          label: "Comparte siguientes pasos",
          description: "Envía detalles de propiedades, folletos o un enlace de reserva mientras el hilo sigue organizado.",
        },
        {
          label: "Automatiza el seguimiento",
          description: "Recordatorios y flujos de Growth Engine mantienen leads silenciosos avanzando hacia una visita.",
        },
      ],
      products: [
        {
          label: "Unified Inbox",
          description: "Conversaciones compartidas en canales de mensajería con contexto de CRM.",
          href: "/unified-inbox",
        },
        {
          label: "AI Copilot",
          description: "Asistencia en el hilo para respuestas, resúmenes y contexto del lead.",
          href: "/#ai-copilot",
        },
        {
          label: "AI Brain",
          description: "Calificación más profunda, personalización y funciones de IA en toda la plataforma.",
          href: "/#ai-brain",
        },
        {
          label: "Automations",
          description: "Flujos de seguimiento y plantillas para nurturing de compradores y vendedores.",
          href: "/automation-templates",
        },
        {
          label: "MLS / matching de inventario",
          description: "Conecta inventario y empareja compradores donde la integración MLS esté activa.",
          href: "/crm-with-mls-integration",
        },
        {
          label: "Realtor Growth Engine",
          description: "El Growth Engine en vivo para flujos inmobiliarios y configuración.",
          href: "/realtor-growth-engine",
        },
        {
          label: "Prospect AI",
          description: "Encuentra y califica negocios locales cuando tu crecimiento incluye prospección outbound.",
          href: "/prospect-ai",
        },
      ],
      useCases: [
        {
          situation: "Un comprador escribe sobre casas en un barrio y rango de presupuesto concretos.",
          action:
            "Captura preferencias en la conversación, califica el lead y muestra inventario coincidente donde esté conectado.",
          outcome: "El agente responde con pasos relevantes en lugar de reiniciar la llamada de descubrimiento.",
        },
        {
          situation: "Un vendedor pregunta por listar su casa tras semanas de navegación en silencio.",
          action:
            "Reconoce la intención de vendedor con ayuda de IA, asigna un responsable y recomienda el camino de seguimiento correcto.",
          outcome: "El equipo reserva una consulta en lugar de perder la consulta en un inbox personal.",
        },
        {
          situation: "Un lead caliente se queda en silencio tras recibir listados.",
          action: "Activa automatización de seguimiento sin respuesta preservando etapa del pipeline y notas.",
          outcome: "La conversación se reanuda antes de que el comprador pase a otro agente.",
        },
        {
          situation: "Un agente quiere compartir un conjunto curado de propiedades desde el chat en vivo.",
          action: "Usa contexto de inventario y presentaciones compartibles de propiedades desde el espacio de trabajo.",
          outcome: "Los compradores reciben opciones claras sin que el agente reconstruya materiales en otra herramienta.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "Email", "SMS", "Web chat"],
      integrations: [
        { label: "MLS / Bridge Interactive", href: "/crm-with-mls-integration" },
        { label: "Calendly", href: "/#integrations" },
        { label: "Meta Embedded Signup", href: "/whatsapp-business-api" },
      ],
      howItWorks: [
        {
          title: "Conecta tus canales",
          description: "Usa el onboarding guiado de Meta para WhatsApp y los canales sociales compatibles.",
        },
        {
          title: "Invita a tu equipo",
          description: "Asigna conversaciones, deja notas y mantén cada lead visible en un solo inbox.",
        },
        {
          title: "Añade IA y automatización",
          description: "Activa la asistencia de Copilot e instala flujos de seguimiento inmobiliario donde tengas acceso.",
        },
        {
          title: "Añade Growth Engine cuando estés listo",
          description: "Usa Realtor Growth Engine para flujos inmobiliarios empaquetados y soporte de configuración.",
        },
      ],
      relatedLinks: [
        {
          label: "Realtor Growth Engine",
          href: "/realtor-growth-engine",
          description: "Página del producto del Growth Engine inmobiliario en vivo.",
        },
        {
          label: "CRM con integración MLS",
          href: "/crm-with-mls-integration",
          description: "Detalles de sincronización de inventario y matching de propiedades con IA.",
        },
        {
          label: "AI Lead Scoring",
          href: "/ai-lead-scoring",
          description: "Cómo Copilot prioriza compradores y vendedores calientes.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "Flujos de seguimiento listos para personalizar.",
        },
      ],
      finalCtaHeadline: "Convierte más conversaciones inmobiliarias en visitas reservadas",
      finalCtaSubtitle:
        "Empieza gratis, conecta tus canales y lleva calificación con IA y seguimiento al mismo espacio de trabajo desde el que tu equipo ya envía mensajes.",
      ssrBullets: [
        "Unified Inbox para WhatsApp y canales de mensajería compatibles",
        "Calificación con IA, lead scoring y asistencia de Copilot",
        "Matching de inventario MLS donde esté conectado",
        "Flujos automatizados de seguimiento para compradores y vendedores",
        "Realtor Growth Engine para crecimiento inmobiliario empaquetado",
      ],
    },
    "/solutions/ecommerce": {
      industryLabel: "E-commerce",
      breadcrumbLabel: "E-commerce",
      title: "CRM y mensajería para e-commerce | WhachatCRM",
      metaDescription:
        "CRM y mensajería para e-commerce en WhatsApp, Instagram, Facebook, SMS y Email. Unifica conversaciones de compradores, automatiza el seguimiento y conecta Shopify donde esté soportado.",
      ogTitle: "Solución de mensajería y CRM para e-commerce | WhachatCRM",
      h1: "Convierte cada conversación de comprador en más ingresos",
      heroIntro:
        "WhachatCRM ayuda a equipos de e-commerce a capturar preguntas de producto, gestionar conversaciones de soporte, personalizar el seguimiento con IA y mantener el contexto de Shopify conectado al espacio de mensajería.",
      heroVisual: {
        inquiryLabel: "DM de comprador",
        inquiryMessage: "¿La sudadera azul marino se envía hoy? Busco talla M.",
        suggestionLabel: "Sugerencia de AI Copilot",
        suggestionMessage: "Confirma disponibilidad de talla, comparte plazos de envío y etiqueta para seguimiento post-compra.",
        stageLabel: "Intención de producto",
        nextStep: "Siguiente: asignar respuesta de soporte",
      },
      challengesHeading: "Lo que les cuesta a los equipos de e-commerce",
      secondaryCta: { label: "Ver Shopify CRM", href: "/shopify-crm" },
      challenges: [
        {
          title: "Las preguntas de compradores llegan fuera de horario",
          description: "DMs de producto y consultas por WhatsApp se acumulan mientras el equipo de la tienda está offline.",
        },
        {
          title: "El soporte está repartido entre apps",
          description: "Instagram, WhatsApp, Email y el chat de la tienda guardan cada uno una parte distinta de la historia del cliente.",
        },
        {
          title: "Respuestas repetitivas queman tiempo del equipo",
          description: "Preguntas de envío, tallas y disponibilidad se repiten — sin un playbook compartido.",
        },
        {
          title: "El seguimiento se detiene tras la primera respuesta",
          description: "Compradores interesados que no compraron necesitan nurturing estructurado, no mensajes sueltos.",
        },
      ],
      helpsIntro:
        "Combina Unified Inbox, asistencia con IA, automatizaciones y conexión Shopify para que la mensajería forme parte del flujo de ingresos.",
      helpsPoints: [
        {
          title: "Un solo lugar para conversaciones de compradores",
          description: "Reúne WhatsApp, Instagram, Facebook, SMS, Email y web chat en Unified Inbox.",
        },
        {
          title: "IA que ayuda al equipo a ir más rápido",
          description: "AI Copilot redacta respuestas y muestra contexto; AI Brain apoya la personalización donde esté activo.",
        },
        {
          title: "Automatización para recorridos repetibles",
          description: "Usa flujos de trabajo, chatbots y campañas para preguntas frecuentes y reactivación.",
        },
        {
          title: "Shopify junto a la conversación",
          description: "Conecta Shopify para que el contexto de tienda y mensajería trabajen juntos donde esté soportado.",
        },
      ],
      workflowTitle: "De consulta de comprador a relación continua",
      workflowSteps: [
        {
          label: "Consulta de comprador",
          description: "Un cliente pregunta por un producto en WhatsApp, Instagram o el chat de tu web.",
        },
        {
          label: "Captura o responde la intención",
          description: "Un chatbot o compañero gestiona la primera respuesta y registra lo que necesita el comprador.",
        },
        {
          label: "La conversación entra en Unified Inbox",
          description: "El hilo se une a una cola compartida con propiedad, notas y contexto de canal.",
        },
        {
          label: "AI Copilot asiste la respuesta",
          description: "Los agentes reciben ayuda para resumir historial y redactar respuestas claras y coherentes con la marca.",
        },
        {
          label: "Recomienda la siguiente acción",
          description: "AI Brain ayuda a priorizar el seguimiento y personalizar el camino donde esté activo.",
        },
        {
          label: "Automatiza el nurturing",
          description: "Flujos y campañas continúan la relación tras la primera conversación.",
        },
      ],
      products: [
        {
          label: "Unified Inbox",
          description: "Conversaciones omnicanal de compradores y soporte en un solo espacio.",
          href: "/unified-inbox",
        },
        {
          label: "Chatbots",
          description: "Primeras respuestas automáticas para preguntas frecuentes de producto y soporte.",
          href: "/whatsapp-business-api#inbox-automation",
        },
        {
          label: "Automations & Campaigns",
          description: "Flujos de seguimiento y secuencias de reactivación para contactos que ya tienes.",
          href: "/automation-templates",
        },
        {
          label: "AI Copilot",
          description: "Asistencia en el hilo para respuestas más rápidas y de mayor calidad.",
          href: "/#ai-copilot",
        },
        {
          label: "AI Brain",
          description: "Personalización y funciones de IA en planes elegibles.",
          href: "/#ai-brain",
        },
        {
          label: "Team Collaboration",
          description: "Asignaciones, notas y propiedad compartida para soporte y ventas.",
          href: "/shared-team-inbox",
        },
        {
          label: "Integración Shopify",
          description: "Conecta Shopify y explora flujos de mensajería conscientes de la tienda.",
          href: "/shopify-crm",
        },
      ],
      useCases: [
        {
          situation: "Un comprador pregunta por talla o stock en Instagram o WhatsApp.",
          action: "Enruta el mensaje a Unified Inbox y responde con todo el historial visible.",
          outcome: "El equipo responde rápido sin buscar en inboxes sociales dispersos.",
        },
        {
          situation: "Preguntas de producto llegan fuera del horario comercial.",
          action: "Usa un chatbot web o de mensajería para capturar intención y fijar expectativas.",
          outcome: "Los leads esperan en el inbox cuando el equipo empieza el siguiente turno.",
        },
        {
          situation: "El volumen de soporte se dispara en un lanzamiento.",
          action: "Asigna conversaciones, usa Copilot para borradores y mantén notas en el contacto.",
          outcome: "Los clientes reciben respuestas coherentes sin duplicar respuestas del equipo.",
        },
        {
          situation: "Compradores anteriores se han quedado en silencio.",
          action: "Lanza una campaña o automatización para reactivar contactos etiquetados con seguimiento relevante.",
          outcome: "La mensajería se convierte en un canal de relación continua, no solo soporte reactivo.",
        },
        {
          situation: "Tu tienda ya funciona con Shopify.",
          action: "Conecta Shopify y usa WhachatCRM para gestionar conversaciones alrededor de la tienda.",
          outcome: "Mensajería y flujos de tienda comparten un espacio de operador donde esté soportado.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
      integrations: [
        { label: "Shopify", href: "/shopify-crm" },
        { label: "Stripe", href: "/#integrations" },
        { label: "Meta messaging", href: "/whatsapp-business-api" },
      ],
      howItWorks: [
        {
          title: "Conecta canales de mensajería",
          description: "Configura WhatsApp vía Meta Embedded Signup y añade los canales sociales que ya usas.",
        },
        {
          title: "Conecta Shopify cuando estés listo",
          description: "Instala la conexión Shopify para que el contexto de tienda quede junto a las conversaciones.",
        },
        {
          title: "Construye flujos de primera respuesta",
          description: "Usa chatbots y plantillas de automatización para preguntas frecuentes de compradores.",
        },
        {
          title: "Activa IA para tu equipo",
          description: "Enciende la asistencia de Copilot para que los agentes respondan más rápido con mejor contexto.",
        },
      ],
      relatedLinks: [
        {
          label: "Shopify CRM",
          href: "/shopify-crm",
          description: "Integración Shopify y detalles de mensajería para e-commerce.",
        },
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Inbox omnicanal para conversaciones de compradores y soporte.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "Flujos predefinidos para seguimiento y nurturing.",
        },
        {
          label: "WhatsApp Business API",
          href: "/whatsapp-business-api",
          description: "Onboarding oficial de API para mensajería a escala.",
        },
      ],
      finalCtaHeadline: "Haz más fácil convertir cada conversación de comprador",
      finalCtaSubtitle:
        "Empieza gratis, unifica tus canales y conecta Shopify cuando quieras unir tienda y mensajería en un solo flujo.",
      ssrBullets: [
        "Unified Inbox para WhatsApp, Instagram, Facebook, SMS, Email y web chat",
        "Chatbots y automatizaciones para preguntas frecuentes de compradores",
        "Asistencia de AI Copilot para respuestas de soporte y ventas",
        "Campañas y seguimiento para contactos existentes",
        "Conexión Shopify para flujos de mensajería conscientes de la tienda",
      ],
    },
    "/solutions/local-service-businesses": {
      industryLabel: "Negocios locales y de servicios",
      breadcrumbLabel: "Negocios locales y de servicios",
      title: "CRM para negocios locales de servicios | WhachatCRM",
      metaDescription:
        "CRM y mensajería para negocios locales de servicios. Encuentra y califica leads con Prospect AI, captura solicitudes de servicio, asigna trabajo, comparte enlaces de reserva y automatiza el seguimiento.",
      ogTitle: "CRM y mensajería para negocios locales de servicios | WhachatCRM",
      h1: "De encontrar clientes locales a reservar el siguiente trabajo",
      heroIntro:
        "Pensado para contratistas, proveedores de servicios del hogar, servicios profesionales y negocios locales con citas que ganan trabajo a través de conversaciones — no solo formularios.",
      heroVisual: {
        inquiryLabel: "Solicitud de servicio",
        inquiryMessage: "Necesito reparación de AC en el ZIP 33139 — ¿pueden venir esta semana?",
        suggestionLabel: "Sugerencia de AI Copilot",
        suggestionMessage: "Confirma zona de servicio y urgencia, luego comparte enlace de reserva con el técnico adecuado.",
        stageLabel: "Lead listo para trabajo",
        nextStep: "Siguiente: enviar enlace de reserva",
      },
      challengesHeading: "Lo que les cuesta a los equipos de servicios locales",
      secondaryCta: { label: "Explorar Prospect AI", href: "/prospect-ai" },
      challenges: [
        {
          title: "Conseguir trabajo nuevo de forma constante es difícil",
          description:
            "Las referencias ayudan, pero los equipos siguen necesitando una forma repetible de descubrir y calificar oportunidades locales.",
        },
        {
          title: "Las solicitudes de servicio llegan incompletas",
          description:
            "Llamadas y leads por chat suelen omitir ubicación, horario o detalles del trabajo que importan para cotizar.",
        },
        {
          title: "La persona equivocada es dueña del lead",
          description:
            "Sin asignación y visibilidad, trabajos calientes quedan sin respuesta mientras otro miembro del equipo está libre.",
        },
        {
          title: "Los leads silenciosos desaparecen",
          description:
            "Prospectos que pidieron cotización la semana pasada necesitan seguimiento, no un hilo de texto olvidado.",
        },
      ],
      helpsIntro:
        "Usa Prospect AI para encontrar oportunidades, y luego Unified Inbox, calificación con IA, enlaces de reserva y automatización para convertir conversaciones en trabajo agendado.",
      helpsPoints: [
        {
          title: "Encuentra y califica prospectos locales",
          description:
            "Prospect AI ayuda a descubrir negocios por tipo y ubicación, y calificar el encaje antes del outreach.",
        },
        {
          title: "Captura solicitudes de servicio con claridad",
          description: "Chatbot web e inbox recogen lo que necesita el cliente y cuándo.",
        },
        {
          title: "Enruta el trabajo al responsable correcto",
          description: "Asignaciones, etiquetas, etapas y scoring mantienen al equipo alineado sobre quién debe responder.",
        },
        {
          title: "Haz seguimiento hasta reservar el trabajo",
          description: "Comparte enlaces de Calendly o reserva, luego automatiza recordatorios cuando un prospecto se queda en silencio.",
        },
      ],
      workflowTitle: "De lead a trabajo reservado",
      workflowSteps: [
        {
          label: "Encuentra o recibe un lead",
          description: "Chat entrante, widget web o outreach de Prospect AI inicia la conversación.",
        },
        {
          label: "Captura el servicio solicitado",
          description: "Registra tipo de trabajo, ubicación y horario en la línea de tiempo del contacto.",
        },
        {
          label: "Califica necesidad y encaje",
          description: "Usa AI Brain, scoring y preguntas de calificación para priorizar oportunidades reales.",
        },
        {
          label: "Asigna el lead",
          description: "Enruta la conversación al compañero adecuado con notas y propiedad.",
        },
        {
          label: "Comparte enlace de reserva",
          description: "Envía un enlace de Calendly o consulta sin salir del hilo.",
        },
        {
          label: "Automatiza el seguimiento",
          description: "Recordatorios, campañas y flujos nutren trabajos futuros desde contactos pasados.",
        },
      ],
      products: [
        {
          label: "Prospect AI",
          description: "Encuentra y califica negocios locales, luego gestiona respuestas en el CRM.",
          href: "/prospect-ai",
        },
        {
          label: "Unified Inbox",
          description: "Mantén cada conversación de servicio visible para el equipo.",
          href: "/unified-inbox",
        },
        {
          label: "AI Brain & Copilot",
          description: "Califica oportunidades y asiste respuestas dentro de conversaciones en vivo.",
          href: "/#ai-platform",
        },
        {
          label: "Lead scoring & stages",
          description: "Prioriza trabajos calientes con etiquetas, etapas y señales de scoring.",
          href: "/ai-lead-scoring",
        },
        {
          label: "Automations & Campaigns",
          description: "Seguimiento sin respuesta y reactivación para contactos pasados.",
          href: "/automation-templates",
        },
        {
          label: "Team Collaboration",
          description: "Asignaciones y notas compartidas para que los trabajos no se atasquen.",
          href: "/shared-team-inbox",
        },
      ],
      useCases: [
        {
          situation: "Necesitas un pipeline constante de negocios locales a los que vender.",
          action: "Usa Prospect AI para descubrir, calificar e iniciar outreach personalizado.",
          outcome: "La prospección outbound se convierte en un flujo gestionado dentro de WhachatCRM.",
        },
        {
          situation: "Un propietario pide cotización por tu web fuera de horario.",
          action: "Captura detalles del servicio con el chatbot web y deja el lead en Unified Inbox.",
          outcome: "Tu equipo empieza al día siguiente con una solicitud completa en lugar de una llamada perdida.",
        },
        {
          situation: "Dos técnicos podrían tomar el mismo trabajo.",
          action: "Asigna la conversación, deja notas internas y mantén un solo responsable.",
          outcome: "Los clientes reciben un camino de respuesta claro.",
        },
        {
          situation: "Un prospecto pidió precio y luego se quedó en silencio.",
          action: "Activa seguimiento automatizado preservando etapa del lead e historial.",
          outcome: "Más cotizaciones se convierten en consultas reservadas.",
        },
        {
          situation: "Clientes anteriores pueden necesitar trabajo estacional o repetido.",
          action: "Reactiva contactos etiquetados con campañas cuando el momento sea adecuado.",
          outcome: "Tu lista se convierte en un canal de oportunidad recurrente.",
        },
      ],
      channels: ["WhatsApp", "SMS", "Email", "Instagram", "Facebook Messenger", "Web chat"],
      integrations: [
        { label: "Calendly", href: "/#integrations" },
        { label: "Meta messaging", href: "/whatsapp-business-api" },
        { label: "Gmail / Google Workspace", href: "/#integrations" },
      ],
      howItWorks: [
        {
          title: "Conecta canales y el chat de tu web",
          description: "Lleva mensajería entrante y el widget web a un solo inbox.",
        },
        {
          title: "Añade Prospect AI para crecimiento outbound",
          description: "Descubre oportunidades locales y mantén respuestas junto a tus otras conversaciones.",
        },
        {
          title: "Define calificación y enrutamiento",
          description: "Usa etiquetas, etapas, scoring y asignaciones que encajen con cómo tu equipo reserva trabajo.",
        },
        {
          title: "Automatiza los momentos de silencio",
          description: "Haz seguimiento automático cuando los prospectos se estancan entre cotización y reserva.",
        },
      ],
      relatedLinks: [
        {
          label: "Prospect AI",
          href: "/prospect-ai",
          description: "Equipo de ventas con IA para encontrar y calificar negocios locales.",
        },
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Mensajería compartida para conversaciones de servicio.",
        },
        {
          label: "AI Lead Scoring",
          href: "/ai-lead-scoring",
          description: "Prioriza los trabajos que necesitan atención ahora.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "Flujos de seguimiento para nurturing y reactivación.",
        },
      ],
      finalCtaHeadline: "Reserva más trabajos locales desde las conversaciones que ya tienes",
      finalCtaSubtitle:
        "Empieza gratis, conecta tus canales y añade Prospect AI cuando quieras crecer tu pipeline outbound.",
      ssrBullets: [
        "Prospect AI para encontrar y calificar oportunidades locales",
        "Chatbot web y Unified Inbox para solicitudes de servicio",
        "Asignación, etiquetas, etapas y lead scoring",
        "Enlaces de reserva y Calendly dentro de conversaciones",
        "Seguimiento automatizado y campañas de reactivación",
      ],
    },
    "/solutions/marketing-agencies": {
      industryLabel: "Agencias de marketing",
      breadcrumbLabel: "Agencias de marketing",
      title: "Plataforma de WhatsApp y mensajería para agencias de marketing | WhachatCRM",
      metaDescription:
        "Plataforma de mensajería para agencias con WhatsApp, inbox multicanal, chatbots, automatización, AI Copilot y engagement de clientes. Conexión opcional de integración CRM y Partner Program.",
      ogTitle: "Mensajería y automatización con IA para agencias | WhachatCRM",
      h1: "Entrega mensajería más inteligente y automatización con IA para tus clientes",
      heroIntro:
        "Ya sea que gestiones campañas para clientes, respuestas de comunidad o extiendas un stack CRM existente, WhachatCRM ofrece a las agencias un espacio práctico de mensajería, automatización e IA — con o sin integración CRM.",
      heroVisual: {
        inquiryLabel: "Respuesta a campaña de cliente",
        inquiryMessage: "Vi vuestro anuncio — ¿podéis enviar detalles de la oferta?",
        suggestionLabel: "Sugerencia de AI Copilot",
        suggestionMessage: "Califica intención de campaña, transfiere al equipo del cliente y activa el flujo de nurturing.",
        stageLabel: "Lead de campaña",
        nextStep: "Siguiente: enrutar al inbox del cliente",
      },
      challengesHeading: "Lo que les cuesta a los equipos de agencia",
      secondaryCta: { label: "Ver Partner Program", href: "/partner-program" },
      challenges: [
        {
          title: "Los clientes esperan WhatsApp, no solo anuncios",
          description: "El tráfico de campaña se pierde cuando no hay un camino oficial de mensajería listo para respuestas.",
        },
        {
          title: "Las herramientas están fragmentadas por cliente",
          description: "Inboxes, chatbots y seguimiento viven en sitios distintos, y la calidad de entrega varía.",
        },
        {
          title: "Los equipos del cliente necesitan ayuda para responder",
          description: "Incluso buenas automatizaciones fallan si los humanos no pueden gestionar conversaciones en vivo con rapidez.",
        },
        {
          title: "El crecimiento de la agencia necesita una oferta repetible",
          description: "Las agencias quieren un paquete claro de mensajería e IA que puedan entregar una y otra vez.",
        },
      ],
      helpsIntro:
        "Usa WhachatCRM como capa de mensajería e IA para el engagement de clientes — y conecta la integración CRM o únete al Partner Program cuando encajen con tu negocio.",
      helpsPoints: [
        {
          title: "WhatsApp oficial y mensajería multicanal",
          description: "Conecta canales Meta y gestiona respuestas en Unified Inbox con colaboración en equipo.",
        },
        {
          title: "Chatbots y automatización que los clientes notan",
          description: "Construye flujos de calificación, seguimiento y campañas sin empezar desde cero.",
        },
        {
          title: "IA que ayuda a equipos cara al cliente",
          description: "AI Copilot asiste respuestas; AI Brain apoya personalización y estrategia donde esté activo.",
        },
        {
          title: "Rutas opcionales de CRM y crecimiento partner",
          description: "Usa la conexión CRM Marketplace cuando haga falta, y gana con el Partner Program.",
        },
      ],
      workflowTitle: "De configuración de canal del cliente a engagement continuo",
      workflowSteps: [
        {
          label: "Conecta canales del cliente",
          description: "Configura WhatsApp oficial y mensajería social compatible para la marca.",
        },
        {
          label: "Construye chatbot y flujos",
          description: "Crea flujos de primera respuesta y calificación para campañas o soporte.",
        },
        {
          label: "Centraliza conversaciones",
          description: "Lleva respuestas a Unified Inbox con propiedad y notas.",
        },
        {
          label: "Asiste equipos con AI Copilot",
          description: "Ayuda al personal cara al cliente a responder más rápido con contexto y borradores.",
        },
        {
          label: "Automatiza el seguimiento",
          description: "Usa flujos y campañas para mantener leads avanzando tras el primer contacto.",
        },
        {
          label: "Mejora el engagement con el tiempo",
          description: "Itera mensajería, enrutamiento y asistencia con IA según el volumen real de conversaciones.",
        },
      ],
      products: [
        {
          label: "WhatsApp Business API",
          description: "Ruta oficial Meta Embedded Signup para acceso WhatsApp del cliente.",
          href: "/whatsapp-business-api",
        },
        {
          label: "Unified Inbox",
          description: "Conversaciones multicanal compartidas para equipos de clientes.",
          href: "/unified-inbox",
        },
        {
          label: "Chatbots & Automations",
          description: "Flujos de calificación y seguimiento para campañas.",
          href: "/automation-templates",
        },
        {
          label: "AI Copilot & AI Brain",
          description: "Asiste respuestas y personaliza siguientes pasos donde esté activo.",
          href: "/#ai-platform",
        },
        {
          label: "Team Collaboration",
          description: "Asignaciones y notas para operadores de agencia o del cliente.",
          href: "/shared-team-inbox",
        },
        {
          label: "Integración CRM para agencias",
          description: "Detalles de integración orientados al Marketplace para agencias que usan un CRM.",
          href: "/go-high-level-agencies",
        },
        {
          label: "Partner Program",
          description: "Crece con WhachatCRM y gana comisiones recurrentes de partner donde aplique.",
          href: "/partner-program",
        },
      ],
      useCases: [
        {
          situation: "Un cliente necesita presencia oficial de WhatsApp para respuestas de campaña.",
          action: "Conecta WhatsApp Business API y enruta conversaciones a Unified Inbox.",
          outcome: "El tráfico de anuncios tiene un lugar conforme donde aterrizar y recibir respuesta.",
        },
        {
          situation: "Un lanzamiento necesita calificación por chatbot antes del traspaso humano.",
          action: "Construye chatbot y flujos de automatización que capturen intención y clasifiquen leads.",
          outcome: "El equipo del cliente solo dedica tiempo a conversaciones calificadas.",
        },
        {
          situation: "El personal del cliente no da abasto con los DMs.",
          action: "Activa AI Copilot, asignaciones y notas compartidas en un solo inbox.",
          outcome: "La calidad de respuesta se mantiene aunque suba el volumen.",
        },
        {
          situation: "Tu agencia ya opera dentro de una plataforma CRM.",
          action: "Usa WhachatCRM como capa de mensajería e IA junto a la integración CRM donde esté conectado.",
          outcome: "Los clientes reciben mejor gestión de conversaciones sin reemplazar todo el stack.",
        },
        {
          situation: "Quieres monetizar recomendaciones de WhachatCRM.",
          action: "Únete al Partner Program y refiere negocios que necesiten mensajería e IA CRM.",
          outcome: "El crecimiento de la agencia incluye upside recurrente de partner donde el programa lo soporte.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
      integrations: [
        { label: "CRM Marketplace", href: "/go-high-level-agencies" },
        { label: "Meta Embedded Signup", href: "/whatsapp-business-api" },
        { label: "Partner Program", href: "/partner-program" },
      ],
      howItWorks: [
        {
          title: "Elige el modelo de entrega al cliente",
          description: "Usa WhachatCRM standalone, con integración CRM o como parte de una oferta liderada por partner.",
        },
        {
          title: "Conecta canales y construye flujos",
          description: "Levanta WhatsApp, enrutamiento de inbox, chatbots y automatizaciones para la marca.",
        },
        {
          title: "Activa IA para operadores",
          description: "Da a equipos de clientes asistencia Copilot para respuestas en vivo rápidas y coherentes.",
        },
        {
          title: "Empaqueta y repite",
          description: "Convierte el mismo playbook de mensajería e IA en un servicio repetible de agencia.",
        },
      ],
      relatedLinks: [
        {
          label: "Ruta CRM para agencias",
          href: "/go-high-level-agencies",
          description: "Cómo WhachatCRM extiende la integración CRM con mensajería e IA.",
        },
        {
          label: "Partner Program",
          href: "/partner-program",
          description: "Asóciate con WhachatCRM y crece ingresos recurrentes.",
        },
        {
          label: "WhatsApp Business API",
          href: "/whatsapp-business-api",
          description: "Onboarding oficial de API para acceso WhatsApp del cliente.",
        },
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Inbox omnicanal compartido para conversaciones de clientes.",
        },
      ],
      finalCtaHeadline: "Ofrece a tus clientes una capa de mensajería e IA más sólida",
      finalCtaSubtitle:
        "Empieza gratis, empaqueta WhachatCRM para entrega a clientes y explora la integración CRM o Partner Program cuando encajen.",
      ssrBullets: [
        "WhatsApp API oficial y mensajería multicanal",
        "Unified Inbox con colaboración en equipo para operadores de clientes",
        "Chatbots, automatizaciones y campañas para engagement",
        "Asistencia de AI Copilot y AI Brain donde esté activo",
        "Conexión opcional de integración CRM y Partner Program",
      ],
    },
    "/solutions/med-spas": {
      industryLabel: "Med spas y bienestar",
      breadcrumbLabel: "Med spas y bienestar",
      title: "CRM para med spas y negocios de bienestar | WhachatCRM",
      metaDescription:
        "CRM y mensajería para med spas y negocios de bienestar. Captura consultas de tratamiento desde WhatsApp e Instagram, califica consultas, asigna tu equipo y automatiza el seguimiento.",
      ogTitle: "CRM de mensajería y seguimiento de leads para med spas | WhachatCRM",
      h1: "Convierte más consultas de med spa en citas reservadas",
      heroIntro:
        "WhachatCRM ayuda a med spas y negocios de bienestar a responder preguntas de tratamiento, calificar interés en consultas, asignar al compañero adecuado y hacer seguimiento hasta reservar la visita — sin convertir la mensajería en un sistema clínico.",
      heroVisual: {
        inquiryLabel: "Consulta de tratamiento",
        inquiryMessage: "Interesada en consulta para depilación láser — prefiero tardes.",
        suggestionLabel: "Sugerencia de AI Copilot",
        suggestionMessage: "Confirma interés en el tratamiento, captura horario y comparte enlace de reserva de consulta.",
        stageLabel: "Lista para consulta",
        nextStep: "Siguiente: reservar consulta",
      },
      challengesHeading: "Lo que les cuesta a equipos de med spa y bienestar",
      secondaryCta: { label: "Ver Unified Inbox", href: "/unified-inbox" },
      challenges: [
        {
          title: "Las preguntas de tratamiento llegan en redes",
          description: "Consultas por Instagram y WhatsApp sobre procedimientos necesitan respuestas rápidas y cuidadosas.",
        },
        {
          title: "El interés fuera de horario se enfría",
          description: "Prospectos que miran tratamientos de noche a menudo nunca llegan a un formulario de reserva.",
        },
        {
          title: "No toda consulta está lista para reservar",
          description: "Los equipos necesitan calificar interés en el servicio antes de dedicar tiempo de consulta.",
        },
        {
          title: "El seguimiento es inconsistente",
          description: "Leads que preguntaron por consulta la semana pasada necesitan nurturing estructurado, no un DM olvidado.",
        },
      ],
      helpsIntro:
        "Usa mensajería, calificación, asistencia con IA y automatización para llevar consultas estéticas y de bienestar hacia citas reservadas.",
      helpsPoints: [
        {
          title: "Encuentra prospectos en los canales que usan",
          description: "WhatsApp, Instagram, Facebook y chat web alimentan un Unified Inbox.",
        },
        {
          title: "Califica la consulta que quieren",
          description: "Captura interés en tratamiento, horario y disposición para el siguiente paso con preguntas estructuradas.",
        },
        {
          title: "Ayuda a tu equipo a responder con confianza",
          description: "AI Copilot asiste en el hilo; AI Brain apoya personalización donde esté activo.",
        },
        {
          title: "Reserva y nutre sin excederte en lo clínico",
          description: "Comparte enlaces de reserva o Calendly, asigna responsables y automatiza seguimiento — no historiales médicos.",
        },
      ],
      workflowTitle: "De consulta de tratamiento a cita reservada",
      workflowSteps: [
        {
          label: "Nueva consulta de tratamiento",
          description: "Un prospecto pregunta por un servicio en Instagram, WhatsApp o tu web.",
        },
        {
          label: "Identifica interés en el servicio",
          description: "Captura qué tratamiento o consulta están preguntando.",
        },
        {
          label: "Responde preguntas iniciales",
          description: "Chatbot o equipo responde con información clara del siguiente paso — no consejo médico.",
        },
        {
          label: "Califica la oportunidad",
          description: "Usa scoring, etiquetas y asistencia con IA para priorizar consultas listas.",
        },
        {
          label: "Asigna y comparte reserva",
          description: "Enruta al compañero adecuado y envía enlace de reserva de consulta.",
        },
        {
          label: "Automatiza el seguimiento",
          description: "Recuerda leads silenciosos y nutre servicios futuros con campañas donde corresponda.",
        },
      ],
      products: [
        {
          label: "Unified Inbox",
          description: "Centraliza conversaciones de tratamiento y consulta para el equipo de recepción.",
          href: "/unified-inbox",
        },
        {
          label: "Chatbots",
          description: "Captura interés fuera de horario e intención de servicio antes del traspaso humano.",
          href: "/whatsapp-business-api#inbox-automation",
        },
        {
          label: "AI Copilot",
          description: "Ayuda al personal a responder más rápido con contexto de conversación y borradores.",
          href: "/#ai-copilot",
        },
        {
          label: "AI Brain",
          description: "Apoya calificación y seguimiento personalizado donde esté activo.",
          href: "/#ai-brain",
        },
        {
          label: "Lead scoring & stages",
          description: "Prioriza consultas listas para reservar con etiquetas y scoring.",
          href: "/ai-lead-scoring",
        },
        {
          label: "Automations & Campaigns",
          description:
            "Haz seguimiento a consultas que no reservaron o dejaron de responder — y reactiva contactos pasados con cuidado.",
          href: "/automation-templates",
        },
        {
          label: "Team Collaboration",
          description: "Asigna conversaciones para que las solicitudes de consulta tengan un responsable claro.",
          href: "/shared-team-inbox",
        },
      ],
      useCases: [
        {
          situation: "Alguien envía DM en Instagram preguntando por un tratamiento popular.",
          action: "Lleva la conversación a Unified Inbox y captura qué servicio quieren.",
          outcome: "Recepción responde con un camino claro de consulta en lugar de perder el DM.",
        },
        {
          situation: "Visitantes de la web miran tratamientos tras cerrar.",
          action: "Usa el chatbot web para capturar interés y datos de contacto.",
          outcome: "El personal de mañana empieza con consultas calificadas listas para reservar.",
        },
        {
          situation: "Un prospecto está interesado pero no listo para agendar.",
          action: "Etiqueta el lead, califica disposición e inscribe en seguimiento suave automatizado.",
          outcome: "Tu negocio permanece presente sin perseguir manualmente.",
        },
        {
          situation: "Varios coordinadores gestionan solicitudes de consulta.",
          action: "Asigna propiedad y mantén notas en cada conversación.",
          outcome: "Menos respuestas duplicadas y menos oportunidades de reserva perdidas.",
        },
        {
          situation: "Consultas pasadas pueden estar listas para un servicio relacionado.",
          action: "Reactiva contactos apropiados con campañas cuando la oferta sea relevante.",
          outcome: "La mensajería apoya relaciones de bienestar continuas — con cuidado e intención.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
      integrations: [
        { label: "Calendly", href: "/#integrations" },
        { label: "Meta messaging", href: "/whatsapp-business-api" },
        { label: "Gmail / Google Workspace", href: "/#integrations" },
      ],
      howItWorks: [
        {
          title: "Conecta canales sociales y WhatsApp",
          description: "Lleva consultas de Instagram, Facebook y WhatsApp a un solo inbox.",
        },
        {
          title: "Añade chat web para interés fuera de horario",
          description: "Captura preguntas de tratamiento cuando recepción está offline.",
        },
        {
          title: "Define calificación de consulta",
          description: "Usa etiquetas, etapas y preguntas que encajen con cómo tu negocio reserva visitas.",
        },
        {
          title: "Automatiza la brecha de seguimiento",
          description:
            "Haz seguimiento a consultas que no reservaron o dejaron de responder — sin afirmaciones clínicas en la mensajería.",
        },
      ],
      relatedLinks: [
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Inbox compartido para conversaciones de tratamiento y consulta.",
        },
        {
          label: "AI Lead Scoring",
          href: "/ai-lead-scoring",
          description: "Prioriza consultas listas para reservar.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "Flujos de seguimiento para nurturing y reactivación.",
        },
        {
          label: "WhatsApp Business API",
          href: "/whatsapp-business-api",
          description: "Onboarding oficial de WhatsApp para mensajería empresarial.",
        },
      ],
      finalCtaHeadline: "Reserva más consultas desde las consultas que ya recibes",
      finalCtaSubtitle:
        "Empieza gratis, unifica tus canales y pon seguimiento asistido por IA detrás de cada conversación de tratamiento.",
      ssrBullets: [
        "Unified Inbox para consultas de WhatsApp, Instagram y Facebook",
        "Captura con chatbot web para interés fuera de horario",
        "Calificación, etiquetado, scoring y asignación en equipo",
        "Enlaces de reserva y Calendly para consultas",
        "Seguimiento automatizado y campañas de reactivación cuidadosas",
      ],
    },
  } as Record<string, Partial<SolutionPageContent>>,
  he: {
    "/real-estate-crm": {
      industryLabel: "נדל״ן",
      breadcrumbLabel: "נדל״ן",
      title: "CRM לנדל״ן לסוכנים וצוותים | WhachatCRM",
      metaDescription:
        "CRM לנדל״ן עם WhatsApp, Unified Inbox, סיווג בינה מלאכותית, התאמת MLS ואוטומציית מעקב. לכדו לידים של קונים ומוכרים והובילו שיחות לסיורים שנקבעו.",
      ogTitle: "CRM לנדל״ן — לכדו, סווגו והמירו | WhachatCRM",
      h1: "לכדו, סווגו והמירו לידים בנדל״ן בכל הערוצים",
      heroIntro:
        "WhachatCRM מאחד הודעות, סיווג בינה מלאכותית, הקשר מלאי ואוטומציית מעקב — כדי שסוכנים וצוותים יעברו מפנייה חדשה לסיור שנקבע בלי לאבד את השיחה.",
      heroVisual: {
        inquiryLabel: "פניית קונה",
        inquiryMessage: "מחפש במיאמי עד $750k — 3 חדרים, מעבר תוך חודשיים.",
        suggestionLabel: "הצעת AI Copilot",
        suggestionMessage: "אשר תקציב ולוח זמנים, דרג את הליד ושתף נכסים מתאימים.",
        stageLabel: "קונה מסווג",
        nextStep: "הבא: שיתוף נכסים",
      },
      challengesHeading: "מה קשה לצוותי נדל״ן",
      secondaryCta: {
        label: "גלו את Realtor Growth Engine",
        href: "/realtor-growth-engine",
      },
      challenges: [
        {
          title: "לידים מגיעים מכל מקום",
          description:
            "פניות מפורטלים, הרשמות ל-open house, הודעות באינסטגרם ו-WhatsApp מתפזרות בין טלפונים ואפליקציות.",
        },
        {
          title: "הסיווג מגיע מאוחר מדי",
          description:
            "תקציב, לוח זמנים והעדפות מיקום אובדים בשיחות ארוכות, וסוכנים רודפים אחרי השיחות הלא נכונות.",
        },
        {
          title: "מעקב נופל בין הכיסאות",
          description:
            "כשקונה משתיק, תזכורות ידניות נשכחות — והסוכן שמגיב ראשון זוכה בסיור.",
        },
        {
          title: "המלאי חי מחוץ לצ'אט",
          description:
            "התאמת נכסים להעדפות הקונה לרוב דורשת מעבר בין כלים ואובדן הקשר השיחה.",
        },
      ],
      helpsIntro: "WhachatCRM מתייחס לכל הודעה כחלק מתהליך נדל״ן — לא כצ'אט מבודד.",
      helpsPoints: [
        {
          title: "תיבת דואר אחת לכל הערוצים",
          description: "WhatsApp, Messenger, Instagram, Email ועוד נכנסים ל-Unified Inbox עם בעלות משותפת והערות.",
        },
        {
          title: "בינה מלאכותית שמבינה כוונת קונה ומוכר",
          description: "AI Brain ו-AI Copilot עוזרים ללכוד העדפות, לדרג לידים ולהציע תגובה או מעקב הבא.",
        },
        {
          title: "מלאי לצד השיחה",
          description: "כש-MLS מחובר, התאימו נכסים להעדפות ושתפו צעדים הבאים בלי לעזוב את השיחה.",
        },
        {
          title: "אוטומציית Growth Engine לנדל״ן",
          description: "Realtor Growth Engine מאגד תהליכי מעקב, תבניות ואינטליגנציה לתחום לסוכנים וצוותים.",
        },
      ],
      workflowTitle: "מפנייה חדשה לסיור שנקבע",
      workflowSteps: [
        {
          label: "פנייה חדשה של קונה או מוכר",
          description: "ליד שולח הודעה ב-WhatsApp, Instagram, Messenger או בדף הסוכן שלכם.",
        },
        {
          label: "לכידת העדפות וכוונה",
          description: "מיקום, תקציב, לוח זמנים וצרכי נכס נרשמים לצד הצ'אט.",
        },
        {
          label: "סיווג ודירוג בינה מלאכותית",
          description: "AI Brain ו-Copilot עוזרים לתעדף הזדמנויות חמות ולהמליץ על פעולות הבאות.",
        },
        {
          label: "התאמת מלאי רלוונטי",
          description: "כשמחובר, הציעו נכסים מתאימים ושמרו הקשר בשיחה.",
        },
        {
          label: "שיתוף צעדים הבאים",
          description: "שלחו פרטי נכס, עלונים או קישור הזמנה — והשיחה נשארת מסודרת.",
        },
        {
          label: "אוטומציית מעקב",
          description: "תזכורות ותהליכי Growth Engine ממשיכים לידים שקטים לקראת סיור.",
        },
      ],
      products: [
        {
          label: "Unified Inbox",
          description: "שיחות משותפות בערוצי הודעות עם הקשר CRM.",
          href: "/unified-inbox",
        },
        {
          label: "AI Copilot",
          description: "סיוע בתוך השיחה לתגובות, סיכומים והקשר ליד.",
          href: "/#ai-copilot",
        },
        {
          label: "AI Brain",
          description: "סיווג עמוק יותר, התאמה אישית ויכולות AI בפלטפורמה.",
          href: "/#ai-brain",
        },
        {
          label: "Automations",
          description: "תהליכי מעקב ותבניות לטיפוח קונים ומוכרים.",
          href: "/automation-templates",
        },
        {
          label: "MLS / התאמת מלאי",
          description: "חברו מלאי והתאימו קונים כשאינטגרציית MLS פעילה.",
          href: "/crm-with-mls-integration",
        },
        {
          label: "Realtor Growth Engine",
          description: "Growth Engine החי לתהליכי נדל״ן והגדרה.",
          href: "/realtor-growth-engine",
        },
        {
          label: "Prospect AI",
          description: "מצאו וסווגו עסקים מקומיים כשצמיחה כוללת פרוספקציה יוצאת.",
          href: "/prospect-ai",
        },
      ],
      useCases: [
        {
          situation: "קונה שולח הודעה על בתים בשכונה ובטווח תקציב מסוימים.",
          action: "לכדו העדפות בשיחה, דרגו את הליד והציגו מלאי מתאים כשמחובר.",
          outcome: "הסוכן מגיב עם צעדים רלוונטיים במקום להתחיל שיחת גילוי מחדש.",
        },
        {
          situation: "מוכר שואל על רישום הבית אחרי שבועות של גלישה שקטה.",
          action: "זהו כוונת מוכר בעזרת AI, הקצו בעלים והמליצו על מסלול מעקב נכון.",
          outcome: "הצוות קובע ייעוץ במקום לאבד את הפנייה בתיבת דואר אישית.",
        },
        {
          situation: "ליד חם משתיק אחרי קבלת נכסים.",
          action: "הפעילו אוטומציית מעקב ללא תגובה תוך שמירה על שלב וציונים.",
          outcome: "השיחה מתחדשת לפני שהקונה עובר לסוכן אחר.",
        },
        {
          situation: "סוכן רוצה לשתף מערך נכסים מותאם מהצ'אט החי.",
          action: "השתמשו בהקשר מלאי ובמצגות נכסים לשיתוף מתוך סביבת העבודה.",
          outcome: "קונים מקבלים אפשרויות ברורות בלי שהסוכן יבנה חומרים מחדש בכלי אחר.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "Email", "SMS", "Web chat"],
      integrations: [
        { label: "MLS / Bridge Interactive", href: "/crm-with-mls-integration" },
        { label: "Calendly", href: "/#integrations" },
        { label: "Meta Embedded Signup", href: "/whatsapp-business-api" },
      ],
      howItWorks: [
        {
          title: "חברו את הערוצים",
          description: "השתמשו ב-onboarding מודרך של Meta ל-WhatsApp ולערוצים חברתיים נתמכים.",
        },
        {
          title: "הזמינו את הצוות",
          description: "הקצו שיחות, השאירו הערות ושמרו כל ליד גלוי בתיבת דואר אחת.",
        },
        {
          title: "הוסיפו AI ואוטומציה",
          description: "הפעילו סיוע Copilot והתקינו תהליכי מעקב לנדל״ן כשיש הרשאה.",
        },
        {
          title: "הוסיפו Growth Engine כשמוכנים",
          description: "השתמשו ב-Realtor Growth Engine לתהליכי נדל״ן ארוזים ותמיכה בהגדרה.",
        },
      ],
      relatedLinks: [
        {
          label: "Realtor Growth Engine",
          href: "/realtor-growth-engine",
          description: "דף המוצר של Growth Engine לנדל״ן החי.",
        },
        {
          label: "CRM עם אינטגרציית MLS",
          href: "/crm-with-mls-integration",
          description: "סנכרון מלאי והתאמת נכסים ב-AI.",
        },
        {
          label: "AI Lead Scoring",
          href: "/ai-lead-scoring",
          description: "איך Copilot מתעדף קונים ומוכרים חמים.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "תהליכי מעקב מוכנים להתאמה.",
        },
      ],
      finalCtaHeadline: "המירו יותר שיחות נדל״ן לסיורים שנקבעו",
      finalCtaSubtitle:
        "התחילו בחינם, חברו ערוצים והביאו סיווג AI ומעקב לאותה סביבת עבודה שממנה הצוות כבר שולח הודעות.",
      ssrBullets: [
        "Unified Inbox ל-WhatsApp ולערוצי הודעות נתמכים",
        "סיווג AI, דירוג לידים וסיוע Copilot",
        "התאמת מלאי MLS כשמחובר",
        "תהליכי מעקב אוטומטיים לקונים ומוכרים",
        "Realtor Growth Engine לצמיחה ארוזה בנדל״ן",
      ],
    },
    "/solutions/ecommerce": {
      industryLabel: "מסחר אלקטרוני",
      breadcrumbLabel: "מסחר אלקטרוני",
      title: "CRM והודעות לחנויות אונליין | WhachatCRM",
      metaDescription:
        "CRM והודעות ל-e-commerce ב-WhatsApp, Instagram, Facebook, SMS ו-Email. איחוד שיחות קונים, אוטומציית מעקב וחיבור Shopify כשנתמך.",
      ogTitle: "פתרון הודעות ו-CRM ל-e-commerce | WhachatCRM",
      h1: "הפכו כל שיחת קונה ליותר הכנסות",
      heroIntro:
        "WhachatCRM עוזר לצוותי e-commerce ללכוד שאלות על מוצרים, לנהל שיחות תמיכה, להתאים מעקב ב-AI ולשמור הקשר Shopify מחובר לסביבת ההודעות.",
      heroVisual: {
        inquiryLabel: "הודעה מקונה",
        inquiryMessage: "ההודי הכחול כהה נשלח היום? מחפש מידה M.",
        suggestionLabel: "הצעת AI Copilot",
        suggestionMessage: "אשר זמינות מידה, שתף זמני משלוח ותייג למעקב לאחר רכישה.",
        stageLabel: "כוונת מוצר",
        nextStep: "הבא: הקצאת תגובת תמיכה",
      },
      challengesHeading: "מה קשה לצוותי e-commerce",
      secondaryCta: { label: "ראו Shopify CRM", href: "/shopify-crm" },
      challenges: [
        {
          title: "שאלות קונים מגיעות מחוץ לשעות",
          description: "הודעות על מוצרים ו-WhatsApp מצטברות כשצוות החנות offline.",
        },
        {
          title: "תמיכה מפוזרת בין אפליקציות",
          description: "Instagram, WhatsApp, Email וצ'אט החנות מחזיקים כל אחד חלק אחר מסיפור הלקוח.",
        },
        {
          title: "תשובות חוזרות שורפות זמן",
          description: "שאלות משלוח, מידות וזמינות חוזרות — בלי playbook משותף.",
        },
        {
          title: "מעקב נעצר אחרי התגובה הראשונה",
          description: "קונים חמים שלא קנו צריכים טיפוח מובנה, לא הודעות חד-פעמיות.",
        },
      ],
      helpsIntro:
        "שלבו Unified Inbox, סיוע AI, אוטומציות וחיבור Shopify — כדי שההודעות יהיו חלק מתהליך ההכנסות.",
      helpsPoints: [
        {
          title: "מקום אחד לשיחות קונים",
          description: "הביאו WhatsApp, Instagram, Facebook, SMS, Email ו-web chat ל-Unified Inbox.",
        },
        {
          title: "AI שעוזר לצוות לעבוד מהר יותר",
          description: "AI Copilot מנסח תגובות ומציג הקשר; AI Brain תומך בהתאמה אישית כשפעיל.",
        },
        {
          title: "אוטומציה למסלולים חוזרים",
          description: "השתמשו בתהליכים, צ'אטבוטים וקמפיינים לשאלות נפוצות וריאנגagement.",
        },
        {
          title: "Shopify לצד השיחה",
          description: "חברו Shopify כדי שהקשר חנות והודעות יעבדו יחד כשנתמך.",
        },
      ],
      workflowTitle: "מפניית קונה לקשר מתמשך",
      workflowSteps: [
        {
          label: "פניית קונה",
          description: "לקוח שואל על מוצר ב-WhatsApp, Instagram או צ'אט באתר.",
        },
        {
          label: "לכידה או מענה לכוונה",
          description: "צ'אטבוט או חבר צוות מטפלים בתגובה הראשונה ורושמים מה הקונה צריך.",
        },
        {
          label: "השיחה נכנסת ל-Unified Inbox",
          description: "השיחה מצטרפת לתור משותף עם בעלות, הערות והקשר ערוץ.",
        },
        {
          label: "AI Copilot מסייע בתגובה",
          description: "סוכנים מקבלים עזרה לסכם היסטוריה ולנסח תגובות ברורות ועקביות.",
        },
        {
          label: "המלצה על הפעולה הבאה",
          description: "AI Brain עוזר לתעדף מעקב ולהתאים את המסלול כשפעיל.",
        },
        {
          label: "אוטומציית טיפוח",
          description: "תהליכים וקמפיינים ממשיכים את הקשר אחרי השיחה הראשונה.",
        },
      ],
      products: [
        {
          label: "Unified Inbox",
          description: "שיחות קונים ותמיכה omnichannel בסביבה אחת.",
          href: "/unified-inbox",
        },
        {
          label: "Chatbots",
          description: "תגובות ראשונות אוטומטיות לשאלות מוצר ותמיכה נפוצות.",
          href: "/whatsapp-business-api#inbox-automation",
        },
        {
          label: "Automations & Campaigns",
          description: "תהליכי מעקב ורצפי ריאנגagement לאנשי קשר שכבר יש לכם.",
          href: "/automation-templates",
        },
        {
          label: "AI Copilot",
          description: "סיוע בתוך השיחה לתגובות מהירות ואיכותיות יותר.",
          href: "/#ai-copilot",
        },
        {
          label: "AI Brain",
          description: "התאמה אישית ויכולות AI בתוכניות זכאות.",
          href: "/#ai-brain",
        },
        {
          label: "Team Collaboration",
          description: "הקצאות, הערות ובעלות משותפת לתמיכה ומכירות.",
          href: "/shared-team-inbox",
        },
        {
          label: "אינטגרציית Shopify",
          description: "חברו Shopify וחקור תהליכי הודעות מודעים לחנות.",
          href: "/shopify-crm",
        },
      ],
      useCases: [
        {
          situation: "קונה שואל על מידה או מלאי ב-Instagram או WhatsApp.",
          action: "נתבו את ההודעה ל-Unified Inbox והגיבו עם כל ההיסטוריה גלויה.",
          outcome: "הצוות עונה מהר בלי לחפש בין תיבות דואר חברתיות.",
        },
        {
          situation: "שאלות מוצר מגיעות מחוץ לשעות העסק.",
          action: "השתמשו בצ'אטבוט באתר או בהודעות ללכידת כוונה וציפיות.",
          outcome: "לידים מחכים בתיבת הדואר כשהצוות מתחיל את המשמרת הבאה.",
        },
        {
          situation: "נפח תמיכה קופץ בזמן השקה.",
          action: "הקצו שיחות, השתמשו ב-Copilot לטיוטות ושמרו הערות על איש הקשר.",
          outcome: "לקוחות מקבלים תשובות עקביות בלי תגובות כפולות.",
        },
        {
          situation: "קונים קודמים השתיקו.",
          action: "הריצו קמפיין או אוטומציה לריאנגagement של אנשי קשר מתויגים.",
          outcome: "ההודעות הופכות לערוץ קשר מתמשך, לא רק תמיכה ריאקטיבית.",
        },
        {
          situation: "החנות כבר רצה על Shopify.",
          action: "חברו Shopify והשתמשו ב-WhachatCRM לניהול שיחות סביב החנות.",
          outcome: "הודעות ותהליכי חנות חולקים סביבת מפעיל אחת כשנתמך.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
      integrations: [
        { label: "Shopify", href: "/shopify-crm" },
        { label: "Stripe", href: "/#integrations" },
        { label: "Meta messaging", href: "/whatsapp-business-api" },
      ],
      howItWorks: [
        {
          title: "חברו ערוצי הודעות",
          description: "הגדירו WhatsApp דרך Meta Embedded Signup והוסיפו ערוצים חברתיים שכבר בשימוש.",
        },
        {
          title: "חברו Shopify כשמוכנים",
          description: "התקינו חיבור Shopify כדי שהקשר חנות יישב לצד השיחות.",
        },
        {
          title: "בנו תהליכי תגובה ראשונה",
          description: "השתמשו בצ'אטבוטים ותבניות אוטומציה לשאלות קונים נפוצות.",
        },
        {
          title: "הפעילו AI לצוות",
          description: "הדליקו סיוע Copilot כדי שהסוכנים יגיבו מהר יותר עם הקשר טוב יותר.",
        },
      ],
      relatedLinks: [
        {
          label: "Shopify CRM",
          href: "/shopify-crm",
          description: "אינטגרציית Shopify ופרטי הודעות ל-e-commerce.",
        },
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "תיבת דואר omnichannel לשיחות קונים ותמיכה.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "תהליכים מוכנים למעקב וטיפוח.",
        },
        {
          label: "WhatsApp Business API",
          href: "/whatsapp-business-api",
          description: "Onboarding רשמי ל-API להודעות בקנה מידה.",
        },
      ],
      finalCtaHeadline: "הקלו על המרת כל שיחת קונה",
      finalCtaSubtitle:
        "התחילו בחינם, איחדו ערוצים וחברו Shopify כשמוכנים לאחד חנות והודעות יחד.",
      ssrBullets: [
        "Unified Inbox ל-WhatsApp, Instagram, Facebook, SMS, Email ו-web chat",
        "צ'אטבוטים ואוטומציות לשאלות קונים נפוצות",
        "סיוע AI Copilot לתגובות תמיכה ומכירות",
        "קמפיינים ומעקב לאנשי קשר קיימים",
        "חיבור Shopify לתהליכי הודעות מודעים לחנות",
      ],
    },
    "/solutions/local-service-businesses": {
      industryLabel: "עסקים מקומיים ושירותים",
      breadcrumbLabel: "עסקים מקומיים ושירותים",
      title: "CRM לעסקי שירות מקומיים | WhachatCRM",
      metaDescription:
        "CRM והודעות לעסקי שירות מקומיים. מצאו וסווגו לידים עם Prospect AI, לכדו בקשות שירות, הקצו עבודה, שתפו קישורי הזמנה ואוטומציית מעקב.",
      ogTitle: "CRM והודעות לעסקי שירות מקומיים | WhachatCRM",
      h1: "ממציאת לקוחות מקומיים להזמנת העבודה הבאה",
      heroIntro:
        "מיועד לקבלנים, ספקי שירותי בית, שירותים מקצועיים ועסקים מקומיים מבוססי פגישות שזוכים בעבודה דרך שיחות — לא רק טפסים.",
      heroVisual: {
        inquiryLabel: "בקשת שירות",
        inquiryMessage: "צריך תיקון מזגן ב-ZIP 33139 — אפשר מישהו השבוע?",
        suggestionLabel: "הצעת AI Copilot",
        suggestionMessage: "אשר אזור שירות ודחיפות, ואז שתף קישור הזמנה עם הטכנאי המתאים.",
        stageLabel: "ליד מוכן לעבודה",
        nextStep: "הבא: שליחת קישור הזמנה",
      },
      challengesHeading: "מה קשה לצוותי שירות מקומיים",
      secondaryCta: { label: "גלו Prospect AI", href: "/prospect-ai" },
      challenges: [
        {
          title: "קשה למצוא עבודה חדשה באופן עקבי",
          description: "הפניות עוזרות, אבל צוותים עדיין צריכים דרך חוזרת לגלות ולסווג הזדמנויות מקומיות.",
        },
        {
          title: "בקשות שירות מגיעות לא שלמות",
          description: "מתקשרים ולידים בצ'אט לעיתים מדלגים על מיקום, תזמון או פרטי עבודה לציטוט.",
        },
        {
          title: "האדם הלא נכון מחזיק בליד",
          description: "בלי הקצאה ונראות, עבודות חמות נשארות ללא מענה בעוד חבר צוות פנוי.",
        },
        {
          title: "לידים שקטים נעלמים",
          description: "לקוחות פוטנציאליים שביקשו הצעת מחיר בשבוע שעבר צריכים מעקב, לא שיחה שנשכחה.",
        },
      ],
      helpsIntro:
        "השתמשו ב-Prospect AI למציאת הזדמנויות, ואז ב-Unified Inbox, סיווג AI, קישורי הזמנה ואוטומציה — להפוך שיחות לעבודה מתוזמנת.",
      helpsPoints: [
        {
          title: "מצאו וסווגו לקוחות פוטנציאליים מקומיים",
          description: "Prospect AI עוזר לגלות עסקים לפי סוג ומיקום, ולסווג התאמה לפני outreach.",
        },
        {
          title: "לכדו בקשות שירות בצורה מסודרת",
          description: "צ'אטבוט באתר ותהליכי inbox אוספים מה הלקוח צריך ומתי.",
        },
        {
          title: "נתבו עבודה לבעלים הנכון",
          description: "הקצאות, תגיות, שלבים ודירוג שומרים את הצוות מסונכרן מי צריך להגיב.",
        },
        {
          title: "עקבו עד שהעבודה נקבעת",
          description: "שתפו קישורי Calendly או הזמנה, ואז אוטומציית תזכורות כשלקוח פוטנציאלי משתיק.",
        },
      ],
      workflowTitle: "מליד לעבודה שנקבעה",
      workflowSteps: [
        {
          label: "מציאה או קבלת ליד",
          description: "צ'אט נכנס, ווידג'ט באתר או outreach של Prospect AI מתחיל את השיחה.",
        },
        {
          label: "לכידת השירות המבוקש",
          description: "רשמו סוג עבודה, מיקום ותזמון בציר הזמן של איש הקשר.",
        },
        {
          label: "סיווג צורך והתאמה",
          description: "השתמשו ב-AI Brain, דירוג ושאלות סיווג לתעדוף הזדמנויות אמיתיות.",
        },
        {
          label: "הקצאת הליד",
          description: "נתבו את השיחה לחבר הצוות המתאים עם הערות ובעלות.",
        },
        {
          label: "שיתוף קישור הזמנה",
          description: "שלחו קישור Calendly או ייעוץ בלי לעזוב את השיחה.",
        },
        {
          label: "אוטומציית מעקב",
          description: "תזכורות, קמפיינים ותהליכים מטפחים עבודות עתידיות מאנשי קשר קודמים.",
        },
      ],
      products: [
        {
          label: "Prospect AI",
          description: "מצאו וסווגו עסקים מקומיים, ונהלו תגובות ב-CRM.",
          href: "/prospect-ai",
        },
        {
          label: "Unified Inbox",
          description: "שמרו כל שיחת שירות גלויה לצוות.",
          href: "/unified-inbox",
        },
        {
          label: "AI Brain & Copilot",
          description: "סווגו הזדמנויות וסייעו בתגובות בתוך שיחות חיות.",
          href: "/#ai-platform",
        },
        {
          label: "Lead scoring & stages",
          description: "תעדפו עבודות חמות עם תגיות, שלבים ואותות דירוג.",
          href: "/ai-lead-scoring",
        },
        {
          label: "Automations & Campaigns",
          description: "מעקב ללא תגובה וריאנגagement לאנשי קשר קודמים.",
          href: "/automation-templates",
        },
        {
          label: "Team Collaboration",
          description: "הקצאות והערות משותפות כדי שעבודות לא ייתקעו.",
          href: "/shared-team-inbox",
        },
      ],
      useCases: [
        {
          situation: "צריך pipeline קבוע של עסקים מקומיים למכירה.",
          action: "השתמשו ב-Prospect AI לגילוי, סיווג והתחלת outreach מותאם.",
          outcome: "פרוספקציה יוצאת הופכת לתהליך מנוהל בתוך WhachatCRM.",
        },
        {
          situation: "בעל בית מבקש הצעת מחיר באתר מחוץ לשעות.",
          action: "לכדו פרטי שירות עם צ'אטבוט באתר והשאירו את הליד ב-Unified Inbox.",
          outcome: "הצוות מתחיל למחרת עם בקשה מלאה במקום שיחה שלא נענתה.",
        },
        {
          situation: "שני טכנאים יכולים לקחת את אותה עבודה.",
          action: "הקצו את השיחה, השאירו הערות פנימיות ושמרו בעלים אחד.",
          outcome: "לקוחות מקבלים מסלול תגובה ברור אחד.",
        },
        {
          situation: "לקוח פוטנציאלי ביקש מחיר ואז השתיק.",
          action: "הפעילו מעקב אוטומטי תוך שמירה על שלב ותיעוד.",
          outcome: "יותר הצעות מחיר הופכות לייעוצים שנקבעו.",
        },
        {
          situation: "לקוחות קודמים עשויים להזדקק לעבודה עונתית או חוזרת.",
          action: "ריאנגage אנשי קשר מתויגים עם קמפיינים בזמן הנכון.",
          outcome: "הרשימה שלכם הופכת לערוץ הזדמנויות חוזר.",
        },
      ],
      channels: ["WhatsApp", "SMS", "Email", "Instagram", "Facebook Messenger", "Web chat"],
      integrations: [
        { label: "Calendly", href: "/#integrations" },
        { label: "Meta messaging", href: "/whatsapp-business-api" },
        { label: "Gmail / Google Workspace", href: "/#integrations" },
      ],
      howItWorks: [
        {
          title: "חברו ערוצים וצ'אט באתר",
          description: "הביאו הודעות נכנסות וווידג'ט אתר לתיבת דואר אחת.",
        },
        {
          title: "הוסיפו Prospect AI לצמיחה יוצאת",
          description: "גלו הזדמנויות מקומיות ושמרו תגובות לצד שיחות אחרות.",
        },
        {
          title: "הגדירו סיווג וניתוב",
          description: "השתמשו בתגיות, שלבים, דירוג והקצאות שמתאימים לאופן שבו הצוות קובע עבודה.",
        },
        {
          title: "אוטומציה ברגעי שקט",
          description: "עקבו אוטומטית כשלקוחות פוטנציאליים נתקעים בין הצעת מחיר להזמנה.",
        },
      ],
      relatedLinks: [
        {
          label: "Prospect AI",
          href: "/prospect-ai",
          description: "צוות מכירות AI למציאה וסיווג עסקים מקומיים.",
        },
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "הודעות משותפות לשיחות שירות.",
        },
        {
          label: "AI Lead Scoring",
          href: "/ai-lead-scoring",
          description: "תעדפו עבודות שדורשות תשומת לב עכשיו.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "תהליכי מעקב לטיפוח וריאנגagement.",
        },
      ],
      finalCtaHeadline: "קבעו יותר עבודות מקומיות מהשיחות שכבר יש לכם",
      finalCtaSubtitle:
        "התחילו בחינם, חברו ערוצים והוסיפו Prospect AI כשמוכנים לגדול pipeline יוצא.",
      ssrBullets: [
        "Prospect AI למציאה וסיווג הזדמנויות מקומיות",
        "צ'אטבוט באתר ו-Unified Inbox לבקשות שירות",
        "הקצאה, תגיות, שלבים ודירוג לידים",
        "קישורי הזמנה ו-Calendly בתוך שיחות",
        "מעקב אוטומטי וקמפייני ריאנגagement",
      ],
    },
    "/solutions/marketing-agencies": {
      industryLabel: "סוכנויות שיווק",
      breadcrumbLabel: "סוכנויות שיווק",
      title: "פלטפורמת WhatsApp והודעות לסוכנויות שיווק | WhachatCRM",
      metaDescription:
        "פלטפורמת הודעות לסוכנויות עם WhatsApp, inbox רב-ערוצי, צ'אטבוטים, אוטומציה, AI Copilot ומעורבות לקוחות. חיבור אינטגרציית CRM אופציונלי ו-Partner Program.",
      ogTitle: "הודעות ואוטומציית AI לסוכנויות | WhachatCRM",
      h1: "ספקו הודעות חכמות יותר ואוטומציית AI ללקוחות שלכם",
      heroIntro:
        "בין אם אתם מנהלים קמפיינים ללקוחות, תגובות קהילה או מרחיבים stack CRM קיים — WhachatCRM נותן לסוכנויות סביבת הודעות, אוטומציה ו-AI מעשית — עם או בלי אינטגרציית CRM.",
      heroVisual: {
        inquiryLabel: "תגובה לקמפיין לקוח",
        inquiryMessage: "ראיתי את המודעה — אפשר פרטים על ההצעה?",
        suggestionLabel: "הצעת AI Copilot",
        suggestionMessage: "סווג כוונת קמפיין, העבר לצוות הלקוח והפעל תהליך טיפוח.",
        stageLabel: "ליד קמפיין",
        nextStep: "הבא: ניתוב ל-inbox הלקוח",
      },
      challengesHeading: "מה קשה לצוותי סוכנות",
      secondaryCta: { label: "ראו Partner Program", href: "/partner-program" },
      challenges: [
        {
          title: "לקוחות מצפים ל-WhatsApp, לא רק למודעות",
          description: "תנועת קמפיין נכשלת כשאין נתיב הודעות רשמי מוכן לתגובות.",
        },
        {
          title: "כלים מפוזרים לכל לקוח",
          description: "Inboxes, צ'אטבוטים ומעקב חיים במקומות שונים — ואיכות המסירה משתנה.",
        },
        {
          title: "צוותי לקוח צריכים עזרה בתגובה",
          description: "גם אוטומציות טובות נכשלות אם בני אדם לא מסתדרים עם שיחות חיות במהירות.",
        },
        {
          title: "צמיחת הסוכנות דורשת הצעה חוזרת",
          description: "סוכנויות רוצות חבילת הודעות ו-AI ברורה שאפשר לספק שוב ושוב.",
        },
      ],
      helpsIntro:
        "השתמשו ב-WhachatCRM כשכבת הודעות ו-AI למעורבות לקוחות — וחברו אינטגרציית CRM או הצטרפו ל-Partner Program כשמתאים.",
      helpsPoints: [
        {
          title: "WhatsApp רשמי והודעות רב-ערוציות",
          description: "חברו ערוצי Meta ונהלו תגובות ב-Unified Inbox עם שיתוף פעולה בצוות.",
        },
        {
          title: "צ'אטבוטים ואוטומציה שהלקוחות מרגישים",
          description: "בנו תהליכי סיווג, מעקב וקמפיינים בלי להתחיל מאפס.",
        },
        {
          title: "AI שעוזר לצוותים מול לקוחות",
          description: "AI Copilot מסייע בתגובות; AI Brain תומך בהתאמה אישית ואסטרטגיה כשפעיל.",
        },
        {
          title: "מסלולי CRM ושותפים אופציונליים",
          description: "השתמשו בחיבור CRM Marketplace כשצריך, והרוויחו דרך Partner Program.",
        },
      ],
      workflowTitle: "מהגדרת ערוץ לקוח למעורבות מתמשכת",
      workflowSteps: [
        {
          label: "חיבור ערוצי לקוח",
          description: "הגדירו WhatsApp רשמי והודעות חברתיות נתמכות למותג.",
        },
        {
          label: "בניית צ'אטבוט ותהליכים",
          description: "צרו תהליכי תגובה ראשונה וסיווג לקמפיינים או תמיכה.",
        },
        {
          label: "ריכוז שיחות",
          description: "הביאו תגובות ל-Unified Inbox עם בעלות והערות.",
        },
        {
          label: "סיוע לצוותים עם AI Copilot",
          description: "עזרו לצוות מול לקוח להגיב מהר יותר עם הקשר וטיוטות.",
        },
        {
          label: "אוטומציית מעקב",
          description: "השתמשו בתהליכים וקמפיינים כדי להמשיך לידים אחרי המגע הראשון.",
        },
        {
          label: "שיפור מעורבות לאורך זמן",
          description: "שפרו הודעות, ניתוב וסיוע AI לפי נפח שיחות אמיתי.",
        },
      ],
      products: [
        {
          label: "WhatsApp Business API",
          description: "נתיב Meta Embedded Signup רשמי לגישת WhatsApp של לקוח.",
          href: "/whatsapp-business-api",
        },
        {
          label: "Unified Inbox",
          description: "שיחות רב-ערוציות משותפות לצוותי לקוח.",
          href: "/unified-inbox",
        },
        {
          label: "Chatbots & Automations",
          description: "תהליכי סיווג ומעקב לקמפיינים.",
          href: "/automation-templates",
        },
        {
          label: "AI Copilot & AI Brain",
          description: "סיוע בתגובות והתאמת צעדים הבאים כשפעיל.",
          href: "/#ai-platform",
        },
        {
          label: "Team Collaboration",
          description: "הקצאות והערות למפעילי סוכנות או לקוח.",
          href: "/shared-team-inbox",
        },
        {
          label: "אינטגרציית CRM לסוכנויות",
          description: "פרטי אינטגרציה מכוונים Marketplace לסוכנויות שמשתמשות ב-CRM.",
          href: "/go-high-level-agencies",
        },
        {
          label: "Partner Program",
          description: "צמחו עם WhachatCRM והרוויחו עמלות שותפים חוזרות כשזכאים.",
          href: "/partner-program",
        },
      ],
      useCases: [
        {
          situation: "לקוח צריך נוכחות WhatsApp רשמית לתגובות קמפיין.",
          action: "חברו WhatsApp Business API ונתבו שיחות ל-Unified Inbox.",
          outcome: "תנועת מודעות יש לה לאן לנחות ולקבל מענה תקין.",
        },
        {
          situation: "השקה דורשת סיווג צ'אטבוט לפני העברה לאדם.",
          action: "בנו צ'אטבוט ותהליכי אוטומציה שלוכדים כוונה ומדרגים לידים.",
          outcome: "צוות הלקוח מבלה זמן רק על שיחות מסווגות.",
        },
        {
          situation: "צוות לקוח לא מספיק לעמוד ב-DMs.",
          action: "הפעילו AI Copilot, הקצאות והערות משותפות בתיבת דואר אחת.",
          outcome: "איכות תגובה נשמרת גם כשהנפח עולה.",
        },
        {
          situation: "הסוכנות כבר פועלת בתוך פלטפורמת CRM.",
          action: "השתמשו ב-WhachatCRM כשכבת הודעות ו-AI לצד אינטגרציית CRM כשמחובר.",
          outcome: "לקוחות מקבלים טיפול שיחות חזק יותר בלי להחליף את כל ה-stack.",
        },
        {
          situation: "רוצים למונטיזציה של המלצות WhachatCRM.",
          action: "הצטרפו ל-Partner Program והפנו עסקים שצריכים הודעות ו-AI CRM.",
          outcome: "צמיחת הסוכנות כוללת upside שותפים חוזר כשהתוכנית תומכת.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
      integrations: [
        { label: "CRM Marketplace", href: "/go-high-level-agencies" },
        { label: "Meta Embedded Signup", href: "/whatsapp-business-api" },
        { label: "Partner Program", href: "/partner-program" },
      ],
      howItWorks: [
        {
          title: "בחרו מודל מסירה ללקוח",
          description: "השתמשו ב-WhachatCRM standalone, עם אינטגרציית CRM או כחלק מהצעת partner.",
        },
        {
          title: "חברו ערוצים ובנו תהליכים",
          description: "הקימו WhatsApp, ניתוב inbox, צ'אטבוטים ואוטומציות למותג.",
        },
        {
          title: "הפעילו AI למפעילים",
          description: "תנו לצוותי לקוח סיוע Copilot לתגובות חיות מהירות ועקביות.",
        },
        {
          title: "ארזו וחזרו על זה",
          description: "הפכו את אותו playbook הודעות ו-AI לשירות סוכנות חוזר.",
        },
      ],
      relatedLinks: [
        {
          label: "נתיב CRM לסוכנויות",
          href: "/go-high-level-agencies",
          description: "איך WhachatCRM מרחיב אינטגרציית CRM עם הודעות ו-AI.",
        },
        {
          label: "Partner Program",
          href: "/partner-program",
          description: "שתפו פעולה עם WhachatCRM וצמחו הכנסות חוזרות.",
        },
        {
          label: "WhatsApp Business API",
          href: "/whatsapp-business-api",
          description: "Onboarding API רשמי לגישת WhatsApp של לקוח.",
        },
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Inbox omnichannel משותף לשיחות לקוח.",
        },
      ],
      finalCtaHeadline: "תנו ללקוחות שכבת הודעות ו-AI חזקה יותר",
      finalCtaSubtitle:
        "התחילו בחינם, ארזו WhachatCRM למסירה ללקוחות, וחקור אינטגרציית CRM או Partner Program כשמתאים.",
      ssrBullets: [
        "WhatsApp API רשמי והודעות רב-ערוציות",
        "Unified Inbox עם שיתוף פעולה בצוות למפעילי לקוח",
        "צ'אטבוטים, אוטומציות וקמפיינים למעורבות",
        "סיוע AI Copilot ו-AI Brain כשפעיל",
        "חיבור אינטגרציית CRM אופציונלי ו-Partner Program",
      ],
    },
    "/solutions/med-spas": {
      industryLabel: "Med spas ובריאות",
      breadcrumbLabel: "Med spas ובריאות",
      title: "CRM ל-med spas ועסקי בריאות | WhachatCRM",
      metaDescription:
        "CRM והודעות ל-med spas ועסקי בריאות. לכדו פניות טיפול מ-WhatsApp ו-Instagram, סווגו ייעוצים, הקצו צוות ואוטומציית מעקב.",
      ogTitle: "CRM הודעות ומעקב לידים ל-med spas | WhachatCRM",
      h1: "המירו יותר פניות med spa לייעוצים שנקבעו",
      heroIntro:
        "WhachatCRM עוזר ל-med spas ועסקי בריאות לענות על שאלות טיפול, לסווג עניין בייעוץ, להקצות את חבר הצוות הנכון ולעקוב עד שהביקור נקבע — בלי להפוך את ההודעות למערכת רפואית.",
      heroVisual: {
        inquiryLabel: "פניית טיפול",
        inquiryMessage: "מעוניינת בייעוץ להסרת שיער בלייזר — מעדיפה ערב.",
        suggestionLabel: "הצעת AI Copilot",
        suggestionMessage: "אשר עניין בטיפול, לכדו תזמון ושתף קישור הזמנת ייעוץ.",
        stageLabel: "מוכנה לייעוץ",
        nextStep: "הבא: קביעת ייעוץ",
      },
      challengesHeading: "מה קשה לצוותי med spa ובריאות",
      secondaryCta: { label: "ראו Unified Inbox", href: "/unified-inbox" },
      challenges: [
        {
          title: "שאלות טיפול מגיעות ברשתות",
          description: "פניות ב-Instagram ו-WhatsApp על טיפולים דורשות תגובות מהירות וזהירות.",
        },
        {
          title: "עניין מחוץ לשעות מתקרר",
          description: "לקוחות פוטנציאליים שעוברים על טיפולים בלילה לעיתים לא מגיעים לטופס הזמנה.",
        },
        {
          title: "לא כל פנייה מוכנה להזמנה",
          description: "צוותים צריכים לסווג עניין בשירות לפני שמקדישים זמן ייעוץ.",
        },
        {
          title: "מעקב לא עקבי",
          description: "לידים ששאלו על ייעוץ בשבוע שעבר צריכים טיפוח מובנה, לא DM שנשכח.",
        },
      ],
      helpsIntro:
        "השתמשו בהודעות, סיווג, סיוע AI ואוטומציה — כדי להוביל פניות אסתטיקה ובריאות לייעוצים שנקבעו.",
      helpsPoints: [
        {
          title: "פגשו לקוחות פוטנציאליים בערוצים שהם משתמשים",
          description: "WhatsApp, Instagram, Facebook ו-web chat מזינים Unified Inbox אחד.",
        },
        {
          title: "סווגו את הייעוץ שהם רוצים",
          description: "לכדו עניין בטיפול, תזמון ומוכנות לצעד הבא עם שאלות מובנות.",
        },
        {
          title: "עזרו לצוות להגיב בביטחון",
          description: "AI Copilot מסייע בתוך השיחה; AI Brain תומך בהתאמה אישית כשפעיל.",
        },
        {
          title: "קבעו וטפחו בלי לחרוג לתחום הרפואי",
          description: "שתפו קישורי הזמנה או Calendly, הקצו בעלים ואוטומציית מעקב — לא תיקים רפואיים.",
        },
      ],
      workflowTitle: "מפניית טיפול לייעוץ שנקבע",
      workflowSteps: [
        {
          label: "פניית טיפול חדשה",
          description: "לקוח פוטנציאלי שואל על שירות ב-Instagram, WhatsApp או באתר.",
        },
        {
          label: "זיהוי עניין בשירות",
          description: "לכדו איזה טיפול או ייעוץ הם שואלים עליו.",
        },
        {
          label: "מענה לשאלות ראשונות",
          description: "צ'אטבוט או צוות עונים עם מידע ברור על הצעד הבא — לא ייעוץ רפואי.",
        },
        {
          label: "סיווג ההזדמנות",
          description: "השתמשו בדירוג, תגיות וסיוע AI לתעדוף ייעוצים מוכנים.",
        },
        {
          label: "הקצאה ושיתוף הזמנה",
          description: "נתבו לחבר הצוות המתאים ושלחו קישור הזמנת ייעוץ.",
        },
        {
          label: "אוטומציית מעקב",
          description: "הזכירו לידים שקטים וטפחו שירותים עתידיים עם קמפיינים כשמתאים.",
        },
      ],
      products: [
        {
          label: "Unified Inbox",
          description: "רכזו שיחות טיפול וייעוץ לצוות הקבלה.",
          href: "/unified-inbox",
        },
        {
          label: "Chatbots",
          description: "לכדו עניין מחוץ לשעות וכוונת שירות לפני העברה לאדם.",
          href: "/whatsapp-business-api#inbox-automation",
        },
        {
          label: "AI Copilot",
          description: "עזרו לצוות להגיב מהר יותר עם הקשר שיחה וטיוטות.",
          href: "/#ai-copilot",
        },
        {
          label: "AI Brain",
          description: "תמיכה בסיווג ומעקב מותאם כשפעיל.",
          href: "/#ai-brain",
        },
        {
          label: "Lead scoring & stages",
          description: "תעדפו פניות מוכנות לייעוץ עם תגיות ודירוג.",
          href: "/ai-lead-scoring",
        },
        {
          label: "Automations & Campaigns",
          description:
            "עקבו אחרי פניות שלא הזמינו או הפסיקו להגיב — וריאנגage אנשי קשר קודמים בזהירות.",
          href: "/automation-templates",
        },
        {
          label: "Team Collaboration",
          description: "הקצו שיחות כדי שבקשות ייעוץ יקבלו בעלים ברור.",
          href: "/shared-team-inbox",
        },
      ],
      useCases: [
        {
          situation: "מישהו שולח DM באינסטגרם על טיפול פופולרי.",
          action: "הביאו את השיחה ל-Unified Inbox ולכדו איזה שירות הם רוצים.",
          outcome: "הקבלה מגיבה עם מסלול ייעוץ ברור במקום לאבד את ה-DM.",
        },
        {
          situation: "מבקרים באתר עוברים על טיפולים אחרי סגירה.",
          action: "השתמשו בצ'אטבוט באתר ללכידת עניין ופרטי קשר.",
          outcome: "צוות הבוקר מתחיל עם פניות מסווגות מוכנות להזמנה.",
        },
        {
          situation: "לקוח פוטנציאלי מעוניין אבל לא מוכן לקבוע.",
          action: "תייגו את הליד, דרגו מוכנות והרשמו למעקב עדין אוטומטי.",
          outcome: "העסק נשאר בראש בלי רדיפה ידנית.",
        },
        {
          situation: "מספר מתאמים מטפלים בבקשות ייעוץ.",
          action: "הקצו בעלות ושמרו הערות על כל שיחה.",
          outcome: "פחות תגובות כפולות ופחות הזדמנויות הזמנה שנופלות.",
        },
        {
          situation: "ייעוצים קודמים עשויים להיות מוכנים לשירות קשור.",
          action: "ריאנגage אנשי קשר מתאימים עם קמפיינים כשההצעה רלוונטית.",
          outcome: "ההודעות תומכות בקשרי בריאות מתמשכים — בזהירות ובכוונה.",
        },
      ],
      channels: ["WhatsApp", "Instagram", "Facebook Messenger", "SMS", "Email", "Web chat"],
      integrations: [
        { label: "Calendly", href: "/#integrations" },
        { label: "Meta messaging", href: "/whatsapp-business-api" },
        { label: "Gmail / Google Workspace", href: "/#integrations" },
      ],
      howItWorks: [
        {
          title: "חברו ערוצים חברתיים ו-WhatsApp",
          description: "הביאו פניות Instagram, Facebook ו-WhatsApp ל-inbox אחד.",
        },
        {
          title: "הוסיפו צ'אט באתר לעניין מחוץ לשעות",
          description: "לכדו שאלות טיפול כשהקבלה offline.",
        },
        {
          title: "הגדירו סיווג ייעוץ",
          description: "השתמשו בתגיות, שלבים ושאלות שמתאימים לאופן שבו העסק קובע ביקורים.",
        },
        {
          title: "אוטומציה לפער המעקב",
          description: "עקבו אחרי פניות שלא הזמינו או הפסיקו להגיב — בלי טענות רפואיות בהודעות.",
        },
      ],
      relatedLinks: [
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Inbox משותף לשיחות טיפול וייעוץ.",
        },
        {
          label: "AI Lead Scoring",
          href: "/ai-lead-scoring",
          description: "תעדפו פניות מוכנות לייעוץ.",
        },
        {
          label: "Automation Templates",
          href: "/automation-templates",
          description: "תהליכי מעקב לטיפוח וריאנגagement.",
        },
        {
          label: "WhatsApp Business API",
          href: "/whatsapp-business-api",
          description: "Onboarding WhatsApp רשמי להודעות עסקיות.",
        },
      ],
      finalCtaHeadline: "קבעו יותר ייעוצים מהפניות שכבר מקבלים",
      finalCtaSubtitle:
        "התחילו בחינם, איחדו ערוצים ושימו מעקב מסייע AI מאחורי כל שיחת טיפול.",
      ssrBullets: [
        "Unified Inbox לפניות WhatsApp, Instagram ו-Facebook",
        "לכידת צ'אטבוט באתר לעניין מחוץ לשעות",
        "סיווג, תיוג, דירוג והקצאת צוות",
        "קישורי הזמנה ו-Calendly לייעוצים",
        "מעקב אוטומטי וקמפייני ריאנגagement זהירים",
      ],
    },
  } as Record<string, Partial<SolutionPageContent>>,
} as const;
