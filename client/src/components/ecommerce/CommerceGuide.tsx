import { useState, type FormEvent } from "react";
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

function CommerceFeedback() {
  const { t } = useTranslation();
  const [category, setCategory] = useState("suggestion");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<"sent" | "failed" | "required" | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;
    if (!name.trim() || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim()) || !message.trim()) {
      setNotice("required"); return;
    }
    setSending(true); setNotice(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), message: "[Shopify Growth Engine guide / " + category + "]\\n" + message.trim() }),
      });
      if (!res.ok) throw new Error("Feedback submission failed");
      setMessage(""); setNotice("sent");
    } catch { setNotice("failed"); }
    finally { setSending(false); }
  };
  return <section id="merchant-feedback" className="scroll-mt-20 rounded-xl border bg-white p-5 sm:p-6" aria-labelledby="merchant-feedback-title">
    <h2 id="merchant-feedback-title" className="text-lg font-semibold text-slate-950">{t("commerceFeedback.heading")}</h2>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">{t("commerceFeedback.intro")}</p>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div><label htmlFor="commerce-feedback-category" className="mb-1 block text-sm font-medium text-slate-800">{t("commerceFeedback.kind")}</label>
        <select id="commerce-feedback-category" value={category} onChange={event=>setCategory(event.target.value)} className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:max-w-md">
          {(["suggestion","feature","issue"] as const).map(kind=><option key={kind} value={kind}>{t("commerceFeedback." + kind)}</option>)}
        </select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="commerce-feedback-name" className="mb-1 block text-sm font-medium text-slate-800">{t("commerceFeedback.name")}</label>
          <input id="commerce-feedback-name" value={name} maxLength={120} onChange={event=>setName(event.target.value)} required autoComplete="name" className="min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
        </div>
        <div><label htmlFor="commerce-feedback-email" className="mb-1 block text-sm font-medium text-slate-800">{t("commerceFeedback.email")}</label>
          <input id="commerce-feedback-email" type="email" value={email} maxLength={254} onChange={event=>setEmail(event.target.value)} required autoComplete="email" dir="ltr" className="min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
        </div>
      </div>
      <div><label htmlFor="commerce-feedback-message" className="mb-1 block text-sm font-medium text-slate-800">{t("commerceFeedback.message")}</label>
        <textarea id="commerce-feedback-message" required minLength={3} maxLength={3000} rows={4} value={message} onChange={event=>setMessage(event.target.value)} placeholder={t("commerceFeedback.placeholder")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
      </div>
      <p className="text-xs text-slate-500">{t("commerceFeedback.privacy")}</p>
      {notice && <p role="status" className={notice==="sent"?"text-sm text-emerald-700":"text-sm text-red-700"}>{t("commerceFeedback." + notice)}</p>}
      <button type="submit" disabled={sending} className="min-h-10 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{t(sending?"commerceFeedback.sending":"commerceFeedback.send")}</button>
    </form>
  </section>;
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
    <CommerceFeedback />
  </main>;
}
