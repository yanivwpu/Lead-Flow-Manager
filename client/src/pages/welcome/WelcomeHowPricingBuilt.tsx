import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function WelcomeHowPricingBuilt() {
  const { t } = useTranslation();
  return (
    <>
      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
              {t("home.howItWorks.title")}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600">{t("home.howItWorks.subtitle")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12 xl:gap-16">
            {[1, 2, 3].map((step) => (
              <div key={step} className="text-center">
                <div className="h-14 w-14 xl:h-16 xl:w-16 bg-brand-green text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl xl:text-2xl font-bold">
                  {step}
                </div>
                <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">
                  {t(`home.howItWorks.step${step}.title` as "home.howItWorks.step1.title")}
                </h3>
                <p className="text-gray-600 xl:text-lg">{t(`home.howItWorks.step${step}.desc` as "home.howItWorks.step1.desc")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-20">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            {t("home.pricingTeaser.title")}
          </h2>
          <p className="text-base md:text-lg xl:text-xl text-gray-600 mb-8">{t("home.pricingTeaser.subtitle")}</p>

          <div className="flex flex-wrap justify-center gap-4 md:gap-6 mb-8">
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>{t("home.pricingTeaser.freePlan")}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>{t("home.pricingTeaser.paidPlans")}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <CheckCircle2 className="h-5 w-5 text-brand-green" />
              <span>{t("home.pricingTeaser.cancelAnytime")}</span>
            </div>
          </div>

          <Link href="/pricing">
            <button className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center gap-2 transition-all shadow-lg">
              {t("home.pricingTeaser.seePlans")}
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
        </div>
      </section>

      <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
        <div className="max-w-4xl xl:max-w-5xl mx-auto text-center">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-10">{t("home.builtFor.title")}</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 xl:gap-8 mb-10">
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t("home.builtFor.salesTeams")}</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t("home.builtFor.supportTeams")}</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t("home.builtFor.agencies")}</p>
            </div>
            <div className="bg-white p-4 md:p-6 rounded-xl border border-gray-200">
              <p className="font-medium text-gray-900 text-sm md:text-base">{t("home.builtFor.smallBiz")}</p>
            </div>
          </div>

          <p className="text-lg xl:text-xl text-gray-600">{t("home.builtFor.tagline")}</p>
        </div>
      </section>
    </>
  );
}
