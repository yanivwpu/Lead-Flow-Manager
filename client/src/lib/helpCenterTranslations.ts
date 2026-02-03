import { BookOpen, Brain, Smartphone, Globe, Settings, Zap, Phone, Bell, Tag, Clock, Mail, Shield, CreditCard, HelpCircle, Users, FileText, Plug, MessageSquare } from "lucide-react";

export type HelpLanguage = "en" | "he" | "es";

export interface HelpArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  icon: any;
  keywords: string[];
}

export interface HelpCategory {
  name: string;
  icon: any;
}

export const HELP_CATEGORIES: Record<HelpLanguage, HelpCategory[]> = {
  en: [
    { name: "Getting Started", icon: BookOpen },
    { name: "AI Features", icon: Brain },
    { name: "Messaging", icon: MessageSquare },
    { name: "Automation", icon: Zap },
    { name: "Integrations", icon: Plug },
    { name: "Billing", icon: CreditCard },
  ],
  he: [
    { name: "תחילת עבודה", icon: BookOpen },
    { name: "תכונות AI", icon: Brain },
    { name: "הודעות", icon: MessageSquare },
    { name: "אוטומציה", icon: Zap },
    { name: "אינטגרציות", icon: Plug },
    { name: "חיובים", icon: CreditCard },
  ],
  es: [
    { name: "Primeros Pasos", icon: BookOpen },
    { name: "Funciones de IA", icon: Brain },
    { name: "Mensajería", icon: MessageSquare },
    { name: "Automatización", icon: Zap },
    { name: "Integraciones", icon: Plug },
    { name: "Facturación", icon: CreditCard },
  ],
};

export const HELP_UI_TRANSLATIONS: Record<HelpLanguage, {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  allCategories: string;
  noArticlesFound: string;
  noArticlesHint: string;
  backToHelpCenter: string;
  wasHelpful: string;
  yes: string;
  no: string;
  thankYou: string;
  tellUsMore: string;
  submitFeedback: string;
}> = {
  en: {
    title: "Help Center",
    subtitle: "Find answers and learn how to use WhachatCRM",
    searchPlaceholder: "Search for help articles...",
    allCategories: "All Categories",
    noArticlesFound: "No articles found",
    noArticlesHint: "Try a different search term or browse categories",
    backToHelpCenter: "Back to Help Center",
    wasHelpful: "Was this article helpful?",
    yes: "Yes",
    no: "No",
    thankYou: "Thank you for your feedback!",
    tellUsMore: "Tell us how we can improve this article",
    submitFeedback: "Submit Feedback",
  },
  he: {
    title: "מרכז העזרה",
    subtitle: "מצא תשובות ולמד כיצד להשתמש ב-WhachatCRM",
    searchPlaceholder: "חפש במאמרי עזרה...",
    allCategories: "כל הקטגוריות",
    noArticlesFound: "לא נמצאו מאמרים",
    noArticlesHint: "נסה מונח חיפוש אחר או עיין בקטגוריות",
    backToHelpCenter: "חזרה למרכז העזרה",
    wasHelpful: "האם מאמר זה היה מועיל?",
    yes: "כן",
    no: "לא",
    thankYou: "תודה על המשוב שלך!",
    tellUsMore: "ספר לנו כיצד נוכל לשפר מאמר זה",
    submitFeedback: "שלח משוב",
  },
  es: {
    title: "Centro de Ayuda",
    subtitle: "Encuentra respuestas y aprende a usar WhachatCRM",
    searchPlaceholder: "Buscar artículos de ayuda...",
    allCategories: "Todas las Categorías",
    noArticlesFound: "No se encontraron artículos",
    noArticlesHint: "Intenta con otro término de búsqueda o navega por categorías",
    backToHelpCenter: "Volver al Centro de Ayuda",
    wasHelpful: "¿Te resultó útil este artículo?",
    yes: "Sí",
    no: "No",
    thankYou: "¡Gracias por tu opinión!",
    tellUsMore: "Cuéntanos cómo podemos mejorar este artículo",
    submitFeedback: "Enviar Comentarios",
  },
};

