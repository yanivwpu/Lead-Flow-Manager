import { useTranslation } from "react-i18next";
import { MessageSquare, Bell, Tag, Phone, Zap, Brain } from "lucide-react";

export default function WelcomeBenefitsSection() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="mx-auto mb-12 max-w-3xl text-center md:mb-16">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-green">Business outcomes</p>
          <h2 className="text-3xl md:text-5xl font-display font-bold tracking-tight text-gray-950 mb-4">
            {t("home.features.title")}
          </h2>
          <p className="text-base md:text-lg text-gray-600">{t("home.features.subtitle")}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {[
            {
              icon: MessageSquare,
              color: "bg-emerald-100",
              iconColor: "text-brand-green",
              title: t("home.features.item1.title"),
              desc: t("home.features.item1.desc"),
            },
            {
              icon: Tag,
              color: "bg-blue-100",
              iconColor: "text-blue-600",
              title: t("home.features.item2.title"),
              desc: t("home.features.item2.desc"),
            },
            {
              icon: Bell,
              color: "bg-amber-100",
              iconColor: "text-amber-600",
              title: t("home.features.item3.title"),
              desc: t("home.features.item3.desc"),
            },
            {
              icon: Brain,
              color: "bg-purple-100",
              iconColor: "text-purple-600",
              title: t("home.features.item4.title"),
              desc: t("home.features.item4.desc"),
            },
            {
              icon: Phone,
              color: "bg-cyan-100",
              iconColor: "text-cyan-600",
              title: t("home.features.item5.title"),
              desc: t("home.features.item5.desc"),
            },
            {
              icon: Zap,
              color: "bg-pink-100",
              iconColor: "text-pink-600",
              title: t("home.features.item6.title"),
              desc: t("home.features.item6.desc"),
            },
          ].map((benefit, i) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="bg-white/80 p-6 rounded-[1.5rem] ring-1 ring-gray-100 animate-fade-in-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`h-11 w-11 ${benefit.color} rounded-xl flex items-center justify-center mb-5`}>
                  <Icon className={`h-6 w-6 ${benefit.iconColor}`} />
                </div>
                <h3 className="text-lg xl:text-xl font-bold text-gray-950 mb-2">{benefit.title}</h3>
                <p className="text-gray-600 xl:text-base leading-relaxed">{benefit.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
