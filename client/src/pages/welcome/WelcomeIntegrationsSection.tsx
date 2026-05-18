import { useTranslation } from "react-i18next";
import {
  ShoppingCart,
  Users,
  CreditCard,
  Calendar,
  FileSpreadsheet,
  Home,
  Instagram,
  Facebook,
  MessageCircle,
  Link2,
} from "lucide-react";

const INTEGRATIONS = [
  { name: "WhatsApp via Meta", icon: MessageCircle, color: "bg-emerald-500", status: "Live" },
  { name: "Instagram DMs", icon: Instagram, color: "bg-pink-500", status: "Live" },
  { name: "Facebook Messenger", icon: Facebook, color: "bg-blue-600", status: "Live" },
  { name: "Shopify", icon: ShoppingCart, color: "bg-green-600", status: "Live" },
  { name: "HubSpot", icon: Users, color: "bg-orange-500", status: "Live" },
  { name: "GoHighLevel", icon: Link2, color: "bg-indigo-600", status: "Live" },
  { name: "Calendly", icon: Calendar, color: "bg-sky-500", status: "Live" },
  { name: "Google Sheets", icon: FileSpreadsheet, color: "bg-emerald-600", status: "Live" },
  { name: "WooCommerce", icon: ShoppingCart, color: "bg-violet-600", status: "Live" },
  { name: "Stripe", icon: CreditCard, color: "bg-purple-500", status: "Live" },
  { name: "Showcase IDX", icon: Home, color: "bg-rose-500", status: "Live" },
];

function IntegrationsHub() {
  return (
    <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {INTEGRATIONS.map((integration) => {
        const Icon = integration.icon;
        return (
          <div
            key={integration.name}
            className="group rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-gray-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${integration.color}`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                {integration.status}
              </span>
            </div>
            <p className="mt-3 text-sm font-semibold text-gray-900">{integration.name}</p>
          </div>
        );
      })}
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white">
          <span className="text-sm font-bold">+</span>
        </div>
        <p className="mt-3 text-sm font-semibold text-gray-900">More native integrations</p>
        <p className="mt-1 text-xs text-gray-500">Added based on customer demand.</p>
      </div>
    </div>
  );
}

export default function WelcomeIntegrationsSection() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-20 md:py-24 bg-gradient-to-b from-white to-gray-50">
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="text-center mb-10 md:mb-12">
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
