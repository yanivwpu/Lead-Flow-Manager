export type SupportedTemplateLanguage = "en" | "he" | "es";
export type TemplateCategory = "abandoned_cart" | "lead_nurture" | "service_reminder" | "promotions";
export type Industry = "general" | "clinic" | "real_estate" | "travel" | "ecommerce";

export interface AutomationTemplate {
  id: string;
  language: SupportedTemplateLanguage;
  category: TemplateCategory;
  industry: Industry;
  name: string;
  description: string;
  messages: Array<{
    delay: string;
    content: string;
    type: "initial" | "followup" | "reminder" | "feedback";
  }>;
  placeholders: string[];
  aiEnabled: boolean;
}

export const LOCALIZED_TEMPLATES: AutomationTemplate[] = [
  // ==================== SPANISH TEMPLATES ====================
  
  // Abandoned Cart - Spanish
  {
    id: "es_abandoned_cart_ecommerce",
    language: "es",
    category: "abandoned_cart",
    industry: "ecommerce",
    name: "Recuperación de Carrito Abandonado",
    description: "Secuencia de 3 mensajes para recuperar carritos abandonados con enlace y código de descuento opcional",
    messages: [
      {
        delay: "1h",
        content: "¡Hola {{name}}! 👋 Notamos que dejaste algunos productos en tu carrito. ¿Necesitas ayuda para completar tu compra?\n\n🛒 Tu carrito: {{cart_link}}\n\n¿Tienes alguna pregunta sobre los productos?",
        type: "initial"
      },
      {
        delay: "24h",
        content: "{{name}}, tus productos siguen esperándote 🛍️\n\n{{product_list}}\n\n⏰ No te lo pierdas - el stock es limitado.\n\n👉 Completa tu compra: {{cart_link}}",
        type: "followup"
      },
      {
        delay: "72h",
        content: "¡Última oportunidad, {{name}}! 🎁\n\nUsa el código {{discount_code}} para obtener un descuento especial en tu compra.\n\n✨ Oferta válida por 24 horas.\n\n🛒 Finalizar compra: {{cart_link}}",
        type: "reminder"
      }
    ],
    placeholders: ["name", "cart_link", "product_list", "discount_code"],
    aiEnabled: true
  },
  
  // Lead Nurture - Spanish
  {
    id: "es_lead_nurture_general",
    language: "es",
    category: "lead_nurture",
    industry: "general",
    name: "Nutrición de Leads / Seguimiento de Ventas",
    description: "Mensaje de bienvenida con opciones y seguimiento automático si no hay respuesta",
    messages: [
      {
        delay: "0",
        content: "¡Hola {{name}}! 👋 Gracias por contactarnos.\n\n¿En qué podemos ayudarte hoy?\n\n1️⃣ Más información sobre nuestros servicios\n2️⃣ Solicitar una cotización\n3️⃣ Hablar con un asesor\n\nResponde con el número de tu elección.",
        type: "initial"
      },
      {
        delay: "12h",
        content: "{{name}}, ¿pudiste revisar nuestras opciones? 🤔\n\nEstamos aquí para ayudarte. Solo responde a este mensaje y te atenderemos de inmediato.\n\n¿Te gustaría programar una llamada rápida? ☎️",
        type: "followup"
      }
    ],
    placeholders: ["name"],
    aiEnabled: true
  },
  
  // Lead Nurture - Real Estate Spanish
  {
    id: "es_lead_nurture_real_estate",
    language: "es",
    category: "lead_nurture",
    industry: "real_estate",
    name: "Seguimiento Inmobiliario",
    description: "Secuencia para leads de bienes raíces con opciones de visita y cotización",
    messages: [
      {
        delay: "0",
        content: "¡Hola {{name}}! 🏠 Gracias por tu interés en {{property_name}}.\n\n¿Cómo te gustaría continuar?\n\n1️⃣ Agendar una visita\n2️⃣ Recibir más fotos y detalles\n3️⃣ Conocer opciones de financiamiento\n\nResponde con el número que prefieras.",
        type: "initial"
      },
      {
        delay: "12h",
        content: "{{name}}, la propiedad en {{location}} sigue disponible ✨\n\n📍 {{property_name}}\n💰 Precio: {{price}}\n\n¿Te gustaría agendar una visita esta semana?",
        type: "followup"
      }
    ],
    placeholders: ["name", "property_name", "location", "price"],
    aiEnabled: true
  },
  
  // Service Reminder - Spanish Clinics
  {
    id: "es_service_reminder_clinic",
    language: "es",
    category: "service_reminder",
    industry: "clinic",
    name: "Recordatorio de Cita Médica",
    description: "Recordatorios 24h y 1h antes de la cita, más solicitud de retroalimentación",
    messages: [
      {
        delay: "-24h",
        content: "📅 Recordatorio: {{name}}, tienes una cita mañana.\n\n🏥 {{clinic_name}}\n📍 {{location}}\n🕐 {{appointment_time}}\n👨‍⚕️ Dr./Dra. {{doctor_name}}\n\n¿Confirmas tu asistencia? Responde SÍ o NO.",
        type: "reminder"
      },
      {
        delay: "-1h",
        content: "⏰ {{name}}, tu cita es en 1 hora.\n\n🏥 {{clinic_name}}\n📍 {{location}}\n\nTe esperamos. ¡Nos vemos pronto!",
        type: "reminder"
      },
      {
        delay: "+2h",
        content: "¡Gracias por visitarnos, {{name}}! 🙏\n\n¿Cómo fue tu experiencia hoy?\n\n⭐ Excelente\n👍 Buena\n😐 Regular\n\nTu opinión nos ayuda a mejorar.",
        type: "feedback"
      }
    ],
    placeholders: ["name", "clinic_name", "location", "appointment_time", "doctor_name"],
    aiEnabled: true
  },
  
  // Service Reminder - Travel Spanish
  {
    id: "es_service_reminder_travel",
    language: "es",
    category: "service_reminder",
    industry: "travel",
    name: "Recordatorio de Viaje",
    description: "Recordatorios antes del viaje y seguimiento post-viaje",
    messages: [
      {
        delay: "-24h",
        content: "🌴 ¡Mañana es el gran día, {{name}}!\n\n✈️ {{destination}}\n📅 {{travel_date}}\n🕐 Salida: {{departure_time}}\n\n📋 Checklist:\n✅ Pasaporte\n✅ Confirmación de vuelo\n✅ Reserva de hotel\n\n¿Todo listo para tu aventura?",
        type: "reminder"
      },
      {
        delay: "+48h",
        content: "¡Hola {{name}}! 🌟\n\n¿Cómo estuvo tu viaje a {{destination}}?\n\nNos encantaría saber tu experiencia. ¿Qué calificación le darías?\n\n⭐⭐⭐⭐⭐ Increíble\n⭐⭐⭐⭐ Muy bueno\n⭐⭐⭐ Bueno",
        type: "feedback"
      }
    ],
    placeholders: ["name", "destination", "travel_date", "departure_time"],
    aiEnabled: true
  },
  
  // Promotions - Spanish
  {
    id: "es_promotions_general",
    language: "es",
    category: "promotions",
    industry: "general",
    name: "Promociones y Ofertas Limitadas",
    description: "Oferta inicial con recordatorio de urgencia (FOMO)",
    messages: [
      {
        delay: "0",
        content: "🎉 ¡Oferta Especial para ti, {{name}}!\n\n{{promotion_details}}\n\n💥 {{discount_percent}}% de descuento\n⏰ Válido hasta: {{expiry_date}}\n\n👉 Aprovecha ahora: {{offer_link}}\n\nUsa el código: {{promo_code}}",
        type: "initial"
      },
      {
        delay: "24h",
        content: "⚠️ {{name}}, ¡últimas horas!\n\n🔥 La oferta del {{discount_percent}}% termina pronto.\n\n⏰ Solo quedan {{hours_left}} horas.\n\n👉 No te lo pierdas: {{offer_link}}",
        type: "reminder"
      }
    ],
    placeholders: ["name", "promotion_details", "discount_percent", "expiry_date", "offer_link", "promo_code", "hours_left"],
    aiEnabled: true
  },
  
  // ==================== HEBREW TEMPLATES ====================
  
  // Abandoned Cart - Hebrew
  {
    id: "he_abandoned_cart_ecommerce",
    language: "he",
    category: "abandoned_cart",
    industry: "ecommerce",
    name: "עגלה נטושה",
    description: "רצף של 3 הודעות לשחזור עגלות נטושות עם קישור והנחה אופציונלית",
    messages: [
      {
        delay: "1h",
        content: "שלום {{name}}! 👋 שמנו לב שהשארת כמה מוצרים בעגלה שלך. צריך עזרה להשלים את הרכישה?\n\n🛒 העגלה שלך: {{cart_link}}\n\nיש לך שאלות על המוצרים?",
        type: "initial"
      },
      {
        delay: "24h",
        content: "{{name}}, המוצרים שלך עדיין מחכים לך 🛍️\n\n{{product_list}}\n\n⏰ אל תפספס - המלאי מוגבל.\n\n👈 להשלמת הרכישה: {{cart_link}}",
        type: "followup"
      },
      {
        delay: "72h",
        content: "הזדמנות אחרונה, {{name}}! 🎁\n\nהשתמש בקוד {{discount_code}} לקבלת הנחה מיוחדת על הרכישה שלך.\n\n✨ ההצעה בתוקף ל-24 שעות.\n\n🛒 לסיום הרכישה: {{cart_link}}",
        type: "reminder"
      }
    ],
    placeholders: ["name", "cart_link", "product_list", "discount_code"],
    aiEnabled: true
  },
  
  // Lead Nurture - Hebrew
  {
    id: "he_lead_nurture_general",
    language: "he",
    category: "lead_nurture",
    industry: "general",
    name: "לידים & מכירות",
    description: "הודעת פתיחה עם אפשרויות ומעקב אוטומטי אם אין תגובה",
    messages: [
      {
        delay: "0",
        content: "שלום {{name}}! 👋 תודה שפנית אלינו.\n\nאיך נוכל לעזור לך היום?\n\n1️⃣ מידע נוסף על השירותים שלנו\n2️⃣ לקבל הצעת מחיר\n3️⃣ לדבר עם נציג\n\nהשב/י עם מספר האפשרות שמתאימה לך.",
        type: "initial"
      },
      {
        delay: "12h",
        content: "{{name}}, הספקת לראות את האפשרויות שלנו? 🤔\n\nאנחנו כאן כדי לעזור. פשוט השב/י להודעה הזו ונחזור אליך מיד.\n\nרוצה לתאם שיחה קצרה? ☎️",
        type: "followup"
      }
    ],
    placeholders: ["name"],
    aiEnabled: true
  },
  
  // Lead Nurture - Real Estate Hebrew
  {
    id: "he_lead_nurture_real_estate",
    language: "he",
    category: "lead_nurture",
    industry: "real_estate",
    name: "מעקב נדל״ן",
    description: "רצף ללידים בתחום הנדל״ן עם אפשרויות ביקור והצעת מחיר",
    messages: [
      {
        delay: "0",
        content: "שלום {{name}}! 🏠 תודה על ההתעניינות ב{{property_name}}.\n\nאיך תרצה להמשיך?\n\n1️⃣ לתאם ביקור בנכס\n2️⃣ לקבל עוד תמונות ופרטים\n3️⃣ לשמוע על אפשרויות מימון\n\nהשב/י עם המספר המתאים.",
        type: "initial"
      },
      {
        delay: "12h",
        content: "{{name}}, הנכס ב{{location}} עדיין פנוי ✨\n\n📍 {{property_name}}\n💰 מחיר: {{price}}\n\nרוצה לתאם ביקור השבוע?",
        type: "followup"
      }
    ],
    placeholders: ["name", "property_name", "location", "price"],
    aiEnabled: true
  },
  
  // Service Reminder - Hebrew Clinics
  {
    id: "he_service_reminder_clinic",
    language: "he",
    category: "service_reminder",
    industry: "clinic",
    name: "תזכורת פגישה / שירות",
    description: "תזכורות 24 שעות ושעה לפני הפגישה, בתוספת בקשת משוב",
    messages: [
      {
        delay: "-24h",
        content: "📅 תזכורת: {{name}}, יש לך פגישה מחר.\n\n🏥 {{clinic_name}}\n📍 {{location}}\n🕐 {{appointment_time}}\n👨‍⚕️ ד״ר {{doctor_name}}\n\nאת/ה מאשר/ת הגעה? השב/י כן או לא.",
        type: "reminder"
      },
      {
        delay: "-1h",
        content: "⏰ {{name}}, הפגישה שלך בעוד שעה.\n\n🏥 {{clinic_name}}\n📍 {{location}}\n\nמחכים לך. נתראה בקרוב!",
        type: "reminder"
      },
      {
        delay: "+2h",
        content: "תודה שביקרת אצלנו, {{name}}! 🙏\n\nאיך הייתה החוויה שלך היום?\n\n⭐ מעולה\n👍 טובה\n😐 סבירה\n\nהמשוב שלך עוזר לנו להשתפר.",
        type: "feedback"
      }
    ],
    placeholders: ["name", "clinic_name", "location", "appointment_time", "doctor_name"],
    aiEnabled: true
  },
  
  // Promotions - Hebrew
  {
    id: "he_promotions_general",
    language: "he",
    category: "promotions",
    industry: "general",
    name: "מבצעים והצעות מוגבלות",
    description: "הצעה ראשונית עם תזכורת דחיפות",
    messages: [
      {
        delay: "0",
        content: "🎉 הצעה מיוחדת בשבילך, {{name}}!\n\n{{promotion_details}}\n\n💥 {{discount_percent}}% הנחה\n⏰ בתוקף עד: {{expiry_date}}\n\n👈 לניצול ההטבה: {{offer_link}}\n\nקוד קופון: {{promo_code}}",
        type: "initial"
      },
      {
        delay: "24h",
        content: "⚠️ {{name}}, שעות אחרונות!\n\n🔥 ההנחה של {{discount_percent}}% עומדת להסתיים.\n\n⏰ נותרו רק {{hours_left}} שעות.\n\n👈 אל תפספס: {{offer_link}}",
        type: "reminder"
      }
    ],
    placeholders: ["name", "promotion_details", "discount_percent", "expiry_date", "offer_link", "promo_code", "hours_left"],
    aiEnabled: true
  },
  
  // ==================== ENGLISH TEMPLATES ====================
  
  // Abandoned Cart - English
  {
    id: "en_abandoned_cart_ecommerce",
    language: "en",
    category: "abandoned_cart",
    industry: "ecommerce",
    name: "Abandoned Cart Recovery",
    description: "3-message sequence to recover abandoned carts with link and optional discount",
    messages: [
      {
        delay: "1h",
        content: "Hi {{name}}! 👋 We noticed you left some items in your cart. Need help completing your purchase?\n\n🛒 Your cart: {{cart_link}}\n\nAny questions about the products?",
        type: "initial"
      },
      {
        delay: "24h",
        content: "{{name}}, your items are still waiting for you 🛍️\n\n{{product_list}}\n\n⏰ Don't miss out - limited stock available.\n\n👉 Complete your order: {{cart_link}}",
        type: "followup"
      },
      {
        delay: "72h",
        content: "Last chance, {{name}}! 🎁\n\nUse code {{discount_code}} for a special discount on your purchase.\n\n✨ Offer valid for 24 hours.\n\n🛒 Checkout now: {{cart_link}}",
        type: "reminder"
      }
    ],
    placeholders: ["name", "cart_link", "product_list", "discount_code"],
    aiEnabled: true
  },
  
  // Lead Nurture - English
  {
    id: "en_lead_nurture_general",
    language: "en",
    category: "lead_nurture",
    industry: "general",
    name: "Lead Nurture / Sales Follow-Up",
    description: "Welcome message with options and automatic follow-up if no response",
    messages: [
      {
        delay: "0",
        content: "Hi {{name}}! 👋 Thanks for reaching out.\n\nHow can we help you today?\n\n1️⃣ More info about our services\n2️⃣ Request a quote\n3️⃣ Speak with an advisor\n\nReply with the number of your choice.",
        type: "initial"
      },
      {
        delay: "12h",
        content: "{{name}}, did you get a chance to review our options? 🤔\n\nWe're here to help. Just reply to this message and we'll get back to you right away.\n\nWould you like to schedule a quick call? ☎️",
        type: "followup"
      }
    ],
    placeholders: ["name"],
    aiEnabled: true
  },
  
  // Service Reminder - English Clinics
  {
    id: "en_service_reminder_clinic",
    language: "en",
    category: "service_reminder",
    industry: "clinic",
    name: "Appointment Reminder",
    description: "24h and 1h reminders before appointment, plus feedback request",
    messages: [
      {
        delay: "-24h",
        content: "📅 Reminder: {{name}}, you have an appointment tomorrow.\n\n🏥 {{clinic_name}}\n📍 {{location}}\n🕐 {{appointment_time}}\n👨‍⚕️ Dr. {{doctor_name}}\n\nPlease confirm your attendance. Reply YES or NO.",
        type: "reminder"
      },
      {
        delay: "-1h",
        content: "⏰ {{name}}, your appointment is in 1 hour.\n\n🏥 {{clinic_name}}\n📍 {{location}}\n\nWe're looking forward to seeing you!",
        type: "reminder"
      },
      {
        delay: "+2h",
        content: "Thank you for visiting us, {{name}}! 🙏\n\nHow was your experience today?\n\n⭐ Excellent\n👍 Good\n😐 Okay\n\nYour feedback helps us improve.",
        type: "feedback"
      }
    ],
    placeholders: ["name", "clinic_name", "location", "appointment_time", "doctor_name"],
    aiEnabled: true
  },
  
  // Promotions - English
  {
    id: "en_promotions_general",
    language: "en",
    category: "promotions",
    industry: "general",
    name: "Limited-Time Offers",
    description: "Initial offer with urgency reminder (FOMO)",
    messages: [
      {
        delay: "0",
        content: "🎉 Special Offer for you, {{name}}!\n\n{{promotion_details}}\n\n💥 {{discount_percent}}% OFF\n⏰ Valid until: {{expiry_date}}\n\n👉 Claim now: {{offer_link}}\n\nUse code: {{promo_code}}",
        type: "initial"
      },
      {
        delay: "24h",
        content: "⚠️ {{name}}, only a few hours left!\n\n🔥 The {{discount_percent}}% offer expires soon.\n\n⏰ Only {{hours_left}} hours remaining.\n\n👉 Don't miss out: {{offer_link}}",
        type: "reminder"
      }
    ],
    placeholders: ["name", "promotion_details", "discount_percent", "expiry_date", "offer_link", "promo_code", "hours_left"],
    aiEnabled: true
  }
];

