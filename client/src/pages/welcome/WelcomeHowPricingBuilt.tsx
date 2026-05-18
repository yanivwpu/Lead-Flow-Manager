import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Building2, Headphones, Home, Store, Users } from "lucide-react";

export default function WelcomeHowPricingBuilt() {
  const { t } = useTranslation();
  return (
    <>
      <section className="px-4 md:px-6 py-20 md:py-24 bg-white">
        <div className="max-w-5xl xl:max-w-6xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">Setup</p>
            <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">
              {t("home.howItWorks.title")}
            </h2>
            <p className="text-base md:text-lg xl:text-xl text-gray-600">{t("home.howItWorks.subtitle")}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5 md:gap-6">
            {[1, 2, 3].map((step) => (
              <div key={step} className="rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-green text-lg font-bold text-white">
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

      <section className="px-4 md:px-6 py-20 md:py-24 bg-gray-50">
        <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">
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

      <section className="px-4 md:px-6 py-20 md:py-24 bg-white">
        <div className="max-w-6xl xl:max-w-7xl mx-auto">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">Use cases</p>
            <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">{t("home.builtFor.title")}</h2>
            <p className="text-base md:text-lg text-gray-600">{t("home.builtFor.tagline")}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: Home, title: t("home.builtFor.realEstate"), desc: t("home.builtFor.realEstateDesc") },
              { icon: Users, title: t("home.builtFor.salesTeams"), desc: t("home.builtFor.salesTeamsDesc") },
              { icon: Building2, title: t("home.builtFor.agencies"), desc: t("home.builtFor.agenciesDesc") },
              { icon: Headphones, title: t("home.builtFor.supportTeams"), desc: t("home.builtFor.supportTeamsDesc") },
              { icon: Store, title: t("home.builtFor.smallBiz"), desc: t("home.builtFor.smallBizDesc") },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gray-50 text-gray-800 ring-1 ring-gray-200">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-gray-950">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
