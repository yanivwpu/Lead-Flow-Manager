import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import i18n, { loadLocale } from "./lib/i18n";
import { parseLocalizedPath, hasLocalizedVersion } from "@shared/localeRoutes";
import {
  LANGUAGE_CACHE_KEY,
  LANGUAGE_SOURCE_KEY,
  isTrustedExplicitLanguageSource,
  overwriteUntrustedLanguageCache,
} from "@shared/authenticatedLocale";

async function mount() {
  const parsed = parseLocalizedPath(window.location.pathname || "/");
  let lang = localStorage.getItem(LANGUAGE_CACHE_KEY) || "";
  const languageSource = localStorage.getItem(LANGUAGE_SOURCE_KEY);

  if (parsed.isLocalePrefixed && parsed.isSupported) {
    // Explicit /es or /he URL is authoritative — ignore stale storage.
    lang = parsed.locale;
    localStorage.setItem(LANGUAGE_CACHE_KEY, lang);
  } else if (!parsed.isLocalePrefixed && hasLocalizedVersion(parsed.englishPath)) {
    // Unprefixed Phase 2 marketing URL → English is authoritative.
    lang = "en";
    localStorage.setItem(LANGUAGE_CACHE_KEY, "en");
  } else if (
    (window.location.pathname === "/app" || window.location.pathname.startsWith("/app/")) &&
    !isTrustedExplicitLanguageSource(languageSource)
  ) {
    // Authenticated /app routes: detector cache is untrusted without a user marker.
    lang = "en";
    overwriteUntrustedLanguageCache(localStorage);
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
