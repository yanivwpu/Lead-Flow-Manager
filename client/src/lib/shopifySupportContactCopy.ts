const en = {
  title: "Optional support contact",
  body: "Choose a business email for help with your WhachatCRM setup and support requests. This does not subscribe you to marketing.",
  open: "Confirm support email", manage: "Manage support contact", label: "Business email",
  source: "Suggested from your Shopify store settings. You can change it.",
  save: "Save support contact", skip: "Skip", remove: "Remove confirmed contact",
  error: "Could not save your support contact. Please try again.", cancel: "Close",
  saved: "Support contact saved.", missing: "You can enter a business email, or skip and keep using the app.",
};
const es: typeof en = {
  title: "Contacto de soporte opcional",
  body: "Elige un correo de empresa para recibir ayuda con la configuración de WhachatCRM y las solicitudes de soporte. Esto no te suscribe a marketing.",
  open: "Confirmar correo de soporte", manage: "Gestionar contacto de soporte", label: "Correo de empresa",
  source: "Sugerido desde la configuración de tu tienda Shopify. Puedes cambiarlo.",
  save: "Guardar contacto de soporte", skip: "Omitir", remove: "Eliminar contacto confirmado",
  error: "No se pudo guardar el contacto de soporte. Inténtalo de nuevo.", cancel: "Cerrar",
  saved: "Contacto de soporte guardado.", missing: "Puedes introducir un correo de empresa u omitir este paso y seguir usando la aplicación.",
};
const he: typeof en = {
  title: "איש קשר לתמיכה — אופציונלי",
  body: "בחרו כתובת דוא״ל עסקית לעזרה בהגדרת WhachatCRM ובפניות לתמיכה. פעולה זו אינה מצרפת אתכם לדיוור שיווקי.",
  open: "אישור דוא״ל לתמיכה", manage: "ניהול איש קשר לתמיכה", label: "דוא״ל עסקי",
  source: "הכתובת מוצעת מהגדרות חנות Shopify. אפשר לשנות אותה.",
  save: "שמירת איש קשר לתמיכה", skip: "דלגו", remove: "הסרת איש הקשר שאושר",
  error: "לא ניתן לשמור את איש הקשר לתמיכה. נסו שוב.", cancel: "סגירה",
  saved: "איש הקשר לתמיכה נשמר.", missing: "אפשר להזין כתובת עסקית או לדלג ולהמשיך להשתמש באפליקציה.",
};
export function shopifySupportContactCopy(language: string) {
  return language.startsWith("he") ? he : language.startsWith("es") ? es : en;
}
