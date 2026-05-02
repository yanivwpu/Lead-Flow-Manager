import { useTranslation } from "react-i18next";
import {
  ShoppingCart,
  Users,
  Building2,
  CreditCard,
  Phone,
  Calendar,
  Mail,
  FileSpreadsheet,
  Home,
} from "lucide-react";

const INTEGRATIONS = [
  { name: "Shopify", icon: ShoppingCart, color: "bg-green-500" },
  { name: "HubSpot", icon: Users, color: "bg-orange-500" },
  { name: "Salesforce", icon: Building2, color: "bg-blue-500" },
  { name: "Stripe", icon: CreditCard, color: "bg-purple-500" },
  { name: "Twilio", icon: Phone, color: "bg-red-600" },
  { name: "Calendly", icon: Calendar, color: "bg-sky-500" },
  { name: "Mailchimp", icon: Mail, color: "bg-yellow-500" },
  { name: "Google Sheets", icon: FileSpreadsheet, color: "bg-emerald-500" },
  { name: "ShowcaseIDX", icon: Home, color: "bg-rose-500" },
];

function IntegrationsHub() {
  const topRow = INTEGRATIONS.slice(0, 4);
  const bottomRow = INTEGRATIONS.slice(4);

  return (
    <div className="w-full max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto px-4">
      <div className="flex flex-col items-center gap-6 md:gap-8">
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full">
          {topRow.map((integration, i) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex flex-col items-center animate-fade-in-up"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div
                  className={`h-14 w-14 md:h-16 md:w-16 ${integration.color} rounded-xl shadow-lg flex items-center justify-center`}
                >
                  <Icon className="h-7 w-7 md:h-8 md:w-8 text-white" />
                </div>
                <span className="text-xs md:text-sm font-medium text-gray-600 mt-2">{integration.name}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 md:gap-6 w-full justify-center">
          <div className="h-1 bg-gradient-to-r from-transparent via-gray-300 to-gray-300 flex-1 max-w-[120px] md:max-w-[200px] rounded-full animate-scale-in-right" />

          <div className="h-20 w-20 md:h-28 md:w-28 bg-brand-green rounded-2xl shadow-2xl flex items-center justify-center shrink-0 animate-scale-in">
            <span className="text-white font-bold text-3xl md:text-5xl">W</span>
          </div>

          <div className="h-1 bg-gradient-to-l from-transparent via-gray-300 to-gray-300 flex-1 max-w-[120px] md:max-w-[200px] rounded-full animate-scale-in-left" />
        </div>

        <div className="flex flex-wrap justify-center gap-4 md:gap-8 w-full">
          {bottomRow.map((integration, i) => {
            const Icon = integration.icon;
            return (
              <div
                key={integration.name}
                className="flex flex-col items-center animate-fade-in-up"
                style={{ animationDelay: `${300 + i * 80}ms` }}
              >
                <div
                  className={`h-14 w-14 md:h-16 md:w-16 ${integration.color} rounded-xl shadow-lg flex items-center justify-center`}
                >
                  <Icon className="h-7 w-7 md:h-8 md:w-8 text-white" />
                </div>
                <span className="text-xs md:text-sm font-medium text-gray-600 mt-2">{integration.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function WelcomeIntegrationsSection() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-b from-gray-50 to-white">
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="text-center mb-10 md:mb-12">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            {t("home.integrations.title")}
          </h2>
          <p className="text-base md:text-lg xl:text-xl text-gray-600 max-w-2xl xl:max-w-3xl mx-auto">
            {t("home.integrations.subtitle")}
          </p>
        </div>

        <IntegrationsHub />
      </div>
    </section>
  );
}
