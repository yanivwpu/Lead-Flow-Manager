import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Users, Briefcase } from "lucide-react";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";

type PortalKind = "partner" | "sales";

const COPY: Record<
  PortalKind,
  {
    title: string;
    subtitle: string;
    api: string;
    loginHref: string;
    loginLabel: string;
    Icon: typeof Users;
  }
> = {
  partner: {
    title: "Partner Portal",
    subtitle: "Reset your partner password",
    api: "/api/partner-portal/forgot-password",
    loginHref: "/partner-portal",
    loginLabel: "Back to Partner login",
    Icon: Users,
  },
  sales: {
    title: "Sales Portal",
    subtitle: "Reset your sales portal password",
    api: "/api/sales-portal/forgot-password",
    loginHref: "/sales-portal",
    loginLabel: "Back to Sales login",
    Icon: Briefcase,
  },
};

export function PartnerForgotPassword() {
  return <PortalForgotPassword portal="partner" />;
}

export function SalesForgotPassword() {
  return <PortalForgotPassword portal="sales" />;
}

function PortalForgotPassword({ portal }: { portal: PortalKind }) {
  const cfg = COPY[portal];
  const Icon = cfg.Icon;
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const res = await fetch(cfg.api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(data.error || "Too many requests. Please try again later.");
      }
      if (!res.ok && res.status !== 200) {
        // Prefer neutral messaging even on unexpected errors.
      }
      setMessage(
        data.message ||
          (portal === "partner"
            ? "If a partner account exists for this email, we’ve sent password reset instructions."
            : "If a sales account exists for this email, we’ve sent password reset instructions."),
      );
    } catch (err: any) {
      setError(err.message || "Something went wrong");
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
              <Icon className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900">{cfg.title}</h1>
            <p className="text-gray-600 mt-2">{cfg.subtitle}</p>
          </div>

          {message ? (
            <div className="space-y-4" data-testid="portal-forgot-success">
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>
              <Link href={cfg.loginHref} className="block">
                <Button type="button" variant="outline" className="w-full">
                  {cfg.loginLabel}
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
              ) : null}
              <div>
                <Label htmlFor="portal-forgot-email">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="portal-forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="you@example.com"
                    data-testid="portal-forgot-email"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-brand-green hover:bg-green-700"
                disabled={isLoading}
                data-testid="portal-forgot-submit"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  "Send reset link"
                )}
              </Button>
              <p className="text-center text-sm text-gray-500">
                <Link href={cfg.loginHref} className="text-brand-green hover:underline">
                  {cfg.loginLabel}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
