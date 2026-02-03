import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supportedLanguages, changeLanguage, getCurrentLanguage, type SupportedLanguage } from '@/lib/i18n';

interface LanguageSelectorProps {
  variant?: 'default' | 'compact';
  className?: string;
}

export function LanguageSelector({ variant = 'default', className }: LanguageSelectorProps) {
  const { t } = useTranslation();
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getCurrentLanguage());

  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLang(getCurrentLanguage());
    };

    window.addEventListener('languageChanged', handleLanguageChange);
    return () => window.removeEventListener('languageChanged', handleLanguageChange);
  }, []);

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    changeLanguage(lang);
    setCurrentLang(lang);
    
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
