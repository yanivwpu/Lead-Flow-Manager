import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/use-toast';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supportedLanguages, changeLanguage, getCurrentLanguage, type SupportedLanguage } from '@/lib/i18n';
import { marketingLanguageTargetPath, useMarketingUrlLocale } from '@/lib/marketingLocaleRouting';
import type { MarketingLocale } from '@shared/marketingLocale';
import { isPublicLocaleAuthoritativePath } from '@shared/localeRoutes';
import { useAuth } from '@/lib/auth-context';
import {
  finishExplicitLanguageSelection,
  isCurrentLanguageSelection,
  noteExplicitLanguageSelection,
  persistAuthenticatedLanguage,
} from '@/lib/userLanguagePreference';

interface LanguageSelectorProps {
  variant?: 'default' | 'compact';
  className?: string;
  /** When true (marketing chrome), navigate to the equivalent localized URL. */
  navigateOnChange?: boolean;
  loginPreference?: boolean;
}

export function LanguageSelector({
  variant = 'default',
  className,
  navigateOnChange = false,
  loginPreference = false,
}: LanguageSelectorProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const urlLocale = useMarketingUrlLocale();
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getCurrentLanguage());
  const languageMenuLabel = t("language.select");

  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLang(getCurrentLanguage());
    };

    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);

  // On public marketing URLs, the selector reflects the URL locale (not stale i18n).
  useEffect(() => {
    if (!navigateOnChange) return;
    if (!isPublicLocaleAuthoritativePath(location)) return;
    if (currentLang !== urlLocale) {
      setCurrentLang(urlLocale as SupportedLanguage);
    }
  }, [navigateOnChange, location, urlLocale, currentLang]);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    // Explicit session selection first so a slower /api/auth/me cannot overwrite it.
    const generation = noteExplicitLanguageSelection(!user && loginPreference ? lang : undefined);
    const pathname = window.location.pathname;
    const applied = await changeLanguage(lang, () => isCurrentLanguageSelection(generation) && window.location.pathname === pathname);
    if (!finishExplicitLanguageSelection(generation, lang, applied, user ? "account" : loginPreference ? "login" : "browser", user?.id)) return;
    if (!applied) return;
    setCurrentLang(lang);

    if (navigateOnChange) {
      const nextPath = marketingLanguageTargetPath(location, lang as MarketingLocale);
      if (nextPath !== location) {
        setLocation(nextPath);
      }
    }

    // Persist only when logged in; skip redundant PATCH for the current saved value.
    const result = await persistAuthenticatedLanguage(lang, user?.id);
    if (!result.ok && isCurrentLanguageSelection(generation) && getCurrentLanguage() === lang) {
      toast({ description: i18n.t("language.saveFailed"), variant: "destructive" });
    }
  };

  const currentLanguageInfo = supportedLanguages[currentLang];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size={variant === 'compact' ? 'icon' : 'sm'}
          className={className}
          data-testid="language-selector"
          aria-label={languageMenuLabel}
        >
          <Globe className="h-4 w-4" aria-hidden />
          {variant === 'default' && (
            <span className="ms-2 hidden sm:inline">{currentLanguageInfo.nativeName}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {(Object.entries(supportedLanguages) as [SupportedLanguage, typeof supportedLanguages.en][]).map(
          ([code, info]) => (
            <DropdownMenuItem
              key={code}
              onClick={() => handleLanguageChange(code)}
              className="flex items-center justify-between cursor-pointer"
              data-testid={`language-option-${code}`}
            >
              <span className={(info.dir as string) === 'rtl' ? 'font-hebrew' : ''}>
                {info.nativeName}
              </span>
              {currentLang === code && <Check className="h-4 w-4 text-emerald-600" aria-hidden />}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
