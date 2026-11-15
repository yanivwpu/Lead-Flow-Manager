import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { ArrowLeft, BookOpen, CheckCircle2, CircleCheck, CircleDashed, Clock3, Eye,
  HelpCircle, ListChecks, MessageCircle, PauseCircle, Send,
  Settings2, ShieldCheck, ShieldOff, ShoppingBag, XCircle } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type GuideSection = {
  id: string; title: string; paragraphs?: string[]; notes?: string[];
  items?: {question: string; answer: string}[];
  statuses?: {id: keyof typeof statusAppearance; label: string; description: string}[];
  steps?: {title: string; instruction: string; success: string; action: string}[];
};
const statusAppearance = {
  active: {icon: CheckCircle2, tone: "text-emerald-700"},
  ready: {icon: CircleCheck, tone: "text-blue-700"},
  setup: {icon: Settings2, tone: "text-amber-700"},
  paused: {icon: PauseCircle, tone: "text-slate-600"},
  unavailable: {icon: XCircle, tone: "text-slate-600"},
  coming: {icon: CircleDashed, tone: "text-slate-600"},
  queued: {icon: Clock3, tone: "text-slate-600"},
  accepted: {icon: Send, tone: "text-blue-700"},
  delivered: {icon: CheckCircle2, tone: "text-emerald-700"},
  read: {icon: Eye, tone: "text-blue-700"},
  failed: {icon: XCircle, tone: "text-rose-700"},
  review: {icon: HelpCircle, tone: "text-amber-700"},
  suppressed: {icon: ShieldOff, tone: "text-slate-600"},
} as const;
const consentSteps = [
  {icon: MessageCircle, href: "/app/settings?tab=channels"},
  {icon: ShieldCheck, href: "/app/ecommerce-growth-engine?view=post"},
  {icon: ListChecks, href: "/app/ecommerce-growth-engine?view=post"},
  {icon: ShoppingBag, href: "/app/ecommerce-growth-engine?view=setup"},
] as const;

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
  const sections = t("commerceEducation.sections", { returnObjects: true }) as GuideSection[];
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
      {section.items && <Accordion type="multiple" dir={i18n.dir() as "ltr" | "rtl"} className="mt-3" data-testid="commerce-guide-faq">
        {section.items.map((item,index)=><AccordionItem key={index} value={`faq-${index}`}>
          <AccordionTrigger className="min-h-11 gap-3 rounded px-1 text-start font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span style={{unicodeBidi:"plaintext"}}><CommerceText text={item.question}/></span>
          </AccordionTrigger>
          <AccordionContent className="px-1 pb-5 leading-relaxed text-slate-600">
            <p style={{unicodeBidi:"plaintext"}}><CommerceText text={item.answer}/></p>
          </AccordionContent>
        </AccordionItem>)}
      </Accordion>}
      {section.statuses && <dl className="mt-4 grid gap-3 sm:grid-cols-2" data-testid="commerce-guide-statuses">
        {section.statuses.map(status=>{
          const {icon: Icon,tone}=statusAppearance[status.id];
          return <div key={status.id} data-status={status.id} className="rounded-lg border border-slate-200 p-3">
            <dt className="flex items-start gap-2 text-sm font-semibold text-slate-950"><Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`}/><span><CommerceText text={status.label}/></span></dt>
            <dd className="mt-1 ps-6 text-sm leading-relaxed text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={status.description}/></dd>
          </div>;
        })}
      </dl>}
      {section.steps && <ol className="mt-4 space-y-4" data-testid="commerce-guide-consent-steps">
        {section.steps.map((step,index)=>{
          const {icon: Icon,href}=consentSteps[index];
          return <li key={step.title} className="flex gap-3 rounded-xl border border-slate-200 p-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">{index+1}</span>
            <div className="min-w-0 flex-1">
              <h3 className="flex items-start gap-2 text-sm font-semibold text-slate-950"><Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"/><span><CommerceText text={step.title}/></span></h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={step.instruction}/></p>
              <div className="mt-3 border-s-2 border-emerald-200 ps-3 text-sm leading-relaxed text-slate-600">
                <p className="font-medium text-slate-900">{t("commerceEducation.successLabel")}</p>
                <p className="mt-1" style={{unicodeBidi:"plaintext"}}><CommerceText text={step.success}/></p>
              </div>
              <Link href={href} className="mt-2 inline-flex min-h-11 items-center rounded text-sm font-medium text-blue-700 hover:underline focus-visible:ring-2 focus-visible:ring-blue-500">{step.action}</Link>
            </div>
          </li>;
        })}
      </ol>}
      {section.notes?.map((note,index)=><p key={index} className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={note}/></p>)}
      {section.paragraphs?.map((paragraph,index)=><p key={index} className="mt-3 text-sm leading-relaxed text-slate-600" style={{unicodeBidi:"plaintext"}}><CommerceText text={paragraph}/></p>)}
    </section>)}
  </main>;
}
