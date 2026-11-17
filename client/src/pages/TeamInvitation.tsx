import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { getDirection } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";
import { invitationReturnPath, rememberInvitationReturn } from "@/lib/teamInvitationReturn";

export function TeamInvitationPage() {
  const { t } = useTranslation();
  const { user, isLoading, sessionAligned } = useAuth();
  const path = invitationReturnPath(`/team-invitation${window.location.hash}`);
  const token = path?.split("#")[1];
  const [preview, setPreview] = useState<{ workspaceName: string; email: string; role: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const verified = !!user?.emailVerifiedAt;
  const authHref = `/auth?mode=login&redirect=${encodeURIComponent(path || "/team-invitation")}`;
  useEffect(() => {
    if (!token || !verified || !sessionAligned) return;
    let cancelled = false;
    setPreview(null); setError("");
    fetch("/api/team/invitations/preview", { method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json(); if (!cancelled) setPreview(data);
      }).catch(err => { if (!cancelled) setError(t(err.message === "403" ? "teamInvite.identityError" : "teamInvite.invalid")); });
    return () => { cancelled = true; };
  }, [token, verified, sessionAligned, user?.id, t]);
  async function accept() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/team/invitations/accept", { method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!res.ok) throw new Error(String(res.status));
      rememberInvitationReturn(null);
      // Replace all account-scoped caches and sockets after server-side selection.
      window.location.replace("/app/inbox");
    } catch (err) {
      setError(t(err instanceof Error && err.message === "403" ? "teamInvite.identityError" : "teamInvite.invalid"));
      setBusy(false);
    }
  }
  return <><NoIndexHelmet /><main dir={getDirection()} className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <section className="w-full max-w-md rounded-xl border bg-white p-6 space-y-4 text-start">
      <h1 className="text-xl font-semibold">{t("teamInvite.title")}</h1>
      <p>{t("teamInvite.instructions")}</p>
      {!path && <p role="alert">{t("teamInvite.invalid")}</p>}
      {isLoading ? <p>{t("teamInvite.loading")}</p> : !user ?
        <a className="underline block" href={authHref}>{t("teamInvite.signIn")}</a> : <>
          <p className="break-all">{user.email}</p>
          {!verified && <a href="/check-email" className="underline block" onClick={() => rememberInvitationReturn(path)}>{t("teamInvite.verify")}</a>}
          {preview && <><p className="break-words">{t("teamInvite.workspace")}: {preview.workspaceName}</p>
            <p>{t("teamInvite.role")}: {t(`teamInvite.${preview.role}`)}</p>
            <Button className="w-full" disabled={busy} onClick={accept}>{t(busy ? "teamInvite.loading" : "teamInvite.accept")}</Button></>}
          <a className="underline block" href={authHref}>{t("teamInvite.switchAccount")}</a>
        </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
    </section>
  </main></>;
}
