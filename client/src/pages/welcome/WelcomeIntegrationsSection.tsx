import { useTranslation } from "react-i18next";
import {
  ShoppingCart,
  CreditCard,
  Calendar,
  FileSpreadsheet,
  Instagram,
  Facebook,
  MessageCircle,
  Link2,
} from "lucide-react";

const INTEGRATIONS = [
  { name: "WhatsApp via Meta", icon: MessageCircle, color: "bg-emerald-500" },
  { name: "Instagram DMs", icon: Instagram, color: "bg-pink-500" },
  { name: "Facebook Messenger", icon: Facebook, color: "bg-blue-600" },
  { name: "Shopify", icon: ShoppingCart, color: "bg-green-600" },
  { name: "Stripe", icon: CreditCard, color: "bg-purple-500" },
  { name: "Calendly", icon: Calendar, color: "bg-sky-500" },
  { name: "Google Sheets", icon: FileSpreadsheet, color: "bg-emerald-600" },
  { name: "GoHighLevel / LeadConnector", icon: Link2, color: "bg-indigo-600" },
];

function IntegrationsHub() {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
      {INTEGRATIONS.map((integration) => {
        const Icon = integration.icon;
        return (
          <div
            key={integration.name}
            className="group flex items-center gap-3 rounded-2xl bg-white/70 p-3 transition-colors hover:bg-gray-50"
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${integration.color}`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
            <p className="text-sm font-semibold text-gray-900">{integration.name}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function WelcomeIntegrationsSection() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="text-center mb-10 md:mb-12">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">Supported integrations</p>
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
