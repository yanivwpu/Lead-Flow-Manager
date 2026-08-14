import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import i18n, { loadLocale } from "./lib/i18n";
import { parseLocalizedPath, hasLocalizedVersion } from "@shared/localeRoutes";
import { debug34aeaf } from "./lib/debug34aeaf";

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

  // #region agent log
  debug34aeaf({
    hypothesisId: "D",
    runId: "pre-fix",
    location: "client/src/bootstrap.tsx:mount",
    message: "react_mount_start",
    data: {
      href: window.location.href,
      pathname: window.location.pathname,
      port: window.location.port || "(default)",
      hasImportMetaHot: Boolean(import.meta.hot),
    },
  });
  if (import.meta.hot) {
    import.meta.hot.on("vite:ws:connect", () => {
      debug34aeaf({
        hypothesisId: "A",
        runId: "pre-fix",
        location: "client/src/bootstrap.tsx:hmr",
        message: "vite_ws_connect",
        data: { href: window.location.href },
      });
    });
    import.meta.hot.on("vite:ws:disconnect", () => {
      debug34aeaf({
        hypothesisId: "A",
        runId: "pre-fix",
        location: "client/src/bootstrap.tsx:hmr",
        message: "vite_ws_disconnect",
        data: { href: window.location.href },
      });
    });
  }
  window.addEventListener("error", (ev) => {
    debug34aeaf({
      hypothesisId: "D",
      runId: "pre-fix",
      location: "client/src/bootstrap.tsx:window_error",
      message: "window_runtime_error",
      data: {
        message: String(ev.message || "").slice(0, 300),
        filename: String(ev.filename || "").slice(0, 200),
      },
    });
  });
  // #endregion

  // Mount immediately — do not block first paint / LCP on locale JSON.
  // Homepage above-fold copy uses sync shared homepage locales; below-fold
  // sections update when the locale bundle finishes loading.
  createRoot(document.getElementById("root")!).render(<App />);

  // #region agent log
  debug34aeaf({
    hypothesisId: "D",
    runId: "pre-fix",
    location: "client/src/bootstrap.tsx:mount",
    message: "react_root_rendered",
    data: {
      rootChildCount: document.getElementById("root")?.childElementCount ?? -1,
    },
  });
  // #endregion

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
