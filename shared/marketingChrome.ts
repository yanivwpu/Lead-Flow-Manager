/**
 * Shared public chrome labels (header, breadcrumbs, section eyebrows, CTAs).
 * Accessible from client and future SSR.
 */

import type { MarketingLocale } from "./marketingLocale";

export type MarketingChromeCopy = {
  product: string;
  solutions: string;
  resources: string;
  pricing: string;
  logIn: string;
  startFreeTrial: string;
  startFree: string;
  bookDemo: string;
  home: string;
  learnMore: string;
  openGuide: string;
  status: string;
  theProblem: string;
  howItHelps: string;
  differentiation: string;
  productDetail: string;
  platformIntelligence: string;
  oneBrainAcross: string;
  oneBrainIntro: string;
  capabilities: string;
  directory: string;
  verifiedIntegrations: string;
  useCases: string;
  situation: string;
  whatWhachatDoes: string;
  outcome: string;
  platformStory: string;
  howWhachatWorksTogether: string;
  gettingStarted: string;
  howToGetStarted: string;
  relatedProducts: string;
  seeInIndustry: string;
  visualWorkflow: string;
  industryChallenges: string;
  howWhachatHelps: string;
  relevantProducts: string;
  channelsAndIntegrations: string;
  related: string;
  leadStage: string;
  step: string;
  enlargeScreenshot: string;
  closeEnlarged: string;
  flowScenariosChatbot: string;
  flowScenariosAutomations: string;
  flowEyebrow: string;
  whenThisHappens: string;
  menuProduct: string;
  menuSolutions: string;
  menuResources: string;
  platformCapabilities: string;
  multipleProductsTogether: string;
  realisticScenariosFor: string;
  messagingChannels: string;
  verifiedChannelsNote: string;
  relevantIntegrationsTitle: string;
  relevantIntegrationsNote: string;
  howItWorksSection: string;
  relatedProductsAndIntegrations: string;
  howProductWorks: string;
  realisticTeamsUse: string;
  genericAiVsBrain: string;
};

