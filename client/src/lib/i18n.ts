import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import he from '../locales/he.json';
import es from '../locales/es.json';

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
      he: { translation: he },
      es: { translation: es },
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

export const changeLanguage = (lng: SupportedLanguage) => {
  i18n.changeLanguage(lng);
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
