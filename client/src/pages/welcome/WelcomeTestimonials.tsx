import { useTranslation } from "react-i18next";
import { Quote, Shield } from "lucide-react";

/** Trust / social proof block (positioned as testimonials slot on marketing). */
export default function WelcomeTestimonials() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-20 md:py-24 bg-gray-950 text-white">
      <div className="max-w-6xl xl:max-w-7xl mx-auto">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <div className="h-14 w-14 bg-brand-green/15 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-brand-green/20">
            <Shield className="h-7 w-7 text-brand-green" />
          </div>
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">{t("home.trust.eyebrow")}</p>
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold tracking-tight mb-4">{t("home.trust.title")}</h2>
          <p className="text-gray-300 xl:text-lg">{t("home.trust.line1")}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <Quote className="mb-5 h-5 w-5 text-brand-green" />
              <p className="text-sm leading-relaxed text-gray-300">{t(`home.trust.card${n}.quote` as "home.trust.card1.quote")}</p>
              <div className="mt-5 border-t border-white/10 pt-4">
                <p className="text-sm font-semibold text-white">{t(`home.trust.card${n}.role` as "home.trust.card1.role")}</p>
                <p className="text-xs text-gray-500">{t("home.trust.placeholder")}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid-cols-4">
          {["Sales teams", "Service teams", "Real estate", "Agencies"].map((label) => (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              {label}
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-gray-500">{t("home.trust.line2")}</p>
      </div>
    </section>
  );
}
