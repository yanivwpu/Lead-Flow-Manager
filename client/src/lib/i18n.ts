import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import { LANGUAGE_CACHE_KEY } from '@shared/authenticatedLocale';
import en from '../locales/en.json';

export const supportedLanguages = {
  en: { name: 'English', nativeName: 'English', dir: 'ltr' },
  he: { name: 'Hebrew', nativeName: 'עברית', dir: 'rtl' },
  es: { name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
} as const;

export type SupportedLanguage = keyof typeof supportedLanguages;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    lng: 'en',
    supportedLngs: ['en', 'he', 'es'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      // Authenticated + first-visit locale must not follow Accept-Language / navigator.
      // The preference layer owns cache writes; public route changes only update i18n.
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_CACHE_KEY,
      caches: [],
    },
  });

export async function loadLocale(lng: string): Promise<void> {
  if (lng === 'en' || i18n.hasResourceBundle(lng, 'translation')) return;
  const mod = await import(`../locales/${lng}.json`);
  i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
}

let languageRequest = 0;

export const changeLanguage = async (
  lng: SupportedLanguage,
  canApply: () => boolean = () => true,
): Promise<boolean> => {
  const request = ++languageRequest;
  try {
    await loadLocale(lng);
    if (request !== languageRequest || !canApply()) return false;
    await i18n.changeLanguage(lng);
  } catch (error) {
    console.warn(`[i18n] Failed to load locale "${lng}"`, error);
    if (request === languageRequest && canApply()) {
      window.dispatchEvent(new CustomEvent('whachatcrm:locale-load-failed', { detail: lng }));
    }
    return false;
  }
  if (request !== languageRequest || !canApply()) return false;

  const dir = supportedLanguages[lng].dir;
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;
  document.documentElement.classList.toggle('rtl', dir === 'rtl');
  window.dispatchEvent(new Event('languageChanged'));
  return true;
};

export const getCurrentLanguage = (): SupportedLanguage => {
  const raw = (i18n.language || 'en').split('-')[0];
  if (raw === 'he' || raw === 'es' || raw === 'en') return raw;
  return 'en';
};

export const getDirection = (): 'ltr' | 'rtl' => {
  const lang = getCurrentLanguage();
  return supportedLanguages[lang]?.dir || 'ltr';
};

export default i18n;
