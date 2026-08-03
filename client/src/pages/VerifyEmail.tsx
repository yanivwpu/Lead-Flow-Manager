import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";
import { useAuth } from "@/lib/auth-context";
import { trackSignUp } from "@/lib/ga4Events";

export function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    if (!token) {
      setStatus("error");
      setMessage("This verification link is missing a token.");
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
          setMessage(data.error || "This verification link is invalid or has expired.");
          return;
        }
        await refreshSession();
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
          data.trialStarted
            ? "Your email is verified. Your 14-day Pro + AI Brain trial has started."
            : "Your email is verified. You can continue to WhachatCRM.",
        );
        window.setTimeout(() => setLocation("/app/inbox"), 1500);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("We couldn’t verify your email. Please try again.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshSession, setLocation]);

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
            {status === "success" ? "Email verified" : status === "error" ? "Verification failed" : "Verifying"}
          </h1>
          <p className="text-sm text-gray-600 mb-6">{message}</p>
          {status === "error" && (
            <div className="space-y-3">
              <Link href="/auth?mode=login">
                <Button className="w-full bg-brand-green hover:bg-emerald-700">Back to login</Button>
              </Link>
              <p className="text-xs text-gray-500">
                Need a new link? Sign up again with the same email or use Resend from the signup screen.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
