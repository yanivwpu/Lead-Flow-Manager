export type WorkflowLocale = "en" | "es" | "he";

export type WorkflowNodeKind = "source" | "ai" | "knowledge" | "decision" | "outcome";

export interface WorkflowNodeConfig {
  id: string;
  icon: "whatsapp" | "bot" | "home" | "database" | "filter" | "calendar" | "user" | "landmark" | "truck" | "clock";
  kind: WorkflowNodeKind;
  x: number;
  y: number;
  label: Record<WorkflowLocale, string>;
}

export interface WorkflowRouteConfig {
  id: string;
  label: Record<WorkflowLocale, string>;
  nodeIds: string[];
  captions: Record<WorkflowLocale, string[]>;
  note?: Record<WorkflowLocale, string>;
}

export interface WorkflowWalkthroughConfig {
  nodes: WorkflowNodeConfig[];
  routes: WorkflowRouteConfig[];
  connections: Array<[string, string]>;
  supportingConnections: Array<[string, string]>;
}

const l = (en: string, es: string, he: string): Record<WorkflowLocale, string> => ({ en, es, he });

/**
 * Customer-facing illustration of the currently shipped RGE behavior.
 * Coordinates are percentages so the renderer can remain generic.
 */
export const realtorWorkflowWalkthrough: WorkflowWalkthroughConfig = {
  nodes: [
    { id: "inquiry", icon: "whatsapp", kind: "source", x: 8, y: 27, label: l("WhatsApp inquiry", "Consulta por WhatsApp", "פנייה ב-WhatsApp") },
    { id: "ai", icon: "bot", kind: "ai", x: 29, y: 27, label: l("AI Agent", "Agente de IA", "סוכן AI") },
    { id: "qualify", icon: "filter", kind: "decision", x: 50, y: 27, label: l("Lead qualification", "Calificación del lead", "סיווג הליד") },
    { id: "inventory", icon: "database", kind: "knowledge", x: 29, y: 70, label: l("Business knowledge", "Conocimiento del negocio", "ידע עסקי") },
    { id: "properties", icon: "home", kind: "knowledge", x: 50, y: 70, label: l("Property inventory", "Inventario de propiedades", "מלאי נכסים") },
    { id: "viewing", icon: "calendar", kind: "outcome", x: 73, y: 9, label: l("Viewing link", "Enlace para visita", "קישור לביקור") },
    { id: "handoff", icon: "user", kind: "outcome", x: 92, y: 9, label: l("Agent follow-up", "Seguimiento del agente", "המשך טיפול של סוכן") },
    { id: "finance", icon: "landmark", kind: "outcome", x: 82, y: 34, label: l("Financing help", "Ayuda financiera", "סיוע במימון") },
    { id: "moving", icon: "truck", kind: "outcome", x: 82, y: 58, label: l("Moving help", "Ayuda de mudanza", "סיוע במעבר") },
    { id: "nurture", icon: "clock", kind: "outcome", x: 73, y: 84, label: l("Nurture follow-up", "Seguimiento gradual", "מעקב וטיפוח") },
    { id: "reengage", icon: "whatsapp", kind: "outcome", x: 92, y: 84, label: l("Re-engagement", "Reactivación", "חידוש קשר") },
  ],
  connections: [
    ["inquiry", "ai"], ["ai", "qualify"], ["qualify", "viewing"], ["viewing", "handoff"],
    ["qualify", "finance"], ["qualify", "moving"], ["qualify", "nurture"], ["nurture", "reengage"], ["reengage", "handoff"],
  ],
  supportingConnections: [["inventory", "ai"], ["properties", "ai"]],
  routes: [
    {
      id: "viewing",
      label: l("Viewing", "Visita", "ביקור"),
      nodeIds: ["inquiry", "ai", "qualify", "viewing", "handoff"],
      captions: {
        en: ["“I’d like to see the Coral Gables home.”", "AI asks about needs, budget and timing.", "Viewing intent is detected.", "A configured booking link is shared.", "A high-priority CRM task cues the agent."],
        es: ["“Quiero ver la casa de Coral Gables.”", "La IA pregunta necesidades, presupuesto y plazo.", "Se detecta la intención de visita.", "Se comparte un enlace de reserva configurado.", "Una tarea prioritaria avisa al agente."],
        he: ["״אשמח לראות את הבית בקורל גייבלס.״", "ה-AI שואל על צרכים, תקציב ולוח זמנים.", "מזוהה כוונה לתאם ביקור.", "נשלח קישור הזמנה שהוגדר מראש.", "משימת CRM בעדיפות גבוהה ממתינה לסוכן."],
      },
      note: l("Requires a configured booking link or connected Calendly. The illustration does not confirm a booking.", "Requiere un enlace configurado o Calendly conectado. La ilustración no confirma una reserva.", "נדרש קישור הזמנה מוגדר או Calendly מחובר. ההמחשה אינה מאשרת שההזמנה בוצעה."),
    },
    {
      id: "finance",
      label: l("Financing", "Financiación", "מימון"),
      nodeIds: ["inquiry", "ai", "qualify", "finance"],
      captions: {
        en: ["“I’m still exploring mortgage options.”", "AI gathers financing, budget and timing context.", "Financing interest is tagged.", "With your permission-based setup, the engine shares configured details, a link, or creates an internal task."],
        es: ["“Aún estoy explorando opciones hipotecarias.”", "La IA reúne contexto de financiación, presupuesto y plazo.", "Se etiqueta el interés financiero.", "Según tu configuración con permiso, comparte datos configurados, un enlace o crea una tarea interna."],
        he: ["״אני עדיין בודק אפשרויות משכנתה.״", "ה-AI אוסף מידע על מימון, תקציב ולוח זמנים.", "ההתעניינות במימון מתויגת.", "בהתאם להגדרה מבוססת הרשאה, המערכת משתפת פרטים שהוגדרו, קישור או יוצרת משימה פנימית."],
      },
      note: l("No automatic lead transfer or provider notification is implied.", "No implica transferencia automática del lead ni aviso al proveedor.", "אין כאן העברה אוטומטית של הליד או הודעה לספק."),
    },
    {
      id: "moving",
      label: l("Moving", "Mudanza", "מעבר"),
      nodeIds: ["inquiry", "ai", "qualify", "moving"],
      captions: {
        en: ["“We’ll also need help moving.”", "AI keeps the home search context intact.", "Moving interest is tagged.", "With the lead’s consent, configured contact details or a link can be shared, or an internal task created."],
        es: ["“También necesitaremos ayuda con la mudanza.”", "La IA conserva el contexto de la búsqueda.", "Se etiqueta el interés de mudanza.", "Con permiso del lead, se comparten datos o un enlace configurado, o se crea una tarea interna."],
        he: ["״נצטרך גם עזרה במעבר.״", "ה-AI שומר את הקשר חיפוש הבית.", "הצורך בשירותי מעבר מתויג.", "בהסכמת הליד ניתן לשתף פרטים או קישור שהוגדרו, או ליצור משימה פנימית."],
      },
      note: l("Routes can be combined; a lead can also continue toward a viewing.", "Las rutas se pueden combinar; el lead también puede continuar hacia una visita.", "אפשר לשלב מסלולים; הליד יכול להמשיך גם לתיאום ביקור."),
    },
    {
      id: "nurture",
      label: l("Not ready", "Aún no está listo", "עדיין לא מוכן"),
      nodeIds: ["inquiry", "ai", "qualify", "nurture", "reengage", "handoff"],
      captions: {
        en: ["“I’m just researching for now.”", "AI records needs without pushing.", "Readiness and timeline guide the next step.", "Channel-aware follow-up waits until the lead goes quiet.", "An eligible message reopens the conversation.", "The agent sees the updated stage, tags and task."],
        es: ["“Por ahora solo estoy investigando.”", "La IA registra necesidades sin presionar.", "La preparación y el plazo guían el siguiente paso.", "El seguimiento espera a que el lead deje de responder.", "Un mensaje permitido reactiva la conversación.", "El agente ve la etapa, etiquetas y tarea actualizadas."],
        he: ["״בינתיים אני רק בודק.״", "ה-AI מתעד צרכים ללא לחץ.", "רמת המוכנות ולוח הזמנים קובעים את הצעד הבא.", "המעקב המותאם לערוץ ממתין עד שהליד משתתק.", "הודעה מותרת מחדשת את השיחה.", "הסוכן רואה שלב, תגיות ומשימה מעודכנים."],
      },
      note: l("WhatsApp follow-up outside the reply window requires an approved template.", "El seguimiento de WhatsApp fuera de la ventana requiere una plantilla aprobada.", "מעקב ב-WhatsApp מחוץ לחלון התגובה דורש תבנית מאושרת."),
    },
  ],
};

export function workflowLocale(language?: string): WorkflowLocale {
  const normalized = (language || "en").toLowerCase();
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("he")) return "he";
  return "en";
}
