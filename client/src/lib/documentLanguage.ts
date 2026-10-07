import { isPublicLocaleAuthoritativePath, parseLocalizedPath } from "../../../shared/localeRoutes";

/** Public URLs win even while an async language change still has the old value. */
export function syncDocumentLanguage(doc: Document, pathname: string, language: string): void {
  const lang = isPublicLocaleAuthoritativePath(pathname)
    ? parseLocalizedPath(pathname).locale
    : (language || "en").split("-")[0];
  const isRtl = ["he", "ar", "fa", "ur"].includes(lang);
  doc.documentElement.lang = lang;
  doc.documentElement.dir = isRtl ? "rtl" : "ltr";
  doc.documentElement.classList.toggle("rtl", isRtl);
  doc.body.classList.toggle("rtl", isRtl);
}
