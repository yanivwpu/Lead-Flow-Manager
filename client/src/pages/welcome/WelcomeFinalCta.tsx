import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";

type Props = { isLoggedIn: boolean };

export default function WelcomeFinalCta({ isLoggedIn }: Props) {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-gradient-to-br from-brand-green/5 to-brand-teal/5">
      <div className="max-w-3xl xl:max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green/10 text-brand-green rounded-full text-sm xl:text-base font-medium mb-6">
          <Zap className="h-4 w-4" />
          {t("home.cta.setupTime")}
        </div>
        <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">{t("home.cta.title")}</h2>
        <p className="text-base md:text-lg xl:text-xl text-gray-600 mb-8">{t("home.cta.subtitle")}</p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
          <Link href={isLoggedIn ? "/app/inbox" : "/auth"}>
            <button
              className="h-14 px-8 bg-brand-green hover:bg-emerald-700 text-white font-semibold rounded-full inline-flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl"
              data-testid="button-final-cta"
            >
              {t("home.cta.primary")}
              <ArrowRight className="h-5 w-5" />
            </button>
          </Link>
          <Link href="/pricing">
            <button
              className="h-14 px-8 bg-white border border-gray-200 text-gray-700 font-medium rounded-full inline-flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
              data-testid="button-final-pricing"
            >
              {t("home.cta.secondary")}
            </button>
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-brand-green" />
            {t("home.hero.note")}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-brand-green" />
            {t("pricing.foreverFree")}
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-brand-green" />
            {t("home.pricingTeaser.cancelAnytime")}
          </span>
        </div>
      </div>
    </section>
  );
}
