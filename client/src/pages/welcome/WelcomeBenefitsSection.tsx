import { useTranslation } from "react-i18next";
import { MessageSquare, Bell, Tag, Phone, Zap, Brain } from "lucide-react";

export default function WelcomeBenefitsSection() {
  const { t } = useTranslation();
  return (
    <section className="px-4 md:px-6 py-16 md:py-20 bg-gray-50">
      <div className="max-w-7xl xl:max-w-[1440px] 2xl:max-w-[1536px] mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <h2 className="text-2xl md:text-4xl xl:text-5xl font-display font-bold text-gray-900 mb-3 md:mb-4">
            {t("home.features.title")}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 md:gap-8">
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
                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-fade-in-up"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className={`h-12 w-12 ${benefit.color} rounded-xl flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${benefit.iconColor}`} />
                </div>
                <h3 className="text-lg xl:text-xl font-bold text-gray-900 mb-2">{benefit.title}</h3>
                <p className="text-gray-600 xl:text-base">{benefit.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
