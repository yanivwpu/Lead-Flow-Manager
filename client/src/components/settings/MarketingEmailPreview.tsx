import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
export function MarketingEmailPreview({ itemId, revision }: { itemId: string; revision: string }) {
  const { t, i18n } = useTranslation();
  const preview = useQuery({ staleTime: 0, refetchOnMount: "always", queryKey: ["marketing-preview", itemId, revision], queryFn: async () => {
    const response = await fetch(`/api/marketing/queue/${encodeURIComponent(itemId)}/preview`, { credentials: "include" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("marketingCompliance.previewUnavailable", "Preview unavailable"));
    return data as { text: string; html: string; subject: string };
  }});
  if (preview.isPending || preview.isFetching) return <p role="status">{t("marketingCompliance.loadingPreview", "Loading recipient preview…")}</p>;
  if (!preview.data || preview.isError) return <p role="alert">{preview.error?.message || t("marketingCompliance.previewUnavailableHold", "Recipient preview unavailable. Marketing remains blocked.")}</p>;
  return <section lang={i18n.resolvedLanguage || i18n.language || "en"} dir={i18n.dir()} className="space-y-3"><h3 className="font-semibold">{t("marketingCompliance.previewTitle", "Recipient email preview")}</h3><p dir="auto">{preview.data.subject}</p><iframe title={t("marketingCompliance.htmlFooter", "HTML email including required footer")} sandbox="" referrerPolicy="no-referrer" srcDoc={preview.data.html} className="w-full min-h-80 border rounded" /><details><summary>{t("marketingCompliance.textFooter", "Plain text including required footer")}</summary><pre dir="auto" className="whitespace-pre-wrap break-words text-sm">{preview.data.text}</pre></details><p>{t("marketingCompliance.previewHold", "Preview only. Marketing sending remains disabled.")}</p></section>;
}
