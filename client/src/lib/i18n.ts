import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

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
    supportedLngs: ['en', 'he', 'es'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'whachatcrm_language',
      caches: ['localStorage'],
    },
  });

export async function loadLocale(lng: string): Promise<void> {
  if (lng === 'en') return;
  if (i18n.hasResourceBundle(lng, 'translation')) return;
  try {
    const mod = await import(`../locales/${lng}.json`);
    i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
  } catch (e) {
    console.warn(`[i18n] Failed to load locale "${lng}"`, e);
  }
}

export const changeLanguage = async (lng: SupportedLanguage) => {
  await loadLocale(lng);
  await i18n.changeLanguage(lng);
  localStorage.setItem('whachatcrm_language', lng);

  const dir = supportedLanguages[lng].dir;
  document.documentElement.dir = dir;
  document.documentElement.lang = lng;

  if (dir === 'rtl') {
    document.documentElement.classList.add('rtl');
  } else {
    document.documentElement.classList.remove('rtl');
  }
};

export const getCurrentLanguage = (): SupportedLanguage => {
  return (i18n.language as SupportedLanguage) || 'en';
};

export const getDirection = (): 'ltr' | 'rtl' => {
  const lang = getCurrentLanguage();
  return supportedLanguages[lang]?.dir || 'ltr';
};

export default i18n;
