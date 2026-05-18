import { useTranslation } from "react-i18next";
import { ArrowRight, Bot, CalendarDays, MessageCircle, RefreshCw } from "lucide-react";

export default function WelcomeProblemSolution() {
  const { t } = useTranslation();
  const scenarios = [
    { icon: MessageCircle, key: "lead" },
    { icon: Bot, key: "instagram" },
    { icon: RefreshCw, key: "quiet" },
    { icon: CalendarDays, key: "appointment" },
  ];

  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-white [content-visibility:auto] [contain-intrinsic-size:1px_620px]">
      <div className="max-w-6xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="mx-auto mb-10 max-w-3xl text-center md:mb-14">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">
            {t("home.problem.eyebrow")}
          </p>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950">
            {t("home.problem.title")}
          </h2>
          <p className="mt-4 text-base md:text-lg text-gray-600">
            {t("home.problem.subtitle")}
          </p>
        </div>

        <div className="space-y-6">
          {scenarios.map(({ icon: Icon, key }, index) => (
            <div key={key} className="relative grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-950">
                    {t(`home.problem.scenarios.${key}.title` as "home.problem.scenarios.lead.title")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t(`home.problem.scenarios.${key}.source` as "home.problem.scenarios.lead.source")}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-[1.5rem] bg-gray-50/80 p-3 sm:flex-row sm:items-center sm:gap-3">
                {["step1", "step2", "step3"].map((step, stepIndex) => (
                  <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
                    <div className="min-w-0 flex-1 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-gray-200">
                      {t(`home.problem.scenarios.${key}.${step}` as "home.problem.scenarios.lead.step1")}
                    </div>
                    {stepIndex < 2 && (
                      <ArrowRight className="hidden h-4 w-4 shrink-0 text-gray-300 sm:block" />
                    )}
                  </div>
                ))}
              </div>
              {index < scenarios.length - 1 && (
                <div className="hidden md:absolute md:left-[21px] md:top-[54px] md:block md:h-7 md:w-px md:bg-gray-200" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
