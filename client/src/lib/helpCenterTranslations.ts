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

WhachatCRM brings supported channels into one unified inbox so your team can reply faster and keep lead history in one place.
- **WhatsApp**: Connected through Meta Embedded Signup
- **Instagram DMs**: Connected through Meta and linked Facebook Pages
- **Facebook Messenger**: Connected through your Facebook Page
- **Web Chat**: Website widget for inbound conversations
- **SMS, Telegram, and TikTok lead intake**: Available where enabled

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

Create follow-ups, reminders, lead nurturing steps, and campaign flows across supported channels.
- **Starter**: Basic automations, templates, and follow-ups
- **Pro**: More advanced workflows, Growth Engine automations, and AI-assisted triggers where enabled
- **AI Brain add-on**: Optional intelligence layer for smarter suggestions, context, and workflow enhancements
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

AI Assist Basic is included in **Starter and above**. AI Brain is an optional add-on for teams that want deeper context, smart suggestions, lead scoring or insights where enabled, and advanced AI workflow enhancements.

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
4. **Choose your AI behavior** - Start with suggestions and enable advanced modes only where your plan supports them
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

1. Go to **Templates** > **Presets**
2. Filter by language, category, or industry
3. Use the **eye** icon for a read-only preview of the sequence
4. Click **Use Template** to create a **draft** campaign and open the full editor
5. Edit name, status, steps, messages, delays, and placeholders — then **Save Draft** or activate from the editor

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

### Free
- Best for testing WhachatCRM
- Basic inbox access
- Limited active conversations
- 1 user
- Test supported channels

### Starter - $19/month
- Up to 3 users
- AI Assist Basic included
- Unified inbox
- Templates and follow-ups
- Basic automations
- Core integrations
- Better conversation capacity for small businesses

### Pro - $49/month
- Unlimited users
- Advanced automations
- Growth Engines access where eligible
- Enhanced AI-assisted workflows
- Larger conversation capacity
- Multi-channel scaling features
- Advanced workflow capabilities

### AI Brain Add-on
- Optional intelligence layer
- Smart suggestions
- AI context assistance
- Lead scoring and insights where enabled
- Advanced AI workflow enhancements

## Meta Conversation Fees

No WhachatCRM markup on Meta conversation pricing.

You pay Meta/WhatsApp conversation fees directly based on Meta's pricing model. WhachatCRM does not add additional per-message markups.

Your WhachatCRM subscription and Meta messaging charges are separate.

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

# Connecting Communication Channels

Use this guide to connect WhatsApp, Facebook Messenger, and Instagram DMs to the unified inbox.

## Before You Start

- Log into the correct Facebook/Meta account before you begin
- Make sure you have admin access to the business, Page, and messaging assets
- Instagram must be a Professional account
- Instagram must be linked to a Facebook Page
- WhatsApp connects through Meta Embedded Signup
- Some Meta features may require approval before live customer messaging works

## Connect WhatsApp

FLOW: WhachatCRM → Meta Embedded Signup → Choose Business → Choose WhatsApp Account → Choose Phone Number → Return to WhachatCRM → Connection Verification → Ready

1. Open **Settings** → **Integrations / Channels**
2. Click **Connect WhatsApp**
3. Continue with Meta Embedded Signup
4. Select or create your business account
5. Select your WhatsApp Business Account
6. Select your phone number
7. Return to WhachatCRM
8. WhachatCRM verifies the connection automatically
9. If multiple numbers exist, choose the number you want connected

WhachatCRM does not add a markup to Meta conversation pricing. Your WhachatCRM subscription and Meta messaging charges are separate.

## Connect Facebook Messenger

FLOW: WhachatCRM → Meta Login → Choose Page/Account → Approve Permissions → Return to WhachatCRM → Inbox Ready

1. Open **Integrations**
2. Click **Connect Facebook**
3. Choose the Facebook Page
4. Approve requested permissions
5. Return to WhachatCRM
6. Test the inbox connection

## Connect Instagram

FLOW: WhachatCRM → Meta Login → Choose Page/Account → Approve Permissions → Return to WhachatCRM → Inbox Ready

1. Ensure Instagram is Professional
2. Ensure it is linked to a Facebook Page
3. Click **Connect Instagram**
4. Approve Meta permissions
5. Return to WhachatCRM
6. Verify inbox connection

If messages do not arrive, Meta permissions, account linkage, or app review may still need approval or configuration.

## Status Definitions

### Connected
Your channel is ready.

### Needs Attention
The connection exists but requires review or reconnection.

### Pending Review
Meta approval or setup may still be in progress.

### Not Connected
This channel has not been connected yet.

## Troubleshooting

- Make sure you used the correct Facebook/Meta admin account
- Confirm Instagram is linked to the correct Facebook Page
- Confirm the WhatsApp number is a production number
- Reconnect the channel if permissions changed
- Contact support if the connection still needs attention
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
- **וואטסאפ**: דרך Meta Embedded Signup
- **SMS**: זמין כשמופעל
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

