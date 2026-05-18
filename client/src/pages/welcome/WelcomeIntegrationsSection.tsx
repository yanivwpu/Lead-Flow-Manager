import { useTranslation } from "react-i18next";

const INTEGRATIONS = [
  { name: "WhatsApp", logo: "/logos/whatsapp.svg" },
  { name: "Instagram", logo: "/logos/instagram.svg" },
  { name: "Facebook Messenger", logo: "/logos/facebook.svg" },
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
    <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
      {INTEGRATIONS.map((integration) => {
        return (
          <div
            key={integration.name}
            className="group flex flex-col items-center gap-3 text-center"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 transition-transform group-hover:-translate-y-0.5">
              <img src={integration.logo} alt="" className="h-8 w-8 object-contain" loading="lazy" />
            </div>
            <p className="text-sm font-medium text-gray-700">{integration.name}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function WelcomeIntegrationsSection() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-18 md:py-20 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="text-center mb-12 md:mb-14">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">Integrations</p>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">
            {t("home.integrations.title")}
          </h2>
          <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
            {t("home.integrations.subtitle")}
          </p>
        </div>

        <IntegrationsHub />
      </div>
    </section>
  );
}
