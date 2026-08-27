import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";
import { useAuth } from "@/lib/auth-context";
import {
  CHECK_EMAIL_PATH,
  clearPendingVerificationEmail,
  consumePendingVerificationSend,
  readPendingVerificationEmail,
  rememberPendingVerificationEmail,
} from "@/lib/pendingVerification";
import { getDirection } from "@/lib/i18n";
import { navigateAfterAuth } from "@/lib/postAuthRedirect";

export function CheckEmailPage() {
  const { t } = useTranslation();
  const isRTL = getDirection() === "rtl";
  const [, setLocation] = useLocation();
  const { user, isLoading, sessionAligned, refreshSession, resendVerification } = useAuth();
  const [displayEmail, setDisplayEmail] = useState("");
  const [canChangeEmail, setCanChangeEmail] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [changeBusy, setChangeBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [showChange, setShowChange] = useState(false);
  const [nextEmail, setNextEmail] = useState("");

  useEffect(() => {
    const initialSend = consumePendingVerificationSend();
    if (initialSend === "failed") {
      setError(t("auth.verificationSendFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (isLoading || (user && !sessionAligned)) return;
    if (user && user.emailVerifiedAt !== null) {
      clearPendingVerificationEmail();
      navigateAfterAuth("/app/inbox");
      return;
    }
    if (user && user.emailVerifiedAt === null) {
      setDisplayEmail(user.email);
      rememberPendingVerificationEmail(user.email);
      setCanChangeEmail(true);
      return;
    }
    const stored = readPendingVerificationEmail();
    setDisplayEmail(stored);
    setCanChangeEmail(false);
  }, [user, isLoading, sessionAligned]);

  const handleResend = useCallback(async () => {
    setResendBusy(true);
    setNote("");
    setError("");
    const result = await resendVerification(displayEmail);
    setResendBusy(false);
    if (result.ok) {
      setNote(t("auth.verificationResendSuccess"));
    } else {
      setError(result.error || t("auth.verificationSendFailed"));
    }
  }, [displayEmail, resendVerification, t]);

  const handleChangeEmail = useCallback(async () => {
    setChangeBusy(true);
    setNote("");
    setError("");
    try {
      const response = await fetch("/api/auth/change-pending-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: nextEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        setError(t("auth.verificationEmailInUse"));
        return;
      }
      if (!response.ok) {
        setError(data.error || t("auth.verificationChangeFailed"));
        return;
      }
      const updated = typeof data.email === "string" ? data.email : nextEmail;
      setDisplayEmail(updated);
      rememberPendingVerificationEmail(updated);
      setShowChange(false);
      setNextEmail("");
      await refreshSession();
      if (data.emailSent === false && !data.unchanged) {
        setError(t("auth.verificationSendFailed"));
      } else if (!data.unchanged) {
        setNote(t("auth.verificationResendSuccess"));
      }
    } catch {
      setError(t("auth.verificationChangeFailed"));
    } finally {
      setChangeBusy(false);
    }
  }, [nextEmail, refreshSession, t]);

  const handleLogin = useCallback(() => {
    setLocation("/auth?mode=login");
  }, [setLocation]);

  if (isLoading || (user && !sessionAligned)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-brand-green" />
      </div>
    );
  }

  return (
    <>
      <NoIndexHelmet />
      <div
        dir={isRTL ? "rtl" : "ltr"}
        className={`min-h-screen flex items-center justify-center bg-gray-50 p-6 ${isRTL ? "text-right" : "text-left"}`}
      >
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-5">
            <Mail className="h-6 w-6 text-brand-green" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-3">
            {t("auth.checkEmailTitle")}
          </h1>
          <p className="text-sm text-gray-600 mb-2">
            {t("auth.checkEmailPrimary", { email: displayEmail || t("auth.yourEmail") })}
          </p>
          <p className="text-sm text-gray-500 mb-6">{t("auth.checkEmailSpamHint")}</p>
          {user && user.emailVerifiedAt === null && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
              {t("auth.checkEmailLoginPending")}
            </p>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {note && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex items-start gap-2 text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{note}</span>
            </div>
          )}

          <div className="space-y-3">
            <Button
              type="button"
              className="w-full bg-brand-green hover:bg-emerald-700"
              disabled={resendBusy || !displayEmail}
              onClick={() => void handleResend()}
            >
              {resendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.resendVerification")}
            </Button>
            {canChangeEmail ? (
              showChange ? (
                <div className="space-y-3 rounded-lg border border-gray-200 p-3">
                  <Label htmlFor="pending-email">{t("auth.newEmail")}</Label>
                  <Input
                    id="pending-email"
                    type="email"
                    value={nextEmail}
                    onChange={(e) => setNextEmail(e.target.value)}
                    className="bg-gray-50 border-gray-200"
                    dir="ltr"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowChange(false)}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      type="button"
                      className="flex-1 bg-brand-green hover:bg-emerald-700"
                      disabled={changeBusy || !nextEmail.trim()}
                      onClick={() => void handleChangeEmail()}
                    >
                      {changeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.saveNewEmail")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => setShowChange(true)}>
                  {t("auth.changeEmail")}
                </Button>
              )
            ) : (
              <p className="text-xs text-gray-500">{t("auth.changeEmailRequiresLogin")}</p>
            )}
            <Button type="button" variant="ghost" className="w-full" onClick={handleLogin}>
              {t("auth.returnToLogin")}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

export { CHECK_EMAIL_PATH };