export const HELP_ARTICLES_EN: HelpArticle[] = [
  {
    id: "getting-started",
    title: "Getting Started with WhachatCRM",
    category: "Getting Started",
    icon: BookOpen,
    keywords: ["start", "begin", "new", "setup", "introduction", "channels", "unified inbox"],
    content: `
# Getting Started with WhachatCRM

Welcome to WhachatCRM! This guide will help you get up and running quickly with our unified multi-channel inbox.

## Step 1: Connect Your Channels

WhachatCRM supports 7 messaging channels in one unified inbox:
- **WhatsApp**: Via Twilio or Meta Business API (your choice)
- **SMS**: Via Twilio
- **Telegram**: Connect your bot
- **Instagram DM**: Via Meta integration
- **Facebook Messenger**: Via Meta integration
- **Web Chat**: Embeddable widget for your website
- **TikTok**: Lead intake only

To connect:
1. Go to **Settings** > **Communication Channels**
2. Click **Connect** on the channel you want to add
3. Follow the setup wizard instructions
4. Toggle the channel on when ready

## Step 2: Import or Add Contacts

You can add contacts manually or import them:
- **Manual**: Click the + button in Chats to create a new conversation
- **Import**: Go to Settings and use the import feature (Starter plan and above)

## Step 3: Start Messaging

Once connected, you can:
- Send and receive messages from all channels in one inbox
- System automatically routes replies to the right channel
- Add notes and tags to conversations
- Set follow-up reminders
- Track deals through pipeline stages

## Step 4: Set Up Automation

Save time with automated features:
- **Away Messages**: Auto-reply outside business hours
- **Auto-Responders**: Reply instantly to new messages
- **Smart Fallback**: Auto-route to backup channel if primary fails
- **Drip Sequences**: Send scheduled message series (Pro plan)
- **Workflows**: Automate tagging and assignments (Pro plan)
    `
  },
  {
    id: "ai-brain",
    title: "AI Brain - Your Business Assistant",
    category: "AI Features",
    icon: Brain,
    keywords: ["ai", "brain", "assistant", "smart", "reply", "suggestion", "lead", "capture", "automation"],
    content: `
# AI Brain - Your Intelligent Business Assistant

AI Brain is a powerful add-on that turns WhachatCRM into your tireless business assistant. It learns about your business and helps you respond faster, capture leads automatically, and never miss an opportunity.

## What is AI Brain?

Think of AI Brain as a smart assistant that:
- **Knows your business** - understands your products, services, hours, and sales goals
- **Suggests replies** - drafts contextual responses you can use with one click
- **Captures leads** - automatically extracts customer information from conversations
- **Adapts to your style** - choose from Neutral, Friendly, Professional, or Sales-focused tones

Available for **Starter and Pro plan** users at **$29/month** under Fair Use.

## What can AI Brain do?

### Smart Reply Suggestions
The AI reads the full conversation context and suggests professional, on-brand replies. You can review, edit, or send them with one click.

### Lead Qualification & Scoring
AI Brain automatically identifies and scores leads from 0-100 based on their intent, budget, and readiness to buy.

### Human Handoff
Set custom keywords that automatically trigger a human takeover, pausing the AI and notifying your team.

### Business Knowledge Base
Upload your company's unique information—products, pricing, policies, and FAQs. The AI uses this specific knowledge to provide accurate answers.

## Getting Started

1. **Upgrade to Starter or Pro** - AI Brain requires a paid subscription
2. **Enable AI Brain** - Go to Settings > AI Brain and subscribe
3. **Add Business Knowledge** - Teach AI about your business
4. **Set AI Mode** - Choose Suggest Only, Auto Draft, or Hybrid
5. **Start Using** - Click the brain icon in any chat
    `
  },
  {
    id: "automation-templates",
    title: "Using Automation Templates",
    category: "Automation",
    icon: Zap,
    keywords: ["automation", "templates", "drip", "sequence", "workflow", "preset"],
    content: `
# Using Automation Templates

WhachatCRM provides pre-built automation templates to help you get started quickly with common business workflows.

## Available Template Categories

### Abandoned Cart Recovery
3-message sequence to recover abandoned carts with personalized follow-ups and discount codes.

### Lead Nurture
Welcome messages with options and automatic follow-ups if no response is received.

### Service Reminders
Appointment confirmations sent 24h and 1h before the appointment, plus post-service feedback requests.

### Promotions
Limited-time offers with urgency messaging to drive conversions.

## Industry-Specific Templates

We offer specialized templates for:
- **Healthcare & Clinics** - Appointment reminders with doctor names
- **Real Estate** - Property viewing scheduling and financing options
- **Travel & Tourism** - Trip reminders with checklists
- **E-commerce** - Cart recovery with product lists

## How to Use Templates

1. Go to **Templates** > **Preset Templates**
2. Filter by language, category, or industry
3. Click **Preview** to see the message sequence
4. Customize placeholders with your actual values
5. Toggle **Launch immediately** if you want to activate right away
6. Click **Save Template** or **Launch Now**

## Placeholders

Templates support dynamic placeholders like:
- \`{{name}}\` - Customer's name
- \`{{product_list}}\` - Items in cart
- \`{{discount_code}}\` - Promo code
- \`{{appointment_time}}\` - Scheduled time
- \`{{location}}\` - Business address
    `
  },
  {
    id: "billing",
    title: "Billing & Subscriptions",
    category: "Billing",
    icon: CreditCard,
    keywords: ["billing", "payment", "subscription", "plan", "upgrade", "cancel", "invoice"],
    content: `
# Billing & Subscriptions

Manage your WhachatCRM subscription and billing information.

## Available Plans

### Free Plan
- 50 conversations/month
- Basic inbox features
- 1 channel connection

### Starter Plan - $29/month
- Unlimited conversations
- All 7 channels
- Team collaboration
- Basic automation

### Pro Plan - $79/month
- Everything in Starter
- Advanced automation
- Drip sequences
- Priority support
- API access

### AI Brain Add-on - $29/month
- Unlimited AI features
- Smart reply suggestions
- Lead scoring
- Business knowledge base

## How to Upgrade

1. Go to **Settings** > **Subscription**
2. Click **Upgrade** on your desired plan
3. Enter payment information
4. Your plan activates immediately

## Managing Your Subscription

- **View invoices**: Settings > Billing > Invoices
- **Update payment method**: Settings > Billing > Payment Method
- **Cancel subscription**: Settings > Billing > Cancel Plan

## Refunds

Contact support within 14 days of purchase for refund requests.
    `
  },
  {
    id: "connect-channels",
    title: "Connecting Communication Channels",
    category: "Integrations",
    icon: Plug,
    keywords: ["connect", "channel", "whatsapp", "sms", "telegram", "instagram", "facebook", "webchat"],
    content: `
# Connecting Communication Channels

WhachatCRM supports 7 messaging channels in one unified inbox.

## WhatsApp

### Via Twilio
1. Create a Twilio account
2. Get WhatsApp Business approval
3. Enter your Twilio credentials in Settings

### Via Meta Business API
1. Create a Meta Business account
2. Set up WhatsApp Business API
3. Connect using the Meta wizard in Settings

## SMS (Twilio)

1. Get a Twilio phone number
2. Enter Account SID and Auth Token
3. Configure webhook URL

## Telegram

1. Create a bot using @BotFather
2. Get your bot token
3. Enter token in Settings

## Instagram & Facebook

1. Connect your Meta Business account
2. Link your Instagram/Facebook page
3. Grant messaging permissions

## Web Chat Widget

1. Go to Settings > Web Widget
2. Customize appearance
3. Copy embed code to your website

## TikTok

1. Connect your TikTok Business account
2. Enable lead form integration
3. Leads appear automatically in inbox
    `
  },
];

