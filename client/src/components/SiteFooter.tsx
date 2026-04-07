import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";

export function SiteFooter() {
  const { t } = useTranslation();
  const dir = getDirection();
  const isRTL = dir === 'rtl';

  return (
    <footer className="bg-gray-50 border-t border-gray-200 px-4 md:px-6 py-12 md:py-16" dir={dir}>
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className={`flex flex-col lg:flex-row gap-12 lg:gap-16 ${isRTL ? 'lg:flex-row-reverse' : ''}`}>
          <div className={`lg:w-[260px] shrink-0 ${isRTL ? 'text-right' : ''}`}>
            <Link href="/">
              <div className={`flex items-center gap-2 cursor-pointer mb-4 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                <div className="h-7 w-7 bg-brand-green rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-sm">W</span>
                </div>
                <span className="font-display font-bold text-lg text-gray-900">WhachatCRM</span>
              </div>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t('home.footer.tagline', 'The all-in-one WhatsApp CRM for teams that want to sell more, respond faster, and never lose a lead.')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 lg:gap-12 flex-1">
            <div className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t('home.footer.product', 'Product')}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/pricing"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.pricing', 'Pricing')}</span></Link></li>
                <li><Link href="/whatsapp-crm"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.whatsappCrm', 'WhatsApp CRM')}</span></Link></li>
                <li><Link href="/contact"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.contact', 'Contact')}</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t('home.footer.resources', 'Resources')}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><a href="/WhachatCRM-User-Guide.html"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.gettingStarted', 'Getting Started')}</span></a></li>
                <li><Link href="/help"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.helpCenter', 'Help Center')}</span></Link></li>
                <li><Link href="/blog"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.blog', 'Blog')}</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t('home.footer.comparisons', 'Comparisons')}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/respond-io-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.respondAlt', 'Respond.io Alternative')}</span></Link></li>
                <li><Link href="/wati-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.watiAlt', 'WATI Alternative')}</span></Link></li>
                <li><Link href="/zoko-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.zokoAlt', 'Zoko Alternative')}</span></Link></li>
                <li><Link href="/manychat-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.manychatAlt', 'Manychat Alternative')}</span></Link></li>
                <li><Link href="/pabbly-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.pabblyAlt', 'Pabbly Alternative')}</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? 'text-right' : ''}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t('home.footer.legal', 'Legal')}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/privacy-policy"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.privacy', 'Privacy Policy')}</span></Link></li>
                <li><Link href="/terms-of-use"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t('home.footer.terms', 'Terms of Use')}</span></Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className={`mt-12 pt-8 border-t border-gray-200 ${isRTL ? 'text-right' : ''}`}>
          <p className="text-sm text-gray-400">{t('home.footer.copyright', '© 2025 WhachatCRM. All rights reserved.')}</p>
        </div>
      </div>
    </footer>
  );
}
