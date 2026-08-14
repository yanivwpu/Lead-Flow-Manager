import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import i18n, { loadLocale } from "./lib/i18n";
import { parseLocalizedPath, hasLocalizedVersion } from "@shared/localeRoutes";

async function mount() {
  const parsed = parseLocalizedPath(window.location.pathname || "/");
  let lang = localStorage.getItem("whachatcrm_language") || "";

  if (parsed.isLocalePrefixed && parsed.isSupported) {
    // Explicit /es or /he URL is authoritative — ignore stale storage.
    lang = parsed.locale;
    localStorage.setItem("whachatcrm_language", lang);
  } else if (!parsed.isLocalePrefixed && hasLocalizedVersion(parsed.englishPath)) {
    // Unprefixed Phase 2 marketing URL → English is authoritative.
    lang = "en";
    localStorage.setItem("whachatcrm_language", "en");
  }

  // Mount immediately — do not block first paint / LCP on locale JSON.
  // Homepage above-fold copy uses sync shared homepage locales; below-fold
  // sections update when the locale bundle finishes loading.
  createRoot(document.getElementById("root")!).render(<App />);

  if (lang === "he" || lang === "es") {
    try {
      await loadLocale(lang);
      await i18n.changeLanguage(lang);
    } catch {
      // keep English fallback
    }
  } else if (lang === "en" && i18n.language !== "en") {
    // Clear stale non-English i18n (LanguageDetector / localStorage).
    await i18n.changeLanguage("en");
  }
}

mount();