AI Assist Basic כלול ב-**Starter ומעלה**. AI Brain הוא תוסף אופציונלי לשכבת אינטליגנציה עמוקה יותר, הצעות חכמות, סיוע בהקשר, תובנות לידים כשמופעלות ושיפורי זרימת עבודה מבוססי AI.

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

### Free
- הטוב ביותר לבדיקת WhachatCRM
- גישה בסיסית לתיבת הדואר
- שיחות פעילות מוגבלות
- משתמש אחד
- בדיקת ערוצים נתמכים

### Starter - $19/חודש
- עד 3 משתמשים
- AI Assist Basic כלול
- תיבת דואר מאוחדת
- תבניות ומעקבים
- אוטומציות בסיסיות
- אינטגרציות ליבה
- קיבולת שיחות טובה יותר לעסקים קטנים

### Pro - $49/חודש
- משתמשים ללא הגבלה
- אוטומציות מתקדמות
- גישה ל-Growth Engines כשזכאים
- זרימות עבודה משופרות בסיוע AI
- קיבולת שיחות גדולה יותר
- יכולות סקיילינג רב-ערוציות
- יכולות זרימת עבודה מתקדמות

### תוסף AI Brain
- שכבת אינטליגנציה אופציונלית
- הצעות חכמות
- סיוע AI בהקשר
- דירוג לידים ותובנות כשמופעלים
- שיפורי זרימת עבודה מתקדמים בסיוע AI

## עמלות שיחה של Meta

אין תוספת מחיר של WhachatCRM על תמחור השיחות של Meta.

אתה משלם עמלות שיחה של Meta/WhatsApp ישירות לפי מודל התמחור של Meta. WhachatCRM לא מוסיפה תוספות לכל הודעה.

המנוי שלך ל-WhachatCRM וחיובי ההודעות של Meta נפרדים.

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

השתמש במדריך זה כדי לחבר WhatsApp, Facebook Messenger והודעות Instagram לתיבת הדואר המאוחדת.

## לפני שמתחילים

- התחבר לחשבון Facebook/Meta הנכון
- ודא שיש לך הרשאות אדמין לעסק, לעמוד ולנכסי ההודעות
- חשבון Instagram חייב להיות Professional
- Instagram חייב להיות מקושר לעמוד Facebook
- WhatsApp מתחבר דרך Meta Embedded Signup
- חלק מתכונות Meta עשויות לדרוש אישור לפני הודעות ללקוחות חיים

## חיבור WhatsApp

FLOW: WhachatCRM → Meta Embedded Signup → בחירת עסק → בחירת חשבון WhatsApp → בחירת מספר טלפון → חזרה ל-WhachatCRM → אימות חיבור → מוכן

1. פתח **הגדרות** → **אינטגרציות / ערוצים**
2. לחץ **Connect WhatsApp**
3. המשך עם Meta Embedded Signup
4. בחר או צור את חשבון העסק
5. בחר את חשבון WhatsApp Business
6. בחר את מספר הטלפון
7. חזור ל-WhachatCRM
8. WhachatCRM מאמת את החיבור אוטומטית
9. אם קיימים מספר מספרים, בחר את המספר שברצונך לחבר

אין תוספת מחיר של WhachatCRM על תמחור השיחות של Meta. המנוי שלך וחיובי ההודעות של Meta נפרדים.

## חיבור Facebook Messenger

FLOW: WhachatCRM → Meta Login → בחירת עמוד/חשבון → אישור הרשאות → חזרה ל-WhachatCRM → תיבת דואר מוכנה

1. פתח **אינטגרציות**
2. לחץ **Connect Facebook**
3. בחר את עמוד Facebook
4. אשר את ההרשאות המבוקשות
5. חזור ל-WhachatCRM
6. בדוק את החיבור בתיבת הדואר

## חיבור Instagram

FLOW: WhachatCRM → Meta Login → בחירת עמוד/חשבון → אישור הרשאות → חזרה ל-WhachatCRM → תיבת דואר מוכנה

1. ודא ש-Instagram הוא חשבון Professional
2. ודא שהוא מקושר לעמוד Facebook
3. לחץ **Connect Instagram**
4. אשר הרשאות Meta
5. חזור ל-WhachatCRM
6. אמת את החיבור לתיבת הדואר

אם הודעות לא מגיעות, ייתכן שהרשאות Meta, קישור החשבון או סקירת האפליקציה עדיין דורשים אישור או הגדרה.

## הגדרות סטטוס

### מחובר
הערוץ מוכן.

### דורש תשומת לב
החיבור קיים אבל דורש בדיקה או חיבור מחדש.

### ממתין לאישור
ייתכן שאישור Meta או ההגדרה עדיין בתהליך.

### לא מחובר
הערוץ עדיין לא חובר.

## פתרון בעיות

