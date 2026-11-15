import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowLeft, BookOpen } from "lucide-react";

/** Keep brand names and opt-out commands readable inside Hebrew sentences. */
export function CommerceText({text}:{text:string}) {
  return <>{text.split(/(WhatsApp Business|WhachatCRM|AI Brain|WhatsApp|Shopify|Instagram|Facebook|Telegram|Meta|STOP|SMS|Pro|AI)/g).map((part,index)=>
    index%2 ? <bdi dir="ltr" key={index}>{part}</bdi> : part)}</>;
}
export const COMMERCE_GUIDE_PATH = "/app/ecommerce-growth-engine?view=guide";
export function CommerceGuideLink() {
  const { t } = useTranslation();
  return <Link href={COMMERCE_GUIDE_PATH} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500">
    <BookOpen aria-hidden="true" className="h-4 w-4"/>{t("commerceEducation.guide")}
  </Link>;
}
export function CommerceGuide() {
  const { t, i18n } = useTranslation();
  const sections = t("commerceEducation.sections", { returnObjects: true }) as {id:string;title:string;paragraphs:string[]}[];
  return <main dir={i18n.dir()} lang={i18n.resolvedLanguage} data-testid="commerce-guide" className="mx-auto max-w-5xl space-y-5 p-4 pb-16 sm:p-8">
    <Link href="/app/ecommerce-growth-engine?view=setup" className="inline-flex min-h-10 items-center gap-2 text-sm text-blue-700"><ArrowLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180"/>{t("commerceEducation.back")}</Link>
    <header className="rounded-2xl border border-blue-100 bg-white p-5 sm:p-7">
      <h1 className="text-2xl font-bold text-slate-950">{t("commerceEducation.guide")}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={t("commerceEducation.intro")}/></p>
      <Link href="/app/ecommerce-growth-engine?view=setup" className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{t("commerceEducation.setup")}</Link>
    </header>
    <nav aria-label={t("commerceEducation.guide")} className="grid gap-2 rounded-xl border bg-white p-4 sm:grid-cols-2">
      {sections.map(section=><a key={section.id} href={`#${section.id}`} className="rounded px-2 py-2 text-sm text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500">{section.title}</a>)}
    </nav>
    {sections.map(section=><section key={section.id} id={section.id} className="scroll-mt-20 rounded-xl border bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-950">{section.title}</h2>
      {section.paragraphs.map((paragraph,index)=><p key={index} className="mt-3 text-sm leading-relaxed text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={paragraph}/></p>)}
    </section>)}
  </main>;
}
