import { normalizeUserLanguage } from "../userLanguage";

export function publicRealEstateLanguage(value: unknown) {
  return normalizeUserLanguage(value) ?? "en";
}

export function publicRealEstateLocale(value: unknown): string {
  return { en: "en-US", he: "he-IL", es: "es-419" }[publicRealEstateLanguage(value)];
}

export const publicRealEstateCopy = {
  "MLS#: {id} · Data Source: {source}": {
    he: "מספר MLS: {id} · מקור הנתונים: {source}",
    es: "N.º de MLS: {id} · Fuente de datos: {source}",
  },
  "HOA {price}/mo": {
    he: "ועד בעלי נכסים: {price} לחודש",
    es: "Cuota de asociación: {price}/mes",
  },
  "Home": {
    "he": "בית",
    "es": "Inicio"
  },
  "Properties": {
    "he": "נכסים",
    "es": "Propiedades"
  },
  "Neighborhoods": {
    "he": "שכונות",
    "es": "Barrios"
  },
  "Contact": {
    "he": "יצירת קשר",
    "es": "Contacto"
  },
  "Agent navigation": {
    "he": "ניווט בדף הסוכן",
    "es": "Navegación del agente"
  },
  "Navigation": {
    "he": "ניווט",
    "es": "Navegación"
  },
  "Close menu": {
    "he": "סגירת תפריט",
    "es": "Cerrar menú"
  },
  "Open menu": {
    "he": "פתיחת תפריט",
    "es": "Abrir menú"
  },
  "Market area": {
    "he": "אזור פעילות",
    "es": "Zona de servicio"
  },
  "Contact Agent": {
    "he": "יצירת קשר עם הסוכן",
    "es": "Contactar al agente"
  },
  "Call agent": {
    "he": "חיוג לסוכן",
    "es": "Llamar al agente"
  },
  "Let's Chat": {
    "he": "בואו נדבר",
    "es": "Chateemos"
  },
  "Send a message": {
    "he": "שליחת הודעה",
    "es": "Enviar un mensaje"
  },
  "Schedule Showing": {
    "he": "תיאום סיור בנכס",
    "es": "Programar visita"
  },
  "Choose a time": {
    "he": "בחירת מועד",
    "es": "Elegir horario"
  },
  "What's My Home Worth?": {
    "he": "מה שווי הבית שלי?",
    "es": "¿Cuánto vale mi vivienda?"
  },
  "Request a home valuation": {
    "he": "בקשת הערכת שווי",
    "es": "Solicitar una valoración"
  },
  "No photo": {
    "he": "אין תמונה",
    "es": "Sin foto"
  },
  "View Listing": {
    "he": "הצגת הנכס",
    "es": "Ver propiedad"
  },
  "Ask About This": {
    "he": "בירור על הנכס",
    "es": "Consultar por esta propiedad"
  },
  "Share listing": {
    "he": "שיתוף הנכס",
    "es": "Compartir propiedad"
  },
  "Copy listing link": {
    "he": "העתקת קישור לנכס",
    "es": "Copiar enlace"
  },
  "Select the link below and copy it to share this property.": {
    "he": "בחרו והעתיקו את הקישור לשיתוף הנכס.",
    "es": "Selecciona y copia el enlace para compartir esta propiedad."
  },
  "Listing share URL": {
    "he": "קישור לשיתוף נכס",
    "es": "Enlace para compartir"
  },
  "Copy link": {
    "he": "העתקת קישור",
    "es": "Copiar enlace"
  },
  "Listing link copied.": {
    "he": "קישור הנכס הועתק.",
    "es": "Enlace copiado."
  },
  "All": {
    "he": "הכול",
    "es": "Todas"
  },
  "For Sale": {
    "he": "למכירה",
    "es": "En venta"
  },
  "For Rent": {
    "he": "להשכרה",
    "es": "En alquiler"
  },
  "FOR SALE": {
    "he": "למכירה",
    "es": "EN VENTA"
  },
  "FOR RENT": {
    "he": "להשכרה",
    "es": "EN ALQUILER"
  },
  "Coming Soon": {
    "he": "בקרוב",
    "es": "Próximamente"
  },
  "More Filters": {
    "he": "מסננים נוספים",
    "es": "Más filtros"
  },
  "Filters": {
    "he": "מסננים",
    "es": "Filtros"
  },
  "Filter neighborhood homes": {
    "he": "סינון נכסים בשכונה",
    "es": "Filtrar viviendas del barrio"
  },
  "Location": {
    "he": "מיקום",
    "es": "Ubicación"
  },
  "City, state, or ZIP": {
    "he": "עיר, אזור או מיקוד",
    "es": "Ciudad, región o código postal"
  },
  "Min price": {
    "he": "מחיר מינימלי",
    "es": "Precio mínimo"
  },
  "Max price": {
    "he": "מחיר מקסימלי",
    "es": "Precio máximo"
  },
  "Price minimum": {
    "he": "מחיר מינימלי",
    "es": "Precio mínimo"
  },
  "Price maximum": {
    "he": "מחיר מקסימלי",
    "es": "Precio máximo"
  },
  "Price min": {
    "he": "מחיר מינימלי",
    "es": "Precio mín."
  },
  "Price max": {
    "he": "מחיר מקסימלי",
    "es": "Precio máx."
  },
  "Beds": {
    "he": "חדרי שינה",
    "es": "Habitaciones"
  },
  "Baths": {
    "he": "חדרי רחצה",
    "es": "Baños"
  },
  "Bedrooms": {
    "he": "חדרי שינה",
    "es": "Habitaciones"
  },
  "Bathrooms": {
    "he": "חדרי רחצה",
    "es": "Baños"
  },
  "Property type": {
    "he": "סוג נכס",
    "es": "Tipo de propiedad"
  },
  "Type": {
    "he": "סוג",
    "es": "Tipo"
  },
  "Any": {
    "he": "ללא הגבלה",
    "es": "Cualquiera"
  },
  "All types": {
    "he": "כל הסוגים",
    "es": "Todos los tipos"
  },
  "House": {
    "he": "בית",
    "es": "Casa"
  },
  "Condo": {
    "he": "דירה בבית משותף",
    "es": "Condominio"
  },
  "Townhouse": {
    "he": "בית טורי",
    "es": "Casa adosada"
  },
  "Multi-family": {
    "he": "בית רב-משפחתי",
    "es": "Multifamiliar"
  },
  "Land": {
    "he": "קרקע",
    "es": "Terreno"
  },
  "Other": {
    "he": "אחר",
    "es": "Otro"
  },
  "Min sq ft": {
    "he": "שטח מינימלי ברגל רבועה",
    "es": "Superficie mínima en pies²"
  },
  "Sort": {
    "he": "מיון",
    "es": "Ordenar"
  },
  "Newest": {
    "he": "החדשים ביותר",
    "es": "Más recientes"
  },
  "Price: low to high": {
    "he": "מחיר מהנמוך לגבוה",
    "es": "Precio de menor a mayor"
  },
  "Price: high to low": {
    "he": "מחיר מהגבוה לנמוך",
    "es": "Precio de mayor a menor"
  },
  "Apply filters": {
    "he": "החלת מסננים",
    "es": "Aplicar filtros"
  },
  "Reset": {
    "he": "איפוס",
    "es": "Restablecer"
  },
  "Clear": {
    "he": "ניקוי",
    "es": "Limpiar"
  },
  "Apply": {
    "he": "החלה",
    "es": "Aplicar"
  },
  "No listings match your filters.": {
    "he": "לא נמצאו נכסים התואמים למסננים.",
    "es": "No hay propiedades que coincidan con los filtros."
  },
  "No published listings yet.": {
    "he": "עדיין אין נכסים שפורסמו.",
    "es": "Todavía no hay propiedades publicadas."
  },
  "Back to top": {
    "he": "חזרה לראש הדף",
    "es": "Volver arriba"
  },
  "Powered by": {
    "he": "מופעל באמצעות",
    "es": "Con tecnología de"
  },
  "Private preview — not published": {
    "he": "תצוגה מקדימה פרטית · טרם פורסם",
    "es": "Vista previa privada · sin publicar"
  },
  "Property": {
    "he": "נכס",
    "es": "Propiedad"
  },
  "Message": {
    "he": "הודעה",
    "es": "Mensaje"
  },
  "Property address": {
    "he": "כתובת הנכס",
    "es": "Dirección de la propiedad"
  },
  "Timeline": {
    "he": "לוח זמנים",
    "es": "Plazo"
  },
  "e.g. 30–60 days": {
    "he": "לדוגמה 30–60 ימים",
    "es": "P. ej., 30–60 días"
  },
  "Reason for selling": {
    "he": "סיבת המכירה",
    "es": "Motivo de la venta"
  },
  "Cancel": {
    "he": "ביטול",
    "es": "Cancelar"
  },
  "Submit": {
    "he": "שליחה",
    "es": "Enviar"
  },
  "Web chat": {
    "he": "צ׳אט באתר",
    "es": "Chat web"
  },
  "Chat": {
    "he": "צ׳אט",
    "es": "Chat"
  },
  "Minimize chat": {
    "he": "מזעור צ׳אט",
    "es": "Minimizar chat"
  },
  "Close chat": {
    "he": "סגירת צ׳אט",
    "es": "Cerrar chat"
  },
  "Close": {
    "he": "סגירה",
    "es": "Cerrar"
  },
  "EXPLORE THE NEIGHBORHOOD": {
    "he": "גלו את השכונה",
    "es": "EXPLORA EL BARRIO"
  },
  "NEIGHBORHOOD LOCAL GUIDE": {
    "he": "מדריך מקומי לשכונה",
    "es": "GUÍA LOCAL DEL BARRIO"
  },
  "GET TO KNOW THE AREA": {
    "he": "הכירו את האזור",
    "es": "CONOCE LA ZONA"
  },
  "PICTURE THE NEIGHBORHOOD": {
    "he": "השכונה בתמונות",
    "es": "EL BARRIO EN IMÁGENES"
  },
  "YOUR LOCAL REAL ESTATE AGENT": {
    "he": "סוכן הנדל״ן המקומי שלכם",
    "es": "TU AGENTE INMOBILIARIO LOCAL"
  },
  "Contact the local real estate agent": {
    "he": "יצירת קשר עם סוכן הנדל״ן המקומי",
    "es": "Contactar al agente inmobiliario local"
  },
  "Homes for Sale": {
    "he": "בתים למכירה",
    "es": "Viviendas en venta"
  },
  "Homes for Rent": {
    "he": "בתים להשכרה",
    "es": "Viviendas en alquiler"
  },
  "Area drawn by this agent; it is not an official municipal neighborhood boundary.": {
    "he": "האזור שורטט על ידי הסוכן ואינו גבול שכונה רשמי של הרשות המקומית.",
    "es": "El agente delimitó esta zona, que no corresponde a un límite municipal oficial."
  },
  "Add your own neighborhood insights to see how the guide will appear.": {
    "he": "הוסיפו מידע מקומי כדי לראות איך המדריך יוצג.",
    "es": "Añade información del barrio para ver cómo aparecerá la guía."
  },
  "Neighborhood area boundaries are temporarily unavailable. Contact the agent for current options.": {
    "he": "גבולות השכונה אינם זמינים כרגע. פנו לסוכן לקבלת מידע עדכני.",
    "es": "Los límites del barrio no están disponibles temporalmente. Consulta al agente sobre las opciones actuales."
  },
  "Listings unavailable": {
    "he": "הנכסים אינם זמינים",
    "es": "Propiedades no disponibles"
  },
  "Older MLS inventory is excluded until the feed is refreshed. Ask the agent for current options.": {
    "he": "נכסי MLS ישנים הוסרו עד לרענון המקור. פנו לסוכן לקבלת מידע עדכני.",
    "es": "Los anuncios antiguos de MLS se excluyen hasta que se actualice la fuente. Consulta al agente sobre las opciones actuales."
  },
  "Get a free home valuation and personalized selling strategy.": {
    "he": "קבלו הערכת שווי חינם ואסטרטגיית מכירה מותאמת.",
    "es": "Obtén una valoración gratuita y una estrategia de venta personalizada."
  },
  "Message Me": {
    "he": "שלחו לי הודעה",
    "es": "Envíame un mensaje"
  },
  "Ask About This Listing": {
    "he": "בירור על הנכס",
    "es": "Consultar por esta propiedad"
  },
  "Thinking of Selling?": {
    "he": "שוקלים למכור?",
    "es": "¿Estás pensando en vender?"
  },
  "Open in Google Maps": {
    "he": "פתיחה ב־Google Maps",
    "es": "Abrir en Google Maps"
  },
  "Map preview": {
    "he": "תצוגה מקדימה של המפה",
    "es": "Vista previa del mapa"
  },
  "Location map": {
    "he": "מפת מיקום",
    "es": "Mapa de ubicación"
  },
  "Scan To View Listing": {
    "he": "סרקו להצגת הנכס",
    "es": "Escanea para ver la propiedad"
  },
  "Open listing on your phone": {
    "he": "פתחו את הנכס בטלפון",
    "es": "Abre la propiedad en tu teléfono"
  },
  "Page actions": {
    "he": "פעולות בדף",
    "es": "Acciones de la página"
  },
  "Print flyer": {
    "he": "הדפסת עלון",
    "es": "Imprimir folleto"
  },
  "Previous photo": {
    "he": "תמונה קודמת",
    "es": "Foto anterior"
  },
  "Next photo": {
    "he": "תמונה הבאה",
    "es": "Foto siguiente"
  },
  "Send inquiry": {
    "he": "שליחת פנייה",
    "es": "Enviar consulta"
  },
  "Enter an email address or phone number.": {
    "he": "הזינו כתובת דוא״ל או מספר טלפון.",
    "es": "Introduce un correo electrónico o número de teléfono."
  },
  "Sending inquiry…": {
    "he": "הפנייה נשלחת…",
    "es": "Enviando consulta…"
  },
  "Thanks. Your inquiry was sent.": {
    "he": "תודה. הפנייה נשלחה.",
    "es": "Gracias. Tu consulta se envió."
  },
  "Unable to send inquiry.": {
    "he": "לא ניתן לשלוח את הפנייה.",
    "es": "No se pudo enviar la consulta."
  },
  "Powered by WhachatCRM": {
    "he": "מופעל באמצעות WhachatCRM",
    "es": "Con tecnología de WhachatCRM"
  },
  "Description": {
    "he": "תיאור",
    "es": "Descripción"
  },
  "Agent not found": {
    "he": "הסוכן לא נמצא",
    "es": "Agente no encontrado"
  },
  "Page not found": {
    "he": "הדף לא נמצא",
    "es": "Página no encontrada"
  },
  "This agent page is not available.": {
    "he": "דף הסוכן אינו זמין.",
    "es": "Esta página del agente no está disponible."
  },
  "Homes in {name}": {
    "he": "בתים בשכונת {name}",
    "es": "Viviendas en {name}"
  },
  "Discover {name}": {
    "he": "גלו את {name}",
    "es": "Descubre {name}"
  },
  "Living in {name}": {
    "he": "לגור ב־{name}",
    "es": "Vivir en {name}"
  },
  "Around {name}": {
    "he": "בסביבת {name}",
    "es": "Alrededor de {name}"
  },
  "Questions about buying, selling, or exploring {name}?": {
    "he": "רוצים לקנות, למכור או להכיר את {name}?",
    "es": "¿Tienes preguntas sobre comprar, vender o explorar {name}?"
  },
  "Load more homes for sale": {
    "he": "טעינת עוד בתים למכירה",
    "es": "Cargar más viviendas en venta"
  },
  "Load more rentals": {
    "he": "טעינת עוד נכסים להשכרה",
    "es": "Cargar más alquileres"
  },
  "Name": {
    "he": "שם",
    "es": "Nombre"
  },
  "Email": {
    "he": "דוא״ל",
    "es": "Correo electrónico"
  },
  "Phone": {
    "he": "טלפון",
    "es": "Teléfono"
  },
  "Photo {number}": {
    "he": "תמונה {number}",
    "es": "Foto {number}"
  },
  "Built {year}": {
    "he": "נבנה ב־{year}",
    "es": "Construido en {year}"
  },
  "Listed By: {name}": {
    "he": "משווק על ידי: {name}",
    "es": "Publicado por: {name}"
  },
  "Price on request": {
    "he": "המחיר לפי בקשה",
    "es": "Precio a consultar"
  },
  "{price}/mo": {
    "he": "{price} לחודש",
    "es": "{price}/mes"
  },
  "{amount} Sq Ft": {
    "he": "{amount} רגל רבועה",
    "es": "{amount} pies²"
  },
  "{count} Bed": {
    "he": "{count} חדר שינה",
    "es": "{count} habitación"
  },
  "{count} Beds": {
    "he": "{count} חדרי שינה",
    "es": "{count} habitaciones"
  },
  "{count} Bath": {
    "he": "{count} חדר רחצה",
    "es": "{count} baño"
  },
  "{count} Baths": {
    "he": "{count} חדרי רחצה",
    "es": "{count} baños"
  },
  "Real Estate Agent": {
    "he": "סוכן נדל״ן",
    "es": "Agente inmobiliario"
  }
,
  "Sort by": {
    "he": "מיון לפי",
    "es": "Ordenar por"
  },
  "Property Listings": {
    "he": "נכסים",
    "es": "Propiedades"
  },
  "Real Estate Agent in {area}": {
    "he": "סוכן נדל״ן ב־{area}",
    "es": "Agente inmobiliario en {area}"
  },
  "Meet {name}.": {
    "he": "הכירו את {name}.",
    "es": "Conoce a {name}."
  },
  "Meet {name} at {brokerage}.": {
    "he": "הכירו את {name} מ־{brokerage}.",
    "es": "Conoce a {name} de {brokerage}."
  },
  "Serving {area}.": {
    "he": "פעילות באזור {area}.",
    "es": "Atiende en {area}."
  },
  "Contact the agent for help buying or selling a home.": {
    "he": "פנו לסוכן לקבלת עזרה בקנייה או במכירה.",
    "es": "Contacta al agente para recibir ayuda para comprar o vender."
  },
  "The verified neighborhood map is temporarily unavailable. Local properties cannot be shown right now.": {
    "he": "מפת השכונה המאומתת אינה זמינה כרגע. לא ניתן להציג נכסים מקומיים.",
    "es": "El mapa verificado no está disponible temporalmente. Ahora no se pueden mostrar propiedades locales."
  },
  "Neighborhood property matching requires a verified local boundary. Contact the agent for available properties.": {
    "he": "הצגת נכסים בשכונה דורשת גבולות מקומיים מאומתים. פנו לסוכן לבירור זמינות.",
    "es": "Las coincidencias requieren un límite local verificado. Consulta al agente sobre las propiedades disponibles."
  },
  "Some previously synced properties are not shown because their current MLS availability cannot be verified.": {
    "he": "חלק מהנכסים שסונכרנו אינם מוצגים כי זמינותם ב־MLS אינה מאומתת.",
    "es": "Algunas propiedades sincronizadas no aparecen porque no se puede verificar su disponibilidad en MLS."
  },
  "Private test: these are previously synced listings, not verified current availability. Do not share as active properties.": {
    "he": "בדיקה פרטית: אלה נכסים שסונכרנו בעבר וזמינותם אינה מאומתת. אין לשתף אותם כנכסים פעילים.",
    "es": "Prueba privada: estos anuncios se sincronizaron antes y su disponibilidad actual no está verificada. No los compartas como activos."
  },
  "Properties are matched to an agent-defined custom area, not an official neighborhood boundary, and checked against MLS display permissions.": {
    "he": "הנכסים מותאמים לאזור שהגדיר הסוכן ונבדקים לפי הרשאות התצוגה של MLS.",
    "es": "Las propiedades coinciden con un área delimitada por el agente y se comprueban los permisos de visualización en MLS."
  },
  "Properties are matched by verified neighborhood boundaries and MLS display permissions.": {
    "he": "הנכסים מותאמים לפי גבולות שכונה מאומתים והרשאות תצוגה של MLS.",
    "es": "Las propiedades se seleccionan según los límites verificados y los permisos de visualización de MLS."
  },
  "No verified for-sale listings are available to show. Ask the agent about the latest options.": {
    "he": "אין נכסים מאומתים למכירה שאפשר להציג. פנו לסוכן לבירור אפשרויות עדכניות.",
    "es": "No hay anuncios de venta verificados para mostrar. Consulta al agente sobre las opciones actuales."
  },
  "No verified rental listings are available to show. Ask the agent about the latest options.": {
    "he": "אין נכסים מאומתים להשכרה שאפשר להציג. פנו לסוכן לבירור אפשרויות עדכניות.",
    "es": "No hay anuncios de alquiler verificados para mostrar. Consulta al agente sobre las opciones actuales."
  },
  "Search results are limited to currently scanned inventory; counts may be incomplete. Ask the agent for more options.": {
    "he": "התוצאות מוגבלות למלאי שנסרק, ולכן הספירה עשויה להיות חלקית. פנו לסוכן לאפשרויות נוספות.",
    "es": "Los resultados se limitan al inventario revisado y los recuentos pueden estar incompletos. Consulta al agente para ver más opciones."
  },
  "Showing {loaded} of {total} listings": {
    "he": "מוצגים {loaded} מתוך {total} נכסים",
    "es": "Se muestran {loaded} de {total} propiedades"
  },
  "{total} listings found": {
    "he": "נמצאו {total} נכסים",
    "es": "Se encontraron {total} propiedades"
  },
  "1 listing found": {
    "he": "נמצא נכס אחד",
    "es": "Se encontró una propiedad"
  },
  "0 listings": {
    "he": "אין נכסים",
    "es": "0 propiedades"
  },
  "Load {count} more listings": {
    "he": "טעינת {count} נכסים נוספים",
    "es": "Cargar {count} propiedades más"
  },
  "{count} remaining": {
    "he": "נותרו {count}",
    "es": "Quedan {count}"
  },
  "Minimum price must not exceed maximum price": {
    "he": "המחיר המינימלי לא יכול להיות גבוה מהמחיר המקסימלי",
    "es": "El precio mínimo no puede superar el máximo"
  },
  "Neighborhood listings unavailable": {
    "he": "נכסי השכונה אינם זמינים",
    "es": "Propiedades del barrio no disponibles"
  },
  "Failed to load listings": {
    "he": "טעינת הנכסים נכשלה",
    "es": "No se pudieron cargar las propiedades"
  },
  "Could not copy link": {
    "he": "לא ניתן להעתיק את הקישור",
    "es": "No se pudo copiar el enlace"
  },
  "No link to share": {
    "he": "אין קישור לשיתוף",
    "es": "No hay enlace para compartir"
  },
  "Link copied": {
    "he": "הקישור הועתק",
    "es": "Enlace copiado"
  },
  "Shared": {
    "he": "שותף",
    "es": "Compartido"
  },
  "Thanks — we'll be in touch soon.": {
    "he": "תודה, ניצור קשר בקרוב.",
    "es": "Gracias, pronto nos pondremos en contacto."
  },
  "Submit failed": {
    "he": "השליחה נכשלה",
    "es": "No se pudo enviar"
  },
  "Listing not available": {
    "he": "הנכס אינו זמין",
    "es": "Propiedad no disponible"
  },
  "This listing may have been sold, taken off market, or the link is no longer valid.": {
    "he": "ייתכן שהנכס נמכר או הוסר מהשוק, או שהקישור אינו תקף.",
    "es": "Es posible que la propiedad se haya vendido o retirado, o que el enlace ya no sea válido."
  },
  "Could not load listing": {
    "he": "לא ניתן לטעון את הנכס",
    "es": "No se pudo cargar la propiedad"
  },
  "Something went wrong while loading this page. Please try again in a moment.": {
    "he": "אירעה שגיאה בטעינת הדף. נסו שוב בעוד רגע.",
    "es": "Ocurrió un error al cargar la página. Inténtalo en un momento."
  },
  "If the problem continues, ask your agent for an updated link.": {
    "he": "אם הבעיה נמשכת, בקשו מהסוכן קישור מעודכן.",
    "es": "Si el problema continúa, solicita a tu agente un enlace actualizado."
  },
  "QR code to view listing": {
    "he": "קוד QR להצגת הנכס",
    "es": "Código QR para ver la propiedad"
  },
  "For best print results, turn off browser Headers and footers.": {
    "he": "להדפסה מיטבית, בטלו את כותרות הדפדפן העליונות והתחתונות.",
    "es": "Para imprimir mejor, desactiva los encabezados y pies de página del navegador."
  },
  "Active": {
    "he": "פעיל",
    "es": "Activo"
  },
  "Pending": {
    "he": "בהמתנה",
    "es": "Pendiente"
  },
  "Sold": {
    "he": "נמכר",
    "es": "Vendido"
  },
  "Closed": {
    "he": "נסגר",
    "es": "Cerrado"
  }
,
  "Property listing": {
    "he": "נכס",
    "es": "Propiedad"
  },
  "View {address}.": {
    "he": "צפו בנכס בכתובת {address}.",
    "es": "Consulta la propiedad en {address}."
  },
  "Schedule a showing or contact the agent.": {
    "he": "תאמו סיור או פנו לסוכן.",
    "es": "Programa una visita o contacta al agente."
  },
  "{location} Real Estate": {
    "he": "נדל״ן ב־{location}",
    "es": "Bienes raíces en {location}"
  },
  "Property location map": {
    "he": "מפת מיקום הנכס",
    "es": "Mapa de ubicación de la propiedad"
  },
  "Showing {loaded} of at least {total} scanned matches": {
    "he": "מוצגים {loaded} מתוך לפחות {total} נכסים שנסרקו",
    "es": "Se muestran {loaded} de al menos {total} coincidencias revisadas"
  },
  "No verified rental homes match these filters. Ask the agent for other options.": {
    "he": "אין נכסים מאומתים להשכרה התואמים למסננים. פנו לסוכן לאפשרויות נוספות.",
    "es": "Ninguna vivienda de alquiler verificada coincide con estos filtros. Consulta al agente sobre otras opciones."
  },
  "No verified for-sale homes match these filters. Ask the agent for other options.": {
    "he": "אין נכסים מאומתים למכירה התואמים למסננים. פנו לסוכן לאפשרויות נוספות.",
    "es": "Ninguna vivienda en venta verificada coincide con estos filtros. Consulta al agente sobre otras opciones."
  },  "This page is visible only to its owner while previewing.": {
    "he": "רק בעל הדף יכול לצפות בתצוגה המקדימה.",
    "es": "Solo el propietario puede ver esta vista previa."
  },
  "Public URL after publication:": {
    "he": "כתובת ציבורית לאחר הפרסום:",
    "es": "URL pública después de publicar:"
  },
  "A public link will be available when your Agent Page is enabled and this neighborhood is published.": {
    "he": "קישור ציבורי יהיה זמין לאחר הפעלת דף הסוכן ופרסום השכונה.",
    "es": "El enlace público estará disponible cuando se active la página del agente y se publique el barrio."
  },
  "Page unavailable": {
    "he": "הדף אינו זמין",
    "es": "Página no disponible"
  }
,
  "← Back to the Agent Page": {
    "he": "חזרה לדף הסוכן →",
    "es": "← Volver a la página del agente"
  },
  "Email or phone is required.": {
    "he": "יש להזין דוא״ל או מספר טלפון.",
    "es": "Introduce un correo electrónico o un teléfono."
  },
  "Enter a valid phone number.": {
    "he": "הזינו מספר טלפון תקין.",
    "es": "Introduce un número de teléfono válido."
  }
} as const;

export function publicRealEstateText(
  language: unknown,
  key: keyof typeof publicRealEstateCopy,
  values: Record<string, string | number> = {},
): string {
  const locale = publicRealEstateLanguage(language);
  const template = locale === "en" ? key : publicRealEstateCopy[key][locale];
  return template.replace(/\{(\w+)\}/g, (token, name) => String(values[name] ?? token));
}
