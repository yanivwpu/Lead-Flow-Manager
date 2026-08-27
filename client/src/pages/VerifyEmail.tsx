import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";
import { useAuth } from "@/lib/auth-context";
import { trackSignUp } from "@/lib/ga4Events";
import { CHECK_EMAIL_PATH, clearPendingVerificationEmail } from "@/lib/pendingVerification";

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState(t("auth.verifyingMessage"));

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    if (!token) {
      setStatus("error");
      setMessage(t("auth.verifyMissingToken"));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatus("error");
          setMessage(data.error || t("auth.verifyInvalidLink"));
          return;
        }
        await refreshSession();
        clearPendingVerificationEmail();
        const userId = data?.user?.id as string | undefined;
        if (userId && !data.alreadyVerified) {
          const source =
            new URLSearchParams(window.location.search).get("ref") ||
            new URLSearchParams(window.location.search).get("source") ||
            undefined;
          trackSignUp({
            method: "email",
            plan: "free",
            source: source || undefined,
            userId,
          });
        }
        setStatus("success");
        setMessage(
          data.trialStarted ? t("auth.verifyTrialStarted") : t("auth.verifyContinue"),
        );
        window.setTimeout(() => setLocation("/app/inbox"), 1500);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage(t("auth.verifyNetworkError"));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshSession, setLocation, t]);

  return (
    <>
      <NoIndexHelmet />
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          {status === "loading" && (
            <Loader2 className="h-8 w-8 animate-spin text-brand-green mx-auto mb-4" />
          )}
          {status === "success" && (
            <CheckCircle2 className="h-8 w-8 text-brand-green mx-auto mb-4" />
          )}
          {status === "error" && (
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-4" />
          )}
          <h1 className="text-xl font-display font-semibold text-gray-900 mb-2">
            {status === "success"
              ? t("auth.emailVerifiedTitle")
              : status === "error"
                ? t("auth.verificationFailedTitle")
                : t("auth.verifyingTitle")}
          </h1>
          <p className="text-sm text-gray-600 mb-6">{message}</p>
          {status === "error" && (
            <div className="space-y-3">
              <Link href={CHECK_EMAIL_PATH}>
                <Button className="w-full bg-brand-green hover:bg-emerald-700">
                  {t("auth.checkEmailTitle")}
                </Button>
              </Link>
              <p className="text-xs text-gray-500">{t("auth.verifyNeedNewLink")}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
