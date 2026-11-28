import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { syncDocumentLanguage } from "./lib/documentLanguage";
import { getLoginTransitionLanguage } from "./lib/userLanguagePreference";
import i18n, { changeLanguage } from "./lib/i18n";
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
  } else if (!parsed.isLocalePrefixed && hasLocalizedVersion(parsed.englishPath)) {
    // Unprefixed Phase 2 marketing URL → English is authoritative.
    lang = "en";
  } else if (
    (window.location.pathname === "/app" || window.location.pathname.startsWith("/app/")) &&
    !isTrustedExplicitLanguageSource(languageSource)
  ) {
    // Authenticated /app routes: detector cache is untrusted without a user marker.
    lang = "en";
    overwriteUntrustedLanguageCache(localStorage);
  }

  const isAppPath = parsed.englishPath === "/app" || parsed.englishPath.startsWith("/app/");
  const loginLocale = isAppPath ? getLoginTransitionLanguage() : null;
  if (loginLocale) syncDocumentLanguage(document, window.location.pathname, loginLocale);
  if (loginLocale || (parsed.englishPath === "/auth" && (lang === "he" || lang === "es"))) {
    await changeLanguage(loginLocale ?? (lang === "he" ? "he" : "es"));
  }

  // Public pages mount immediately. AuthProvider restores the account language before publishing its session.
  createRoot(document.getElementById("root")!).render(<App />);

  if (!isAppPath && (lang === "he" || lang === "es") && i18n.language !== lang) {
    await changeLanguage(lang);
  } else if (!isAppPath && lang === "en" && i18n.language !== "en") {
    await changeLanguage("en");
  }
}

mount();
