import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";

/** Trust / social proof block (positioned as testimonials slot on marketing). */
export default function WelcomeTestimonials() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-12 md:py-16 bg-gray-900 text-white">
      <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
        <div className="h-14 w-14 bg-brand-green/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Shield className="h-7 w-7 text-brand-green" />
        </div>
        <h2 className="text-xl md:text-3xl xl:text-4xl font-display font-bold mb-4">{t("home.trust.title")}</h2>
        <p className="text-gray-300 xl:text-lg mb-2">{t("home.trust.line1")}</p>
        <p className="text-gray-400 xl:text-lg">{t("home.trust.line2")}</p>
      </div>
    </section>
  );
}
