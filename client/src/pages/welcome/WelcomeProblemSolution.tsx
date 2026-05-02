import { useTranslation } from "react-i18next";
import { CheckCircle2 } from "lucide-react";

export default function WelcomeProblemSolution() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-900 text-white [content-visibility:auto] [contain-intrinsic-size:1px_800px]">
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-center mb-10 md:mb-14">
          {t("home.problem.title")}
        </h2>

        <div className="grid md:grid-cols-2 gap-8 md:gap-12 xl:gap-16">
          <div>
            <h3 className="text-lg xl:text-xl font-semibold text-gray-400 mb-6 uppercase tracking-wide">
              {t("home.problem.heading")}
            </h3>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="flex items-start gap-3">
                  <div className="h-6 w-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-400 text-sm">✕</span>
                  </div>
                  <p className="text-gray-300 xl:text-lg">{t(`home.problem.item${n}` as const)}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-lg xl:text-xl font-semibold text-brand-green mb-6 uppercase tracking-wide">
              {t("home.solution.heading")}
            </h3>
            <div className="space-y-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-brand-green shrink-0 mt-0.5" />
                  <p className="text-white xl:text-lg">{t(`home.solution.item${n}` as const)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
