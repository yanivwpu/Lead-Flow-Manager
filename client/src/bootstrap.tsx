import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import i18n, { loadLocale } from "./lib/i18n";

async function mount() {
  const stored = localStorage.getItem('whachatcrm_language') || '';
  if (stored && stored !== 'en' && ['he', 'es'].includes(stored)) {
    await loadLocale(stored);
    await i18n.changeLanguage(stored);
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

mount();
