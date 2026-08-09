/**
 * Localized product page overlays (es / he).
 * English remains authoritative in productPages.ts; hrefs and branded labels stay fixed.
 */

import type { ProductPageContent } from "./productPages";

export const PRODUCT_PAGE_LOCALES = {
  es: {
  "/ai-brain": {
    "productLabel": "AI Brain",
    "breadcrumbLabel": "AI Brain",
    "title": "AI Brain para conocimiento empresarial e inteligencia CRM | WhachatCRM",
    "metaDescription": "WhachatCRM AI Brain es la capa de inteligencia de conocimiento empresarial para tu CRM. Enseña tu perfil, analiza fuentes de conocimiento, revisa conflictos, publica inteligencia aprobada y potencia Copilot, Prospect AI y Campañas.",
    "ogTitle": "AI Brain — Inteligencia de conocimiento empresarial | WhachatCRM",
    "h1": "IA que entiende cómo funciona tu negocio",
    "heroIntro": "La IA genérica puede escribir una respuesta. AI Brain entiende tu negocio, tus objetivos, qué preguntar y qué debe ocurrir después — y luego distribuye esa inteligencia aprobada en WhachatCRM.",
    "secondaryCta": {
      "label": "Ver AI Copilot",
      "href": "/ai-copilot"
    },
    "heroVisual": {
      "inquiryLabel": "Conocimiento empresarial",
      "inquiryMessage": "Servicios, políticas y clientes ideales conectados para revisión.",
      "suggestionLabel": "Hallazgo de AI Brain",
      "suggestionMessage": "Conflicto detectado entre dos páginas de conocimiento — revisa antes de publicar.",
      "stageLabel": "Listo para publicar",
      "nextStep": "Siguiente: aprobar inteligencia"
    },
    "screenshotKey": "aiWorkspace",
    "screenshotAlt": "Espacio de trabajo de IA de WhachatCRM que explica AI Assist y la capa premium de inteligencia AI Brain",
    "visualSections": [
      {
        "title": "Analiza el conocimiento página por página",
        "description": "La IA lee cada página conectada por separado y redacta lo encontrado. Nada llega a tus respuestas hasta que revises y publiques inteligencia aprobada.",
        "screenshotKey": "aiBrainAnalyze",
        "screenshotAlt": "Panel Analyze de AI Brain mostrando páginas escaneadas con recuentos de hechos nuevos y modificados"
      },
      {
        "title": "Define qué debe preguntar la IA",
        "description": "Genera, edita y gestiona preguntas de calificación desde el contexto de tu negocio para que Copilot y las conversaciones pidan los detalles correctos.",
        "screenshotKey": "aiBrainQuestions",
        "screenshotAlt": "Panel de preguntas al cliente de AI Brain con campos de calificación obligatorios y opcionales"
      }
    ],
    "problemTitle": "Por qué la IA genérica se queda corta para equipos de ventas",
    "problems": [
      {
        "title": "Respuestas sin contexto empresarial",
        "description": "La IA basada solo en prompts inventa tono y ofertas que no coinciden con cómo vende realmente tu empresa."
      },
      {
        "title": "El conocimiento está disperso",
        "description": "Sitios web, documentos y notas entran en conflicto — y nadie revisa lo que la IA puede usar."
      },
      {
        "title": "La calificación es inconsistente",
        "description": "Cada compañero hace preguntas distintas, así que la calidad del pipeline depende de quién respondió primero."
      },
      {
        "title": "Las campañas suenan genéricas",
        "description": "El alcance que ignora tus servicios y clientes ideales desperdicia conversaciones."
      }
    ],
    "howIntro": "AI Brain analiza el conocimiento de tu negocio, identifica cambios o conflictos y te permite controlar qué se convierte en inteligencia aprobada.",
    "howPoints": [
      {
        "title": "Enseña a la IA sobre el negocio",
        "description": "Captura tu perfil empresarial, sector, servicios e instrucciones que la IA debe seguir."
      },
      {
        "title": "Conecta y analiza conocimiento",
        "description": "Añade páginas o fuentes de conocimiento y analiza cambios, duplicados y posibles conflictos."
      },
      {
        "title": "Revisa y publica",
        "description": "Tú decides qué se convierte en inteligencia aprobada antes de que impulse otras funciones de IA."
      },
      {
        "title": "Úsalo en toda la plataforma",
        "description": "El contexto aprobado ayuda a Prospect AI, AI Copilot, la calificación y la personalización de campañas donde esté habilitado."
      }
    ],
    "comparison": {
      "leftTitle": "IA genérica",
      "leftItems": [
        "Funciona principalmente a partir del prompt actual",
        "A menudo produce respuestas genéricas",
        "Tiene conocimiento limitado de la empresa",
        "Principalmente genera contenido",
        "Puede usar información incompleta o conflictiva",
        "No define la estrategia de calificación de la empresa"
      ],
      "rightTitle": "WhachatCRM AI Brain",
      "rightItems": [
        "Usa el perfil empresarial y el contexto del sector de la empresa",
        "Entiende productos, servicios y conocimiento empresarial aprobados",
        "Analiza páginas de conocimiento conectadas",
        "Identifica duplicados, cambios y posibles conflictos",
        "Permite revisar y publicar conocimiento aprobado",
        "Admite preguntas de calificación y contexto de cliente ideal",
        "Personaliza campañas y estrategia donde esté habilitado",
        "Suministra inteligencia a Prospect AI y AI Copilot"
      ]
    },
    "featuresTitle": "Qué cubre AI Brain",
    "features": [
      {
        "label": "Perfil empresarial",
        "description": "Nombre de la empresa, sector, servicios, productos, detalles de reservas e instrucciones personalizadas."
      },
      {
        "label": "Análisis de conocimiento",
        "description": "Analiza páginas conectadas, detecta cambios y retiene hechos disputados hasta resolverlos."
      },
      {
        "label": "Revisar y publicar",
        "description": "Publicación controlada para que la IA solo use inteligencia que apruebes."
      },
      {
        "label": "Preguntas de calificación",
        "description": "Define qué debe preguntar el equipo y la IA para calificar oportunidades."
      },
      {
        "label": "Modos: Off / Suggest / Auto",
        "description": "Elige cuánto asiste la IA en funciones elegibles, según tu plan y configuración."
      },
      {
        "label": "Inteligencia de plataforma",
        "description": "Capa opcional que profundiza Copilot y Prospect AI con contexto empresarial."
      }
    ],
    "workflowTitle": "De enseñar a inteligencia aprobada",
    "workflowSteps": [
      {
        "label": "Enseñar a la IA",
        "description": "Añade tu perfil empresarial, servicios y contexto operativo."
      },
      {
        "label": "Analizar conocimiento",
        "description": "Conecta fuentes y ejecuta análisis de actualizaciones y conflictos."
      },
      {
        "label": "Revisar hallazgos",
        "description": "Inspecciona duplicados, cambios y hechos disputados."
      },
      {
        "label": "Publicar inteligencia aprobada",
        "description": "Libera solo lo que tu equipo acepta como contexto confiable."
      },
      {
        "label": "Impulsar calificación",
        "description": "Guía preguntas y puntuación con reglas empresariales aprobadas."
      },
      {
        "label": "Impulsar Copilot y campañas",
        "description": "Mantén respuestas y personalización alineadas con tu negocio."
      }
    ],
    "useCases": [
      {
        "situation": "Necesitas que la IA refleje tus servicios y políticas reales.",
        "action": "Enseña el perfil empresarial y publica conocimiento aprobado.",
        "outcome": "Las sugerencias se mantienen ancladas en cómo operas realmente."
      },
      {
        "situation": "El texto del sitio web cambió y podría confundir las respuestas de la IA.",
        "action": "Vuelve a analizar el conocimiento, revisa conflictos y publica con cuidado.",
        "outcome": "Las afirmaciones obsoletas no se convierten en silencio en orientación de IA."
      },
      {
        "situation": "Una campaña de Prospect AI necesita personalización más precisa.",
        "action": "Usa contexto aprobado de Brain al personalizar el alcance.",
        "outcome": "Los mensajes suenan más cerca de tu oferta y clientes ideales."
      },
      {
        "situation": "Los agentes necesitan mejores recomendaciones del siguiente paso en el chat.",
        "action": "Habilita contexto de Copilot impulsado por Brain donde corresponda.",
        "outcome": "La asistencia en conversaciones refleja tu estrategia de calificación."
      },
      {
        "situation": "Los equipos hacen preguntas de calificación distintas por costumbre.",
        "action": "Define preguntas de calificación una vez en AI Brain.",
        "outcome": "La calificación se vuelve consistente en canales y personas."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "Usa inteligencia de Brain dentro de conversaciones en vivo."
      },
      {
        "label": "Prospect AI",
        "href": "/prospect-ai",
        "description": "Encuentra y califica prospectos; Brain profundiza la personalización."
      },
      {
        "label": "Campañas",
        "href": "/campaigns",
        "description": "Alcance personalizado guiado por contexto empresarial aprobado."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "Donde Copilot informado por Brain asiste las respuestas."
      }
    ],
    "industryLinks": [
      {
        "label": "Bienes raíces",
        "href": "/real-estate-crm"
      },
      {
        "label": "Negocios locales y de servicios",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "Med spas y bienestar",
        "href": "/solutions/med-spas"
      }
    ],
    "howItWorks": [
      {
        "title": "Abre AI Brain en tu espacio de trabajo",
        "description": "Comienza desde el perfil empresarial y los pasos de conocimiento."
      },
      {
        "title": "Añade fuentes y analiza",
        "description": "Conecta páginas, ejecuta análisis e inspecciona hallazgos."
      },
      {
        "title": "Publica lo que confías",
        "description": "Aprueba inteligencia antes de que influya en otras funciones de IA."
      },
      {
        "title": "Habilita productos de IA relacionados",
        "description": "Usa Copilot, Prospect AI y Campañas con contexto más profundo donde corresponda."
      }
    ],
    "finalCtaHeadline": "Dale a tu IA un cerebro empresarial que tú controlas",
    "finalCtaSubtitle": "Empieza gratis, enseña a WhachatCRM cómo trabajas y publica inteligencia aprobada para Copilot, Prospect AI y Campañas.",
    "ssrBullets": [
      "Perfil empresarial, sector, servicios e instrucciones",
      "Análisis de conocimiento con revisión de cambios, duplicados y conflictos",
      "Publicación controlada por el usuario de inteligencia aprobada",
      "Preguntas de calificación y contexto de IA de plataforma",
      "Impulsa Copilot, Prospect AI y personalización de campañas donde esté habilitado"
    ]
  },
  "/ai-copilot": {
    "productLabel": "AI Copilot",
    "breadcrumbLabel": "AI Copilot",
    "title": "AI Copilot para conversaciones CRM | WhachatCRM",
    "metaDescription": "WhachatCRM AI Copilot ayuda a los equipos a saber qué decir y qué hacer a continuación dentro de las conversaciones con clientes — con puntuación de leads, respuestas sugeridas y recomendaciones de siguiente acción impulsadas por el contexto de conversación y negocio.",
    "ogTitle": "AI Copilot — Sabe qué decir a continuación | WhachatCRM",
    "h1": "Sabe qué decir y qué hacer a continuación",
    "heroIntro": "AI Copilot es el asistente de conversación que funciona dentro de Unified Inbox. Usa el contexto de la conversación — y AI Brain cuando está habilitado — para ayudar a tu equipo a entender la oportunidad y avanzarla.",
    "secondaryCta": {
      "label": "Explorar AI Brain",
      "href": "/ai-brain"
    },
    "heroVisual": {
      "inquiryLabel": "Conversación en vivo",
      "inquiryMessage": "Interesado en una consulta esta semana — ¿cuál es el siguiente paso?",
      "suggestionLabel": "Recomendación de Copilot",
      "suggestionMessage": "Puntuación de lead 82 — califica el plazo, luego comparte el enlace de reserva.",
      "stageLabel": "Alta intención",
      "nextStep": "Siguiente: respuesta sugerida lista"
    },
    "screenshotKey": "aiCopilot",
    "screenshotAlt": "Panel de AI Copilot mostrando asistencia en conversaciones e insights de leads en WhachatCRM",
    "visualSections": [
      {
        "title": "Puntuación de leads junto al hilo",
        "description": "Las puntuaciones y explicaciones ayudan a los equipos a entender por qué una conversación parece lista — sin salir de Unified Inbox.",
        "screenshotKey": "leadScore",
        "screenshotAlt": "Tarjeta de puntuación de lead de AI Copilot con factores de calificación"
      }
    ],
    "problemTitle": "Qué frena a los equipos en el inbox",
    "problems": [
      {
        "title": "El contexto está enterrado en el hilo",
        "description": "Los agentes releen chats largos antes de decidir qué importa."
      },
      {
        "title": "La calidad del lead no está clara",
        "description": "Sin puntuación y explicaciones, las oportunidades calientes parecen cualquier otro mensaje."
      },
      {
        "title": "Los siguientes pasos varían según la persona",
        "description": "Algunos compañeros reservan, otros se detienen, y la calidad del seguimiento se vuelve inconsistente."
      },
      {
        "title": "Las respuestas tardan demasiado en redactarse",
        "description": "Incluso respuestas simples compiten con el resto de la cola del día."
      }
    ],
    "howIntro": "AI Brain es la capa de inteligencia de la plataforma. AI Copilot es el asistente que usa esa inteligencia — más la conversación en vivo — dentro de los chats con clientes.",
    "howPoints": [
      {
        "title": "Analizar contexto de conversación",
        "description": "Copilot lee el hilo y las señales del contacto para resumir lo que está ocurriendo."
      },
      {
        "title": "Puntuar y explicar el lead",
        "description": "La puntuación de leads y las explicaciones ayudan a los equipos a priorizar las conversaciones correctas."
      },
      {
        "title": "Recomendar la siguiente acción",
        "description": "Las sugerencias pueden incluir rutas como asignar, reservar, calificar, nutrir o hacer seguimiento — según capacidad y contexto."
      },
      {
        "title": "Redactar con control humano",
        "description": "Las respuestas sugeridas ayudan a los agentes a avanzar más rápido. El modo Auto solo está disponible cuando está habilitado y autorizado — no reemplaza el criterio por defecto."
      }
    ],
    "featuresTitle": "Capacidades verificadas de Copilot",
    "features": [
      {
        "label": "Análisis de conversación",
        "description": "Asistencia consciente del contexto dentro de hilos de Unified Inbox.",
        "href": "/unified-inbox"
      },
      {
        "label": "Puntuación de leads",
        "description": "Puntuaciones con explicaciones para que los equipos entiendan por qué un lead parece listo.",
        "href": "/ai-lead-scoring"
      },
      {
        "label": "Respuestas sugeridas",
        "description": "Asistencia de borrador para respuestas más rápidas y consistentes."
      },
      {
        "label": "Recomendaciones de siguiente acción",
        "description": "Orientación como calificar, reservar, asignar, nutrir o hacer seguimiento cuando el contexto lo admite."
      },
      {
        "label": "Contexto de AI Brain",
        "description": "Recomendaciones más profundas conscientes del negocio cuando la inteligencia de Brain está habilitada.",
        "href": "/ai-brain"
      },
      {
        "label": "Modos Suggest y Auto",
        "description": "Elige redacción asistida o Auto donde tu plan y configuración lo permitan."
      }
    ],
    "workflowTitle": "Del mensaje a la siguiente acción recomendada",
    "workflowSteps": [
      {
        "label": "Llega la conversación",
        "description": "Un mensaje de cliente aterriza en Unified Inbox."
      },
      {
        "label": "Análisis de contexto",
        "description": "Copilot revisa el hilo y las señales del contacto."
      },
      {
        "label": "Puntuación de lead",
        "description": "La puntuación destaca urgencia e idoneidad con explicaciones."
      },
      {
        "label": "Recomendación",
        "description": "Las siguientes acciones sugeridas ayudan al compañero a decidir."
      },
      {
        "label": "Respuesta sugerida",
        "description": "El borrador está listo para revisión o edición."
      },
      {
        "label": "Acción del equipo",
        "description": "Un humano asigna, reserva, califica o continúa la conversación."
      }
    ],
    "useCases": [
      {
        "situation": "Llega una nueva consulta fuera de horario.",
        "action": "Revisa el resumen, puntuación y respuesta sugerida de Copilot por la mañana.",
        "outcome": "La primera respuesta humana parte del contexto en lugar de una lectura en frío."
      },
      {
        "situation": "Un lead parece listo pero el agente no está seguro.",
        "action": "Usa explicaciones de puntuación y orientación de siguiente acción para elegir reservar vs nutrir.",
        "outcome": "Los chats de alta intención avanzan hacia una reserva o seguimiento claro."
      },
      {
        "situation": "Un equipo de servicio necesita respuestas consistentes.",
        "action": "Confía en sugerencias informadas por Brain manteniendo a los humanos al control.",
        "outcome": "Las respuestas se mantienen alineadas con la marca sin forzar guiones idénticos."
      },
      {
        "situation": "Un agente necesita agendar una visita o consulta.",
        "action": "Sigue la recomendación orientada a reservas de Copilot cuando el hilo lo admite.",
        "outcome": "La conversación avanza a un siguiente paso concreto."
      },
      {
        "situation": "Un consejo específico del sector sería irrelevante.",
        "action": "Copilot se mantiene acotado a la conversación y al contexto empresarial elegible.",
        "outcome": "Los equipos evitan recomendaciones desajustadas que no encajan con la oportunidad."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Brain",
        "href": "/ai-brain",
        "description": "Suministra inteligencia empresarial aprobada."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "Donde Copilot asiste respuestas en vivo."
      },
      {
        "label": "Puntuación de leads con IA",
        "href": "/ai-lead-scoring",
        "description": "Visión general más profunda de puntuación."
      },
      {
        "label": "Colaboración en equipo",
        "href": "/shared-team-inbox",
        "description": "Asigna y comparte propiedad."
      }
    ],
    "industryLinks": [
      {
        "label": "Bienes raíces",
        "href": "/real-estate-crm"
      },
      {
        "label": "E-commerce",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "Med spas y bienestar",
        "href": "/solutions/med-spas"
      }
    ],
    "howItWorks": [
      {
        "title": "Conecta canales y abre Unified Inbox",
        "description": "Copilot asiste donde ya viven las conversaciones."
      },
      {
        "title": "Habilita asistencia de IA para tu plan",
        "description": "Usa Suggest o Auto según autorización y configuración."
      },
      {
        "title": "Añade AI Brain para contexto más profundo",
        "description": "Publica conocimiento empresarial aprobado cuando quieras recomendaciones más ricas."
      },
      {
        "title": "Mantén a los humanos al control",
        "description": "Revisa puntuaciones, recomendaciones y borradores antes de actuar."
      }
    ],
    "finalCtaHeadline": "Ayuda a cada compañero a responder con confianza",
    "finalCtaSubtitle": "Empieza gratis, abre Unified Inbox y deja que AI Copilot guíe qué decir y qué hacer a continuación.",
    "ssrBullets": [
      "Asistencia con contexto de conversación dentro de Unified Inbox",
      "Puntuación de leads con explicaciones",
      "Respuestas sugeridas y recomendaciones de siguiente acción",
      "Contexto empresarial opcional de AI Brain",
      "Modos Suggest y Auto cuando están habilitados y autorizados"
    ]
  },
  "/chatbot-builder": {
    "productLabel": "Chatbot Builder",
    "breadcrumbLabel": "Chatbot Builder",
    "title": "Chatbot Builder visual para recorridos de clientes | WhachatCRM",
    "metaDescription": "Crea recorridos de chatbot sin código en WhachatCRM. Crea flujos de mensajes y preguntas, captura entradas, etiqueta contactos, asigna compañeros y transfiere el trabajo a Unified Inbox en canales compatibles.",
    "ogTitle": "Chatbot Builder — Recorridos visuales de clientes | WhachatCRM",
    "h1": "Crea recorridos de clientes sin escribir código",
    "heroIntro": "Chatbot Builder te ayuda a diseñar flujos conversacionales que dan la bienvenida a clientes, capturan lo que necesitan, califican interés y enrutan el trabajo al compañero correcto — y luego continúan en Unified Inbox.",
    "secondaryCta": {
      "label": "Ver Unified Inbox",
      "href": "/unified-inbox"
    },
    "heroVisual": {
      "inquiryLabel": "Paso del flujo",
      "inquiryMessage": "¿Qué servicio buscas hoy?",
      "suggestionLabel": "Acción",
      "suggestionMessage": "Añadir etiqueta → continuar la conversación en Unified Inbox.",
      "stageLabel": "Calificado",
      "nextStep": "Siguiente: seguimiento del equipo"
    },
    "screenshotKey": "chatbotFlowCanvas",
    "screenshotAlt": "Lienzo de Chatbot Builder con pasos Enviar mensaje y Añadir etiqueta más configuración de plantillas de WhatsApp",
    "visualSections": [
      {
        "title": "Configura cuándo inicia el flujo",
        "description": "Inicia en una conversación nueva, añade disparadores por palabra clave y limita el flujo a canales compatibles como WhatsApp, Instagram, Facebook Messenger, SMS, chat web y Telegram.",
        "screenshotKey": "chatbotTrigger",
        "screenshotAlt": "Panel de disparadores de Chatbot Builder con interruptor de conversación nueva, entrada de palabra clave y filtros de canal"
      }
    ],
    "flowScenarios": [
      {
        "title": "Bienvenida y calificación",
        "summary": "Saluda una conversación nueva, captura lo que necesita el cliente, aplica una etiqueta y continúa con el equipo.",
        "nodes": [
          {
            "label": "Conversación nueva",
            "detail": "Iniciar en conversación nueva"
          },
          {
            "label": "Enviar mensaje de bienvenida",
            "detail": "¡Hola! ¿Cómo puedo ayudarte hoy?"
          },
          {
            "label": "Preguntar qué necesitan",
            "detail": "Capturar la solicitud del cliente"
          },
          {
            "label": "Añadir etiqueta",
            "detail": "Acción de contacto compatible"
          },
          {
            "label": "Continuar en Unified Inbox",
            "detail": "El equipo toma el control con contexto"
          }
        ]
      },
      {
        "title": "Flujo por palabra clave",
        "summary": "Cuando llega una palabra clave configurada, envía el mensaje relevante, haz una pregunta de seguimiento y etiqueta el interés.",
        "nodes": [
          {
            "label": "Palabra clave detectada",
            "detail": "Palabra clave configurada en un canal compatible"
          },
          {
            "label": "Enviar respuesta relevante",
            "detail": "Mensaje o plantilla donde esté soportado"
          },
          {
            "label": "Hacer pregunta de seguimiento",
            "detail": "Capturar detalles de interés"
          },
          {
            "label": "Añadir etiqueta",
            "detail": "Marcar interés para el equipo"
          },
          {
            "label": "Continuar la conversación",
            "detail": "Seguimiento humano en el inbox"
          }
        ]
      },
      {
        "title": "Capturar un lead",
        "summary": "Responde de inmediato, captura nombre y necesidad, luego asigna para seguimiento del equipo.",
        "nodes": [
          {
            "label": "Conversación nueva",
            "detail": "Captura inmediata fuera de horario"
          },
          {
            "label": "Enviar mensaje de bienvenida",
            "detail": "Establecer expectativas rápidamente"
          },
          {
            "label": "Capturar nombre y necesidad",
            "detail": "Captura de entrada compatible"
          },
          {
            "label": "Asignar al equipo",
            "detail": "Acción de asignación compatible"
          },
          {
            "label": "Seguimiento del equipo",
            "detail": "El responsable continúa en Unified Inbox"
          }
        ]
      }
    ],
    "problemTitle": "Por qué los equipos necesitan un constructor visual",
    "problems": [
      {
        "title": "Los mensajes fuera de horario quedan sin respuesta",
        "description": "Los prospectos preguntan cuando nadie está en línea y luego desaparecen."
      },
      {
        "title": "Las respuestas FAQ se repiten todo el día",
        "description": "Los agentes gastan tiempo en las mismas primeras respuestas en lugar de cerrar trabajo."
      },
      {
        "title": "El enrutamiento es manual",
        "description": "Sin captura estructurada, cada consulta se ve igual en el inbox."
      },
      {
        "title": "Las transferencias pierden contexto",
        "description": "Cuando un humano toma el control, faltan los detalles del recorrido."
      }
    ],
    "howIntro": "Diseña flujos con pasos de mensaje, pregunta, retraso y acción. Actívalos en canales compatibles y continúa las conversaciones con tu equipo.",
    "howPoints": [
      {
        "title": "Construcción visual de flujos",
        "description": "Compón recorridos con nodos de mensaje, pregunta, retraso y acción."
      },
      {
        "title": "Captura lo que necesitan",
        "description": "Haz preguntas y recopila los detalles que tu equipo necesita antes del seguimiento."
      },
      {
        "title": "Actualiza contexto CRM",
        "description": "Aplica etiquetas, estado, pipeline o acciones de asignación a medida que avanza el flujo."
      },
      {
        "title": "Continúa en Unified Inbox",
        "description": "Cuando una persona debe tomar el control, la conversación permanece en tu espacio de trabajo compartido."
      }
    ],
    "featuresTitle": "Capacidades del constructor",
    "features": [
      {
        "label": "Nodos de mensaje",
        "description": "Envía texto, medios, botones o mensajes de plantilla donde esté soportado."
      },
      {
        "label": "Preguntas y captura de entrada",
        "description": "Pide los detalles que tu equipo necesita antes de enrutar."
      },
      {
        "label": "Pasos de retraso",
        "description": "Marca el ritmo del recorrido para que los mensajes se sientan naturales."
      },
      {
        "label": "Pasos de acción",
        "description": "Establece etiquetas, estado, etapa de pipeline o asigna un compañero."
      },
      {
        "label": "Disparadores",
        "description": "Inicia en chat nuevo, palabras clave y canales seleccionados."
      },
      {
        "label": "Canales compatibles",
        "description": "WhatsApp, Instagram, Facebook, SMS, chat web, Telegram y GoHighLevel donde esté conectado."
      }
    ],
    "workflowTitle": "Un recorrido típico de calificación",
    "workflowSteps": [
      {
        "label": "Mensaje nuevo",
        "description": "Un cliente inicia una conversación en un canal conectado."
      },
      {
        "label": "Mensaje de bienvenida",
        "description": "El flujo los saluda y establece expectativas."
      },
      {
        "label": "Preguntar qué necesitan",
        "description": "Un nodo de pregunta captura la intención."
      },
      {
        "label": "Continuar el flujo",
        "description": "Envía el siguiente mensaje u otra pregunta compatible."
      },
      {
        "label": "Capturar datos de contacto",
        "description": "Recopila la información que tu equipo necesita para el seguimiento."
      },
      {
        "label": "Calificar y asignar",
        "description": "Etiqueta, actualiza etapa, asigna responsable y continúa en Unified Inbox."
      }
    ],
    "useCases": [
      {
        "situation": "Necesitas captura de leads fuera de horario.",
        "action": "Activa un flujo de bienvenida + calificación cuando inicia un chat nuevo.",
        "outcome": "El personal matutino abre el inbox con consultas estructuradas."
      },
      {
        "situation": "Los clientes hacen las mismas preguntas frecuentes.",
        "action": "Construye una ruta de mensajes que responda preguntas comunes antes de ofrecer un humano.",
        "outcome": "Los agentes invierten tiempo en conversaciones de mayor valor."
      },
      {
        "situation": "Distintos servicios necesitan distintos responsables.",
        "action": "Usa disparadores por palabra clave o acciones de asignación para enrutar al compañero correcto.",
        "outcome": "El enrutamiento ocurre antes de la primera respuesta humana."
      },
      {
        "situation": "Ventas quiere solo leads listos.",
        "action": "Captura respuestas de calificación, etiqueta preparación y transfiere.",
        "outcome": "Unified Inbox comienza con contexto de oportunidad más claro."
      }
    ],
    "relatedProducts": [
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "Donde continúan las transferencias del chatbot."
      },
      {
        "label": "Flujos de trabajo y automatizaciones",
        "href": "/automations",
        "description": "Seguimiento repetible después del flujo."
      },
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "Asiste a humanos después de que el bot califica."
      },
      {
        "label": "AI Brain",
        "href": "/ai-brain",
        "description": "Contexto empresarial para asistencia más inteligente."
      },
      {
        "label": "Colaboración en equipo",
        "href": "/shared-team-inbox",
        "description": "Asignaciones y propiedad compartida."
      }
    ],
    "industryLinks": [
      {
        "label": "E-commerce",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "Negocios locales y de servicios",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "Agencias de marketing",
        "href": "/solutions/marketing-agencies"
      }
    ],
    "howItWorks": [
      {
        "title": "Abre Chatbot Builder",
        "description": "Disponible en planes que incluyen recorridos de chatbot."
      },
      {
        "title": "Diseña el primer recorrido",
        "description": "Añade bienvenida, preguntas, acciones y pasos de asignación."
      },
      {
        "title": "Elige disparadores y canales",
        "description": "Decide cuándo inicia el flujo y dónde puede ejecutarse."
      },
      {
        "title": "Transfiere al inbox",
        "description": "Deja que tu equipo continúe con Copilot y automatizaciones."
      }
    ],
    "finalCtaHeadline": "Lanza recorridos que tus clientes puedan seguir",
    "finalCtaSubtitle": "Empieza gratis, construye tu primer recorrido de chatbot y mantén cada conversación calificada en Unified Inbox.",
    "ssrBullets": [
      "Constructor visual de chatbot con pasos de mensaje, pregunta, retraso y acción",
      "Disparadores por palabra clave y chat nuevo en canales compatibles",
      "Acciones de etiquetas, estado, pipeline y asignación",
      "Transferencia a Unified Inbox para seguimiento humano",
      "Funciona con Copilot, AI Brain y automatizaciones"
    ]
  },
  "/automations": {
    "productLabel": "Flujos de trabajo y automatizaciones",
    "breadcrumbLabel": "Flujos de trabajo y automatizaciones",
    "title": "Flujos de trabajo y automatizaciones CRM | WhachatCRM",
    "metaDescription": "Automatiza el seguimiento en WhachatCRM con flujos de trabajo y plantillas listas para usar. Activa en chats nuevos, palabras clave, etiquetas, etapas o sin respuesta — luego asigna, actualiza contactos y continúa conversaciones.",
    "ogTitle": "Flujos de trabajo y automatizaciones | WhachatCRM",
    "h1": "Automatiza el seguimiento que hace avanzar los leads",
    "heroIntro": "Flujos de trabajo y automatizaciones ayudan a tu equipo a responder a momentos repetibles — chats nuevos, palabras clave, cambios de etapa, etiquetas y leads silenciosos — sin reconstruir el proceso cada vez. Usa flujos personalizados o empieza desde plantillas listas.",
    "secondaryCta": {
      "label": "Explorar plantillas de automatización",
      "href": "/automation-templates"
    },
    "heroVisual": {
      "inquiryLabel": "Disparador",
      "inquiryMessage": "Sin respuesta durante 24 horas en un lead calificado.",
      "suggestionLabel": "Acción de automatización",
      "suggestionMessage": "Asignar responsable → añadir etiqueta de seguimiento → establecer recordatorio de seguimiento.",
      "stageLabel": "En nutrición",
      "nextStep": "Siguiente: continuar flujo de trabajo"
    },
    "screenshotKey": "automationWorkflows",
    "screenshotAlt": "Constructor de flujos de WhachatCRM mostrando disparadores de automatización y acciones de seguimiento",
    "flowScenarios": [
      {
        "title": "Seguimiento sin respuesta",
        "summary": "Cuando un contacto se queda en silencio, inicia una ruta de seguimiento y mantén el contexto del pipeline preciso.",
        "nodes": [
          {
            "label": "Sin respuesta",
            "detail": "El contacto no ha respondido tras el retraso seleccionado"
          },
          {
            "label": "Añadir o actualizar etiqueta",
            "detail": "Marcar el estado de seguimiento"
          },
          {
            "label": "Establecer etapa de pipeline",
            "detail": "Mantener el estado de oportunidad actualizado"
          },
          {
            "label": "Asignar miembro del equipo",
            "detail": "Enrutar propiedad para el siguiente contacto"
          },
          {
            "label": "Continuar nutrición",
            "detail": "Sigue el seguimiento humano o de campaña"
          }
        ]
      },
      {
        "title": "Enrutamiento por palabra clave",
        "summary": "Enruta palabras clave de alta intención al responsable correcto con un siguiente paso claro.",
        "nodes": [
          {
            "label": "Palabra clave detectada",
            "detail": "El mensaje contiene una palabra clave configurada"
          },
          {
            "label": "Añadir etiqueta",
            "detail": "Marcar intención para el equipo"
          },
          {
            "label": "Asignar miembro del equipo",
            "detail": "Round robin o responsable específico"
          },
          {
            "label": "Establecer seguimiento",
            "detail": "Programar el siguiente recordatorio"
          },
          {
            "label": "El responsable responde",
            "detail": "La conversación continúa en Unified Inbox"
          }
        ]
      },
      {
        "title": "Progresión de etapa",
        "summary": "Cuando un contacto alcanza una etapa de pipeline configurada, inicia los siguientes pasos del flujo.",
        "nodes": [
          {
            "label": "Cambio de etapa de pipeline",
            "detail": "El contacto pasa a una etapa configurada"
          },
          {
            "label": "Asignar o actualizar contacto",
            "detail": "Mantener propiedad y estado alineados"
          },
          {
            "label": "Establecer seguimiento",
            "detail": "Iniciar el timing de seguimiento relevante"
          },
          {
            "label": "El flujo continúa",
            "detail": "Equipo y automatizaciones permanecen sincronizados"
          }
        ]
      }
    ],
    "problemTitle": "El seguimiento manual no escala",
    "problems": [
      {
        "title": "Los leads silenciosos se enfrían",
        "description": "Sin una ruta de no respuesta, las conversaciones prometedoras se estancan en el inbox."
      },
      {
        "title": "Las transferencias son inconsistentes",
        "description": "Etiquetas, etapas y responsables se actualizan de forma distinta por cada compañero."
      },
      {
        "title": "El trabajo de bienvenida es repetitivo",
        "description": "Cada chat nuevo necesita las mismas primeras acciones antes de que un humano profundice."
      },
      {
        "title": "Las plantillas son difíciles de encontrar",
        "description": "Los equipos quieren puntos de partida probados sin reinventar cada flujo."
      }
    ],
    "howIntro": "Construye automatizaciones para todo el CRM en el día a día. Los espacios de Growth Engine permanecen como campañas empaquetadas separadas para inteligencia específica del sector.",
    "howPoints": [
      {
        "title": "Empieza desde un disparador",
        "description": "Reacciona a chats nuevos, mensajes, palabras clave, etiquetas, cambios de etapa, sin respuesta y más."
      },
      {
        "title": "Aplica acciones CRM",
        "description": "Asigna compañeros, actualiza etiquetas, estado, pipeline, notas o timing de seguimiento."
      },
      {
        "title": "Usa plantillas cuando ayude",
        "description": "Explora la biblioteca de plantillas de automatización para puntos de partida listos para personalizar."
      },
      {
        "title": "Mantén Growth Engines separados",
        "description": "Realtor Growth Engine y paquetes similares permanecen en su propio espacio — no mezclados en automatizaciones globales."
      }
    ],
    "featuresTitle": "Disparadores, acciones y plantillas",
    "features": [
      {
        "label": "Disparadores comunes",
        "description": "Chat nuevo, mensaje nuevo, palabra clave, sin respuesta, etiqueta añadida/eliminada, cambio de pipeline y más."
      },
      {
        "label": "Acciones CRM",
        "description": "Asignar, etiquetar, establecer estado, pipeline, añadir notas y programar seguimiento."
      },
      {
        "label": "Constructor de flujos",
        "description": "Compón automatizaciones de varios pasos que tu equipo pueda mantener.",
        "href": "/automations"
      },
      {
        "label": "Plantillas de automatización",
        "description": "Presets listos para personalizar rutas de bienvenida, nutrición y soporte.",
        "href": "/automation-templates"
      },
      {
        "label": "Inscripción en campañas",
        "description": "Continúa secuencias de nutrición más largas donde se admita inscripción en campañas.",
        "href": "/campaigns"
      },
      {
        "label": "Colaboración en equipo",
        "description": "Las acciones de asignación mantienen la propiedad clara cuando se activan automatizaciones.",
        "href": "/shared-team-inbox"
      }
    ],
    "workflowTitle": "Un flujo de seguimiento sin respuesta",
    "workflowSteps": [
      {
        "label": "Disparador",
        "description": "Sin respuesta tras una ventana definida en una conversación rastreada."
      },
      {
        "label": "Verificar condición",
        "description": "Confirma que el contacto aún coincide con la etapa o etiqueta prevista."
      },
      {
        "label": "Actualizar contacto",
        "description": "Aplica una etiqueta o etapa de seguimiento para que el pipeline se mantenga preciso."
      },
      {
        "label": "Asignar responsable",
        "description": "Enruta la propiedad al compañero correcto."
      },
      {
        "label": "Enviar o recomendar seguimiento",
        "description": "Continúa la conversación con una ruta de recordatorio."
      },
      {
        "label": "Continuar campaña o flujo",
        "description": "Sigue nutriendo hasta que un humano cierre el ciclo."
      }
    ],
    "useCases": [
      {
        "situation": "Un chat nuevo necesita una bienvenida consistente.",
        "action": "Activa en chat nuevo, etiqueta el lead y asigna un responsable.",
        "outcome": "Cada consulta comienza con el mismo estándar operativo."
      },
      {
        "situation": "Palabras clave de intención señalan una solicitud caliente.",
        "action": "El disparador por palabra clave actualiza etapa y notifica al compañero correcto.",
        "outcome": "Los mensajes de alta intención se priorizan rápidamente."
      },
      {
        "situation": "Un prospecto se quedó en silencio tras el precio.",
        "action": "La automatización sin respuesta programa seguimiento y preserva el historial.",
        "outcome": "Los leads silenciosos vuelven a la ruta de conversación."
      },
      {
        "situation": "Los leads calificados deben mover etapas.",
        "action": "Los cambios de etapa o etiqueta inician los siguientes pasos del flujo.",
        "outcome": "La higiene del pipeline ocurre sin limpieza manual."
      },
      {
        "situation": "Quieres puntos de partida probados.",
        "action": "Abre la biblioteca de plantillas de automatización y personaliza.",
        "outcome": "Los equipos lanzan más rápido sin inventar cada ruta."
      }
    ],
    "relatedProducts": [
      {
        "label": "Plantillas de automatización",
        "href": "/automation-templates",
        "description": "Biblioteca de plantillas de automatización listas para usar."
      },
      {
        "label": "Campañas",
        "href": "/campaigns",
        "description": "Secuencias más largas de nutrición y reactivación."
      },
      {
        "label": "Chatbot Builder",
        "href": "/chatbot-builder",
        "description": "Recorridos de entrada antes de la automatización."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "Donde el trabajo automatizado encuentra respuestas humanas."
      },
      {
        "label": "Realtor Growth Engine",
        "href": "/realtor-growth-engine",
        "description": "Flujos de Growth Engine empaquetados para el sector."
      }
    ],
    "industryLinks": [
      {
        "label": "Bienes raíces",
        "href": "/real-estate-crm"
      },
      {
        "label": "Negocios locales y de servicios",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "Agencias de marketing",
        "href": "/solutions/marketing-agencies"
      }
    ],
    "howItWorks": [
      {
        "title": "Elige un disparador",
        "description": "Empieza desde el momento que debe iniciar el trabajo."
      },
      {
        "title": "Añade acciones CRM",
        "description": "Asigna, etiqueta, actualiza etapa y continúa el seguimiento."
      },
      {
        "title": "O empieza desde una plantilla",
        "description": "Explora /automation-templates y adapta un preset."
      },
      {
        "title": "Supervisa en Unified Inbox",
        "description": "Los humanos toman el control cuando la conversación necesita criterio."
      }
    ],
    "finalCtaHeadline": "Deja de reconstruir el mismo seguimiento cada día",
    "finalCtaSubtitle": "Empieza gratis, crea tu primer flujo o personaliza una plantilla de la biblioteca de automatización.",
    "ssrBullets": [
      "Constructor de flujos para automatizaciones en toda la plataforma",
      "Disparadores para chats nuevos, palabras clave, etiquetas, etapas y sin respuesta",
      "Acciones CRM para asignar, etiquetar, estado, pipeline y seguimiento",
      "Plantillas listas en /automation-templates",
      "Separado de paquetes de Growth Engine por sector"
    ]
  },
  "/campaigns": {
    "productLabel": "Campañas",
    "breadcrumbLabel": "Campañas",
    "title": "Campañas CRM y alcance personalizado | WhachatCRM",
    "metaDescription": "Crea campañas CRM personalizadas en WhachatCRM. Selecciona audiencias, elige canales de mensajería compatibles, personaliza con AI Brain donde esté habilitado, inscribe contactos, rastrea progreso y continúa el seguimiento.",
    "ogTitle": "Campañas — Alcance personalizado | WhachatCRM",
    "h1": "Crea campañas personalizadas que continúan la conversación",
    "heroIntro": "Campañas te ayuda a inscribir los contactos correctos en canales de mensajería compatibles, personalizar el alcance con contexto empresarial y mantener el seguimiento en movimiento — sin tratar cada envío como una difusión única.",
    "secondaryCta": {
      "label": "Explorar AI Brain",
      "href": "/ai-brain"
    },
    "heroVisual": {
      "inquiryLabel": "Audiencia",
      "inquiryMessage": "Prospectos calificados etiquetados “listos para nutrición”.",
      "suggestionLabel": "Paso de campaña",
      "suggestionMessage": "Mensaje personalizado de WhatsApp → espera → seguimiento si no hay respuesta.",
      "stageLabel": "Activa",
      "nextStep": "Siguiente: rastrear inscripción"
    },
    "screenshotKey": "automationTemplateCards",
    "screenshotAlt": "Tarjetas de plantillas de campaña y automatización para secuencias de nutrición y reactivación",
    "problemTitle": "Por qué las campañas importan después de la primera respuesta",
    "problems": [
      {
        "title": "Los leads calificados se quedan en silencio",
        "description": "Sin una ruta secuenciada, el interés se desvanece tras un mensaje."
      },
      {
        "title": "El alcance se siente genérico",
        "description": "Las plantillas que ignoran el contexto empresarial rinden peor."
      },
      {
        "title": "Se ignoran las reglas del canal",
        "description": "Los equipos necesitan inscripción que respete canales conectados y ventanas de mensajería."
      },
      {
        "title": "El estado es difícil de ver",
        "description": "Los estados borrador, activa, pausada y completada deben permanecer claros."
      }
    ],
    "howIntro": "Selecciona una audiencia, elige un canal compatible, crea o personaliza el mensaje, revisa, inscribe contactos y continúa el seguimiento según el progreso de la campaña.",
    "howPoints": [
      {
        "title": "Audiencia e inscripción",
        "description": "Inscribe contactos en secuencias de campaña con verificaciones de elegibilidad."
      },
      {
        "title": "Envío consciente del canal",
        "description": "Las campañas se ejecutan en canales de mensajería compatibles como WhatsApp, Instagram, Facebook, SMS, chat web y Telegram cuando estén conectados."
      },
      {
        "title": "Personalización",
        "description": "Usa marcadores de posición y personalización asistida por IA donde esté habilitado — incluido contexto de AI Brain."
      },
      {
        "title": "Visibilidad del ciclo de vida",
        "description": "Rastrea estados de campaña borrador, activa, pausada y completada."
      }
    ],
    "featuresTitle": "Capacidades de campaña",
    "features": [
      {
        "label": "Selección de audiencia",
        "description": "Inscribe los contactos que coinciden con tu objetivo de seguimiento."
      },
      {
        "label": "Canales de mensajería compatibles",
        "description": "Conjunto centrado en WhatsApp con Instagram, Facebook, SMS, chat web y Telegram donde estén conectados."
      },
      {
        "label": "Creación de mensajes",
        "description": "Construye pasos con plantillas y marcadores de posición."
      },
      {
        "label": "Personalización con AI Brain",
        "description": "Personalización más profunda consciente del negocio cuando Brain está habilitado.",
        "href": "/ai-brain"
      },
      {
        "label": "Secuenciación y seguimiento",
        "description": "Continúa la conversación en el tiempo en lugar de un solo envío masivo."
      },
      {
        "label": "Consentimiento y ventanas de mensajería",
        "description": "La inscripción respeta conexión de canal, opt-out y verificaciones de elegibilidad de mensajería."
      }
    ],
    "workflowTitle": "De audiencia a seguimiento continuo",
    "workflowSteps": [
      {
        "label": "Elegir audiencia",
        "description": "Selecciona contactos listos para alcance o reactivación."
      },
      {
        "label": "Seleccionar canal compatible",
        "description": "Elige un canal de mensajería conectado que la campaña pueda usar."
      },
      {
        "label": "Crear o personalizar mensaje",
        "description": "Escribe pasos con marcadores de posición o personalización asistida por IA."
      },
      {
        "label": "Revisar campaña",
        "description": "Confirma estado, pasos y elegibilidad antes de publicar."
      },
      {
        "label": "Enviar o inscribir contactos",
        "description": "Inicia la inscripción cuando la campaña esté lista."
      },
      {
        "label": "Rastrear y continuar seguimiento",
        "description": "Supervisa el progreso y sigue nutriendo hasta que un humano cierre el ciclo."
      }
    ],
    "useCases": [
      {
        "situation": "Los prospectos calificados necesitan un seguimiento estructurado.",
        "action": "Inscríbelos en una secuencia de nutrición personalizada.",
        "outcome": "El interés se mantiene sin perseguir manualmente cada día."
      },
      {
        "situation": "Consultas anteriores se quedaron en silencio.",
        "action": "Reactiva contactos elegibles en un canal compatible.",
        "outcome": "Oportunidades antiguas reciben otro contacto relevante."
      },
      {
        "situation": "Quieres alcance que refleje tu oferta.",
        "action": "Personaliza con marcadores de posición y contexto de AI Brain.",
        "outcome": "Los mensajes suenan más cerca de cómo vende realmente tu negocio."
      },
      {
        "situation": "Prospect AI encontró una lista que vale la pena contactar.",
        "action": "Continúa el alcance personalizado y gestiona respuestas en Unified Inbox.",
        "outcome": "Descubrimiento y conversación permanecen en un solo CRM."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Brain",
        "href": "/ai-brain",
        "description": "Contexto empresarial aprobado para personalización."
      },
      {
        "label": "Prospect AI",
        "href": "/prospect-ai",
        "description": "Encuentra prospectos para inscribir en el alcance."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "Gestiona respuestas de conversaciones de campaña."
      },
      {
        "label": "Flujos de trabajo y automatizaciones",
        "href": "/automations",
        "description": "Activa seguimiento alrededor de la actividad de campaña."
      }
    ],
    "industryLinks": [
      {
        "label": "Negocios locales y de servicios",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "Agencias de marketing",
        "href": "/solutions/marketing-agencies"
      },
      {
        "label": "E-commerce",
        "href": "/solutions/ecommerce"
      }
    ],
    "howItWorks": [
      {
        "title": "Prepara tu audiencia",
        "description": "Etiqueta o clasifica contactos para que la inscripción sea intencional."
      },
      {
        "title": "Construye la secuencia",
        "description": "Crea pasos en un canal de mensajería compatible."
      },
      {
        "title": "Personaliza con cuidado",
        "description": "Usa marcadores de posición y contexto de Brain donde esté habilitado."
      },
      {
        "title": "Inscribe y supervisa",
        "description": "Rastrea el progreso y responde en Unified Inbox."
      }
    ],
    "finalCtaHeadline": "Mantén la conversación después del primer contacto",
    "finalCtaSubtitle": "Empieza gratis, crea una campaña personalizada y gestiona respuestas en el mismo espacio de trabajo CRM.",
    "ssrBullets": [
      "Inscripción de audiencia con seguimiento de estado de campaña",
      "Canales de mensajería compatibles incluido WhatsApp",
      "Marcadores de posición y personalización asistida por IA donde esté habilitado",
      "Seguimiento secuenciado en lugar de difusiones únicas",
      "Verificaciones de elegibilidad para conexión, opt-out e idoneidad de canal"
    ]
  },
  "/integrations": {
    "productLabel": "Integraciones",
    "breadcrumbLabel": "Integraciones",
    "title": "Directorio de integraciones CRM | WhachatCRM",
    "metaDescription": "Conecta WhachatCRM a canales de mensajería y herramientas empresariales que ya usas — WhatsApp, Instagram, Facebook, SMS, email, Shopify, GoHighLevel, Calendly, Stripe y más.",
    "ogTitle": "Integraciones — Conecta tus herramientas | WhachatCRM",
    "h1": "Conecta WhachatCRM a las herramientas que tu negocio ya usa",
    "heroIntro": "Las integraciones reúnen conversaciones con clientes y herramientas empresariales cotidianas en un espacio de trabajo CRM — para que mensajería, programación, comercio y seguimiento permanezcan conectados.",
    "secondaryCta": {
      "label": "Ver Unified Inbox",
      "href": "/unified-inbox"
    },
    "heroVisual": {
      "inquiryLabel": "Canal conectado",
      "inquiryMessage": "WhatsApp vía Meta Embedded Signup está listo.",
      "suggestionLabel": "Herramienta empresarial",
      "suggestionMessage": "Enlaces de reserva de Calendly y contexto de Shopify junto a la conversación.",
      "stageLabel": "Conectado",
      "nextStep": "Siguiente: abrir Unified Inbox"
    },
    "screenshotKey": "channels",
    "screenshotAlt": "Canales de mensajería conectados de WhachatCRM incluido WhatsApp y plataformas sociales",
    "problemTitle": "Las herramientas desconectadas frenan cada respuesta",
    "problems": [
      {
        "title": "Las conversaciones viven fuera del CRM",
        "description": "Las respuestas de WhatsApp, Instagram y email se dispersan entre apps."
      },
      {
        "title": "El contexto comercial está en otro lugar",
        "description": "Las herramientas de tienda y reservas no están junto al hilo del mensaje."
      },
      {
        "title": "La configuración intimida",
        "description": "Los equipos necesitan destinos claros para Meta, Shopify y plataformas partner."
      },
      {
        "title": "No todo conector necesita una venta agresiva",
        "description": "Un directorio confiable solo lista integraciones que realmente puedes usar."
      }
    ],
    "howIntro": "Conecta los canales y plataformas que encajan con tu flujo de trabajo, luego gestiona conversaciones y seguimiento en WhachatCRM.",
    "howPoints": [
      {
        "title": "Conecta mensajería primero",
        "description": "Trae WhatsApp, Instagram, Facebook, SMS, Telegram, chat web y email a Unified Inbox."
      },
      {
        "title": "Añade plataformas empresariales",
        "description": "Vincula comercio, programación, pagos y herramientas de agencia donde estén disponibles."
      },
      {
        "title": "Usa guías dedicadas cuando haga falta",
        "description": "Las páginas de Shopify, GoHighLevel, WhatsApp API y MLS profundizan en configuración y valor."
      },
      {
        "title": "Sigue trabajando en un inbox",
        "description": "Las integraciones importan más cuando respaldan una conversación en vivo."
      }
    ],
    "featuresTitle": "Qué puedes conectar",
    "features": [
      {
        "label": "WhatsApp oficial vía Meta",
        "description": "Ruta Embedded Signup para acceso a WhatsApp Business API.",
        "href": "/whatsapp-business-api"
      },
      {
        "label": "Mensajería social",
        "description": "Conversaciones de Instagram y Facebook Messenger en un inbox.",
        "href": "/unified-inbox"
      },
      {
        "label": "Shopify",
        "description": "Conecta contexto de tienda con flujos de mensajería de WhachatCRM.",
        "href": "/shopify-crm"
      },
      {
        "label": "GoHighLevel",
        "description": "Conexión amigable para agencias que ya operan en GHL.",
        "href": "/go-high-level-agencies"
      },
      {
        "label": "Calendly y Stripe",
        "description": "Herramientas de reserva y pago que respaldan el siguiente paso del cliente."
      },
      {
        "label": "Inventario inmobiliario",
        "description": "Rutas MLS y Showcase IDX para flujos conscientes de listados.",
        "href": "/crm-with-mls-integration"
      }
    ],
    "workflowTitle": "De conexión a conversación",
    "workflowSteps": [
      {
        "label": "Elige un canal o herramienta",
        "description": "Selecciona mensajería o una plataforma empresarial del directorio."
      },
      {
        "label": "Completa configuración guiada",
        "description": "Sigue Meta Embedded Signup o el flujo de integración relevante."
      },
      {
        "label": "Confirma la conexión",
        "description": "Verifica que el canal o plataforma aparece en tu espacio de trabajo."
      },
      {
        "label": "Abre Unified Inbox",
        "description": "Empieza a gestionar conversaciones con contexto cerca."
      },
      {
        "label": "Añade IA y automatización",
        "description": "Superpone Copilot, chatbots y flujos sobre canales conectados."
      },
      {
        "label": "Expande a medida que creces",
        "description": "Conecta comercio, programación o herramientas partner cuando estés listo."
      }
    ],
    "useCases": [
      {
        "situation": "Necesitas WhatsApp oficial para mensajería empresarial.",
        "action": "Conecta WhatsApp vía Meta y abre Unified Inbox.",
        "outcome": "Los chats de clientes aterrizan en un espacio de trabajo CRM compartido."
      },
      {
        "situation": "Tu tienda funciona con Shopify.",
        "action": "Usa la ruta Shopify CRM para conectar contexto comercial.",
        "outcome": "Mensajería y operaciones de tienda permanecen más cerca."
      },
      {
        "situation": "Tu agencia ya usa GoHighLevel.",
        "action": "Conecta WhachatCRM a través de la ruta de agencias GHL.",
        "outcome": "Mensajería e IA se sitúan junto a tu stack existente."
      },
      {
        "situation": "Los equipos inmobiliarios necesitan contexto de listados.",
        "action": "Explora rutas de integración MLS / Showcase IDX.",
        "outcome": "Las conversaciones pueden referenciar inventario más fácilmente."
      }
    ],
    "relatedProducts": [
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "Donde se encuentran los canales conectados."
      },
      {
        "label": "WhatsApp Business API",
        "href": "/whatsapp-business-api",
        "description": "Guía oficial de configuración de WhatsApp."
      },
      {
        "label": "Shopify CRM",
        "href": "/shopify-crm",
        "description": "Página de producto de integración Shopify."
      },
      {
        "label": "Agencias GoHighLevel",
        "href": "/go-high-level-agencies",
        "description": "Ruta marketplace GHL."
      }
    ],
    "industryLinks": [
      {
        "label": "E-commerce",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "Agencias de marketing",
        "href": "/solutions/marketing-agencies"
      },
      {
        "label": "Bienes raíces",
        "href": "/real-estate-crm"
      }
    ],
    "integrationCategories": [
      {
        "title": "Mensajería",
        "items": [
          {
            "name": "WhatsApp",
            "description": "Meta Embedded Signup oficial para WhatsApp Business API.",
            "href": "/whatsapp-business-api"
          },
          {
            "name": "Instagram",
            "description": "Gestiona conversaciones de Instagram en Unified Inbox.",
            "href": "/unified-inbox"
          },
          {
            "name": "Facebook Messenger",
            "description": "Trae hilos de Messenger al mismo espacio de trabajo.",
            "href": "/unified-inbox"
          },
          {
            "name": "SMS",
            "description": "Conversaciones de texto junto a tus otros canales.",
            "href": "/unified-inbox"
          },
          {
            "name": "Telegram",
            "description": "Canal de mensajería compatible para espacios conectados.",
            "href": "/unified-inbox"
          },
          {
            "name": "Web Chat",
            "description": "Conversaciones del widget web a Unified Inbox.",
            "href": "/unified-inbox"
          },
          {
            "name": "Email / Gmail",
            "description": "Email junto a canales de mensajería donde esté conectado.",
            "href": "/unified-inbox"
          }
        ]
      },
      {
        "title": "Plataformas empresariales",
        "items": [
          {
            "name": "Shopify",
            "description": "Conecta Shopify con flujos de mensajería de WhachatCRM.",
            "href": "/shopify-crm"
          },
          {
            "name": "GoHighLevel",
            "description": "Conexión marketplace de agencia para operadores GHL.",
            "href": "/go-high-level-agencies"
          },
          {
            "name": "Calendly",
            "description": "Comparte enlaces de reserva y mantén la programación junto a conversaciones."
          },
          {
            "name": "Stripe",
            "description": "Herramientas de pago disponibles en la plataforma WhachatCRM."
          },
          {
            "name": "Google Sheets",
            "description": "Conexión de hoja de cálculo para flujos operativos."
          },
          {
            "name": "HubSpot",
            "description": "Conexión CRM listada en el espacio de integraciones."
          },
          {
            "name": "WooCommerce",
            "description": "Conexión comercial para equipos de tienda."
          }
        ]
      },
      {
        "title": "Bienes raíces",
        "items": [
          {
            "name": "Showcase IDX",
            "description": "Ruta de inventario IDX para equipos inmobiliarios.",
            "href": "/crm-with-mls-integration"
          },
          {
            "name": "MLS / Bridge Interactive",
            "description": "Flujos CRM conscientes de MLS para contexto de listados.",
            "href": "/crm-with-mls-integration"
          }
        ]
      }
    ],
    "howItWorks": [
      {
        "title": "Elige la integración que necesitas",
        "description": "Empieza con mensajería, luego añade comercio o herramientas de programación."
      },
      {
        "title": "Sigue el destino de configuración",
        "description": "Usa páginas dedicadas cuando existan; de lo contrario conecta en la app."
      },
      {
        "title": "Confirma en Unified Inbox",
        "description": "Asegúrate de que las conversaciones llegan donde trabaja tu equipo."
      },
      {
        "title": "Superpone IA y automatización",
        "description": "Añade Copilot, chatbots y flujos después de que los canales estén activos."
      }
    ],
    "finalCtaHeadline": "Reúne tus herramientas en un espacio de conversación",
    "finalCtaSubtitle": "Empieza gratis, conecta tu primer canal y explora guías más profundas para Shopify, WhatsApp y GoHighLevel.",
    "ssrBullets": [
      "Canales de mensajería incluido WhatsApp, Instagram, Facebook, SMS, Telegram, chat web y email",
      "Plataformas empresariales como Shopify, GoHighLevel, Calendly y Stripe",
      "Rutas inmobiliarias para MLS y Showcase IDX",
      "Guías dedicadas para WhatsApp API, Shopify CRM y agencias GHL",
      "Unified Inbox como destino de conversaciones conectadas"
    ]
  },
  "/unified-inbox": {
    "productLabel": "Unified Inbox",
    "breadcrumbLabel": "Unified Inbox",
    "title": "Unified Inbox para mensajería multicanal | WhachatCRM",
    "metaDescription": "WhachatCRM Unified Inbox reúne WhatsApp, Instagram, Facebook, SMS, Telegram, chat web y email en un espacio de trabajo inteligente con asignaciones, etiquetas, etapas, AI Copilot y seguimiento.",
    "ogTitle": "Unified Inbox — Todas las conversaciones en un solo lugar | WhachatCRM",
    "h1": "Todas tus conversaciones con clientes. Un inbox inteligente.",
    "heroIntro": "Unified Inbox es donde viven las conversaciones de WhachatCRM — en canales de mensajería compatibles — con contexto de contacto, propiedad del equipo, asistencia de IA y seguimiento en el mismo espacio de trabajo.",
    "secondaryCta": {
      "label": "Ver AI Copilot",
      "href": "/ai-copilot"
    },
    "heroVisual": {
      "inquiryLabel": "Mensaje entrante",
      "inquiryMessage": "Hilos de WhatsApp + Instagram esperando en una cola.",
      "suggestionLabel": "Contexto del inbox",
      "suggestionMessage": "Historial de contacto, etiquetas y recomendaciones de Copilot aparecen junto al chat.",
      "stageLabel": "Sin leer",
      "nextStep": "Siguiente: asignar y responder"
    },
    "screenshotKey": "unifiedInbox",
    "screenshotAlt": "Unified Inbox de WhachatCRM mostrando conversaciones multicanal con contexto de contacto",
    "problemTitle": "Qué ocurre cuando las conversaciones se dispersan",
    "problems": [
      {
        "title": "Los canales viven en teléfonos distintos",
        "description": "Las respuestas de WhatsApp, Instagram y email nunca comparten propiedad."
      },
      {
        "title": "Falta contexto",
        "description": "Los agentes responden sin etiquetas, etapas o historial."
      },
      {
        "title": "La ayuda de IA está desconectada",
        "description": "Las sugerencias solo ayudan cuando están dentro del hilo real."
      },
      {
        "title": "El seguimiento se olvida fácilmente",
        "description": "Sin un inbox compartido, los recordatorios desaparecen con quien vio el chat."
      }
    ],
    "howIntro": "Los mensajes llegan en canales compatibles, se identifican contactos, aparece contexto de IA y CRM, y tu equipo responde, asigna o automatiza el siguiente paso.",
    "howPoints": [
      {
        "title": "Una cola para canales compatibles",
        "description": "WhatsApp, Messenger, Instagram, SMS, Telegram, chat web y email donde estén conectados."
      },
      {
        "title": "Contexto de contacto y lead",
        "description": "Ve historial, etiquetas, etapas y propiedad junto a la conversación."
      },
      {
        "title": "IA dentro del hilo",
        "description": "AI Composer y AI Copilot asisten respuestas sin salir del inbox."
      },
      {
        "title": "Colaboración en equipo",
        "description": "Asigna conversaciones y mantén visibilidad compartida entre usuarios."
      }
    ],
    "featuresTitle": "Capacidades del inbox",
    "features": [
      {
        "label": "Conversaciones multicanal",
        "description": "Canales de mensajería compatibles en un espacio — Shopify no es un canal de mensajería nativo.",
        "href": "/integrations"
      },
      {
        "label": "Lista de conversaciones y estado sin leer",
        "description": "Escanea lo que necesita atención y abre el hilo correcto rápido."
      },
      {
        "label": "Etiquetas, etapas e historial de contacto",
        "description": "Mantén contexto de oportunidad adjunto a cada chat."
      },
      {
        "label": "Asignaciones de equipo",
        "description": "Propiedad clara para equipos multiusuario.",
        "href": "/shared-team-inbox"
      },
      {
        "label": "AI Copilot y AI Composer",
        "description": "Respuestas sugeridas y orientación de siguiente paso en el hilo.",
        "href": "/ai-copilot"
      },
      {
        "label": "Seguimiento y automatización",
        "description": "Continúa con recordatorios, flujos y campañas.",
        "href": "/automations"
      }
    ],
    "workflowTitle": "Del mensaje al seguimiento",
    "workflowSteps": [
      {
        "label": "Llega el mensaje",
        "description": "Un cliente escribe en un canal conectado."
      },
      {
        "label": "Se identifica el contacto",
        "description": "La conversación se adjunta al historial del contacto."
      },
      {
        "label": "La conversación entra en Unified Inbox",
        "description": "El hilo se une a la cola compartida."
      },
      {
        "label": "Aparecen IA y contexto de contacto",
        "description": "Copilot, etiquetas y etapas ayudan al compañero a decidir."
      },
      {
        "label": "Responder o asignar",
        "description": "Un humano responde o enruta la propiedad."
      },
      {
        "label": "Continúa el seguimiento",
        "description": "Programa, automatiza o nutre el siguiente paso."
      }
    ],
    "useCases": [
      {
        "situation": "Los clientes escriben por WhatsApp e Instagram.",
        "action": "Gestiona ambos canales desde una cola de inbox.",
        "outcome": "Menos mensajes perdidos entre apps."
      },
      {
        "situation": "Un lead caliente necesita el responsable correcto.",
        "action": "Asigna la conversación y mantén notas visibles.",
        "outcome": "Las transferencias permanecen limpias para el siguiente compañero."
      },
      {
        "situation": "Los agentes necesitan ayuda redactando respuestas.",
        "action": "Usa sugerencias de Copilot dentro del hilo.",
        "outcome": "Respuestas más rápidas con contexto compartido."
      },
      {
        "situation": "El seguimiento se olvidaría de otro modo.",
        "action": "Combina propiedad del inbox con automatizaciones o campañas.",
        "outcome": "Los leads silenciosos permanecen en una ruta definida."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "Recomendaciones y borradores en el hilo."
      },
      {
        "label": "Chatbot Builder",
        "href": "/chatbot-builder",
        "description": "Califica antes de que los humanos tomen el control."
      },
      {
        "label": "Flujos de trabajo y automatizaciones",
        "href": "/automations",
        "description": "Seguimiento repetible desde eventos del inbox."
      },
      {
        "label": "Integraciones",
        "href": "/integrations",
        "description": "Conecta los canales que alimentan el inbox."
      },
      {
        "label": "Colaboración en equipo",
        "href": "/shared-team-inbox",
        "description": "Propiedad compartida y notas."
      }
    ],
    "industryLinks": [
      {
        "label": "Bienes raíces",
        "href": "/real-estate-crm"
      },
      {
        "label": "E-commerce",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "Med spas y bienestar",
        "href": "/solutions/med-spas"
      }
    ],
    "howItWorks": [
      {
        "title": "Conecta tus canales",
        "description": "Empieza con WhatsApp y los canales de mensajería que ya usas."
      },
      {
        "title": "Invita a tu equipo",
        "description": "Comparte propiedad para que las conversaciones no vivan en un teléfono."
      },
      {
        "title": "Habilita Copilot",
        "description": "Añade asistencia de IA para puntuación, borradores y siguientes pasos."
      },
      {
        "title": "Automatiza lo repetitivo",
        "description": "Usa chatbots, flujos y campañas alrededor del inbox."
      }
    ],
    "finalCtaHeadline": "Pon cada conversación en un inbox inteligente",
    "finalCtaSubtitle": "Empieza gratis, conecta tus canales y deja que tu equipo responda con contexto de IA junto a cada hilo.",
    "ssrBullets": [
      "Mensajería multicanal en un espacio de trabajo",
      "Contexto de contacto, etiquetas, etapas y estado sin leer",
      "Asignaciones de equipo y propiedad compartida",
      "AI Copilot y AI Composer en el hilo",
      "Seguimiento con automatizaciones y campañas"
    ]
  },
  "/shared-team-inbox": {
    "productLabel": "Colaboración en equipo",
    "breadcrumbLabel": "Colaboración en equipo",
    "title": "Inbox compartido de equipo y colaboración | WhachatCRM",
    "metaDescription": "Colabora en conversaciones con clientes en WhachatCRM con acceso a inbox compartido, asignaciones, visibilidad de propiedad y planes multiusuario — para que los equipos respondan juntos sin perder contexto.",
    "ogTitle": "Colaboración en equipo — Inbox compartido | WhachatCRM",
    "h1": "Colabora en cada conversación sin perder contexto",
    "heroIntro": "Colaboración en equipo convierte Unified Inbox en un espacio compartido — invita compañeros, asigna propiedad, mantén visibilidad de quién respondió y avanza conversaciones juntos.",
    "secondaryCta": {
      "label": "Ver Unified Inbox",
      "href": "/unified-inbox"
    },
    "heroVisual": {
      "inquiryLabel": "Conversación compartida",
      "inquiryMessage": "Asignada a Alex — notas visibles para el equipo.",
      "suggestionLabel": "Propiedad",
      "suggestionMessage": "Responsable claro, historial compartido y siguiente seguimiento en un hilo.",
      "stageLabel": "Asignada",
      "nextStep": "Siguiente: el compañero responde"
    },
    "screenshotKey": "unifiedInbox",
    "screenshotAlt": "Inbox compartido de WhachatCRM usado por un equipo colaborador con propiedad de conversación",
    "problemTitle": "Los inboxes de un solo responsable crean riesgo",
    "problems": [
      {
        "title": "Las conversaciones viven en un teléfono",
        "description": "Cuando esa persona está offline, los clientes esperan."
      },
      {
        "title": "Nadie sabe quién es dueño del lead",
        "description": "Respuestas duplicadas y transferencias caídas se vuelven normales."
      },
      {
        "title": "El contexto permanece privado",
        "description": "Sin notas e historial compartidos, cada compañero empieza de cero."
      },
      {
        "title": "El crecimiento necesita más asientos",
        "description": "Los planes deben hacer explícita la colaboración multiusuario."
      }
    ],
    "howIntro": "Invita compañeros a WhachatCRM, comparte conversaciones de Unified Inbox, asigna propiedad y mantén la colaboración visible mientras el equipo responde.",
    "howPoints": [
      {
        "title": "Invitar miembros del equipo",
        "description": "Añade usuarios según la disponibilidad de asientos de tu plan."
      },
      {
        "title": "Compartir conversaciones",
        "description": "Trabaja desde el mismo inbox en lugar de reenviar capturas."
      },
      {
        "title": "Asignar propiedad",
        "description": "Haz obvio quién es el siguiente responsable."
      },
      {
        "title": "Mantener visibilidad",
        "description": "Ve quién respondió y mantén historial de conversación compartido."
      }
    ],
    "featuresTitle": "Capacidades de colaboración",
    "features": [
      {
        "label": "Unified Inbox compartido",
        "description": "Varios compañeros pueden trabajar desde el mismo espacio de conversación.",
        "href": "/unified-inbox"
      },
      {
        "label": "Asignaciones",
        "description": "Enruta propiedad para que la persona correcta haga seguimiento."
      },
      {
        "label": "Notas internas",
        "description": "Captura contexto privado del equipo donde esté soportado."
      },
      {
        "label": "Visibilidad de respuestas",
        "description": "Entiende quién ya respondió antes de escribir."
      },
      {
        "label": "Planes multiusuario",
        "description": "La disponibilidad de asientos crece de Free a Starter y Pro según precios.",
        "href": "/pricing"
      },
      {
        "label": "Asistencia de IA para equipos",
        "description": "Copilot ayuda a cada responsable con contexto compartido.",
        "href": "/ai-copilot"
      }
    ],
    "workflowTitle": "De invitación a seguimiento compartido",
    "workflowSteps": [
      {
        "label": "Invitar compañeros",
        "description": "Añade usuarios al espacio bajo tu plan."
      },
      {
        "label": "Llega la conversación",
        "description": "Un mensaje de cliente entra en Unified Inbox."
      },
      {
        "label": "Asignar un responsable",
        "description": "Enruta el hilo al compañero correcto."
      },
      {
        "label": "Añadir contexto compartido",
        "description": "Usa notas, etiquetas e historial que todo el equipo puede ver."
      },
      {
        "label": "Responder con visibilidad",
        "description": "Todos saben quién ya gestionó el chat."
      },
      {
        "label": "Continuar seguimiento",
        "description": "Automatizaciones y campañas mantienen la propiedad intacta."
      }
    ],
    "useCases": [
      {
        "situation": "Un fundador ya no puede responder cada WhatsApp solo.",
        "action": "Invita compañeros y comparte el inbox.",
        "outcome": "La cobertura continúa cuando una persona está offline."
      },
      {
        "situation": "Ventas y soporte tocan el mismo lead.",
        "action": "Asigna propiedad y deja notas para el siguiente compañero.",
        "outcome": "Las transferencias permanecen claras y profesionales."
      },
      {
        "situation": "Un equipo en crecimiento necesita asientos.",
        "action": "Elige un plan que coincida con necesidades de colaboración multiusuario.",
        "outcome": "La colaboración escala con el negocio."
      }
    ],
    "relatedProducts": [
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "El espacio de conversación compartido."
      },
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "Asistencia para cada compañero en el hilo."
      },
      {
        "label": "Flujos de trabajo y automatizaciones",
        "href": "/automations",
        "description": "Acciones de asignación en flujos."
      },
      {
        "label": "Precios",
        "href": "/pricing",
        "description": "Disponibilidad de asientos por plan."
      }
    ],
    "industryLinks": [
      {
        "label": "Agencias de marketing",
        "href": "/solutions/marketing-agencies"
      },
      {
        "label": "Bienes raíces",
        "href": "/real-estate-crm"
      },
      {
        "label": "Negocios locales y de servicios",
        "href": "/solutions/local-service-businesses"
      }
    ],
    "howItWorks": [
      {
        "title": "Invita a tu equipo",
        "description": "Añade asientos disponibles en tu plan."
      },
      {
        "title": "Comparte el inbox",
        "description": "Deja de reenviar chats desde teléfonos personales."
      },
      {
        "title": "Asigna cada hilo importante",
        "description": "Haz la propiedad explícita."
      },
      {
        "title": "Usa IA y automatizaciones juntos",
        "description": "Mantén colaboración más seguimiento en un CRM."
      }
    ],
    "finalCtaHeadline": "Convierte las conversaciones con clientes en trabajo en equipo",
    "finalCtaSubtitle": "Empieza gratis, invita a tus compañeros y mantén cada respuesta visible en Unified Inbox.",
    "ssrBullets": [
      "Unified Inbox compartido para equipos multiusuario",
      "Asignaciones y visibilidad de propiedad",
      "Notas internas donde esté soportado",
      "Disponibilidad de asientos según plan",
      "Funciona con Copilot y automatizaciones"
    ]
  }
} as Record<string, Partial<ProductPageContent>>,
  he: {
  "/ai-brain": {
    "productLabel": "AI Brain",
    "breadcrumbLabel": "AI Brain",
    "title": "AI Brain לידע עסקי ואינטליגנציה CRM | WhachatCRM",
    "metaDescription": "WhachatCRM AI Brain הוא שכבת האינטליגנציה של ידע עסקי עבור ה-CRM שלכם. לימדו את הפרופיל, נתחו מקורות ידע, בדקו סתירות, פרסמו אינטליגנציה מאושרת והפעילו את Copilot, Prospect AI וקמפיינים.",
    "ogTitle": "AI Brain — אינטליגנציה של ידע עסקי | WhachatCRM",
    "h1": "AI שמבין איך העסק שלכם עובד",
    "heroIntro": "AI גנרי יכול לכתוב תשובה. AI Brain מבין את העסק, את המטרות, מה לשאול ומה צריך לקרות בהמשך — ואז מספק את האינטליגנציה המאושרת ב-WhachatCRM.",
    "secondaryCta": {
      "label": "ראו AI Copilot",
      "href": "/ai-copilot"
    },
    "heroVisual": {
      "inquiryLabel": "ידע עסקי",
      "inquiryMessage": "שירותים, מדיניות ולקוחות אידיאליים מחוברים לבדיקה.",
      "suggestionLabel": "ממצא AI Brain",
      "suggestionMessage": "זוהתה סתירה בין שני דפי ידע — בדקו לפני פרסום.",
      "stageLabel": "מוכן לפרסום",
      "nextStep": "הבא: אישור אינטליגנציה"
    },
    "screenshotKey": "aiWorkspace",
    "screenshotAlt": "סביבת AI של WhachatCRM שמסבירה AI Assist ושכבת האינטליגנציה AI Brain",
    "visualSections": [
      {
        "title": "ניתוח ידע דף אחר דף",
        "description": "AI קורא כל דף מחובר בנפרד ומנסח את מה שנמצא. שום דבר לא מגיע לתשובות עד שבודקים ומפרסמים אינטליגנציה מאושרת.",
        "screenshotKey": "aiBrainAnalyze",
        "screenshotAlt": "פאנל Analyze של AI Brain עם דפים שנסרקו וספירת עובדות חדשות ומשתנות"
      },
      {
        "title": "הגדירו מה AI צריך לשאול",
        "description": "צרו, ערכו ונהלו שאלות סינון מההקשר העסקי כדי ש-Copilot והשיחות יבקשו את הפרטים הנכונים.",
        "screenshotKey": "aiBrainQuestions",
        "screenshotAlt": "פאנל שאלות לקוח של AI Brain עם שדות סינון חובה ואופציונליים"
      }
    ],
    "problemTitle": "למה AI גנרי לא מספיק לצוותי מכירות",
    "problems": [
      {
        "title": "תשובות בלי הקשר עסקי",
        "description": "AI שמבוסס רק על prompt ממציא טון והצעות שלא תואמות איך החברה באמת מוכרת."
      },
      {
        "title": "ידע מפוזר בדפים",
        "description": "אתרים, מסמכים והערות סותרים — ואף אחד לא בודק מה AI רשאי להשתמש."
      },
      {
        "title": "סינון לא עקבי",
        "description": "כל חבר צוות שואל שאלות שונות, ולכן איכות הפייפליין תלויה במי ענה ראשון."
      },
      {
        "title": "קמפיינים נשמעים גנריים",
        "description": "פנייה שמתעלמת מהשירותים ומהלקוחות האידיאליים מבזבזת שיחות."
      }
    ],
    "howIntro": "AI Brain מנתח את הידע העסקי, מזהה שינויים או סתירות ומאפשר לכם לשלוט במה הופך לאינטליגנציה מאושרת.",
    "howPoints": [
      {
        "title": "ללמד את AI על העסק",
        "description": "תעדו פרופיל עסקי, תעשייה, שירותים והוראות ש-AI צריך לעקוב אחריהן."
      },
      {
        "title": "חיבור וניתוח ידע",
        "description": "הוסיפו דפי ידע או מקורות, ואז נתחו שינויים, כפילויות וסתירות אפשריות."
      },
      {
        "title": "בדיקה ופרסום",
        "description": "אתם מחליטים מה הופך לאינטליגנציה מאושרת לפני שזה מפעיל תכונות AI אחרות."
      },
      {
        "title": "שימוש בכל הפלטפורמה",
        "description": "הקשר מאושר מסייע ל-Prospect AI, AI Copilot, סינון והתאמה אישית של קמפיינים כשמופעל."
      }
    ],
    "comparison": {
      "leftTitle": "AI גנרי",
      "leftItems": [
        "עובד בעיקר מה-prompt הנוכחי",
        "לעיתים מייצר תגובות גנריות",
        "ידע מוגבל על החברה",
        "בעיקר מייצר תוכן",
        "עלול להשתמש במידע חלקי או סותר",
        "לא מגדיר אסטרטגיית סינון של החברה"
      ],
      "rightTitle": "WhachatCRM AI Brain",
      "rightItems": [
        "משתמש בפרופיל העסקי ובהקשר התעשייתי של החברה",
        "מבין מוצרים, שירותים וידע עסקי מאושר",
        "מנתח דפי ידע מחוברים",
        "מזהה כפילויות, שינויים וסתירות אפשריות",
        "מאפשר למשתמשים לבדוק ולפרסם ידע מאושר",
        "תומך בשאלות סינון ובהקשר לקוח אידיאלי",
        "מתאים אישית קמפיינים ואסטרטגיה כשמופעל",
        "מספק אינטליגנציה ל-Prospect AI ו-AI Copilot"
      ]
    },
    "featuresTitle": "מה AI Brain מכסה",
    "features": [
      {
        "label": "פרופיל עסקי",
        "description": "שם חברה, תעשייה, שירותים, מוצרים, פרטי הזמנה והוראות מותאמות."
      },
      {
        "label": "ניתוח ידע",
        "description": "נתחו דפים מחוברים, הציגו שינויים והחזיקו עובדות שנויות במחלוקת עד לפתרון."
      },
      {
        "label": "בדיקה ופרסום",
        "description": "פרסום מבוקר כדי ש-AI ישתמש רק באינטליגנציה שאישרתם."
      },
      {
        "label": "שאלות סינון",
        "description": "הגדירו מה הצוות ו-AI צריכים לשאול כדי לסנן הזדמנויות."
      },
      {
        "label": "מצבים: Off / Suggest / Auto",
        "description": "בחרו עד כמה AI מסייע בתכונות זכאות, לפי התוכנית וההגדרות."
      },
      {
        "label": "אינטליגנציה של פלטפורמה",
        "description": "שכבה אופציונלית שמעמיקה את Copilot ו-Prospect AI עם הקשר עסקי."
      }
    ],
    "workflowTitle": "מלימוד לאינטליגנציה מאושרת",
    "workflowSteps": [
      {
        "label": "ללמד AI",
        "description": "הוסיפו פרופיל עסקי, שירותים והקשר תפעולי."
      },
      {
        "label": "ניתוח ידע",
        "description": "חברו מקורות והריצו ניתוח לעדכונים וסתירות."
      },
      {
        "label": "בדיקת ממצאים",
        "description": "בדקו כפילויות, שינויים ועובדות שנויות במחלוקת."
      },
      {
        "label": "פרסום אינטליגנציה מאושרת",
        "description": "שחררו רק מה שהצוות מקבל כהקשר מהימן."
      },
      {
        "label": "הפעלת סינון",
        "description": "הנחו שאלות וניקוד עם כללי עסק מאושרים."
      },
      {
        "label": "הפעלת Copilot וקמפיינים",
        "description": "שמרו על תשובות והתאמה אישית בהתאם לעסק."
      }
    ],
    "useCases": [
      {
        "situation": "צריך ש-AI ישקף את השירותים והמדיניות האמיתיים.",
        "action": "לימדו את הפרופיל העסקי ופרסמו ידע מאושר.",
        "outcome": "ההצעות נשארות מבוססות על איך אתם באמת פועלים."
      },
      {
        "situation": "טקסט באתר השתנה ועלול לבלבל תשובות AI.",
        "action": "נתחו מחדש ידע, בדקו סתירות ופרסמו בזהירות.",
        "outcome": "טענות מיושנות לא הופכות בשקט להנחיית AI."
      },
      {
        "situation": "קמפיין Prospect AI צריך התאמה אישית חדה יותר.",
        "action": "השתמשו בהקשר Brain מאושר בעת התאמת הפנייה.",
        "outcome": "הודעות נשמעות קרוב יותר להצעה וללקוחות האידיאליים."
      },
      {
        "situation": "סוכנים צריכים המלצות טובות יותר לשלב הבא בצ'אט.",
        "action": "הפעילו הקשר Copilot מבוסס Brain כשזכאים.",
        "outcome": "סיוע בשיחות משקף את אסטרטגיית הסינון."
      },
      {
        "situation": "צוותים שואלים שאלות סינון שונות מכוח הרגל.",
        "action": "הגדירו שאלות סינון פעם אחת ב-AI Brain.",
        "outcome": "סינון הופך עקבי בין ערוצים ואנשים."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "משתמש באינטליגנציה של Brain בתוך שיחות חיות."
      },
      {
        "label": "Prospect AI",
        "href": "/prospect-ai",
        "description": "מוצא ומסנן prospects; Brain מעמיק התאמה אישית."
      },
      {
        "label": "קמפיינים",
        "href": "/campaigns",
        "description": "פנייה מותאמת אישית עם הקשר עסקי מאושר."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "שם Copilot מונחה Brain מסייע בתשובות."
      }
    ],
    "industryLinks": [
      {
        "label": "נדל״ן",
        "href": "/real-estate-crm"
      },
      {
        "label": "עסקים מקומיים ושירותים",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "Med spas ובריאות",
        "href": "/solutions/med-spas"
      }
    ],
    "howItWorks": [
      {
        "title": "פתחו AI Brain בסביבת העבודה",
        "description": "התחילו מפרופיל העסק ושלבי הידע."
      },
      {
        "title": "הוסיפו מקורות ונתחו",
        "description": "חברו דפים, הריצו ניתוח ובדקו ממצאים."
      },
      {
        "title": "פרסמו מה שאתם סומכים עליו",
        "description": "אשרו אינטליגנציה לפני שזה משפיע על תכונות AI אחרות."
      },
      {
        "title": "הפעילו מוצרי AI קשורים",
        "description": "השתמשו ב-Copilot, Prospect AI וקמפיינים עם הקשר עמוק יותר כשזכאים."
      }
    ],
    "finalCtaHeadline": "תנו ל-AI שלכם מוח עסקי שאתם שולטים בו",
    "finalCtaSubtitle": "התחילו בחינם, לימדו את WhachatCRM איך אתם עובדים, ופרסמו אינטליגנציה מאושרת ל-Copilot, Prospect AI וקמפיינים.",
    "ssrBullets": [
      "פרופיל עסקי, תעשייה, שירותים והוראות",
      "ניתוח ידע עם בדיקת שינויים, כפילויות וסתירות",
      "פרסום מאושר על ידי המשתמש של אינטליגנציה",
      "שאלות סינון והקשר AI של פלטפורמה",
      "מפעיל Copilot, Prospect AI והתאמה אישית של קמפיינים כשמופעל"
    ]
  },
  "/ai-copilot": {
    "productLabel": "AI Copilot",
    "breadcrumbLabel": "AI Copilot",
    "title": "AI Copilot לשיחות CRM | WhachatCRM",
    "metaDescription": "WhachatCRM AI Copilot עוזר לצוותים לדעת מה לומר ומה לעשות בהמשך בתוך שיחות עם לקוחות — עם ניקוד לידים, תשובות מוצעות והמלצות לפעולה הבאה מבוססות הקשר שיחה ועסקי.",
    "ogTitle": "AI Copilot — דעו מה לומר בהמשך | WhachatCRM",
    "h1": "דעו מה לומר ומה לעשות בהמשך",
    "heroIntro": "AI Copilot הוא עוזר השיחות שעובד בתוך Unified Inbox. הוא משתמש בהקשר השיחה — ו-AI Brain כשמופעל — כדי לעזור לצוות להבין את ההזדמנות ולהתקדם.",
    "secondaryCta": {
      "label": "גלו AI Brain",
      "href": "/ai-brain"
    },
    "heroVisual": {
      "inquiryLabel": "שיחה חיה",
      "inquiryMessage": "מעוניין בייעוץ השבוע — מה השלב הבא?",
      "suggestionLabel": "המלצת Copilot",
      "suggestionMessage": "ניקוד ליד 82 — סננו לוח זמנים, ואז שתפו קישור הזמנה.",
      "stageLabel": "כוונה גבוהה",
      "nextStep": "הבא: תשובה מוצעת מוכנה"
    },
    "screenshotKey": "aiCopilot",
    "screenshotAlt": "פאנל AI Copilot עם סיוע בשיחות ותובנות לידים ב-WhachatCRM",
    "visualSections": [
      {
        "title": "ניקוד לידים ליד השרשור",
        "description": "ניקוד והסברים עוזרים לצוותים להבין למה שיחה נראית מוכנה — בלי לעזוב את Unified Inbox.",
        "screenshotKey": "leadScore",
        "screenshotAlt": "כרטיס ניקוד ליד של AI Copilot עם גורמי סינון"
      }
    ],
    "problemTitle": "מה מאט צוותים ב-inbox",
    "problems": [
      {
        "title": "ההקשר קבור בשרשור",
        "description": "סוכנים קוראים מחדש צ'אטים ארוכים לפני שמחליטים מה חשוב."
      },
      {
        "title": "איכות הליד לא ברורה",
        "description": "בלי ניקוד והסברים, הזדמנויות חמות נראות כמו כל הודעה אחרת."
      },
      {
        "title": "שלבים הבאים משתנים לפי אדם",
        "description": "חלק קובעים פגישות, אחרים נתקעים, ואיכות המעקב הופכת לא עקבית."
      },
      {
        "title": "כתיבת תשובות לוקחת יותר מדי זמן",
        "description": "אפילו תשובות פשוטות מתחרות בשאר התור של היום."
      }
    ],
    "howIntro": "AI Brain הוא שכבת האינטליגנציה של הפלטפורמה. AI Copilot הוא העוזר שמשתמש באינטליגנציה — ובשיחה החיה — בתוך צ'אטים עם לקוחות.",
    "howPoints": [
      {
        "title": "ניתוח הקשר שיחה",
        "description": "Copilot קורא את השרשור ואותות איש הקשר כדי לסכם מה קורה."
      },
      {
        "title": "ניקוד והסבר הליד",
        "description": "ניקוד לידים והסברים עוזרים לצוותים לתעדף את השיחות הנכונות."
      },
      {
        "title": "המלצה לפעולה הבאה",
        "description": "הצעות יכולות לכלול הקצאה, הזמנה, סינון, טיפוח או מעקב — לפי יכולת והקשר."
      },
      {
        "title": "ניסוח עם שליטה אנושית",
        "description": "תשובות מוצעות עוזרות לסוכנים להתקדם מהר יותר. מצב Auto זמין רק כשמופעל וזכאי — הוא לא מחליף שיקול דעת כברירת מחדל."
      }
    ],
    "featuresTitle": "יכולות Copilot מאומתות",
    "features": [
      {
        "label": "ניתוח שיחה",
        "description": "סיוע מודע להקשר בתוך שרשורי Unified Inbox.",
        "href": "/unified-inbox"
      },
      {
        "label": "ניקוד לידים",
        "description": "ניקוד עם הסברים כדי שהצוותים יבינו למה ליד נראה מוכן.",
        "href": "/ai-lead-scoring"
      },
      {
        "label": "תשובות מוצעות",
        "description": "סיוע בניסוח לתגובות מהירות ועקביות יותר."
      },
      {
        "label": "המלצות לפעולה הבאה",
        "description": "הנחיה כמו סינון, הזמנה, הקצאה, טיפוח או מעקב כשההקשר תומך."
      },
      {
        "label": "הקשר AI Brain",
        "description": "המלצות עמוקות יותר מודעות לעסק כשאינטליגנציה של Brain מופעלת.",
        "href": "/ai-brain"
      },
      {
        "label": "מצבי Suggest ו-Auto",
        "description": "בחרו ניסוח מסייע או Auto כשהתוכנית וההגדרות מאפשרות."
      }
    ],
    "workflowTitle": "מהודעה לפעולה הבאה המומלצת",
    "workflowSteps": [
      {
        "label": "השיחה מגיעה",
        "description": "הודעת לקוח נוחתת ב-Unified Inbox."
      },
      {
        "label": "ניתוח הקשר",
        "description": "Copilot בודק את השרשור ואותות איש הקשר."
      },
      {
        "label": "ניקוד ליד",
        "description": "הניקוד מדגיש דחיפות והתאמה עם הסברים."
      },
      {
        "label": "המלצה",
        "description": "פעולות הבאות מוצעות עוזרות לחבר הצוות להחליט."
      },
      {
        "label": "תשובה מוצעת",
        "description": "טיוטה מוכנה לבדיקה או עריכה."
      },
      {
        "label": "פעולת צוות",
        "description": "אדם מקצה, קובע פגישה, מסנן או ממשיך את השיחה."
      }
    ],
    "useCases": [
      {
        "situation": "פנייה חדשה מגיעה מחוץ לשעות.",
        "action": "בדקו בבוקר את הסיכום, הניקוד והתשובה המוצעת של Copilot.",
        "outcome": "התגובה האנושית הראשונה מתחילה מההקשר במקום קריאה קרה."
      },
      {
        "situation": "ליד נראה מוכן אבל הסוכן לא בטוח.",
        "action": "השתמשו בהסברי ניקוד והנחיית פעולה הבאה לבחור הזמנה מול טיפוח.",
        "outcome": "צ'אטים בעלי כוונה גבוהה מתקדמים להזמנה או מעקב ברור."
      },
      {
        "situation": "צוות שירות צריך תשובות עקביות.",
        "action": "סמכו על הצעות מונחות Brain תוך שמירה על שליטה אנושית.",
        "outcome": "תשובות נשארות מותאמות למותג בלי לכפות תסריטים זהים."
      },
      {
        "situation": "סוכן צריך לקבוע הצגה או ייעוץ.",
        "action": "עקבו אחר המלצת Copilot מכוונת להזמנה כשהשרשור תומך.",
        "outcome": "השיחה מתקדמת לשלב הבא קונקרטי."
      },
      {
        "situation": "ייעוץ ספציפי לתעשייה יהיה לא רלוונטי.",
        "action": "Copilot נשאר מוגבל לשיחה ולהקשר עסקי זכאי.",
        "outcome": "צוותים נמנעים מהמלצות שלא מתאימות להזדמנות."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Brain",
        "href": "/ai-brain",
        "description": "מספק אינטליגנציה עסקית מאושרת."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "שם Copilot מסייע בתשובות חיות."
      },
      {
        "label": "ניקוד לידים עם AI",
        "href": "/ai-lead-scoring",
        "description": "סקירת ניקוד מעמיקה יותר."
      },
      {
        "label": "שיתוף פעולה בצוות",
        "href": "/shared-team-inbox",
        "description": "הקצאה ושיתוף בעלות."
      }
    ],
    "industryLinks": [
      {
        "label": "נדל״ן",
        "href": "/real-estate-crm"
      },
      {
        "label": "מסחר אלקטרוני",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "Med spas ובריאות",
        "href": "/solutions/med-spas"
      }
    ],
    "howItWorks": [
      {
        "title": "חברו ערוצים ופתחו Unified Inbox",
        "description": "Copilot מסייע איפה שהשיחות כבר חיות."
      },
      {
        "title": "הפעילו סיוע AI לתוכנית שלכם",
        "description": "השתמשו ב-Suggest או Auto לפי זכאות והגדרות."
      },
      {
        "title": "הוסיפו AI Brain להקשר עמוק יותר",
        "description": "פרסמו ידע עסקי מאושר כשאתם רוצים המלצות עשירות יותר."
      },
      {
        "title": "שמרו על שליטה אנושית",
        "description": "בדקו ניקוד, המלצות וטיוטות לפני פעולה."
      }
    ],
    "finalCtaHeadline": "עזרו לכל חבר צוות לענות בביטחון",
    "finalCtaSubtitle": "התחילו בחינם, פתחו Unified Inbox, ותנו ל-AI Copilot להנחות מה לומר ומה לעשות בהמשך.",
    "ssrBullets": [
      "סיוע מודע להקשר שיחה בתוך Unified Inbox",
      "ניקוד לידים עם הסברים",
      "תשובות מוצעות והמלצות לפעולה הבאה",
      "הקשר עסקי אופציונלי של AI Brain",
      "מצבי Suggest ו-Auto כשמופעלים וזכאים"
    ]
  },
  "/chatbot-builder": {
    "productLabel": "Chatbot Builder",
    "breadcrumbLabel": "Chatbot Builder",
    "title": "Chatbot Builder ויזואלי למסעות לקוח | WhachatCRM",
    "metaDescription": "בנו מסעות chatbot ללא קוד ב-WhachatCRM. צרו זרימות הודעות ושאלות, לכדו קלט, תייגו אנשי קשר, הקצו חברי צוות והעבירו עבודה ל-Unified Inbox בערוצים נתמכים.",
    "ogTitle": "Chatbot Builder — מסעות לקוח ויזואליים | WhachatCRM",
    "h1": "בנו מסעות לקוח בלי לכתוב קוד",
    "heroIntro": "Chatbot Builder עוזר לעצב זרימות שיחה שמקבלות פנים ללקוחות, לוכדות מה הם צריכים, מסננות עניין ומנתבות עבודה לחבר הצוות הנכון — ואז ממשיכות ב-Unified Inbox.",
    "secondaryCta": {
      "label": "ראו Unified Inbox",
      "href": "/unified-inbox"
    },
    "heroVisual": {
      "inquiryLabel": "שלב בזרימה",
      "inquiryMessage": "איזה שירות אתם מחפשים היום?",
      "suggestionLabel": "פעולה",
      "suggestionMessage": "הוספת תג → המשך השיחה ב-Unified Inbox.",
      "stageLabel": "מסונן",
      "nextStep": "הבא: מעקב צוות"
    },
    "screenshotKey": "chatbotFlowCanvas",
    "screenshotAlt": "קנבס Chatbot Builder עם שלבי Send Message ו-Add Tag והגדרות תבנית WhatsApp",
    "visualSections": [
      {
        "title": "הגדירו מתי הזרימה מתחילה",
        "description": "התחילו בשיחה חדשה, הוסיפו טריגרים לפי מילת מפתח והגבילו את הזרימה לערוצים נתמכים כמו WhatsApp, Instagram, Facebook Messenger, SMS, צ'אט web ו-Telegram.",
        "screenshotKey": "chatbotTrigger",
        "screenshotAlt": "פאנל טריגרים של Chatbot Builder עם מתג שיחה חדשה, קלט מילת מפתח ומסנני ערוץ"
      }
    ],
    "flowScenarios": [
      {
        "title": "קבלת פנים וסינון",
        "summary": "קבלו פנים לשיחה חדשה, לכדו מה הלקוח צריך, הוסיפו תג והמשיכו עם הצוות.",
        "nodes": [
          {
            "label": "שיחה חדשה",
            "detail": "התחלה בשיחה חדשה"
          },
          {
            "label": "שליחת הודעת ברוכים הבאים",
            "detail": "שלום! איך אפשר לעזור היום?"
          },
          {
            "label": "שאלו מה הם צריכים",
            "detail": "לכידת בקשת הלקוח"
          },
          {
            "label": "הוספת תג",
            "detail": "פעולת איש קשר נתמכת"
          },
          {
            "label": "המשך ב-Unified Inbox",
            "detail": "הצוות לוקח שליטה עם הקשר"
          }
        ]
      },
      {
        "title": "זרימת מילת מפתח",
        "summary": "כשמגיעה מילת מפתח מוגדרת, שלחו הודעה רלוונטית, שאלו המשך ותייגו עניין.",
        "nodes": [
          {
            "label": "מילת מפתח זוהתה",
            "detail": "מילת מפתח מוגדרת בערוץ נתמך"
          },
          {
            "label": "שליחת תשובה רלוונטית",
            "detail": "הודעה או תבנית כשנתמך"
          },
          {
            "label": "שאלת המשך",
            "detail": "לכידת פרטי עניין"
          },
          {
            "label": "הוספת תג",
            "detail": "סימון עניין לצוות"
          },
          {
            "label": "המשך השיחה",
            "detail": "מעקב אנושי ב-inbox"
          }
        ]
      },
      {
        "title": "לכידת ליד",
        "summary": "הגיבו מיד, לכדו שם וצורך, ואז הקצו למעקב צוות.",
        "nodes": [
          {
            "label": "שיחה חדשה",
            "detail": "לכידה מיידית מחוץ לשעות"
          },
          {
            "label": "שליחת הודעת ברוכים הבאים",
            "detail": "הצבת ציפיות במהירות"
          },
          {
            "label": "לכידת שם וצורך",
            "detail": "לכידת קלט נתמכת"
          },
          {
            "label": "הקצאה לצוות",
            "detail": "פעולת הקצאה נתמכת"
          },
          {
            "label": "מעקב צוות",
            "detail": "הבעלים ממשיך ב-Unified Inbox"
          }
        ]
      }
    ],
    "problemTitle": "למה צוותים צריכים בונה ויזואלי",
    "problems": [
      {
        "title": "הודעות מחוץ לשעות נשארות ללא מענה",
        "description": "prospects שואלים כשאף אחד לא מחובר, ואז נעלמים."
      },
      {
        "title": "תשובות FAQ חוזרות כל היום",
        "description": "סוכנים מבלים זמן על אותן תשובות ראשונות במקום לסגור עבודה."
      },
      {
        "title": "ניתוב ידני",
        "description": "בלי לכידה מובנית, כל פנייה נראית אותו דבר ב-inbox."
      },
      {
        "title": "העברות מאבדות הקשר",
        "description": "כשאדם לוקח שליטה, פרטי המסע חסרים."
      }
    ],
    "howIntro": "עצבו זרימות עם שלבי הודעה, שאלה, השהיה ופעולה. הפעילו בערוצים נתמכים והמשיכו שיחות עם הצוות.",
    "howPoints": [
      {
        "title": "בניית זרימה ויזואלית",
        "description": "חברו מסעות עם צמתי הודעה, שאלה, השהיה ופעולה."
      },
      {
        "title": "לכדו מה הם צריכים",
        "description": "שאלו שאלות ואספו את הפרטים שהצוות צריך לפני מעקב."
      },
      {
        "title": "עדכנו הקשר CRM",
        "description": "החילו תגים, סטטוס, pipeline או פעולות הקצאה ככל שהזרימה מתקדמת."
      },
      {
        "title": "המשיכו ב-Unified Inbox",
        "description": "כשאדם צריך לקחת שליטה, השיחה נשארת בסביבת העבודה המשותפת."
      }
    ],
    "featuresTitle": "יכולות הבונה",
    "features": [
      {
        "label": "צמתי הודעה",
        "description": "שלחו טקסט, מדיה, כפתורים או הודעות תבנית כשנתמך."
      },
      {
        "label": "שאלות ולכידת קלט",
        "description": "בקשו את הפרטים שהצוות צריך לפני ניתוב."
      },
      {
        "label": "שלבי השהיה",
        "description": "קבעו קצב למסע כדי שההודעות ירגישו טבעיות."
      },
      {
        "label": "שלבי פעולה",
        "description": "הגדירו תגים, סטטוס, שלב pipeline או הקצו חבר צוות."
      },
      {
        "label": "טריגרים",
        "description": "התחילו בצ'אט חדש, מילות מפתח וערוצים נבחרים."
      },
      {
        "label": "ערוצים נתמכים",
        "description": "WhatsApp, Instagram, Facebook, SMS, צ'אט web, Telegram ו-GoHighLevel כשמחובר."
      }
    ],
    "workflowTitle": "מסע סינון טיפוסי",
    "workflowSteps": [
      {
        "label": "הודעה חדשה",
        "description": "לקוח מתחיל שיחה בערוץ מחובר."
      },
      {
        "label": "הודעת ברוכים הבאים",
        "description": "הזרימה מקבלת פנים ומציבה ציפיות."
      },
      {
        "label": "שאלו מה הם צריכים",
        "description": "צומת שאלה לוכד כוונה."
      },
      {
        "label": "המשיכו את הזרימה",
        "description": "שלחו הודעה הבאה או שאלו שאלה נתמכת נוספת."
      },
      {
        "label": "לכידת פרטי קשר",
        "description": "אספו את המידע שהצוות צריך למעקב."
      },
      {
        "label": "סינון והקצאה",
        "description": "תייגו, עדכנו שלב, הקצו בעלים והמשיכו ב-Unified Inbox."
      }
    ],
    "useCases": [
      {
        "situation": "צריך לכידת לידים מחוץ לשעות.",
        "action": "הפעילו זרימת ברוכים הבאים + סינון כשצ'אט חדש מתחיל.",
        "outcome": "צוות הבוקר פותח inbox עם פניות מובנות."
      },
      {
        "situation": "לקוחות שואלים את אותן שאלות נפוצות.",
        "action": "בנו נתיב הודעות שעונה על שאלות נפוצות לפני הצעת אדם.",
        "outcome": "סוכנים משקיעים זמן בשיחות בעלות ערך גבוה יותר."
      },
      {
        "situation": "שירותים שונים צריכים בעלים שונים.",
        "action": "השתמשו בטריגרי מילת מפתח או פעולות הקצאה לנתב לחבר הצוות הנכון.",
        "outcome": "ניתוב קורה לפני התשובה האנושית הראשונה."
      },
      {
        "situation": "מכירות רוצה רק לידים מוכנים.",
        "action": "לכדו תשובות סינון, תייגו מוכנות והעבירו.",
        "outcome": "Unified Inbox מתחיל עם הקשר הזדמנות ברור יותר."
      }
    ],
    "relatedProducts": [
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "שם העברות chatbot ממשיכות."
      },
      {
        "label": "זרימות עבודה ואוטומציות",
        "href": "/automations",
        "description": "מעקב חוזר אחרי הזרימה."
      },
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "מסייע לאנשים אחרי שהבוט מסנן."
      },
      {
        "label": "AI Brain",
        "href": "/ai-brain",
        "description": "הקשר עסקי לסיוע חכם יותר."
      },
      {
        "label": "שיתוף פעולה בצוות",
        "href": "/shared-team-inbox",
        "description": "הקצאות ובעלות משותפת."
      }
    ],
    "industryLinks": [
      {
        "label": "מסחר אלקטרוני",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "עסקים מקומיים ושירותים",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "סוכנויות שיווק",
        "href": "/solutions/marketing-agencies"
      }
    ],
    "howItWorks": [
      {
        "title": "פתחו Chatbot Builder",
        "description": "זמין בתוכניות שכוללות מסעות chatbot."
      },
      {
        "title": "עצבו את הנתיב הראשון",
        "description": "הוסיפו ברוכים הבאים, שאלות, פעולות ושלבי הקצאה."
      },
      {
        "title": "בחרו טריגרים וערוצים",
        "description": "החליטו מתי הזרימה מתחילה ואיפה היא יכולה לרוץ."
      },
      {
        "title": "העבירו ל-inbox",
        "description": "תנו לצוות להמשיך עם Copilot ואוטומציות."
      }
    ],
    "finalCtaHeadline": "השיקו מסעות שהלקוחות יכולים לעקוב אחריהם",
    "finalCtaSubtitle": "התחילו בחינם, בנו את נתיב ה-chatbot הראשון, ושמרו כל שיחה מסוננת ב-Unified Inbox.",
    "ssrBullets": [
      "בונה chatbot ויזואלי עם שלבי הודעה, שאלה, השהיה ופעולה",
      "טריגרי מילת מפתח וצ'אט חדש בערוצים נתמכים",
      "פעולות תגים, סטטוס, pipeline והקצאה",
      "העברה ל-Unified Inbox למעקב אנושי",
      "עובד עם Copilot, AI Brain ואוטומציות"
    ]
  },
  "/automations": {
    "productLabel": "זרימות עבודה ואוטומציות",
    "breadcrumbLabel": "זרימות עבודה ואוטומציות",
    "title": "זרימות עבודה ואוטומציות CRM | WhachatCRM",
    "metaDescription": "אוטומטו מעקב ב-WhachatCRM עם זרימות עבודה ותבניות מוכנות. הפעילו בצ'אטים חדשים, מילות מפתח, תגים, שלבים או ללא מענה — ואז הקצו, עדכנו אנשי קשר והמשיכו שיחות.",
    "ogTitle": "זרימות עבודה ואוטומציות | WhachatCRM",
    "h1": "אוטומטו את עבודת המעקב שמקדמת לידים",
    "heroIntro": "זרימות עבודה ואוטומציות עוזרות לצוות להגיב לרגעים חוזרים — צ'אטים חדשים, מילות מפתח, שינויי שלב, תגים ולידים שקטים — בלי לבנות מחדש את התהליך בכל פעם. השתמשו בזרימות מותאמות או התחילו מתבניות מוכנות.",
    "secondaryCta": {
      "label": "עיינו בתבניות אוטומציה",
      "href": "/automation-templates"
    },
    "heroVisual": {
      "inquiryLabel": "טריגר",
      "inquiryMessage": "ללא מענה 24 שעות על ליד מסונן.",
      "suggestionLabel": "פעולת אוטומציה",
      "suggestionMessage": "הקצאת בעלים → הוספת תג מעקב → הגדרת תזכורת מעקב.",
      "stageLabel": "בטיפוח",
      "nextStep": "הבא: המשך זרימת עבודה"
    },
    "screenshotKey": "automationWorkflows",
    "screenshotAlt": "בונה זרימות WhachatCRM עם טריגרי אוטומציה ופעולות מעקב",
    "flowScenarios": [
      {
        "title": "מעקב ללא תגובה",
        "summary": "כשאיש קשר שקט, התחילו נתיב מעקב ושמרו על הקשר pipeline מדויק.",
        "nodes": [
          {
            "label": "ללא מענה",
            "detail": "איש הקשר לא הגיב אחרי ההשהיה שנבחרה"
          },
          {
            "label": "הוספה או עדכון תג",
            "detail": "סימון מצב המעקב"
          },
          {
            "label": "הגדרת שלב pipeline",
            "detail": "שמירה על סטטוס ההזדמנות עדכני"
          },
          {
            "label": "הקצאת חבר צוות",
            "detail": "ניתוב בעלות למגע הבא"
          },
          {
            "label": "המשך טיפוח",
            "detail": "מעקב אנושי או קמפיין ממשיך"
          }
        ]
      },
      {
        "title": "ניתוב לפי מילת מפתח",
        "summary": "נתבו מילות מפתח בעלות כוונה גבוהה לבעלים הנכון עם שלב הבא ברור.",
        "nodes": [
          {
            "label": "מילת מפתח זוהתה",
            "detail": "ההודעה מכילה מילת מפתח מוגדרת"
          },
          {
            "label": "הוספת תג",
            "detail": "סימון כוונה לצוות"
          },
          {
            "label": "הקצאת חבר צוות",
            "detail": "Round robin או בעלים ספציפי"
          },
          {
            "label": "הגדרת מעקב",
            "detail": "תזמון התזכורת הבאה"
          },
          {
            "label": "הבעלים מגיב",
            "detail": "השיחה ממשיכה ב-Unified Inbox"
          }
        ]
      },
      {
        "title": "התקדמות שלב",
        "summary": "כשאיש קשר מגיע לשלב pipeline מוגדר, התחילו את שלבי הזרימה הבאים.",
        "nodes": [
          {
            "label": "שינוי שלב pipeline",
            "detail": "איש הקשר עובר לשלב מוגדר"
          },
          {
            "label": "הקצאה או עדכון איש קשר",
            "detail": "שמירה על בעלות וסטטוס מיושרים"
          },
          {
            "label": "הגדרת מעקב",
            "detail": "התחלת תזמון המעקב הרלוונטי"
          },
          {
            "label": "הזרימה ממשיכה",
            "detail": "צוות ואוטומציות נשארים מסונכרנים"
          }
        ]
      }
    ],
    "problemTitle": "מעקב ידני לא מתרחב",
    "problems": [
      {
        "title": "לידים שקטים מתקררים",
        "description": "בלי נתיב ללא מענה, שיחות מבטיחות נתקעות ב-inbox."
      },
      {
        "title": "העברות לא עקביות",
        "description": "תגים, שלבים ובעלים מתעדכנים אחרת על ידי כל חבר צוות."
      },
      {
        "title": "עבודת קבלת פנים חוזרת",
        "description": "כל צ'אט חדש צריך את אותן פעולות ראשונות לפני שאדם מתעמק."
      },
      {
        "title": "תבניות קשות למצוא",
        "description": "צוותים רוצים נקודות התחלה מוכחות בלי להמציא כל זרימה."
      }
    ],
    "howIntro": "בנו אוטומציות לכל הפלטפורמה לעבודת CRM יומיומית. סביבות Growth Engine נשארות קמפיינים ארוזים נפרדים לאינטליגנציה ספציפית לתעשייה.",
    "howPoints": [
      {
        "title": "התחילו מטריגר",
        "description": "הגיבו לצ'אטים חדשים, הודעות, מילות מפתח, תגים, שינויי שלב, ללא מענה ועוד."
      },
      {
        "title": "החילו פעולות CRM",
        "description": "הקצו חברי צוות, עדכנו תגים, סטטוס, pipeline, הערות או תזמון מעקב."
      },
      {
        "title": "השתמשו בתבניות כשעוזר",
        "description": "עיינו בספריית תבניות האוטומציה לנקודות התחלה מוכנות להתאמה."
      },
      {
        "title": "שמרו Growth Engines נפרדים",
        "description": "Realtor Growth Engine וחבילות דומות נשארות בסביבה משלהן — לא מעורבבות באוטומציות גלובליות."
      }
    ],
    "featuresTitle": "טריגרים, פעולות ותבניות",
    "features": [
      {
        "label": "טריגרים נפוצים",
        "description": "צ'אט חדש, הודעה חדשה, מילת מפתח, ללא מענה, תג נוסף/הוסר, שינוי pipeline ועוד."
      },
      {
        "label": "פעולות CRM",
        "description": "הקצאה, תיוג, הגדרת סטטוס, pipeline, הוספת הערות ותזמון מעקב."
      },
      {
        "label": "בונה זרימות",
        "description": "חברו אוטומציות רב-שלביות שהצוות יכול לתחזק.",
        "href": "/automations"
      },
      {
        "label": "תבניות אוטומציה",
        "description": "Presets מוכנים להתאמה לנתיבי קבלת פנים, טיפוח ותמיכה.",
        "href": "/automation-templates"
      },
      {
        "label": "רישום לקמפיין",
        "description": "המשיכו רצפי טיפוח ארוכים יותר כשרישום לקמפיין נתמך.",
        "href": "/campaigns"
      },
      {
        "label": "שיתוף פעולה בצוות",
        "description": "פעולות הקצאה שומרות על בעלות ברורה כשאוטומציות מופעלות.",
        "href": "/shared-team-inbox"
      }
    ],
    "workflowTitle": "זרימת מעקב ללא מענה",
    "workflowSteps": [
      {
        "label": "טריגר",
        "description": "ללא מענה אחרי חלון מוגדר בשיחה מנוטרת."
      },
      {
        "label": "בדיקת תנאי",
        "description": "אשרו שאיש הקשר עדיין תואם לשלב או תג המיועד."
      },
      {
        "label": "עדכון איש קשר",
        "description": "החילו תג או שלב מעקב כדי שה-pipeline יישאר מדויק."
      },
      {
        "label": "הקצאת בעלים",
        "description": "נתבו בעלות לחבר הצוות הנכון."
      },
      {
        "label": "שליחה או המלצת מעקב",
        "description": "המשיכו את השיחה עם נתיב תזכורת."
      },
      {
        "label": "המשך קמפיין או זרימה",
        "description": "המשיכו לטפח עד שאדם סוגר את המעגל."
      }
    ],
    "useCases": [
      {
        "situation": "צ'אט חדש צריך קבלת פנים עקבית.",
        "action": "הפעילו בצ'אט חדש, תייגו את הליד והקצו בעלים.",
        "outcome": "כל פנייה מתחילה באותו סטנדרט תפעולי."
      },
      {
        "situation": "מילות מפתח כוונה מסמנות בקשה חמה.",
        "action": "טריגר מילת מפתח מעדכן שלב ומודיע לחבר הצוות הנכון.",
        "outcome": "הודעות בעלות כוונה גבוהה מקבלות עדיפות מהר."
      },
      {
        "situation": "prospect שקט אחרי תמחור.",
        "action": "אוטומציה ללא מענה מתזמנת מעקב ושומרת היסטוריה.",
        "outcome": "לידים שקטים חוזרים לנתיב השיחה."
      },
      {
        "situation": "לידים מסוננים צריכים לעבור שלבים.",
        "action": "שינויי שלב או תג מפעילים את שלבי הזרימה הבאים.",
        "outcome": "היגיינת pipeline קורית בלי ניקוי ידני."
      },
      {
        "situation": "רוצים נקודות התחלה מוכחות.",
        "action": "פתחו את ספריית תבניות האוטומציה והתאימו.",
        "outcome": "צוותים משיקים מהר יותר בלי להמציא כל נתיב."
      }
    ],
    "relatedProducts": [
      {
        "label": "תבניות אוטומציה",
        "href": "/automation-templates",
        "description": "ספריית תבניות אוטומציה מוכנות לשימוש."
      },
      {
        "label": "קמפיינים",
        "href": "/campaigns",
        "description": "רצפי טיפוח והפעלה מחדש ארוכים יותר."
      },
      {
        "label": "Chatbot Builder",
        "href": "/chatbot-builder",
        "description": "מסעות כניסה לפני אוטומציה."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "שם עבודה אוטומטית פוגשת תשובות אנושיות."
      },
      {
        "label": "Realtor Growth Engine",
        "href": "/realtor-growth-engine",
        "description": "זרימות Growth Engine ארוזות לתעשייה."
      }
    ],
    "industryLinks": [
      {
        "label": "נדל״ן",
        "href": "/real-estate-crm"
      },
      {
        "label": "עסקים מקומיים ושירותים",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "סוכנויות שיווק",
        "href": "/solutions/marketing-agencies"
      }
    ],
    "howItWorks": [
      {
        "title": "בחרו טריגר",
        "description": "התחילו מהרגע שצריך להפעיל עבודה."
      },
      {
        "title": "הוסיפו פעולות CRM",
        "description": "הקצו, תייגו, עדכנו שלב והמשיכו מעקב."
      },
      {
        "title": "או התחילו מתבנית",
        "description": "עיינו ב-/automation-templates והתאימו preset."
      },
      {
        "title": "עקבו ב-Unified Inbox",
        "description": "אנשים לוקחים שליטה כשהשיחה צריכה שיקול דעת."
      }
    ],
    "finalCtaHeadline": "הפסיקו לבנות מחדש את אותו מעקב כל יום",
    "finalCtaSubtitle": "התחילו בחינם, צרו את הזרימה הראשונה, או התאימו תבנית מספריית האוטומציה.",
    "ssrBullets": [
      "בונה זרימות לאוטומציות בכל הפלטפורמה",
      "טריגרים לצ'אטים חדשים, מילות מפתח, תגים, שלבים וללא מענה",
      "פעולות CRM להקצאה, תיוג, סטטוס, pipeline ומעקב",
      "תבניות מוכנות ב-/automation-templates",
      "נפרד מחבילות Growth Engine לפי תעשייה"
    ]
  },
  "/campaigns": {
    "productLabel": "קמפיינים",
    "breadcrumbLabel": "קמפיינים",
    "title": "קמפיינים CRM ופנייה מותאמת אישית | WhachatCRM",
    "metaDescription": "צרו קמפיינים CRM מותאמים אישית ב-WhachatCRM. בחרו קהלים, בחרו ערוצי הודעות נתמכים, התאימו אישית עם AI Brain כשמופעל, רשמו אנשי קשר, עקבו אחר התקדמות והמשיכו מעקב.",
    "ogTitle": "קמפיינים — פנייה מותאמת אישית | WhachatCRM",
    "h1": "צרו קמפיינים מותאמים אישית שממשיכים את השיחה",
    "heroIntro": "קמפיינים עוזרים לרשום את אנשי הקשר הנכונים בערוצי הודעות נתמכים, להתאים אישית פנייה עם הקשר עסקי ולשמור על מעקב — בלי לטפל בכל שליחה כשידור חד-פעמי.",
    "secondaryCta": {
      "label": "גלו AI Brain",
      "href": "/ai-brain"
    },
    "heroVisual": {
      "inquiryLabel": "קהל",
      "inquiryMessage": "prospects מסוננים מתויגים \"מוכנים לטיפוח\".",
      "suggestionLabel": "שלב קמפיין",
      "suggestionMessage": "הודעת WhatsApp מותאמת אישית → המתנה → מעקב אם אין מענה.",
      "stageLabel": "פעיל",
      "nextStep": "הבא: מעקב אחר רישום"
    },
    "screenshotKey": "automationTemplateCards",
    "screenshotAlt": "כרטיסי תבנית קמפיין ואוטומציה לרצפי טיפוח והפעלה מחדש",
    "problemTitle": "למה קמפיינים חשובים אחרי התשובה הראשונה",
    "problems": [
      {
        "title": "לידים מסוננים שקטים",
        "description": "בלי נתיב מתוזמן, העניין דועך אחרי הודעה אחת."
      },
      {
        "title": "הפנייה מרגישה גנרית",
        "description": "תבניות שמתעלמות מהקשר העסקי מבצעות פחות טוב."
      },
      {
        "title": "כללי ערוץ מתעלמים מהם",
        "description": "צוותים צריכים רישום שמכבד ערוצים מחוברים וחלונות הודעות."
      },
      {
        "title": "קשה לראות סטטוס",
        "description": "מצבי טיוטה, פעיל, מושהה והושלם צריכים להישאר ברורים."
      }
    ],
    "howIntro": "בחרו קהל, בחרו ערוץ נתמך, צרו או התאימו אישית את ההודעה, בדקו, רשמו אנשי קשר והמשיכו מעקב לפי התקדמות הקמפיין.",
    "howPoints": [
      {
        "title": "קהל ורישום",
        "description": "רשמו אנשי קשר לרצפי קמפיין עם בדיקות זכאות."
      },
      {
        "title": "שליחה מודעת לערוץ",
        "description": "קמפיינים רצים בערוצי הודעות נתמכים כמו WhatsApp, Instagram, Facebook, SMS, צ'אט web ו-Telegram כשמחוברים."
      },
      {
        "title": "התאמה אישית",
        "description": "השתמשו ב-placeholders והתאמה אישית מסייעת AI כשמופעל — כולל הקשר AI Brain."
      },
      {
        "title": "נראות מחזור חיים",
        "description": "עקבו אחר מצבי קמפיין טיוטה, פעיל, מושהה והושלם."
      }
    ],
    "featuresTitle": "יכולות קמפיין",
    "features": [
      {
        "label": "בחירת קהל",
        "description": "רשמו את אנשי הקשר שתואמים למטרת המעקב."
      },
      {
        "label": "ערוצי הודעות נתמכים",
        "description": "ערכת הודעות ממוקדת WhatsApp עם Instagram, Facebook, SMS, צ'אט web ו-Telegram כשמחוברים."
      },
      {
        "label": "יצירת הודעות",
        "description": "בנו שלבים עם תבניות ו-placeholders."
      },
      {
        "label": "התאמה אישית AI Brain",
        "description": "התאמה אישית עמוקה יותר מודעת לעסק כש-Brain מופעל.",
        "href": "/ai-brain"
      },
      {
        "label": "רצף ומעקב",
        "description": "המשיכו את השיחה לאורך זמן במקום שידור בודד."
      },
      {
        "label": "מודעות להסכמה וחלונות",
        "description": "רישום מכבד חיבור ערוץ, opt-out ובדיקות זכאות הודעות."
      }
    ],
    "workflowTitle": "מקהל למעקב מתמשך",
    "workflowSteps": [
      {
        "label": "בחירת קהל",
        "description": "בחרו אנשי קשר מוכנים לפנייה או הפעלה מחדש."
      },
      {
        "label": "בחירת ערוץ נתמך",
        "description": "בחרו ערוץ הודעות מחובר שהקמפיין יכול להשתמש בו."
      },
      {
        "label": "יצירה או התאמה אישית של הודעה",
        "description": "כתבו שלבים עם placeholders או התאמה אישית מסייעת AI."
      },
      {
        "label": "בדיקת קמפיין",
        "description": "אשרו סטטוס, שלבים וזכאות לפני השקה."
      },
      {
        "label": "שליחה או רישום אנשי קשר",
        "description": "התחילו רישום כשהקמפיין מוכן."
      },
      {
        "label": "מעקב והמשך מעקב",
        "description": "עקבו אחר התקדמות והמשיכו לטפח עד שאדם סוגר את המעגל."
      }
    ],
    "useCases": [
      {
        "situation": "prospects מסוננים צריכים מעקב מובנה.",
        "action": "רשמו אותם לרצף טיפוח מותאם אישית.",
        "outcome": "העניין נשאר חם בלי רדיפה ידנית יומית."
      },
      {
        "situation": "פניות קודמות שקטו.",
        "action": "הפעילו מחדש אנשי קשר זכאים בערוץ נתמך.",
        "outcome": "הזדמנויות ישנות מקבלות מגע רלוונטי נוסף."
      },
      {
        "situation": "רוצים פנייה שמשקפת את ההצעה.",
        "action": "התאימו אישית עם placeholders והקשר AI Brain.",
        "outcome": "הודעות נשמעות קרוב יותר לאיך העסק באמת מוכר."
      },
      {
        "situation": "Prospect AI מצא רשימה ששווה ליצור קשר.",
        "action": "המשיכו פנייה מותאמת אישית ונהלו תשובות ב-Unified Inbox.",
        "outcome": "גילוי ושיחה נשארים ב-CRM אחד."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Brain",
        "href": "/ai-brain",
        "description": "הקשר עסקי מאושר להתאמה אישית."
      },
      {
        "label": "Prospect AI",
        "href": "/prospect-ai",
        "description": "מצאו prospects לרישום בפנייה."
      },
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "נהלו תשובות משיחות קמפיין."
      },
      {
        "label": "זרימות עבודה ואוטומציות",
        "href": "/automations",
        "description": "הפעילו מעקב סביב פעילות קמפיין."
      }
    ],
    "industryLinks": [
      {
        "label": "עסקים מקומיים ושירותים",
        "href": "/solutions/local-service-businesses"
      },
      {
        "label": "סוכנויות שיווק",
        "href": "/solutions/marketing-agencies"
      },
      {
        "label": "מסחר אלקטרוני",
        "href": "/solutions/ecommerce"
      }
    ],
    "howItWorks": [
      {
        "title": "הכינו את הקהל",
        "description": "תייגו או סווגו אנשי קשר כדי שהרישום יהיה מכוון."
      },
      {
        "title": "בנו את הרצף",
        "description": "צרו שלבים בערוץ הודעות נתמך."
      },
      {
        "title": "התאימו אישית בזהירות",
        "description": "השתמשו ב-placeholders והקשר Brain כשמופעל."
      },
      {
        "title": "רשמו ועקבו",
        "description": "עקבו אחר התקדמות וענו ב-Unified Inbox."
      }
    ],
    "finalCtaHeadline": "המשיכו את השיחה אחרי המגע הראשון",
    "finalCtaSubtitle": "התחילו בחינם, צרו קמפיין מותאם אישית ונהלו תשובות באותה סביבת CRM.",
    "ssrBullets": [
      "רישום קהל עם מעקב סטטוס קמפיין",
      "ערוצי הודעות נתמכים כולל WhatsApp",
      "Placeholders והתאמה אישית מסייעת AI כשמופעל",
      "מעקב מתוזמן במקום שידורים חד-פעמיים",
      "בדיקות זכאות לחיבור, opt-out והתאמת ערוץ"
    ]
  },
  "/integrations": {
    "productLabel": "אינטגרציות",
    "breadcrumbLabel": "אינטגרציות",
    "title": "מדריך אינטגרציות CRM | WhachatCRM",
    "metaDescription": "חברו WhachatCRM לערוצי הודעות וכלים עסקיים שכבר בשימוש — WhatsApp, Instagram, Facebook, SMS, email, Shopify, GoHighLevel, Calendly, Stripe ועוד.",
    "ogTitle": "אינטגרציות — חברו את הכלים שלכם | WhachatCRM",
    "h1": "חברו WhachatCRM לכלים שהעסק שלכם כבר משתמש בהם",
    "heroIntro": "אינטגרציות מביאות שיחות עם לקוחות וכלים עסקיים יומיומיים לסביבת CRM אחת — כדי שהודעות, תזמון, מסחר ומעקב יישארו מחוברים.",
    "secondaryCta": {
      "label": "ראו Unified Inbox",
      "href": "/unified-inbox"
    },
    "heroVisual": {
      "inquiryLabel": "ערוץ מחובר",
      "inquiryMessage": "WhatsApp דרך Meta Embedded Signup מוכן.",
      "suggestionLabel": "כלי עסקי",
      "suggestionMessage": "קישורי הזמנה Calendly והקשר Shopify ליד השיחה.",
      "stageLabel": "מחובר",
      "nextStep": "הבא: פתחו Unified Inbox"
    },
    "screenshotKey": "channels",
    "screenshotAlt": "ערוצי הודעות מחוברים של WhachatCRM כולל WhatsApp ופלטפורמות חברתיות",
    "problemTitle": "כלים מנותקים מאטים כל תשובה",
    "problems": [
      {
        "title": "שיחות חיות מחוץ ל-CRM",
        "description": "תשובות WhatsApp, Instagram ו-email מתפזרות בין אפליקציות."
      },
      {
        "title": "הקשר מסחרי במקום אחר",
        "description": "כלי חנות והזמנות לא יושבים ליד שרשור ההודעה."
      },
      {
        "title": "הגדרה מרתיעה",
        "description": "צוותים צריכים יעדים ברורים ל-Meta, Shopify ופלטפורמות שותפות."
      },
      {
        "title": "לא כל מחבר צריך מכירה אגרסיבית",
        "description": "מדריך אמין מציג רק אינטגרציות שבאמת אפשר להשתמש בהן."
      }
    ],
    "howIntro": "חברו את הערוצים והפלטפורמות שמתאימים לזרימת העבודה, ואז נהלו שיחות ומעקב ב-WhachatCRM.",
    "howPoints": [
      {
        "title": "חברו הודעות קודם",
        "description": "הביאו WhatsApp, Instagram, Facebook, SMS, Telegram, צ'אט web ו-email ל-Unified Inbox."
      },
      {
        "title": "הוסיפו פלטפורמות עסקיות",
        "description": "קשרו מסחר, תזמון, תשלומים וכלי סוכנות כשזמינים."
      },
      {
        "title": "השתמשו במדריכים ייעודיים כשצריך",
        "description": "דפי Shopify, GoHighLevel, WhatsApp API ו-MLS מעמיקים בהגדרה וערך."
      },
      {
        "title": "המשיכו לעבוד ב-inbox אחד",
        "description": "אינטגרציות חשובות ביותר כשהן תומכות בשיחה חיה."
      }
    ],
    "featuresTitle": "מה אפשר לחבר",
    "features": [
      {
        "label": "WhatsApp רשמי דרך Meta",
        "description": "נתיב Embedded Signup לגישה ל-WhatsApp Business API.",
        "href": "/whatsapp-business-api"
      },
      {
        "label": "הודעות חברתיות",
        "description": "שיחות Instagram ו-Facebook Messenger ב-inbox אחד.",
        "href": "/unified-inbox"
      },
      {
        "label": "Shopify",
        "description": "חברו הקשר חנות עם זרימות הודעות WhachatCRM.",
        "href": "/shopify-crm"
      },
      {
        "label": "GoHighLevel",
        "description": "חיבור ידידותי לסוכנויות שכבר פועלות ב-GHL.",
        "href": "/go-high-level-agencies"
      },
      {
        "label": "Calendly ו-Stripe",
        "description": "כלי הזמנה ותשלום שתומכים בשלב הבא של הלקוח."
      },
      {
        "label": "מלאי נדל״ן",
        "description": "נתיבי MLS ו-Showcase IDX לזרימות מודעות לרישום.",
        "href": "/crm-with-mls-integration"
      }
    ],
    "workflowTitle": "מחיבור לשיחה",
    "workflowSteps": [
      {
        "label": "בחרו ערוץ או כלי",
        "description": "בחרו הודעות או פלטפורמה עסקית מהמדריך."
      },
      {
        "label": "השלימו הגדרה מודרכת",
        "description": "עקבו אחר Meta Embedded Signup או זרימת האינטגרציה הרלוונטית."
      },
      {
        "label": "אשרו את החיבור",
        "description": "ודאו שהערוץ או הפלטפורמה מופיעים בסביבת העבודה."
      },
      {
        "label": "פתחו Unified Inbox",
        "description": "התחילו לנהל שיחות עם הקשר בקרבת מקום."
      },
      {
        "label": "הוסיפו AI ואוטומציה",
        "description": "שכבו Copilot, chatbots וזרימות על ערוצים מחוברים."
      },
      {
        "label": "התרחבו עם הצמיחה",
        "description": "חברו מסחר, תזמון או כלי שותפים כשמוכנים."
      }
    ],
    "useCases": [
      {
        "situation": "צריך WhatsApp רשמי להודעות עסקיות.",
        "action": "חברו WhatsApp דרך Meta ופתחו Unified Inbox.",
        "outcome": "צ'אטים עם לקוחות נוחתים בסביבת CRM משותפת."
      },
      {
        "situation": "החנות רצה על Shopify.",
        "action": "השתמשו בנתיב Shopify CRM לחיבור הקשר מסחר.",
        "outcome": "הודעות ותפעול חנות נשארים קרובים יותר."
      },
      {
        "situation": "הסוכנות כבר משתמשת ב-GoHighLevel.",
        "action": "חברו WhachatCRM דרך נתיב סוכנויות GHL.",
        "outcome": "הודעות ו-AI יושבים ליד ה-stack הקיים."
      },
      {
        "situation": "צוותי נדל״ן צריכים הקשר רישום.",
        "action": "גלו נתיבי אינטגרציה MLS / Showcase IDX.",
        "outcome": "שיחות יכולות להתייחס למלאי בקלות רבה יותר."
      }
    ],
    "relatedProducts": [
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "שם ערוצים מחוברים נפגשים."
      },
      {
        "label": "WhatsApp Business API",
        "href": "/whatsapp-business-api",
        "description": "מדריך הגדרת WhatsApp רשמי."
      },
      {
        "label": "Shopify CRM",
        "href": "/shopify-crm",
        "description": "דף מוצר אינטגרציית Shopify."
      },
      {
        "label": "סוכנויות GoHighLevel",
        "href": "/go-high-level-agencies",
        "description": "נתיב marketplace GHL."
      }
    ],
    "industryLinks": [
      {
        "label": "מסחר אלקטרוני",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "סוכנויות שיווק",
        "href": "/solutions/marketing-agencies"
      },
      {
        "label": "נדל״ן",
        "href": "/real-estate-crm"
      }
    ],
    "integrationCategories": [
      {
        "title": "הודעות",
        "items": [
          {
            "name": "WhatsApp",
            "description": "Meta Embedded Signup רשמי ל-WhatsApp Business API.",
            "href": "/whatsapp-business-api"
          },
          {
            "name": "Instagram",
            "description": "נהלו שיחות Instagram ב-Unified Inbox.",
            "href": "/unified-inbox"
          },
          {
            "name": "Facebook Messenger",
            "description": "הביאו שרשורי Messenger לאותה סביבת עבודה.",
            "href": "/unified-inbox"
          },
          {
            "name": "SMS",
            "description": "שיחות טקסט ליד שאר הערוצים.",
            "href": "/unified-inbox"
          },
          {
            "name": "Telegram",
            "description": "ערוץ הודעות נתמך לסביבות מחוברות.",
            "href": "/unified-inbox"
          },
          {
            "name": "Web Chat",
            "description": "שיחות widget אתר ל-Unified Inbox.",
            "href": "/unified-inbox"
          },
          {
            "name": "Email / Gmail",
            "description": "Email ליד ערוצי הודעות כשמחובר.",
            "href": "/unified-inbox"
          }
        ]
      },
      {
        "title": "פלטפורמות עסקיות",
        "items": [
          {
            "name": "Shopify",
            "description": "חברו Shopify עם זרימות הודעות WhachatCRM.",
            "href": "/shopify-crm"
          },
          {
            "name": "GoHighLevel",
            "description": "חיבור marketplace סוכנות למפעילי GHL.",
            "href": "/go-high-level-agencies"
          },
          {
            "name": "Calendly",
            "description": "שתפו קישורי הזמנה ושמרו תזמון ליד שיחות."
          },
          {
            "name": "Stripe",
            "description": "כלי תשלום זמינים בפלטפורמת WhachatCRM."
          },
          {
            "name": "Google Sheets",
            "description": "חיבור גיליון אלקטרוני לזרימות תפעוליות."
          },
          {
            "name": "HubSpot",
            "description": "חיבור CRM המופיע בסביבת האינטגרציות."
          },
          {
            "name": "WooCommerce",
            "description": "חיבור מסחר לצוותי חנות."
          }
        ]
      },
      {
        "title": "נדל״ן",
        "items": [
          {
            "name": "Showcase IDX",
            "description": "נתיב מלאי IDX לצוותי נדל״ן.",
            "href": "/crm-with-mls-integration"
          },
          {
            "name": "MLS / Bridge Interactive",
            "description": "זרימות CRM מודעות MLS להקשר רישום.",
            "href": "/crm-with-mls-integration"
          }
        ]
      }
    ],
    "howItWorks": [
      {
        "title": "בחרו את האינטגרציה שצריך",
        "description": "התחילו מהודעות, ואז הוסיפו מסחר או כלי תזמון."
      },
      {
        "title": "עקבו אחר יעד ההגדרה",
        "description": "השתמשו בדפים ייעודיים כשקיימים; אחרת חברו באפליקציה."
      },
      {
        "title": "אשרו ב-Unified Inbox",
        "description": "ודאו ששיחות מגיעות איפה שהצוות עובד."
      },
      {
        "title": "שכבו AI ואוטומציה",
        "description": "הוסיפו Copilot, chatbots וזרימות אחרי שהערוצים פעילים."
      }
    ],
    "finalCtaHeadline": "הביאו את הכלים שלכם לסביבת שיחה אחת",
    "finalCtaSubtitle": "התחילו בחינם, חברו את הערוץ הראשון, וגלו מדריכים מעמיקים ל-Shopify, WhatsApp ו-GoHighLevel.",
    "ssrBullets": [
      "ערוצי הודעות כולל WhatsApp, Instagram, Facebook, SMS, Telegram, צ'אט web ו-email",
      "פלטפורמות עסקיות כמו Shopify, GoHighLevel, Calendly ו-Stripe",
      "נתיבי נדל״ן ל-MLS ו-Showcase IDX",
      "מדריכים ייעודיים ל-WhatsApp API, Shopify CRM וסוכנויות GHL",
      "Unified Inbox כיעד לשיחות מחוברות"
    ]
  },
  "/unified-inbox": {
    "productLabel": "Unified Inbox",
    "breadcrumbLabel": "Unified Inbox",
    "title": "Unified Inbox להודעות רב-ערוציות | WhachatCRM",
    "metaDescription": "WhachatCRM Unified Inbox מביא WhatsApp, Instagram, Facebook, SMS, Telegram, צ'אט web ו-email לסביבת עבודה חכמה אחת עם הקצאות, תגים, שלבים, AI Copilot ומעקב.",
    "ogTitle": "Unified Inbox — כל השיחות במקום אחד | WhachatCRM",
    "h1": "כל שיחות הלקוחות שלכם. Inbox חכם אחד.",
    "heroIntro": "Unified Inbox הוא המקום שבו שיחות WhachatCRM חיות — בערוצי הודעות נתמכים — עם הקשר איש קשר, בעלות צוות, סיוע AI ומעקב באותה סביבת עבודה.",
    "secondaryCta": {
      "label": "ראו AI Copilot",
      "href": "/ai-copilot"
    },
    "heroVisual": {
      "inquiryLabel": "הודעה נכנסת",
      "inquiryMessage": "שרשורי WhatsApp + Instagram ממתינים בתור אחד.",
      "suggestionLabel": "הקשר inbox",
      "suggestionMessage": "היסטוריית איש קשר, תגים והמלצות Copilot מופיעים ליד הצ'אט.",
      "stageLabel": "לא נקרא",
      "nextStep": "הבא: הקצה וענה"
    },
    "screenshotKey": "unifiedInbox",
    "screenshotAlt": "Unified Inbox של WhachatCRM עם שיחות רב-ערוציות והקשר איש קשר",
    "problemTitle": "מה קורה כששיחות מתפזרות",
    "problems": [
      {
        "title": "ערוצים חיים בטלפונים שונים",
        "description": "תשובות WhatsApp, Instagram ו-email לעולם לא חולקות בעלות."
      },
      {
        "title": "חסר הקשר",
        "description": "סוכנים עונים בלי תגים, שלבים או היסטוריה."
      },
      {
        "title": "עזרת AI מנותקת",
        "description": "הצעות עוזרות רק כשהן יושבות בתוך השרשור האמיתי."
      },
      {
        "title": "קל לשכוח מעקב",
        "description": "בלי inbox משותף, תזכורות נעלמות עם מי שראה את הצ'אט."
      }
    ],
    "howIntro": "הודעות מגיעות בערוצים נתמכים, אנשי קשר מזוהים, הקשר AI ו-CRM מופיע, והצוות עונה, מקצה או מאוטומט את השלב הבא.",
    "howPoints": [
      {
        "title": "תור אחד לערוצים נתמכים",
        "description": "WhatsApp, Messenger, Instagram, SMS, Telegram, צ'אט web ו-email כשמחוברים."
      },
      {
        "title": "הקשר איש קשר וליד",
        "description": "ראו היסטוריה, תגים, שלבים ובעלות ליד השיחה."
      },
      {
        "title": "AI בתוך השרשור",
        "description": "AI Composer ו-AI Copilot מסייעים בתשובות בלי לעזוב את ה-inbox."
      },
      {
        "title": "שיתוף פעולה בצוות",
        "description": "הקצו שיחות ושמרו על נראות משותפת בין משתמשים."
      }
    ],
    "featuresTitle": "יכולות inbox",
    "features": [
      {
        "label": "שיחות רב-ערוציות",
        "description": "ערוצי הודעות נתמכים בסביבה אחת — Shopify אינו ערוץ הודעות native.",
        "href": "/integrations"
      },
      {
        "label": "רשימת שיחות ומצב לא נקרא",
        "description": "סרקו מה דורש תשומת לב ופתחו את השרשור הנכון מהר."
      },
      {
        "label": "תגים, שלבים והיסטוריית איש קשר",
        "description": "שמרו על הקשר הזדמנות מצורף לכל צ'אט."
      },
      {
        "label": "הקצאות צוות",
        "description": "בעלות ברורה לצוותים multi-user.",
        "href": "/shared-team-inbox"
      },
      {
        "label": "AI Copilot ו-AI Composer",
        "description": "תשובות מוצעות והנחיית שלב הבא בשרשור.",
        "href": "/ai-copilot"
      },
      {
        "label": "מעקב ואוטומציה",
        "description": "המשיכו עם תזכורות, זרימות וקמפיינים.",
        "href": "/automations"
      }
    ],
    "workflowTitle": "מהודעה למעקב",
    "workflowSteps": [
      {
        "label": "הודעה מגיעה",
        "description": "לקוח כותב בערוץ מחובר."
      },
      {
        "label": "איש קשר מזוהה",
        "description": "השיחה מצורפת להיסטוריית איש הקשר."
      },
      {
        "label": "השיחה נכנסת ל-Unified Inbox",
        "description": "השרשור מצטרף לתור המשותף."
      },
      {
        "label": "AI והקשר איש קשר מופיעים",
        "description": "Copilot, תגים ושלבים עוזרים לחבר הצוות להחליט."
      },
      {
        "label": "ענה או הקצה",
        "description": "אדם מגיב או מנתב בעלות."
      },
      {
        "label": "מעקב ממשיך",
        "description": "תזמנו, אוטומטו או טפחו את השלב הבא."
      }
    ],
    "useCases": [
      {
        "situation": "לקוחות כותבים ב-WhatsApp ו-Instagram.",
        "action": "טפלו בשני הערוצים מתור inbox אחד.",
        "outcome": "פחות הודעות שמוחמצות בין אפליקציות."
      },
      {
        "situation": "ליד חם צריך את הבעלים הנכון.",
        "action": "הקצו את השיחה ושמרו על הערות גלויות.",
        "outcome": "העברות נשארות נקיות לחבר הצוות הבא."
      },
      {
        "situation": "סוכנים צריכים עזרה בניסוח תשובות.",
        "action": "השתמשו בהצעות Copilot בתוך השרשור.",
        "outcome": "תגובות מהירות יותר עם הקשר משותף."
      },
      {
        "situation": "מעקב היה נשכח אחרת.",
        "action": "שלבו בעלות inbox עם אוטומציות או קמפיינים.",
        "outcome": "לידים שקטים נשארים בנתיב מוגדר."
      }
    ],
    "relatedProducts": [
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "המלצות וטיוטות בשרשור."
      },
      {
        "label": "Chatbot Builder",
        "href": "/chatbot-builder",
        "description": "סננו לפני שאנשים לוקחים שליטה."
      },
      {
        "label": "זרימות עבודה ואוטומציות",
        "href": "/automations",
        "description": "מעקב חוזר מאירועי inbox."
      },
      {
        "label": "אינטגרציות",
        "href": "/integrations",
        "description": "חברו את הערוצים שמזינים את ה-inbox."
      },
      {
        "label": "שיתוף פעולה בצוות",
        "href": "/shared-team-inbox",
        "description": "בעלות משותפת והערות."
      }
    ],
    "industryLinks": [
      {
        "label": "נדל״ן",
        "href": "/real-estate-crm"
      },
      {
        "label": "מסחר אלקטרוני",
        "href": "/solutions/ecommerce"
      },
      {
        "label": "Med spas ובריאות",
        "href": "/solutions/med-spas"
      }
    ],
    "howItWorks": [
      {
        "title": "חברו את הערוצים",
        "description": "התחילו עם WhatsApp וערוצי ההודעות שכבר בשימוש."
      },
      {
        "title": "הזמינו את הצוות",
        "description": "שתפו בעלות כדי ששיחות לא יחיו בטלפון אחד."
      },
      {
        "title": "הפעילו Copilot",
        "description": "הוסיפו סיוע AI לניקוד, טיוטות ושלבים הבאים."
      },
      {
        "title": "אוטומטו את החוזר",
        "description": "השתמשו ב-chatbots, זרימות וקמפיינים סביב ה-inbox."
      }
    ],
    "finalCtaHeadline": "שימו כל שיחה ב-inbox חכם אחד",
    "finalCtaSubtitle": "התחילו בחינם, חברו את הערוצים, ותנו לצוות לענות עם הקשר AI ליד כל שרשור.",
    "ssrBullets": [
      "הודעות רב-ערוציות בסביבת עבודה אחת",
      "הקשר איש קשר, תגים, שלבים ומצב לא נקרא",
      "הקצאות צוות ובעלות משותפת",
      "AI Copilot ו-AI Composer בשרשור",
      "מעקב עם אוטומציות וקמפיינים"
    ]
  },
  "/shared-team-inbox": {
    "productLabel": "שיתוף פעולה בצוות",
    "breadcrumbLabel": "שיתוף פעולה בצוות",
    "title": "Inbox צוות משותף ושיתוף פעולה | WhachatCRM",
    "metaDescription": "שתפו פעולה בשיחות עם לקוחות ב-WhachatCRM עם גישה ל-inbox משותף, הקצאות, נראות בעלות ותוכניות multi-user — כדי שצוותים יענו יחד בלי לאבד הקשר.",
    "ogTitle": "שיתוף פעולה בצוות — Inbox משותף | WhachatCRM",
    "h1": "שתפו פעולה בכל שיחה בלי לאבד הקשר",
    "heroIntro": "שיתוף פעולה בצוות הופך את Unified Inbox לסביבה משותפת — הזמינו חברי צוות, הקצו בעלות, שמרו על נראות מי ענה, והתקדמו בשיחות יחד.",
    "secondaryCta": {
      "label": "ראו Unified Inbox",
      "href": "/unified-inbox"
    },
    "heroVisual": {
      "inquiryLabel": "שיחה משותפת",
      "inquiryMessage": "מוקצה לאלכס — הערות גלויות לצוות.",
      "suggestionLabel": "בעלות",
      "suggestionMessage": "מוקצה ברור, היסטוריה משותפת ומעקב הבא בשרשור אחד.",
      "stageLabel": "מוקצה",
      "nextStep": "הבא: חבר צוות עונה"
    },
    "screenshotKey": "unifiedInbox",
    "screenshotAlt": "Inbox משותף WhachatCRM בשימוש צוות משתף פעולה עם בעלות שיחה",
    "problemTitle": "Inbox עם בעלים יחיד יוצר סיכון",
    "problems": [
      {
        "title": "שיחות חיות בטלפון אחד",
        "description": "כשאותו אדם offline, לקוחות ממתינים."
      },
      {
        "title": "אף אחד לא יודע מי הבעלים של הליד",
        "description": "תשובות כפולות והעברות שנופלות הופכות לנורמה."
      },
      {
        "title": "הקשר נשאר פרטי",
        "description": "בלי הערות והיסטוריה משותפים, כל חבר צוות מתחיל מחדש."
      },
      {
        "title": "צמיחה דורשת יותר מושבים",
        "description": "תוכניות צריכות להפוך שיתוף פעולה multi-user למפורש."
      }
    ],
    "howIntro": "הזמינו חברי צוות ל-WhachatCRM, שתפו שיחות Unified Inbox, הקצו בעלות, ושמרו על שיתוף פעולה גלוי כשהצוות מגיב.",
    "howPoints": [
      {
        "title": "הזמנת חברי צוות",
        "description": "הוסיפו משתמשים לפי זמינות המושבים בתוכנית."
      },
      {
        "title": "שיתוף שיחות",
        "description": "עבדו מאותו inbox במקום להעביר צילומי מסך."
      },
      {
        "title": "הקצאת בעלות",
        "description": "הפכו את חבר הצוות האחראי הבא לברור."
      },
      {
        "title": "שמירה על נראות",
        "description": "ראו מי ענה ושמרו על היסטוריית שיחה משותפת."
      }
    ],
    "featuresTitle": "יכולות שיתוף פעולה",
    "features": [
      {
        "label": "Unified Inbox משותף",
        "description": "מספר חברי צוות יכולים לעבוד מאותה סביבת שיחה.",
        "href": "/unified-inbox"
      },
      {
        "label": "הקצאות",
        "description": "נתבו בעלות כדי שהאדם הנכון ימשיך."
      },
      {
        "label": "הערות פנימיות",
        "description": "תעדו הקשר צוות פרטי כשנתמך."
      },
      {
        "label": "נראות תשובות",
        "description": "הבינו מי כבר הגיב לפני שאתם כותבים."
      },
      {
        "label": "תוכניות multi-user",
        "description": "זמינות מושבים גדלה מ-Free ל-Starter ו-Pro לפי התמחור.",
        "href": "/pricing"
      },
      {
        "label": "סיוע AI לצוותים",
        "description": "Copilot עוזר לכל מוקצה עם הקשר משותף.",
        "href": "/ai-copilot"
      }
    ],
    "workflowTitle": "מהזמנה למעקב משותף",
    "workflowSteps": [
      {
        "label": "הזמינו חברי צוות",
        "description": "הוסיפו משתמשים לסביבה לפי התוכנית."
      },
      {
        "label": "השיחה מגיעה",
        "description": "הודעת לקוח נכנסת ל-Unified Inbox."
      },
      {
        "label": "הקצו בעלים",
        "description": "נתבו את השרשור לחבר הצוות הנכון."
      },
      {
        "label": "הוסיפו הקשר משותף",
        "description": "השתמשו בהערות, תגים והיסטוריה שכל הצוות רואה."
      },
      {
        "label": "ענו עם נראות",
        "description": "כולם יודעים מי כבר טיפל בצ'אט."
      },
      {
        "label": "המשיכו מעקב",
        "description": "אוטומציות וקמפיינים שומרים על בעלות שלמה."
      }
    ],
    "useCases": [
      {
        "situation": "מייסד כבר לא יכול לענות לכל WhatsApp לבד.",
        "action": "הזמינו חברי צוות ושתפו את ה-inbox.",
        "outcome": "כיסוי ממשיך כשאדם אחד offline."
      },
      {
        "situation": "מכירות ותמיכה שניהם נוגעים באותו ליד.",
        "action": "הקצו בעלות והשאירו הערות לחבר הצוות הבא.",
        "outcome": "העברות נשארות ברורות ומקצועיות."
      },
      {
        "situation": "צוות גדל צריך מושבים.",
        "action": "בחרו תוכנית שמתאימה לצרכי שיתוף פעולה multi-user.",
        "outcome": "שיתוף הפעולה מתרחב עם העסק."
      }
    ],
    "relatedProducts": [
      {
        "label": "Unified Inbox",
        "href": "/unified-inbox",
        "description": "סביבת השיחה המשותפת."
      },
      {
        "label": "AI Copilot",
        "href": "/ai-copilot",
        "description": "סיוע לכל חבר צוות בשרשור."
      },
      {
        "label": "זרימות עבודה ואוטומציות",
        "href": "/automations",
        "description": "פעולות הקצאה בזרימות."
      },
      {
        "label": "תמחור",
        "href": "/pricing",
        "description": "זמינות מושבים לפי תוכנית."
      }
    ],
    "industryLinks": [
      {
        "label": "סוכנויות שיווק",
        "href": "/solutions/marketing-agencies"
      },
      {
        "label": "נדל״ן",
        "href": "/real-estate-crm"
      },
      {
        "label": "עסקים מקומיים ושירותים",
        "href": "/solutions/local-service-businesses"
      }
    ],
    "howItWorks": [
      {
        "title": "הזמינו את הצוות",
        "description": "הוסיפו מושבים זמינים בתוכנית."
      },
      {
        "title": "שתפו את ה-inbox",
        "description": "הפסיקו להעביר צ'אטים מטלפונים אישיים."
      },
      {
        "title": "הקצו כל שרשור חשוב",
        "description": "הפכו בעלות למפורשת."
      },
      {
        "title": "השתמשו ב-AI ואוטומציות יחד",
        "description": "שמרו על שיתוף פעולה ומעקב ב-CRM אחד."
      }
    ],
    "finalCtaHeadline": "הפכו שיחות עם לקוחות לעבודת צוות",
    "finalCtaSubtitle": "התחילו בחינם, הזמינו את חברי הצוות, ושמרו על כל תשובה גלויה ב-Unified Inbox.",
    "ssrBullets": [
      "Unified Inbox משותף לצוותים multi-user",
      "הקצאות ונראות בעלות",
      "הערות פנימיות כשנתמך",
      "זמינות מושבים לפי תוכנית",
      "עובד עם Copilot ואוטומציות"
    ]
  }
} as Record<string, Partial<ProductPageContent>>,
} as const;
