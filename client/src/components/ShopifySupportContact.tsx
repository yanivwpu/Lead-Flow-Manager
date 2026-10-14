import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { ShopifySupportContactView } from "./ShopifySupportContactView";
import { shopifySupportContactUrl, saveSupportContact, SupportContactRequestError, type SupportContactFailure } from "@/lib/shopifySupportContactRequest";
import type { ShopifyContactSnapshot, ShopifySupportContactAction } from "@shared/shopifyContactPrivacy";

export function ShopifySupportContact({ manage = false }: { manage?: boolean }) {
  const { user, sessionAligned, refreshSession } = useAuth();
  const { i18n } = useTranslation();
  const client = useQueryClient();
  const key = withUserQueryScope(["/api/shopify/support-contact"], user?.id);
  const [expanded, setExpanded] = useState(false);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<SupportContactFailure | null>(null);
  const currentUserId = useRef(user?.id);
  currentUserId.current = user?.id;
  const [saved, setSaved] = useState(false);
  const { data } = useQuery<ShopifyContactSnapshot>({
    queryKey: key, enabled: !!user && sessionAligned, retry: false, staleTime: 30_000,
    queryFn: async () => {
      const response = await fetch(shopifySupportContactUrl(), { credentials: "include", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Support contact unavailable");
      return response.json();
    },
  });
  useEffect(() => {
    setEmail(""); setExpanded(false); setFailure(null); setSaved(false); setPending(false);
  }, [user?.id]);
  useEffect(() => { if (!expanded) setEmail(data?.suggestedEmail ?? ""); }, [data?.suggestedEmail, expanded]);
  async function save(action: ShopifySupportContactAction) {
    const ownerId = user?.id;
    if (pending || !ownerId || !sessionAligned) return;
    setPending(true); setFailure(null);
    try {
      await saveSupportContact(action);
      if (currentUserId.current !== ownerId) return;
      setSaved(true); setExpanded(false); setEmail("");
      void client.invalidateQueries({ queryKey: key }).catch(() => {});
    } catch (error) {
      if (currentUserId.current !== ownerId) return;
      const reason = error instanceof SupportContactRequestError ? error.reason : "error";
      setFailure(reason);
      if (reason === "sessionExpired") void refreshSession();
    } finally { if (currentUserId.current === ownerId) setPending(false); }

  }
  if (!user || !sessionAligned || !data?.available || (!manage && (data.confirmed || data.dismissed || saved))) return null;
  return <ShopifySupportContactView language={i18n.language || "en"} expanded={expanded} email={email}
    suggested={!!data.suggestedEmail && !data.confirmed} confirmed={data.confirmed} manage={manage}
    pending={pending} failed={!!failure} failureReason={failure || undefined} onEmail={setEmail} onOpen={() => setExpanded(true)}
    onClose={() => { setExpanded(false); setFailure(null); }}
    onSave={() => void save({ action: "confirm", email })}
    onSkip={() => void save({ action: "dismiss" })} onRemove={() => void save({ action: "remove" })} />;
}
