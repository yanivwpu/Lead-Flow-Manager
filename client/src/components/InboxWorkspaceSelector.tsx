import { withUserQueryScope } from "@/lib/accountQueryScope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";

export function InboxWorkspaceSelector() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const { data } = useQuery<{ currentWorkspaceId: string; workspaces: { id: string; name: string; role: string }[] }>({
    queryKey: withUserQueryScope(["/api/inbox/workspaces"], user?.id), enabled: !!user,
    queryFn: async () => {
      const res = await fetch("/api/inbox/workspaces", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Workspace list unavailable");
      return res.json();
    },
  });
  if (!data || (data.workspaces.length < 2 && data.workspaces.some(w => w.id === data.currentWorkspaceId))) return null;
  async function select(workspaceId: string) {
    setBusy(true); setError(false);
    try {
      const res = await fetch("/api/inbox/workspace", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      if (!res.ok) throw new Error("Workspace unavailable");
      window.location.assign("/app/inbox");
    } catch { setBusy(false); setError(true); }
  }
  return <div className="shrink-0 border-b px-3 py-2 space-y-1 text-sm">
    <label className="flex items-center gap-2 min-w-0">
      <span>{t("teamInvite.workspace")}</span>
      <select aria-label={t("teamInvite.workspace")} disabled={busy} value={data.currentWorkspaceId}
        className="min-w-0 flex-1 max-w-full rounded border p-1 bg-white" onChange={e => void select(e.target.value)}>
        {!data.workspaces.some(w => w.id === data.currentWorkspaceId) && <option value={data.currentWorkspaceId} disabled>{t("teamInvite.revoked")}</option>}
        {data.workspaces.map(w => <option key={w.id} value={w.id}>{w.name} ({t(`teamInvite.${w.role}`)})</option>)}
      </select>
    </label>
    {error && <p role="alert">{t("teamInvite.revoked")}</p>}
  </div>;
}
