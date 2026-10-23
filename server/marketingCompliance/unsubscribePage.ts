import { randomBytes } from "node:crypto";
import { escapeMarketingHtml } from "./policy";

type PageKind = "confirm" | "success";
type Locale = "en" | "es" | "he";

const copy: Record<Locale, {
  eyebrow: string;
  titleConfirm: string;
  bodyConfirm: string;
  button: string;
  titleSuccess: string;
  bodySuccess: string;
  footer: string;
}> = {
  en: {
    eyebrow: "EMAIL PREFERENCES",
    titleConfirm: "Unsubscribe from marketing emails",
    bodyConfirm: "Confirm below to stop marketing emails from this sender. You'll no longer receive promotional emails from them.",
    button: "Confirm unsubscribe",
    titleSuccess: "You're unsubscribed",
    bodySuccess: "Your preference has been saved. Marketing emails from this sender have been stopped.",
    footer: "Your preferences matter.",
  },
  es: {
    eyebrow: "PREFERENCIAS DE CORREO",
    titleConfirm: "Cancelar suscripción a correos promocionales",
    bodyConfirm: "Confirma que deseas dejar de recibir correos de marketing de este remitente.",
    button: "Confirmar cancelación",
    titleSuccess: "Suscripción cancelada",
    bodySuccess: "Guardamos tu preferencia. Ya no recibirás correos promocionales de este remitente.",
    footer: "Respetamos tus preferencias.",
  },
  he: {
    eyebrow: "העדפות דוא״ל",
    titleConfirm: "הסרה מרשימת דיוור שיווקי",
    bodyConfirm: "אישור זה יפסיק הודעות דוא״ל שיווקיות משולח זה.",
    button: "אישור הסרה",
    titleSuccess: "הוסרת מרשימת הדיוור",
    bodySuccess: "ההעדפה שלך נשמרה. לא יישלחו אליך עוד הודעות שיווקיות משולח זה.",
    footer: "אנחנו מכבדים את ההעדפות שלך.",
  },
};

function localeFromAcceptLanguage(value?: string | null): Locale {
  const first = (value || "").split(",")[0].trim().toLowerCase().split(";")[0].split("-")[0];
  return first === "es" || first === "he" ? first : "en";
}

/**
 * Standalone public page: no JS, external resources, cookies, user identifiers,
 * analytics or third-party requests. A fresh per-response CSP nonce permits
 * only this page's static styling. GET never records an opt-out.
 */
export function renderMarketingUnsubscribePage(input: {
  kind: PageKind;
  actionPath?: string;
  acceptLanguage?: string | null;
}): { html: string; csp: string; language: Locale } {
  const language = localeFromAcceptLanguage(input.acceptLanguage);
  const strings = copy[language];
  const nonce = randomBytes(18).toString("base64");
  const dir = language === "he" ? "rtl" : "ltr";
  const success = input.kind === "success";
  const title = success ? strings.titleSuccess : strings.titleConfirm;
  const message = success ? strings.bodySuccess : strings.bodyConfirm;
  if (!success && (!input.actionPath || !/^\/api\/marketing\/unsubscribe\/[A-Za-z0-9_-]+$/.test(input.actionPath))) {
    throw new Error("Invalid confirmation path");
  }
  const form = success ? "" : `<form method="post" action="${escapeMarketingHtml(input.actionPath!)}">
    <input type="hidden" name="List-Unsubscribe" value="One-Click">
    <button type="submit">${escapeMarketingHtml(strings.button)}</button>
  </form>`;
  const icon = success
    ? '<span class="status success" aria-hidden="true">✓</span>'
    : '<span class="status confirm" aria-hidden="true">✉</span>';
  const html = `<!doctype html>
<html lang="${language}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${escapeMarketingHtml(title)} | WhachatCRM</title>
<style nonce="${nonce}">
  *{box-sizing:border-box}
  html,body{margin:0;min-height:100%;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}
  body{background:#f4f7f9;color:#172b4d;padding:28px 16px}
  .shell{max-width:540px;margin:min(13vh,100px) auto 0}
  .brand{display:flex;align-items:center;gap:10px;margin-bottom:24px;font-weight:800;font-size:20px;letter-spacing:-.5px;color:#13324d}
  .mark{display:inline-flex;justify-content:center;align-items:center;width:34px;height:34px;border-radius:10px;background:#087f78;color:white;font-size:23px;font-weight:700}
  .card{background:white;border:1px solid #e4ebf0;border-radius:18px;padding:clamp(24px,5vw,38px);box-shadow:0 14px 36px rgba(23,43,77,.07)}
  .eyebrow{font-size:11px;letter-spacing:1.5px;font-weight:800;color:#328477;margin:0 0 20px}
  .status{display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;border-radius:14px;font-size:27px;margin:0 0 12px}
  .confirm{background:#e9f6f3;color:#087f78}
  .success{background:#e4f6ee;color:#087f63}
  h1{font-size:clamp(24px,5vw,31px);line-height:1.22;letter-spacing:-.6px;margin:2px 0 15px;font-weight:780}
  p{font-size:16px;line-height:1.65;color:#506278;margin:0 0 24px}
  form{margin:0}
  button{border:0;border-radius:9px;background:#087f78;color:#fff;font-size:15px;font-weight:700;padding:14px 22px;min-height:46px;cursor:pointer;width:100%}
  button:hover{background:#086961}
  button:focus-visible{outline:3px solid #83d6cb;outline-offset:3px}
  .foot{margin-top:22px;text-align:center;color:#6b7b8a;font-size:12px}
  @media (max-width:480px){body{padding:22px 16px}.shell{margin:8vh auto 0}.card{border-radius:14px}}
</style>
</head>
<body><main class="shell">
  <div class="brand"><span class="mark" aria-hidden="true">W</span><span>WhachatCRM</span></div>
  <section class="card" aria-labelledby="page-title">
    <div class="eyebrow">${escapeMarketingHtml(strings.eyebrow)}</div>
    ${icon}
    <h1 id="page-title">${escapeMarketingHtml(title)}</h1>
    <p>${escapeMarketingHtml(message)}</p>
    ${form}
  </section>
  <div class="foot">${escapeMarketingHtml(strings.footer)}</div>
</main></body></html>`;
  return {
    html,
    language,
    csp: `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'none'; img-src 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'`,
  };
}
