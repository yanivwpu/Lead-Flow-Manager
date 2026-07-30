import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, Eye, EyeOff, Loader2, Users, Briefcase } from "lucide-react";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";

type PortalKind = "partner" | "sales";

const COPY: Record<
  PortalKind,
  {
    title: string;
    api: string;
    loginHref: string;
    Icon: typeof Users;
  }
> = {
  partner: {
    title: "Partner Portal",
    api: "/api/partner-portal/reset-password",
    loginHref: "/partner-portal",
    Icon: Users,
  },
  sales: {
    title: "Sales Portal",
    api: "/api/sales-portal/reset-password",
    loginHref: "/sales-portal",
    Icon: Briefcase,
  },
};

export function PartnerResetPassword() {
  return <PortalResetPassword portal="partner" />;
}

export function SalesResetPassword() {
  return <PortalResetPassword portal="sales" />;
}

function PortalResetPassword({ portal }: { portal: PortalKind }) {
  const cfg = COPY[portal];
  const Icon = cfg.Icon;
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");
    if (!tokenParam) setError("Invalid or missing reset token");
    else setToken(tokenParam);
  }, []);

  useEffect(() => {
    if (!isSuccess) return;
    const t = window.setTimeout(() => setLocation(cfg.loginHref), 2500);
    return () => window.clearTimeout(t);
  }, [isSuccess, cfg.loginHref, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(cfg.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to reset password");
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <NoIndexHelmet />
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="h-14 w-14 bg-brand-green rounded-xl flex items-center justify-center mx-auto mb-4">
              {isSuccess ? (
                <CheckCircle className="h-7 w-7 text-white" />
              ) : (
                <Icon className="h-7 w-7 text-white" />
              )}
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900">{cfg.title}</h1>
            <p className="text-gray-600 mt-2">
              {isSuccess ? "Password updated" : "Choose a new password"}
            </p>
          </div>

          {isSuccess ? (
            <div className="space-y-4 text-center" data-testid="portal-reset-success">
              <p className="text-sm text-emerald-800">
                Password updated successfully. You can now sign in.
              </p>
              <Link href={cfg.loginHref}>
                <Button className="w-full bg-brand-green hover:bg-green-700">Go to login</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? (
                <div
                  className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600"
                  data-testid="portal-reset-error"
                >
                  {error}
                </div>
              ) : null}
              <div>
                <Label htmlFor="portal-new-password">New password</Label>
                <div className="relative mt-1">
                  <Input
                    id="portal-new-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    data-testid="portal-reset-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <Label htmlFor="portal-confirm-password">Confirm new password</Label>
                <Input
                  id="portal-confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1"
                  data-testid="portal-reset-confirm"
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-brand-green hover:bg-green-700"
                disabled={isLoading || !token}
                data-testid="portal-reset-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating…
                  </>
                ) : (
                  "Update password"
                )}
              </Button>
              <p className="text-center text-sm text-gray-500">
                <Link href={cfg.loginHref} className="text-brand-green hover:underline">
                  Back to login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
