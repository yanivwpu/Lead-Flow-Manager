import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";
import { useCookieConsent } from "@/components/CookieConsentRoot";
import { useLocalizedHref } from "@/lib/marketingLocaleRouting";

export function SiteFooter() {
  const { t } = useTranslation();
  const { openPreferences } = useCookieConsent();
  const dir = getDirection();
  const isRTL = dir === "rtl";
  const homeHref = useLocalizedHref("/");
  const pricingHref = useLocalizedHref("/pricing");
  const prospectHref = useLocalizedHref("/prospect-ai");
  const brainHref = useLocalizedHref("/ai-brain");
  const copilotHref = useLocalizedHref("/ai-copilot");
  const inboxHref = useLocalizedHref("/unified-inbox");
  const automationsHref = useLocalizedHref("/automations");
  const chatbotHref = useLocalizedHref("/chatbot-builder");
  const campaignsHref = useLocalizedHref("/campaigns");
  const integrationsHref = useLocalizedHref("/integrations");
  const realEstateHref = useLocalizedHref("/real-estate-crm");
  const rgeHref = useLocalizedHref("/realtor-growth-engine");
  const sharedInboxHref = useLocalizedHref("/shared-team-inbox");

  return (
    <footer className="bg-gray-50 border-t border-gray-200 px-4 md:px-6 py-12 md:py-16" dir={dir}>
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className={`flex flex-col lg:flex-row gap-12 lg:gap-16 ${isRTL ? "lg:flex-row-reverse" : ""}`}>
          <div className={`lg:w-[260px] shrink-0 ${isRTL ? "text-right" : ""}`}>
            <Link href={homeHref}>
              <div className={`flex items-center gap-2 cursor-pointer mb-4 ${isRTL ? "flex-row-reverse justify-end" : ""}`}>
                <div className="h-7 w-7 bg-brand-green rounded-md flex items-center justify-center">
                  <span className="text-white font-bold text-sm">W</span>
                </div>
                <span className="font-display font-bold text-lg text-gray-900">WhachatCRM</span>
              </div>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              {t("home.footer.tagline")}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-8 lg:gap-10 flex-1">
            <div className={isRTL ? "text-right" : ""}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("home.footer.product")}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href={pricingHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.pricing")}</span></Link></li>
                <li><Link href={prospectHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">Prospect AI</span></Link></li>
                <li><Link href={brainHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">AI Brain</span></Link></li>
                <li><Link href={copilotHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">AI Copilot</span></Link></li>
                <li><Link href={inboxHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">Unified Inbox</span></Link></li>
                <li><Link href={automationsHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.workflows")}</span></Link></li>
                <li><Link href={chatbotHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">Chatbot Builder</span></Link></li>
                <li><Link href={campaignsHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.campaigns")}</span></Link></li>
                <li><Link href={integrationsHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.integrations")}</span></Link></li>
                <li><Link href="/whatsapp-crm"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.whatsappCrm")}</span></Link></li>
                <li><Link href="/contact"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.contact")}</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? "text-right" : ""}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("home.footer.solutions")}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/shopify-crm"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.shopifyCrm")}</span></Link></li>
                <li><Link href={realEstateHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.realEstateCrm")}</span></Link></li>
                <li><Link href={rgeHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">Realtor Growth Engine</span></Link></li>
                <li><Link href={prospectHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">Prospect AI</span></Link></li>
                <li><Link href="/crm-with-mls-integration"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.mlsIntegration")}</span></Link></li>
                <li><Link href="/ai-lead-scoring"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.aiLeadScoring")}</span></Link></li>
                <li><Link href={sharedInboxHref}><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.sharedTeamInbox")}</span></Link></li>
                <li><Link href="/automation-templates"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.automationTemplates")}</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? "text-right" : ""}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("home.footer.resources")}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><a href="/user-guide"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.gettingStarted")}</span></a></li>
                <li><Link href="/help"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.helpCenter")}</span></Link></li>
                <li><Link href="/blog"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.blog")}</span></Link></li>
                <li><Link href="/partner-program"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.partnerProgram")}</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? "text-right" : ""}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("home.footer.comparisons")}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/best-whatsapp-crm-2026"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.bestWhatsappCrm")}</span></Link></li>
                <li><Link href="/respond-io-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.respondAlt")}</span></Link></li>
                <li><Link href="/wati-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.watiAlt")}</span></Link></li>
                <li><Link href="/zoko-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.zokoAlt")}</span></Link></li>
                <li><Link href="/manychat-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.manychatAlt")}</span></Link></li>
                <li><Link href="/pabbly-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.pabblyAlt")}</span></Link></li>
                <li><Link href="/interakt-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">Interakt</span></Link></li>
                <li><Link href="/waba360-alternative"><span className="hover:text-gray-900 transition-colors cursor-pointer">360dialog</span></Link></li>
              </ul>
            </div>

            <div className={isRTL ? "text-right" : ""}>
              <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-4">{t("home.footer.legal")}</h3>
              <ul className="space-y-2.5 text-sm text-gray-500">
                <li><Link href="/privacy-policy"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.privacy")}</span></Link></li>
                <li><Link href="/terms-of-use"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.terms")}</span></Link></li>
                <li><Link href="/data-deletion"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.dataDeletion", "Data deletion")}</span></Link></li>
                <li><Link href="/unsubscribe"><span className="hover:text-gray-900 transition-colors cursor-pointer">{t("home.footer.emailPreferences", "Email preferences")}</span></Link></li>
                <li>
                  <button
                    type="button"
                    onClick={() => openPreferences()}
                    className="hover:text-gray-900 transition-colors cursor-pointer text-left"
                  >
                    {t("home.footer.cookiePreferences", "Cookie preferences")}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className={`mt-12 pt-8 border-t border-gray-200 ${isRTL ? "text-right" : ""}`}>
          <p className="text-sm text-gray-400">{t("home.footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}
