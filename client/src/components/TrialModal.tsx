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
import { upgradeToProAI, type UpgradeProvider } from "@/lib/upgradeRouting";

interface TrialModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daysRemaining: number;
  upgradeProvider: UpgradeProvider;
}

export function TrialModal({ open, onOpenChange, daysRemaining, upgradeProvider }: TrialModalProps) {
  const [loading, setLoading] = useState(false);

  const primaryLabel =
    upgradeProvider === "shopify"
      ? "Keep Pro + AI with Shopify Billing"
      : "Keep Pro + AI";

  const handlePrimary = async () => {
    setLoading(true);
    try {
      await upgradeToProAI("/app/settings");
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="modal-trial-details">
        <DialogHeader>
          <div className="flex justify-center mb-2">
            <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
              <Sparkles className="h-6 w-6 text-slate-700" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">You&apos;re using Pro + AI Brain</DialogTitle>
          <DialogDescription className="text-center text-gray-600 space-y-3 pt-1">
            <p>
              <span className="font-semibold text-gray-900">{daysRemaining}</span> day
              {daysRemaining !== 1 ? "s" : ""} left in your included trial.
            </p>
            <ul className="text-left text-sm space-y-2 pt-2 border-t border-gray-100 mt-3">
              <li className="flex gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                AI reply suggestions &amp; automation-friendly inbox
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                Lead qualification, scoring &amp; Growth Engine–ready workflows
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                Higher conversation limits &amp; Pro CRM features
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                Full workflow &amp; automation builder during trial
              </li>
            </ul>
            <p className="text-xs text-gray-500 pt-2 leading-relaxed">
              After the trial, your account moves to Free unless you upgrade. Your data stays safe, but Pro and AI
              automations may pause until you subscribe.
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col gap-2 pt-2">
          <Button
            className="w-full bg-slate-900 hover:bg-slate-800 text-white"
            onClick={handlePrimary}
            disabled={loading}
            data-testid="button-trial-upgrade-primary"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : primaryLabel}
          </Button>
          <Link href="/pricing">
            <a className="block w-full">
              <Button variant="outline" className="w-full border-gray-200" data-testid="button-trial-view-plans">
                View plans
              </Button>
            </a>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