export const MARKETING_CHROME: Record<MarketingLocale, MarketingChromeCopy> = {
  en: {
    product: "Product",
    solutions: "Solutions",
    resources: "Resources",
    pricing: "Pricing",
    logIn: "Log in",
    startFreeTrial: "Start Free Trial",
    startFree: "Start Free",
    bookDemo: "Book a Demo",
    home: "Home",
    learnMore: "Learn more",
    openGuide: "Open guide",
    status: "Status",
    theProblem: "The problem",
    howItHelps: "How it helps",
    differentiation: "Differentiation",
    productDetail: "Product detail",
    platformIntelligence: "Platform intelligence",
    oneBrainAcross: "One Brain across the platform",
    oneBrainIntro:
      "Approved business intelligence can power the products that need company context — without inventing knowledge you did not provide or publish.",
    capabilities: "Capabilities",
    directory: "Directory",
    verifiedIntegrations: "Verified integrations",
    useCases: "Use cases",
    situation: "Situation",
    whatWhachatDoes: "What WhachatCRM does",
    outcome: "Outcome",
    platformStory: "Platform story",
    howWhachatWorksTogether: "How WhachatCRM works together",
    gettingStarted: "Getting started",
    howToGetStarted: "How to get started",
    relatedProducts: "Related products",
    seeInIndustry: "See it in industry solutions",
    visualWorkflow: "Visual workflow",
    industryChallenges: "Industry challenges",
    howWhachatHelps: "How WhachatCRM helps",
    relevantProducts: "Relevant products",
    channelsAndIntegrations: "Channels & integrations",
    related: "Related",
    leadStage: "Lead stage",
    step: "Step",
    enlargeScreenshot: "Enlarge",
    closeEnlarged: "Close enlarged image",
    flowScenariosChatbot: "Chatbot journey scenarios",
    flowScenariosAutomations: "Automation if-this-then-that scenarios",
    flowEyebrow: "When this happens → WhachatCRM does this next",
    whenThisHappens: "When this happens → WhachatCRM does this next",
    menuProduct: "Product menu",
    menuSolutions: "Solutions menu",
    menuResources: "Resources menu",
    platformCapabilities: "Platform capabilities",
    multipleProductsTogether: "Multiple products working together",
    realisticScenariosFor: "Realistic scenarios for",
    messagingChannels: "Messaging channels",
    verifiedChannelsNote: "Verified channels available in WhachatCRM.",
    relevantIntegrationsTitle: "Relevant integrations",
    relevantIntegrationsNote: "Connect the tools that matter for this industry.",
    howItWorksSection: "How it works",
    relatedProductsAndIntegrations: "Related products and integrations",
    howProductWorks: "How {{product}} works",
    realisticTeamsUse: "Realistic ways teams use {{product}}",
    genericAiVsBrain: "Generic AI vs WhachatCRM AI Brain",
  },
  es: {
    product: "Producto",
    solutions: "Soluciones",
    resources: "Recursos",
    pricing: "Precios",
    logIn: "Iniciar sesión",
    startFreeTrial: "Empieza tu prueba gratis",
    startFree: "Empieza gratis",
    bookDemo: "Reserva una demo",
    home: "Inicio",
    learnMore: "Más información",
    openGuide: "Abrir guía",
    status: "Estado",
    theProblem: "El problema",
    howItHelps: "Cómo ayuda",
    differentiation: "Diferenciación",
    productDetail: "Detalle del producto",
    platformIntelligence: "Inteligencia de la plataforma",
    oneBrainAcross: "Un solo AI Brain en toda la plataforma",
    oneBrainIntro:
      "La inteligencia empresarial aprobada puede potenciar los productos que necesitan contexto de tu empresa — sin inventar conocimiento que no hayas proporcionado o publicado.",
    capabilities: "Capacidades",
    directory: "Directorio",
    verifiedIntegrations: "Integraciones verificadas",
    useCases: "Casos de uso",
    situation: "Situación",
    whatWhachatDoes: "Qué hace WhachatCRM",
    outcome: "Resultado",
    platformStory: "Historia de la plataforma",
    howWhachatWorksTogether: "Cómo trabaja WhachatCRM en conjunto",
    gettingStarted: "Primeros pasos",
    howToGetStarted: "Cómo empezar",
    relatedProducts: "Productos relacionados",
    seeInIndustry: "Verlo en soluciones por industria",
    visualWorkflow: "Flujo visual",
    industryChallenges: "Desafíos del sector",
    howWhachatHelps: "Cómo ayuda WhachatCRM",
    relevantProducts: "Productos relevantes",
    channelsAndIntegrations: "Canales e integraciones",
    related: "Relacionados",
    leadStage: "Etapa del lead",
    step: "Paso",
    enlargeScreenshot: "Ampliar",
    closeEnlarged: "Cerrar imagen ampliada",
    flowScenariosChatbot: "Escenarios de recorrido del chatbot",
    flowScenariosAutomations: "Escenarios de automatización si-esto-entonces-aquello",
    flowEyebrow: "Cuando ocurre esto → WhachatCRM hace esto a continuación",
    whenThisHappens: "Cuando ocurre esto → WhachatCRM hace esto a continuación",
    menuProduct: "Menú de producto",
    menuSolutions: "Menú de soluciones",
    menuResources: "Menú de recursos",
    platformCapabilities: "Capacidades de la plataforma",
    multipleProductsTogether: "Varios productos trabajando juntos",
    realisticScenariosFor: "Escenarios realistas para",
    messagingChannels: "Canales de mensajería",
    verifiedChannelsNote: "Canales verificados disponibles en WhachatCRM.",
    relevantIntegrationsTitle: "Integraciones relevantes",
    relevantIntegrationsNote: "Conecta las herramientas que importan para este sector.",
    howItWorksSection: "Cómo funciona",
    relatedProductsAndIntegrations: "Productos e integraciones relacionados",
    howProductWorks: "Cómo funciona {{product}}",
    realisticTeamsUse: "Formas realistas en que los equipos usan {{product}}",
    genericAiVsBrain: "IA genérica vs WhachatCRM AI Brain",
  },
  he: {
    product: "מוצר",
    solutions: "פתרונות",
    resources: "משאבים",
    pricing: "מחירים",
    logIn: "התחברות",
    startFreeTrial: "התחל ניסיון חינם",
    startFree: "התחל בחינם",
    bookDemo: "קבע הדגמה",
    home: "בית",
    learnMore: "למידע נוסף",
    openGuide: "פתח מדריך",
    status: "סטטוס",
    theProblem: "הבעיה",
    howItHelps: "איך זה עוזר",
    differentiation: "הבדלה",
    productDetail: "פירוט המוצר",
    platformIntelligence: "האינטליגנציה של הפלטפורמה",
    oneBrainAcross: "AI Brain אחד לכל הפלטפורמה",
    oneBrainIntro:
      "אינטליגנציה עסקית מאושרת יכולה להזין את המוצרים שזקוקים להקשר של העסק — בלי להמציא ידע שלא סיפקתם או פרסמתם.",
    capabilities: "יכולות",
    directory: "מדריך",
    verifiedIntegrations: "אינטגרציות מאומתות",
    useCases: "מקרי שימוש",
    situation: "מצב",
    whatWhachatDoes: "מה WhachatCRM עושה",
    outcome: "תוצאה",
    platformStory: "סיפור הפלטפורמה",
    howWhachatWorksTogether: "איך WhachatCRM עובד יחד",
    gettingStarted: "תחילת העבודה",
    howToGetStarted: "איך מתחילים",
    relatedProducts: "מוצרים קשורים",
    seeInIndustry: "ראו בפתרונות לפי תעשייה",
    visualWorkflow: "תרשים זרימה",
    industryChallenges: "אתגרי התעשייה",
    howWhachatHelps: "איך WhachatCRM עוזר",
    relevantProducts: "מוצרים רלוונטיים",
    channelsAndIntegrations: "ערוצים ואינטגרציות",
    related: "קשור",
    leadStage: "שלב הליד",
    step: "שלב",
    enlargeScreenshot: "הגדל",
    closeEnlarged: "סגור תמונה מוגדלת",
    flowScenariosChatbot: "תרחישי מסע בצ׳אטבוט",
    flowScenariosAutomations: "תרחישי אוטומציה אם-זה-אז-זה",
    flowEyebrow: "כשזה קורה → WhachatCRM עושה את זה בהמשך",
    whenThisHappens: "כשזה קורה → WhachatCRM עושה את זה בהמשך",
    menuProduct: "תפריט מוצר",
    menuSolutions: "תפריט פתרונות",
    menuResources: "תפריט משאבים",
    platformCapabilities: "יכולות הפלטפורמה",
    multipleProductsTogether: "מספר מוצרים שעובדים יחד",
    realisticScenariosFor: "תרחישים ריאליים עבור",
    messagingChannels: "ערוצי הודעות",
    verifiedChannelsNote: "ערוצים מאומתים זמינים ב-WhachatCRM.",
    relevantIntegrationsTitle: "אינטגרציות רלוונטיות",
    relevantIntegrationsNote: "חברו את הכלים שחשובים לתעשייה הזו.",
    howItWorksSection: "איך זה עובד",
    relatedProductsAndIntegrations: "מוצרים ואינטגרציות קשורים",
    howProductWorks: "איך {{product}} עובד",
    realisticTeamsUse: "דרכים ריאליות שבהן צוותים משתמשים ב-{{product}}",
    genericAiVsBrain: "AI גנרי מול WhachatCRM AI Brain",
  },
};

