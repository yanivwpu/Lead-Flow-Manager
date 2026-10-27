import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth-context";
import { withUserQueryScope } from "./accountQueryScope";
import { useEcommerceMerchantActivationStatus } from "./ecommerceMerchantActivation";

export function useEcommercePilot() {
  const { user, sessionAligned } = useAuth();
  const query = useQuery<{ available: boolean }>({
    queryKey: withUserQueryScope(["/api/shopify/ecommerce/capabilities"], user?.id),
    enabled: !!user?.id && sessionAligned,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await fetch("/api/shopify/ecommerce/capabilities", { credentials: "include" });
      if (response.status === 401 || response.status === 404) return { available: false };
      if (!response.ok) throw new Error("Pilot access unavailable");
      return response.json();
    },
  });
  return { available: !!user?.id && sessionAligned && !query.isError && query.data?.available === true,
    checking: !sessionAligned || (!!user?.id && query.isPending) };
}

export function EcommercePilotBoundary({ children }: { children: ReactNode }) {
  const { available, checking } = useEcommercePilot();
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const copy = locale === "he" ? ["בודקים גישה…", "העמוד אינו זמין."] :
    locale === "es" ? ["Comprobando acceso…", "Esta página no está disponible."] :
    ["Checking access…", "This page is not available."];
  return <><Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>
    {available ? children : <p className="p-6 text-sm text-slate-600" role="status" dir={locale === "he" ? "rtl" : "ltr"}>{copy[checking ? 0 : 1]}</p>}</>;
}

/** Activated merchants see the same workspace as pilots, without receiving pilot-only API access. */
export function EcommerceWorkspaceBoundary({ children }: { children: ReactNode }) {
  const pilot = useEcommercePilot();
  const activation = useEcommerceMerchantActivationStatus();
  const { user, sessionAligned } = useAuth();
  const { i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const allowed = !!user?.id && sessionAligned &&
    (pilot.available || (activation.data?.activated === true && activation.data?.eligible === true));
  const loading = sessionAligned && !!user?.id && (pilot.checking || activation.isPending);
  const message = locale === "he"
    ? loading ? "בודקים גישה…" : "יש להפעיל את מנוע המסחר האלקטרוני מתוך תבניות."
    : locale === "es"
      ? loading ? "Comprobando acceso…" : "Activa el motor de comercio electrónico desde Plantillas."
      : loading ? "Checking access…" : "Activate E-Commerce Growth Engine from Templates.";
  return <><Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>
    {allowed ? children : <p className="p-6 text-sm text-slate-600" role="status" dir={locale === "he" ? "rtl" : "ltr"}>{message}</p>}
  </>;
}