- ודא שהשתמשת בחשבון Facebook/Meta אדמין הנכון
- ודא ש-Instagram מקושר לעמוד Facebook הנכון
- ודא שמספר WhatsApp הוא מספר production
- חבר מחדש את הערוץ אם ההרשאות השתנו
- פנה לתמיכה אם החיבור עדיין דורש תשומת לב
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
- **WhatsApp**: Mediante Meta Embedded Signup
- **SMS**: Disponible donde esté habilitado
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

AI Assist Basic está incluido en **Starter y planes superiores**. AI Brain es un complemento opcional para equipos que necesitan más contexto, sugerencias inteligentes, asistencia de IA, puntuación o insights de leads donde estén habilitados, y mejoras avanzadas de flujos con IA.

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

### Free
- Ideal para probar WhachatCRM
- Acceso básico a la bandeja
- Conversaciones activas limitadas
- 1 usuario
- Prueba de canales compatibles

### Starter - $19/mes
- Hasta 3 usuarios
- AI Assist Basic incluido
- Bandeja unificada
- Plantillas y seguimientos
- Automatizaciones básicas
- Integraciones principales
- Más capacidad de conversaciones para pequeños negocios

### Pro - $49/mes
- Usuarios ilimitados
- Automatizaciones avanzadas
- Acceso a Growth Engines donde corresponda
- Flujos mejorados asistidos por IA
- Mayor capacidad de conversaciones
- Funciones para escalar múltiples canales
- Capacidades avanzadas de workflow

### Complemento AI Brain
- Capa de inteligencia opcional
- Sugerencias inteligentes
- Asistencia contextual con IA
- Puntuación e insights de leads donde estén habilitados
- Mejoras avanzadas de workflow con IA

## Tarifas de conversación de Meta

WhachatCRM no agrega margen al precio de conversaciones de Meta.

Pagas las tarifas de conversación de Meta/WhatsApp directamente según el modelo de precios de Meta. WhachatCRM no agrega recargos por mensaje.

Tu suscripción de WhachatCRM y los cargos de mensajería de Meta son separados.

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

Usa esta guía para conectar WhatsApp, Facebook Messenger e Instagram DMs a la bandeja unificada.

## Antes de empezar

- Inicia sesión con la cuenta correcta de Facebook/Meta
- Necesitas acceso de administrador al negocio, Página y activos de mensajería
- Instagram debe ser una cuenta Professional
- Instagram debe estar vinculado a una Página de Facebook
- WhatsApp se conecta mediante Meta Embedded Signup
- Algunas funciones de Meta pueden requerir aprobación antes de enviar mensajes a clientes reales

## Conectar WhatsApp

FLOW: WhachatCRM → Meta Embedded Signup → Elegir negocio → Elegir cuenta WhatsApp → Elegir número → Volver a WhachatCRM → Verificación → Listo

1. Abre **Configuración** → **Integraciones / Canales**
2. Haz clic en **Connect WhatsApp**
3. Continúa con Meta Embedded Signup
4. Selecciona o crea tu cuenta de negocio
5. Selecciona tu WhatsApp Business Account
6. Selecciona tu número de teléfono
7. Vuelve a WhachatCRM
8. WhachatCRM verifica la conexión automáticamente
9. Si existen varios números, elige el número que quieres conectar

WhachatCRM no agrega margen al precio de conversaciones de Meta. Tu suscripción y los cargos de mensajería de Meta son separados.

## Conectar Facebook Messenger

FLOW: WhachatCRM → Meta Login → Elegir Página/Cuenta → Aprobar permisos → Volver a WhachatCRM → Bandeja lista

1. Abre **Integraciones**
2. Haz clic en **Connect Facebook**
3. Elige la Página de Facebook
4. Aprueba los permisos solicitados
5. Vuelve a WhachatCRM
6. Prueba la conexión en la bandeja

## Conectar Instagram

FLOW: WhachatCRM → Meta Login → Elegir Página/Cuenta → Aprobar permisos → Volver a WhachatCRM → Bandeja lista

1. Asegúrate de que Instagram sea Professional
2. Asegúrate de que esté vinculado a una Página de Facebook
3. Haz clic en **Connect Instagram**
4. Aprueba los permisos de Meta
5. Vuelve a WhachatCRM
6. Verifica la conexión de la bandeja

Si los mensajes no llegan, permisos de Meta, vinculación de cuentas o revisión de la app pueden necesitar aprobación o configuración.

## Estados

### Conectado
Tu canal está listo.

### Requiere atención
La conexión existe pero requiere revisión o reconexión.

### Pendiente de revisión
La aprobación o configuración de Meta puede seguir en progreso.

### No conectado
Este canal todavía no se ha conectado.

## Solución de problemas

- Asegúrate de usar la cuenta correcta de Facebook/Meta con permisos de administrador
- Confirma que Instagram esté vinculado a la Página de Facebook correcta
- Confirma que el número de WhatsApp sea de producción
- Reconecta el canal si cambiaron los permisos
- Contacta a soporte si la conexión sigue requiriendo atención
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
