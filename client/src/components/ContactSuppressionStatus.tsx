import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
export function ContactSuppressionStatus({ contactId, identityRevision }: { contactId: string; identityRevision?: string }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const path = `/api/marketing/contacts/${encodeURIComponent(contactId)}`;
  const history = useQuery({ queryKey: [path, "suppression", identityRevision], queryFn: async () => {
    const response = await fetch(`${path}/suppression`, { credentials: "include" });
    if (!response.ok) throw new Error(t("marketingCompliance.historyError", "Unable to load opt-out history"));
    return response.json() as Promise<{ canSuppress?: boolean; history: Array<{ scope: string; reason: string; source: string; suppressed_at: string }> }>;
  }});
  const suppress = useMutation({ mutationFn: async () => {
    const response = await fetch(`${path}/dnc`, { method: "POST", credentials: "include" });
    if (!response.ok) throw new Error(t("marketingCompliance.dncError", "Unable to save do-not-contact"));
  }, onSuccess: () => queryClient.invalidateQueries() });
  return <section lang={i18n.resolvedLanguage || i18n.language || "en"} dir={i18n.dir()} className="rounded-lg border p-4 space-y-2" aria-label={t("marketingCompliance.preferences", "Marketing preferences")}>
    <h2 className="font-semibold">{t("marketingCompliance.preferences", "Marketing preferences")}</h2>
    {history.data?.history?.map((entry, i) => <div key={i}><strong className="text-red-700">{entry.scope === "all" ? t("marketingCompliance.dnc", "Do not contact") : t("marketingCompliance.emailSuppressed", "Email marketing suppressed")}</strong><p>{entry.reason} · {entry.source} · {new Date(entry.suppressed_at).toLocaleString()}</p></div>)}
    {history.data?.history?.some(entry => entry.scope === "all") ? <p>{t("marketingCompliance.stopped", "Promotional outreach is stopped. Reimporting does not re-enable contact.")}</p> : <Button variant="outline" disabled={!history.data?.canSuppress || suppress.isPending || history.isPending || history.isError} onClick={() => { if (window.confirm(t("marketingCompliance.confirmDnc", "Set permanent do not contact across channels? This cancels queued outreach, workflows and campaign enrollments and cannot be undone here."))) suppress.mutate(); }}>{t("marketingCompliance.setDnc", "Set do not contact across channels")}</Button>}
    {history.data && !history.data.canSuppress && <p>{t("marketingCompliance.missingIdentity", "Add a valid email or international phone number before setting do not contact.")}</p>}
    {(history.isError || suppress.isError) && <p role="alert">{suppress.error?.message || history.error?.message}</p>}
  </section>;
}
