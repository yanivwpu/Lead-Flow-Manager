import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { ShopifySupportContactView } from "./ShopifySupportContactView";
import type { ShopifyContactSnapshot, ShopifySupportContactAction } from "@shared/shopifyContactPrivacy";

export function ShopifySupportContact({ manage = false }: { manage?: boolean }) {
  const { user, sessionAligned } = useAuth();
  const { i18n } = useTranslation();
  const client = useQueryClient();
  const key = withUserQueryScope(["/api/shopify/support-contact"], user?.id);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data } = useQuery<ShopifyContactSnapshot>({
    queryKey: key, enabled: !!user && sessionAligned, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch("/api/shopify/support-contact", { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Support contact unavailable");
      return response.json();
    },
  });
  useEffect(() => {
    setEmail(""); setExpanded(false); setFailed(false); setSaved(false);
  }, [user?.id]);
  useEffect(() => { if (!expanded) setEmail(data?.suggestedEmail ?? ""); }, [data?.suggestedEmail, expanded]);
  async function save(action: ShopifySupportContactAction) {
    if (pending) return;
    setPending(true); setFailed(false);
    try {
      const response = await fetch("/api/shopify/support-contact", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action), signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Could not save support contact");
      setSaved(true); setExpanded(false); setEmail("");
      await client.invalidateQueries({ queryKey: key });
    } catch { setFailed(true); }
    finally { setPending(false); }
  }
  if (!data?.available || (!manage && (data.confirmed || data.dismissed || saved))) return null;
  return <ShopifySupportContactView language={i18n.language || "en"} expanded={expanded} email={email}
    suggested={!!data.suggestedEmail && !data.confirmed} confirmed={data.confirmed} manage={manage}
    pending={pending} failed={failed} onEmail={setEmail} onOpen={() => setExpanded(true)}
    onClose={() => { setExpanded(false); setFailed(false); }}
    onSave={() => void save({ action: "confirm", email })}
    onSkip={() => void save({ action: "dismiss" })} onRemove={() => void save({ action: "remove" })} />;
}
