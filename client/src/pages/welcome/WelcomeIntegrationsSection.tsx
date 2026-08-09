import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";
import { getLocalizedHomepage } from "@shared/localizeMarketingContent";
import { useLocalizedHref, useMarketingUrlLocale } from "@/lib/marketingLocaleRouting";

const INTEGRATIONS = [
  { name: "WhatsApp via Meta", logo: "/logos/whatsapp.svg" },
  { name: "Instagram", logo: "/logos/instagram.svg" },
  { name: "Facebook Messenger", logo: "/logos/facebook.svg" },
  { name: "Gmail / Google Workspace", logo: "/logos/gmail.svg" },
  { name: "Shopify", logo: "/logos/shopify.svg" },
  { name: "Stripe", logo: "/logos/stripe.svg" },
  { name: "Calendly", logo: "/logos/calendly.svg" },
  { name: "Google Sheets", logo: "/logos/google-sheets.svg" },
  { name: "HubSpot", logo: "/logos/hubspot.svg" },
  { name: "WooCommerce", logo: "/logos/woocommerce.svg" },
  { name: "Showcase IDX", logo: "/logos/showcase-idx.svg" },
];

function IntegrationsHub() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-6">
      {INTEGRATIONS.map((integration) => {
        return (
          <div
            key={integration.name}
            className="group flex items-center gap-2.5 text-center"
          >
            <img src={integration.logo} alt="" className="h-7 w-7 object-contain opacity-90 transition-opacity group-hover:opacity-100" loading="lazy" />
            <p className="text-sm font-medium text-gray-600">{integration.name}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function WelcomeIntegrationsSection() {
  const { t } = useTranslation();
  const locale = useMarketingUrlLocale();
  const home = getLocalizedHomepage(locale);
  const integrationsHref = useLocalizedHref("/integrations");
  return (
    <section
      id="integrations"
      className="scroll-mt-24 px-4 md:px-6 py-16 md:py-20 bg-gradient-to-b from-white to-gray-50"
    >
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="text-center mb-10 md:mb-12">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">
            {home.eyebrows.integrations}
          </p>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">
            {t("home.integrations.title")}
          </h2>
          <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            {t("home.integrations.subtitle")}
          </p>
        </div>

        <IntegrationsHub />
        <div className="mt-10 text-center">
          <Link
            href={integrationsHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/40 rounded"
          >
            {home.integrationsCta}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