export const CATEGORY_LABELS: Record<SupportedTemplateLanguage, Record<TemplateCategory, string>> = {
  en: {
    abandoned_cart: "Abandoned Cart",
    lead_nurture: "Lead Nurture",
    service_reminder: "Service Reminder",
    promotions: "Promotions"
  },
  he: {
    abandoned_cart: "עגלה נטושה",
    lead_nurture: "טיפוח לידים",
    service_reminder: "תזכורת שירות",
    promotions: "מבצעים"
  },
  es: {
    abandoned_cart: "Carrito Abandonado",
    lead_nurture: "Nutrición de Leads",
    service_reminder: "Recordatorio de Servicio",
    promotions: "Promociones"
  }
};

export const INDUSTRY_LABELS: Record<SupportedTemplateLanguage, Record<Industry, string>> = {
  en: {
    general: "General",
    clinic: "Healthcare & Clinics",
    real_estate: "Real Estate",
    travel: "Travel & Tourism",
    ecommerce: "E-commerce"
  },
  he: {
    general: "כללי",
    clinic: "בריאות וקליניקות",
    real_estate: "נדל״ן",
    travel: "תיירות ונסיעות",
    ecommerce: "מסחר אלקטרוני"
  },
  es: {
    general: "General",
    clinic: "Salud y Clínicas",
    real_estate: "Bienes Raíces",
    travel: "Viajes y Turismo",
    ecommerce: "Comercio Electrónico"
  }
};

export function getTemplatesByLanguage(language: SupportedTemplateLanguage): AutomationTemplate[] {
  return LOCALIZED_TEMPLATES.filter(t => t.language === language);
}

export function getTemplatesByIndustry(industry: Industry): AutomationTemplate[] {
  return LOCALIZED_TEMPLATES.filter(t => t.industry === industry || t.industry === "general");
}

export function getTemplatesByCategory(category: TemplateCategory): AutomationTemplate[] {
  return LOCALIZED_TEMPLATES.filter(t => t.category === category);
}

export function getFilteredTemplates(
  language?: SupportedTemplateLanguage,
  category?: TemplateCategory,
  industry?: Industry
): AutomationTemplate[] {
  return LOCALIZED_TEMPLATES.filter(t => {
    if (language && t.language !== language) return false;
    if (category && t.category !== category) return false;
    if (industry && t.industry !== industry && t.industry !== "general") return false;
    return true;
  });
}

export function replacePlaceholders(content: string, values: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}
