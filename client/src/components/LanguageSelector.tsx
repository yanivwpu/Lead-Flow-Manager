import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supportedLanguages, changeLanguage, getCurrentLanguage, type SupportedLanguage } from '@/lib/i18n';
import { marketingLanguageTargetPath } from '@/lib/marketingLocaleRouting';
import type { MarketingLocale } from '@shared/marketingLocale';

interface LanguageSelectorProps {
  variant?: 'default' | 'compact';
  className?: string;
  /** When true (marketing chrome), navigate to the equivalent localized URL. */
  navigateOnChange?: boolean;
}

export function LanguageSelector({
  variant = 'default',
  className,
  navigateOnChange = false,
}: LanguageSelectorProps) {
  const { t } = useTranslation();
  const [location, setLocation] = useLocation();
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getCurrentLanguage());

  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLang(getCurrentLanguage());
    };

    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    await changeLanguage(lang);
    setCurrentLang(lang);

    if (navigateOnChange) {
      const nextPath = marketingLanguageTargetPath(location, lang as MarketingLocale);
      if (nextPath !== location) {
        setLocation(nextPath);
      }
    }
    
    try {
      await fetch('/api/user/language', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ language: lang }),
      });
    } catch (error) {
      console.error('Failed to save language preference:', error);
    }
  };

  const currentLanguageInfo = supportedLanguages[currentLang];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size={variant === 'compact' ? 'icon' : 'sm'}
          className={className}
          data-testid="language-selector"
        >
          <Globe className="h-4 w-4" />
          {variant === 'default' && (
            <span className="ml-2 hidden sm:inline">{currentLanguageInfo.nativeName}</span>
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
              {currentLang === code && <Check className="h-4 w-4 text-emerald-600" />}
            </DropdownMenuItem>
          )
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
