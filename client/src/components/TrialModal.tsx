import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getDirection } from "@/lib/i18n";
import { upgradeToProAI } from "@/lib/upgradeRouting";

interface TrialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daysRemaining: number;
}

export function TrialModal({ open, onOpenChange, daysRemaining }: TrialModalProps) {
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const dir = getDirection();

  const handlePrimary = async () => {
    setLoading(true);
    try {
      await upgradeToProAI("/app/settings");
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir={dir}
        className="sm:max-w-[440px] gap-0 border border-gray-200/80 p-8 shadow-xl sm:p-10"
        data-testid="modal-trial-details"
      >
        <DialogHeader className="space-y-4 text-center sm:text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Sparkles className="h-6 w-6 text-slate-700" aria-hidden />
          </div>
          <div className="space-y-2">
            <DialogTitle className="text-balance text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              {t("trial.modal.title")}
            </DialogTitle>
            <p className="text-base text-gray-500">{t("trial.modal.subtitle")}</p>
          </div>
          <DialogDescription asChild>
            <div className="space-y-6 pt-2 text-start text-gray-600">
              <p className="text-center text-sm text-gray-600">
                {t("trial.modal.daysLeft", { count: daysRemaining })}
              </p>
              <ul className="space-y-3 border-t border-gray-100 pt-6 text-sm leading-relaxed">
                <li className="flex items-start gap-3">
                  <span className="font-bold text-emerald-600 shrink-0" aria-hidden>
                    ✓
                  </span>
                  <span>{t("trial.modal.bullet1")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-bold text-emerald-600 shrink-0" aria-hidden>
                    ✓
                  </span>
                  <span>{t("trial.modal.bullet2")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-bold text-emerald-600 shrink-0" aria-hidden>
                    ✓
                  </span>
                  <span>{t("trial.modal.bullet3")}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="font-bold text-emerald-600 shrink-0" aria-hidden>
                    ✓
                  </span>
                  <span>{t("trial.modal.bullet4")}</span>
                </li>
              </ul>
              <p className="border-t border-gray-100 pt-6 text-xs leading-relaxed text-gray-500">
                {t("trial.modal.footerNote")}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-10 flex w-full flex-col gap-3 sm:flex-col">
          <button
            type="button"
            onClick={handlePrimary}
            disabled={loading}
            data-testid="button-trial-upgrade-primary"
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-green px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-green disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden /> : t("trial.modal.ctaUnlock")}
          </button>
          <Link href="/pricing">
            <a className="block w-full">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-lg border-gray-200 bg-white font-medium text-gray-900 shadow-none hover:bg-gray-50"
                data-testid="button-trial-view-plans"
              >
                {t("trial.modal.ctaViewPlans")}
              </Button>
            </a>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