export function getMarketingChrome(locale: MarketingLocale): MarketingChromeCopy {
  return MARKETING_CHROME[locale] ?? MARKETING_CHROME.en;
}

/** Descriptive clause for each PLATFORM_STORY step (product names stay branded in UI). */
export const PLATFORM_STORY_STEP_TEXT: Record<MarketingLocale, readonly string[]> = {
  en: [
    "finds opportunities",
    "understands and recommends",
    "start personalized outreach",
    "manages replies",
    "guides the conversation",
    "handle repeatable work",
    "package industry workflows",
  ],
  es: [
    "encuentra oportunidades",
    "comprende y recomienda",
    "inician outreach personalizado",
    "gestionan respuestas",
    "guía la conversación",
    "automatizan trabajo repetitivo",
    "empaquetan flujos por industria",
  ],
  he: [
    "מוצא הזדמנויות",
    "מבין וממליץ",
    "מתחיל outreach מותאם אישית",
    "מנהל תשובות",
    "מנחה את השיחה",
    "מטפל בעבודה חוזרת",
    "אורז תהליכי עבודה לפי תעשייה",
  ],
};

export const BRAIN_CONSUMER_TEXT: Record<MarketingLocale, readonly string[]> = {
  en: [
    "Approved context for personalized outreach",
    "Business-aware recommendations in chat",
    "Personalization grounded in your offer",
    "Consistent questions and ideal-customer rules",
  ],
  es: [
    "Contexto aprobado para outreach personalizado",
    "Recomendaciones conscientes del negocio en el chat",
    "Personalización basada en tu oferta",
    "Preguntas coherentes y reglas de cliente ideal",
  ],
  he: [
    "הקשר מאושר ל-outreach מותאם אישית",
    "המלצות מודעות לעסק בתוך הצ'אט",
    "התאמה אישית מבוססת ההצעה שלך",
    "שאלות עקביות וכללי לקוח אידיאלי",
  ],
};