export const HELP_ARTICLES_HE: HelpArticle[] = [
  {
    id: "getting-started",
    title: "תחילת העבודה עם WhachatCRM",
    category: "תחילת עבודה",
    icon: BookOpen,
    keywords: ["התחלה", "חדש", "הגדרה", "מבוא", "ערוצים", "תיבת דואר מאוחדת"],
    content: `
# תחילת העבודה עם WhachatCRM

ברוכים הבאים ל-WhachatCRM! מדריך זה יעזור לך להתחיל במהירות עם תיבת הדואר המאוחדת רב-ערוצית שלנו.

## שלב 1: חיבור הערוצים שלך

WhachatCRM תומך ב-7 ערוצי הודעות בתיבת דואר מאוחדת אחת:
- **וואטסאפ**: דרך Twilio או Meta Business API (לבחירתך)
- **SMS**: דרך Twilio
- **טלגרם**: חבר את הבוט שלך
- **הודעות אינסטגרם**: דרך אינטגרציית Meta
- **פייסבוק מסנג'ר**: דרך אינטגרציית Meta
- **צ'אט אתר**: ווידג'ט להטמעה באתר שלך
- **טיקטוק**: קליטת לידים בלבד

לחיבור:
1. עבור ל**הגדרות** > **ערוצי תקשורת**
2. לחץ על **חיבור** בערוץ שברצונך להוסיף
3. עקוב אחר הוראות אשף ההגדרה
4. הפעל את הערוץ כשתהיה מוכן

## שלב 2: ייבוא או הוספת אנשי קשר

ניתן להוסיף אנשי קשר ידנית או לייבא אותם:
- **ידני**: לחץ על כפתור + בצ'אטים ליצירת שיחה חדשה
- **ייבוא**: עבור להגדרות והשתמש בתכונת הייבוא (תוכנית Starter ומעלה)

## שלב 3: התחל לשלוח הודעות

לאחר החיבור, תוכל:
- לשלוח ולקבל הודעות מכל הערוצים בתיבת דואר אחת
- המערכת מנתבת תשובות אוטומטית לערוץ הנכון
- להוסיף הערות ותגיות לשיחות
- להגדיר תזכורות מעקב
- לעקוב אחר עסקאות דרך שלבי הצינור

## שלב 4: הגדרת אוטומציה

חסוך זמן עם תכונות אוטומטיות:
- **הודעות היעדרות**: תשובה אוטומטית מחוץ לשעות העבודה
- **מגיבים אוטומטיים**: השב מיידית להודעות חדשות
- **גיבוי חכם**: ניתוב אוטומטי לערוץ גיבוי אם הראשי נכשל
- **רצפי טפטוף**: שליחת סדרת הודעות מתוזמנות (תוכנית Pro)
- **זרימות עבודה**: אוטומציה של תיוג והקצאות (תוכנית Pro)
    `
  },
  {
    id: "ai-brain",
    title: "AI Brain - העוזר העסקי שלך",
    category: "תכונות AI",
    icon: Brain,
    keywords: ["ai", "בינה מלאכותית", "עוזר", "חכם", "תשובה", "הצעה", "ליד", "לכידה", "אוטומציה"],
    content: `
# AI Brain - העוזר העסקי החכם שלך

AI Brain הוא תוסף עוצמתי שהופך את WhachatCRM לעוזר עסקי בלתי נלאה. הוא לומד על העסק שלך ועוזר לך להגיב מהר יותר, ללכוד לידים אוטומטית, ולעולם לא לפספס הזדמנות.

## מה זה AI Brain?

חשוב על AI Brain כעוזר חכם ש:
- **מכיר את העסק שלך** - מבין את המוצרים, השירותים, השעות ויעדי המכירות שלך
- **מציע תשובות** - מנסח תגובות מותאמות הקשר שתוכל להשתמש בלחיצה אחת
- **לוכד לידים** - מחלץ אוטומטית מידע לקוחות משיחות
- **מתאים לסגנון שלך** - בחר בין נייטרלי, ידידותי, מקצועי או ממוקד מכירות

זמין למשתמשי **תוכנית Starter ו-Pro** ב-**$29/חודש** תחת שימוש הוגן.

## מה AI Brain יכול לעשות?

### הצעות תשובה חכמות
ה-AI קורא את כל הקשר השיחה ומציע תשובות מקצועיות ומותאמות למותג. תוכל לבדוק, לערוך או לשלוח בלחיצה אחת.

### הסמכה ודירוג לידים
AI Brain מזהה ומדרג לידים אוטומטית מ-0-100 על סמך כוונה, תקציב ונכונות לרכוש.

### העברה לאדם
הגדר מילות מפתח מותאמות אישית שמפעילות אוטומטית השתלטות אנושית, משהות את ה-AI ומודיעות לצוות שלך.

### בסיס ידע עסקי
העלה את המידע הייחודי של החברה שלך - מוצרים, מחירים, מדיניות ושאלות נפוצות. ה-AI משתמש בידע הספציפי הזה לספק תשובות מדויקות.

## איך להתחיל

1. **שדרג ל-Starter או Pro** - AI Brain דורש מנוי בתשלום
2. **הפעל AI Brain** - עבור להגדרות > AI Brain והירשם
3. **הוסף ידע עסקי** - למד את ה-AI על העסק שלך
4. **הגדר מצב AI** - בחר הצעה בלבד, טיוטה אוטומטית או היברידי
5. **התחל להשתמש** - לחץ על אייקון המוח בכל צ'אט
    `
  },
  {
    id: "automation-templates",
    title: "שימוש בתבניות אוטומציה",
    category: "אוטומציה",
    icon: Zap,
    keywords: ["אוטומציה", "תבניות", "טפטוף", "רצף", "זרימת עבודה", "תבנית מוכנה"],
    content: `
# שימוש בתבניות אוטומציה

WhachatCRM מספקת תבניות אוטומציה מוכנות מראש כדי לעזור לך להתחיל במהירות עם זרימות עבודה עסקיות נפוצות.

## קטגוריות תבניות זמינות

### שחזור עגלה נטושה
רצף של 3 הודעות לשחזור עגלות נטושות עם מעקבים מותאמים אישית וקודי הנחה.

### טיפוח לידים
הודעות ברוכים הבאים עם אפשרויות ומעקבים אוטומטיים אם לא התקבלה תגובה.

### תזכורות שירות
אישורי פגישות שנשלחים 24 שעות ושעה לפני הפגישה, בתוספת בקשות משוב לאחר השירות.

### מבצעים
הצעות לזמן מוגבל עם הודעות דחיפות להנעת המרות.

## תבניות ספציפיות לתעשייה

אנו מציעים תבניות מיוחדות ל:
- **בריאות וקליניקות** - תזכורות פגישות עם שמות רופאים
- **נדל"ן** - תיאום צפייה בנכסים ואפשרויות מימון
- **תיירות ונסיעות** - תזכורות טיול עם רשימות בדיקה
- **מסחר אלקטרוני** - שחזור עגלה עם רשימות מוצרים

## איך להשתמש בתבניות

1. עבור ל**תבניות** > **תבניות מוכנות**
2. סנן לפי שפה, קטגוריה או תעשייה
3. לחץ על **תצוגה מקדימה** לצפייה ברצף ההודעות
4. התאם אישית מילוי מקום עם הערכים האמיתיים שלך
5. הפעל את **השקה מיידית** אם ברצונך להפעיל מיד
6. לחץ על **שמור תבנית** או **השק עכשיו**

## מילוי מקום

תבניות תומכות במילוי מקום דינמי כמו:
- \`{{name}}\` - שם הלקוח
- \`{{product_list}}\` - פריטים בעגלה
- \`{{discount_code}}\` - קוד קופון
- \`{{appointment_time}}\` - זמן מתוזמן
- \`{{location}}\` - כתובת העסק
    `
  },
  {
    id: "billing",
    title: "חיובים ומנויים",
    category: "חיובים",
    icon: CreditCard,
    keywords: ["חיוב", "תשלום", "מנוי", "תוכנית", "שדרוג", "ביטול", "חשבונית"],
    content: `
# חיובים ומנויים

נהל את המנוי ופרטי החיוב שלך ב-WhachatCRM.

## תוכניות זמינות

### תוכנית חינמית
- 50 שיחות/חודש
- תכונות תיבת דואר בסיסיות
- חיבור ערוץ אחד

### תוכנית Starter - $29/חודש
- שיחות ללא הגבלה
- כל 7 הערוצים
- שיתוף פעולה צוותי
- אוטומציה בסיסית

### תוכנית Pro - $79/חודש
- הכל ב-Starter
- אוטומציה מתקדמת
- רצפי טפטוף
- תמיכה בעדיפות
- גישת API

### תוסף AI Brain - $29/חודש
- תכונות AI ללא הגבלה
- הצעות תשובה חכמות
- דירוג לידים
- בסיס ידע עסקי

## איך לשדרג

1. עבור ל**הגדרות** > **מנוי**
2. לחץ על **שדרוג** בתוכנית הרצויה
3. הזן פרטי תשלום
4. התוכנית שלך מופעלת מיידית

## ניהול המנוי שלך

- **צפה בחשבוניות**: הגדרות > חיוב > חשבוניות
- **עדכן אמצעי תשלום**: הגדרות > חיוב > אמצעי תשלום
- **בטל מנוי**: הגדרות > חיוב > בטל תוכנית

## החזרים

פנה לתמיכה תוך 14 יום מהרכישה לבקשות החזר.
    `
  },
  {
    id: "connect-channels",
    title: "חיבור ערוצי תקשורת",
    category: "אינטגרציות",
    icon: Plug,
    keywords: ["חיבור", "ערוץ", "וואטסאפ", "sms", "טלגרם", "אינסטגרם", "פייסבוק", "צ'אט אתר"],
    content: `
# חיבור ערוצי תקשורת

WhachatCRM תומך ב-7 ערוצי הודעות בתיבת דואר מאוחדת אחת.

## וואטסאפ

### דרך Twilio
1. צור חשבון Twilio
2. קבל אישור WhatsApp Business
3. הזן את פרטי ה-Twilio שלך בהגדרות

### דרך Meta Business API
1. צור חשבון Meta Business
2. הגדר WhatsApp Business API
3. התחבר באמצעות אשף Meta בהגדרות

## SMS (Twilio)

1. קבל מספר טלפון Twilio
2. הזן Account SID ו-Auth Token
3. הגדר כתובת webhook

## טלגרם

1. צור בוט באמצעות @BotFather
2. קבל את טוקן הבוט שלך
3. הזן את הטוקן בהגדרות

## אינסטגרם ופייסבוק

1. חבר את חשבון ה-Meta Business שלך
2. קשר את דף האינסטגרם/פייסבוק שלך
3. הענק הרשאות הודעות

## ווידג'ט צ'אט אתר

1. עבור להגדרות > ווידג'ט אתר
2. התאם אישית את המראה
3. העתק קוד הטמעה לאתר שלך

## טיקטוק

1. חבר את חשבון TikTok Business שלך
2. הפעל אינטגרציית טופס לידים
3. לידים מופיעים אוטומטית בתיבת הדואר
    `
  },
];

