import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function MarketingSenderSetup() {
  const queryClient = useQueryClient();
  const [mailbox, setMailbox] = useState("");
  const [brand, setBrand] = useState("");
  const [address, setAddress] = useState("");
  const [verified, setVerified] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const profiles = useQuery({ queryKey: ["marketing-sender-profiles"], queryFn: async () => {
    const response = await fetch("/api/marketing/sender-profiles", { credentials: "include" });
    if (!response.ok) throw new Error("Sender setup is unavailable");
    return response.json() as Promise<{ mailboxes: Array<{ id: string; email: string }>; profiles: Array<{ mailbox_id: string; brand: string; postal_address: string; verified_at: string }> }>;
  }});
  return <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3" aria-label="Marketing sender setup">
    <h2 className="text-lg font-semibold">Marketing sender setup</h2>
    <p>Marketing sending is disabled pending staging acceptance and release approval. Each connected sender must have its own verified physical mailing address. Use the independent sender’s address.</p>
    {profiles.data?.profiles?.map(p => <p key={p.mailbox_id}>{p.brand} · {p.postal_address} · Verified {new Date(p.verified_at).toLocaleDateString()}</p>)}
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); setSaving(true); setStatus("");
      try {
        const response = await fetch(`/api/marketing/sender-profiles/${encodeURIComponent(mailbox)}`, { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brand, postalAddress: address, verified }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to save");
        setStatus("Sender address saved. Marketing sending remains disabled.");
        await queryClient.invalidateQueries({ queryKey: ["marketing-preview"] });
        await profiles.refetch();
      } catch (error) { setStatus(error instanceof Error ? error.message : "Unable to save"); }
      finally { setSaving(false); }
    }}>
      <label className="block">Connected sender<select required className="block rounded border p-2 w-full" value={mailbox} onChange={e => { const nextMailbox = e.target.value; const profile = profiles.data?.profiles?.find(p => p.mailbox_id === nextMailbox); setMailbox(nextMailbox); setBrand(profile?.brand || ""); setAddress(profile?.postal_address || ""); setVerified(false); setStatus(""); }}><option value="">Choose a sender</option>{profiles.data?.mailboxes?.map(m => <option key={m.id} value={m.id}>{m.email}</option>)}</select></label>
      <label className="block">Sender business name<input required maxLength={120} className="block rounded border p-2 w-full" value={brand} onChange={e => { setBrand(e.target.value); setVerified(false); }} /></label>
      <label className="block">Physical mailing address<textarea required minLength={10} maxLength={1000} className="block rounded border p-2 w-full" value={address} onChange={e => { setAddress(e.target.value); setVerified(false); }} /></label>
      <label className="block"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} /> I verified that this is the sender’s current physical mailing address.</label>
      <Button disabled={!verified || saving} type="submit">Save verified sender</Button>
    </form>
    {(status || profiles.isError) && <p role="status">{status || "Sender setup is unavailable. Marketing remains blocked."}</p>}
  </section>;
}
