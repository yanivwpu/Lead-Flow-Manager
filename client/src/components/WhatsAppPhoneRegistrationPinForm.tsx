import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type RegisterResponse = {
  success?: boolean;
  fullyReady?: boolean;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
};

/**
 * Secure post–Embedded Signup PIN step for Cloud API phone registration.
 * PIN is never logged, stored, or placed in URLs.
 */
export function WhatsAppPhoneRegistrationPinForm({
  onSuccess,
  className,
}: {
  onSuccess?: () => void | Promise<void>;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRtl = i18n.dir() === "rtl";

  function clearPins() {
    setPin("");
    setConfirmPin("");
  }

  async function submit() {
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError(t("whatsappPhoneRegistration.invalidPin"));
      return;
    }
    if (pin !== confirmPin) {
      setError(t("whatsappPhoneRegistration.pinMismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/whatsapp/meta/register-phone", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterResponse;
      clearPins();
      if (!res.ok || !data.success) {
        setError(data.error || t("whatsappPhoneRegistration.registerFailed"));
        return;
      }
      await onSuccess?.();
    } catch {
      clearPins();
      setError(t("whatsappPhoneRegistration.registerFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-3 space-y-3",
        className,
      )}
      dir={isRtl ? "rtl" : "ltr"}
    >
      <div className="flex items-start gap-2">
        <Shield className="h-5 w-5 text-amber-800 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-amber-950">
            {t("whatsappPhoneRegistration.title")}
          </p>
          <p className="text-xs text-amber-900/90">{t("whatsappPhoneRegistration.body")}</p>
          <p className="text-xs text-amber-800/90">{t("whatsappPhoneRegistration.keepPin")}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wa-reg-pin" className="text-xs text-amber-950">
            {t("whatsappPhoneRegistration.pinLabel")}
          </Label>
          <Input
            id="wa-reg-pin"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={pin}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, 6);
              setPin(next);
            }}
            className="font-mono tracking-widest"
            aria-label={t("whatsappPhoneRegistration.pinLabel")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-reg-pin-confirm" className="text-xs text-amber-950">
            {t("whatsappPhoneRegistration.confirmLabel")}
          </Label>
          <Input
            id="wa-reg-pin-confirm"
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={6}
            value={confirmPin}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value.replace(/\D/g, "").slice(0, 6);
              setConfirmPin(next);
            }}
            className="font-mono tracking-widest"
            aria-label={t("whatsappPhoneRegistration.confirmLabel")}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-700">{error}</p>}

      <Button type="button" size="sm" disabled={busy} onClick={() => void submit()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        {t("whatsappPhoneRegistration.submit")}
      </Button>
    </div>
  );
}