export const HELP_ARTICLES_ES: HelpArticle[] = [
  {
    id: "getting-started",
    title: "Primeros Pasos con WhachatCRM",
    category: "Primeros Pasos",
    icon: BookOpen,
    keywords: ["comenzar", "inicio", "nuevo", "configuración", "introducción", "canales", "bandeja unificada"],
    content: `
# Primeros Pasos con WhachatCRM

¡Bienvenido a WhachatCRM! Esta guía te ayudará a comenzar rápidamente con nuestra bandeja de entrada multicanal unificada.

## Paso 1: Conecta tus Canales

WhachatCRM soporta 7 canales de mensajería en una bandeja unificada:
- **WhatsApp**: Vía Twilio o Meta Business API (a tu elección)
- **SMS**: Vía Twilio
- **Telegram**: Conecta tu bot
- **Instagram DM**: Vía integración Meta
- **Facebook Messenger**: Vía integración Meta
- **Chat Web**: Widget embebible para tu sitio web
- **TikTok**: Solo captación de leads

Para conectar:
1. Ve a **Configuración** > **Canales de Comunicación**
2. Haz clic en **Conectar** en el canal que deseas agregar
3. Sigue las instrucciones del asistente de configuración
4. Activa el canal cuando estés listo

## Paso 2: Importa o Agrega Contactos

Puedes agregar contactos manualmente o importarlos:
- **Manual**: Haz clic en el botón + en Chats para crear una nueva conversación
- **Importar**: Ve a Configuración y usa la función de importación (plan Starter y superior)

## Paso 3: Comienza a Enviar Mensajes

Una vez conectado, puedes:
- Enviar y recibir mensajes de todos los canales en una bandeja
- El sistema enruta automáticamente las respuestas al canal correcto
- Agregar notas y etiquetas a las conversaciones
- Establecer recordatorios de seguimiento
- Rastrear negocios a través de etapas del embudo

## Paso 4: Configura la Automatización

Ahorra tiempo con funciones automatizadas:
- **Mensajes de Ausencia**: Respuesta automática fuera del horario laboral
- **Auto-Respondedores**: Responde instantáneamente a nuevos mensajes
- **Respaldo Inteligente**: Enrutamiento automático al canal de respaldo si el principal falla
- **Secuencias de Goteo**: Envía series de mensajes programados (plan Pro)
- **Flujos de Trabajo**: Automatiza etiquetado y asignaciones (plan Pro)
    `
  },
  {
    id: "ai-brain",
    title: "AI Brain - Tu Asistente de Negocios",
    category: "Funciones de IA",
    icon: Brain,
    keywords: ["ia", "cerebro", "asistente", "inteligente", "respuesta", "sugerencia", "lead", "captura", "automatización"],
    content: `
# AI Brain - Tu Asistente de Negocios Inteligente

AI Brain es un poderoso complemento que convierte WhachatCRM en tu incansable asistente de negocios. Aprende sobre tu negocio y te ayuda a responder más rápido, capturar leads automáticamente y nunca perder una oportunidad.

## ¿Qué es AI Brain?

Piensa en AI Brain como un asistente inteligente que:
- **Conoce tu negocio** - entiende tus productos, servicios, horarios y objetivos de ventas
- **Sugiere respuestas** - redacta respuestas contextuales que puedes usar con un clic
- **Captura leads** - extrae automáticamente información del cliente de las conversaciones
- **Se adapta a tu estilo** - elige entre Neutral, Amigable, Profesional o enfocado en Ventas

Disponible para usuarios del **plan Starter y Pro** a **$29/mes** bajo Uso Justo.

## ¿Qué puede hacer AI Brain?

### Sugerencias de Respuesta Inteligentes
La IA lee todo el contexto de la conversación y sugiere respuestas profesionales y acordes a tu marca. Puedes revisar, editar o enviar con un clic.

### Calificación y Puntuación de Leads
AI Brain identifica y califica leads automáticamente de 0-100 según su intención, presupuesto y disposición para comprar.

### Transferencia a Humano
Establece palabras clave personalizadas que activan automáticamente una toma de control humana, pausando la IA y notificando a tu equipo.

### Base de Conocimiento del Negocio
Sube la información única de tu empresa: productos, precios, políticas y preguntas frecuentes. La IA usa este conocimiento específico para proporcionar respuestas precisas.

## Cómo Empezar

1. **Actualiza a Starter o Pro** - AI Brain requiere una suscripción de pago
2. **Activa AI Brain** - Ve a Configuración > AI Brain y suscríbete
3. **Agrega Conocimiento del Negocio** - Enseña a la IA sobre tu negocio
4. **Configura el Modo IA** - Elige Solo Sugerencia, Auto Borrador o Híbrido
5. **Comienza a Usar** - Haz clic en el ícono del cerebro en cualquier chat
    `
  },
  {
    id: "automation-templates",
    title: "Uso de Plantillas de Automatización",
    category: "Automatización",
    icon: Zap,
    keywords: ["automatización", "plantillas", "goteo", "secuencia", "flujo de trabajo", "preestablecido"],
    content: `
# Uso de Plantillas de Automatización

WhachatCRM proporciona plantillas de automatización prediseñadas para ayudarte a comenzar rápidamente con flujos de trabajo comerciales comunes.

## Categorías de Plantillas Disponibles

### Recuperación de Carrito Abandonado
Secuencia de 3 mensajes para recuperar carritos abandonados con seguimientos personalizados y códigos de descuento.

### Nutrición de Leads
Mensajes de bienvenida con opciones y seguimientos automáticos si no se recibe respuesta.

### Recordatorios de Servicio
Confirmaciones de citas enviadas 24h y 1h antes de la cita, más solicitudes de retroalimentación post-servicio.

### Promociones
Ofertas por tiempo limitado con mensajes de urgencia para impulsar conversiones.

## Plantillas Específicas por Industria

Ofrecemos plantillas especializadas para:
- **Salud y Clínicas** - Recordatorios de citas con nombres de doctores
- **Bienes Raíces** - Programación de visitas a propiedades y opciones de financiamiento
- **Viajes y Turismo** - Recordatorios de viaje con listas de verificación
- **E-commerce** - Recuperación de carrito con listas de productos

## Cómo Usar las Plantillas

1. Ve a **Plantillas** > **Plantillas Preestablecidas**
2. Filtra por idioma, categoría o industria
3. Haz clic en **Vista Previa** para ver la secuencia de mensajes
4. Personaliza los marcadores de posición con tus valores reales
5. Activa **Lanzar inmediatamente** si deseas activar de inmediato
6. Haz clic en **Guardar Plantilla** o **Lanzar Ahora**

## Marcadores de Posición

Las plantillas soportan marcadores dinámicos como:
- \`{{name}}\` - Nombre del cliente
- \`{{product_list}}\` - Artículos en el carrito
- \`{{discount_code}}\` - Código promocional
- \`{{appointment_time}}\` - Hora programada
- \`{{location}}\` - Dirección del negocio
    `
  },
  {
    id: "billing",
    title: "Facturación y Suscripciones",
    category: "Facturación",
    icon: CreditCard,
    keywords: ["facturación", "pago", "suscripción", "plan", "actualizar", "cancelar", "factura"],
    content: `
# Facturación y Suscripciones

Administra tu suscripción e información de facturación de WhachatCRM.

## Planes Disponibles

### Plan Gratuito
- 50 conversaciones/mes
- Funciones básicas de bandeja
- 1 conexión de canal

### Plan Starter - $29/mes
- Conversaciones ilimitadas
- Los 7 canales
- Colaboración en equipo
- Automatización básica

### Plan Pro - $79/mes
- Todo en Starter
- Automatización avanzada
- Secuencias de goteo
- Soporte prioritario
- Acceso API

### Complemento AI Brain - $29/mes
- Funciones de IA ilimitadas
- Sugerencias de respuesta inteligentes
- Puntuación de leads
- Base de conocimiento del negocio

## Cómo Actualizar

1. Ve a **Configuración** > **Suscripción**
2. Haz clic en **Actualizar** en el plan deseado
3. Ingresa la información de pago
4. Tu plan se activa inmediatamente

## Administrar tu Suscripción

- **Ver facturas**: Configuración > Facturación > Facturas
- **Actualizar método de pago**: Configuración > Facturación > Método de Pago
- **Cancelar suscripción**: Configuración > Facturación > Cancelar Plan

## Reembolsos

Contacta a soporte dentro de los 14 días de la compra para solicitudes de reembolso.
    `
  },
  {
    id: "connect-channels",
    title: "Conectar Canales de Comunicación",
    category: "Integraciones",
    icon: Plug,
    keywords: ["conectar", "canal", "whatsapp", "sms", "telegram", "instagram", "facebook", "chat web"],
    content: `
# Conectar Canales de Comunicación

WhachatCRM soporta 7 canales de mensajería en una bandeja de entrada unificada.

## WhatsApp

### Vía Twilio
1. Crea una cuenta de Twilio
2. Obtén la aprobación de WhatsApp Business
3. Ingresa tus credenciales de Twilio en Configuración

### Vía Meta Business API
1. Crea una cuenta de Meta Business
2. Configura WhatsApp Business API
3. Conéctate usando el asistente de Meta en Configuración

## SMS (Twilio)

1. Obtén un número de teléfono de Twilio
2. Ingresa Account SID y Auth Token
3. Configura la URL del webhook

## Telegram

1. Crea un bot usando @BotFather
2. Obtén tu token del bot
3. Ingresa el token en Configuración

## Instagram y Facebook

1. Conecta tu cuenta de Meta Business
2. Vincula tu página de Instagram/Facebook
3. Otorga permisos de mensajería

## Widget de Chat Web

1. Ve a Configuración > Widget Web
2. Personaliza la apariencia
3. Copia el código de inserción a tu sitio web

## TikTok

1. Conecta tu cuenta de TikTok Business
2. Habilita la integración de formularios de leads
3. Los leads aparecen automáticamente en la bandeja
    `
  },
];

export function getHelpArticles(language: HelpLanguage): HelpArticle[] {
  switch (language) {
    case "he":
      return HELP_ARTICLES_HE;
    case "es":
      return HELP_ARTICLES_ES;
    default:
      return HELP_ARTICLES_EN;
  }
}

export function getHelpCategories(language: HelpLanguage): HelpCategory[] {
  return HELP_CATEGORIES[language] || HELP_CATEGORIES.en;
}

export function getHelpUITranslations(language: HelpLanguage) {
  return HELP_UI_TRANSLATIONS[language] || HELP_UI_TRANSLATIONS.en;
}
