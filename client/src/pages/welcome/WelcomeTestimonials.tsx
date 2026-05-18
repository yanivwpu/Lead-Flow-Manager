import { useTranslation } from "react-i18next";
import { Shield } from "lucide-react";

/** Trust / social proof block (positioned as testimonials slot on marketing). */
export default function WelcomeTestimonials() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-white">
      <div className="max-w-6xl xl:max-w-7xl mx-auto">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="h-12 w-12 bg-brand-green/10 rounded-2xl flex items-center justify-center mx-auto mb-5 ring-1 ring-brand-green/20">
            <Shield className="h-7 w-7 text-brand-green" />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">{t("home.trust.eyebrow")}</p>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">{t("home.trust.title")}</h2>
          <p className="text-gray-600 xl:text-lg">{t("home.trust.line1")}</p>
        </div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 sm:grid-cols-4">
          {["Customer logo", "Case study", "Team story", "Results"].map((label) => (
            <div key={label} className="rounded-2xl bg-gray-50 px-4 py-5 ring-1 ring-gray-100">
              {label}
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">{t("home.trust.line2")}</p>
      </div>
    </section>
  );
}
