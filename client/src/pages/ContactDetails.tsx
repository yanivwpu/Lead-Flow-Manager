import { useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Contact, ContactNote } from "@shared/schema";
import { contactConversationHref, contactsReturnHref } from "@shared/contactDetails";
import { getContactDisplayChannelLabel } from "@shared/contactChannelDisplay";
import { webchatPublicPhone, webchatSafeDisplayName } from "@shared/webchatContactIdentity";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { pipelineStageOptions } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, MessageSquare } from "lucide-react";

type Details = {
  contact: Contact;
  conversations: Array<{ id: string; channel: string }>;
  shopify: boolean;
  displayChannel?: string | null;
  commerceCustomer?: { store: string | null; ordersCount: number | null; totalSpent: string | null };
  orders: Array<{ id: string; store: string | null; number: string | null; total: string | null; currency: string | null; paymentStatus: string | null; fulfillmentStatus: string | null; createdAt: string | null; products: Array<{ name: string | null; quantity: number | null }> }>;
  activity: Array<{ id: string; eventType: string; createdAt: string | null }>;
};

async function request(path: string, method = "GET", body?: unknown, version?: string) {
  const response = await fetch(path, { method, credentials: "include", headers: body ? { "Content-Type": "application/json", ...(version ? { "X-Contact-Updated-At": version } : {}) } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Unable to load customer information");
  }
  return response.json();
}

const date = (value: string | Date | null | undefined) => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString() : "Unavailable";
const section = "min-w-0 rounded-lg border border-gray-200 bg-white p-4 space-y-3";

export function ContactDetails() {
  const [, params] = useRoute("/app/contacts/:id");
  const { user } = useAuth();
  return <ContactDetailsContent key={`${user?.id}:${params?.id}`} id={params?.id} />;
}

function ContactDetailsContent({ id }: { id: string | undefined }) {
  const search = useSearch();
  const { user } = useAuth();
  const path = `/api/contacts/${encodeURIComponent(id || "")}`;
  const cache = useQueryClient();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [editVersion, setEditVersion] = useState<string | undefined>();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const key = withUserQueryScope([`${path}/details`], user?.id);
  const details = useQuery<Details>({ queryKey: key, queryFn: () => request(`${path}/details`), enabled: Boolean(user && id), retry: false, gcTime: 0 });
  // Related data is requested only after contact authorization succeeds.
  const notes = useQuery<ContactNote[]>({ queryKey: withUserQueryScope([`${path}/notes`], user?.id), queryFn: () => request(`${path}/notes`), enabled: Boolean(details.data && user && !details.isError), retry: false });
  const team = useQuery<Array<{ id: string; memberId?: string; name: string; status: string }>>({ queryKey: withUserQueryScope(["/api/team"], user?.id), queryFn: () => request("/api/team"), enabled: Boolean(details.data && user && !details.isError), retry: false });
  const appointments = useQuery<Array<{ id: string; title: string; appointmentType: string; appointmentDate: string; status: string }>>({ queryKey: withUserQueryScope([`${path}/appointments`], user?.id), queryFn: () => request(`${path}/appointments`), enabled: Boolean(details.data && user && !details.isError), retry: false });
  const save = useMutation({
    mutationFn: (patch: Record<string, string | null>) => request(path, "PATCH", patch, ["name", "email", "phone"].some(field => field in patch) ? editVersion : undefined),
    onSuccess: () => { setEditing(false); setDraft({}); cache.invalidateQueries({ queryKey: key }); cache.invalidateQueries({ queryKey: ["/api/contacts"] }); },
  });
  const addNote = useMutation({ mutationFn: () => request(`${path}/notes`, "POST", { content: note.trim() }), onSuccess: () => { setNote(""); cache.invalidateQueries({ queryKey: withUserQueryScope([`${path}/notes`], user?.id) }); } });
  const back = <Link href={contactsReturnHref(search)} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Contacts</Link>;
  if (details.isPending) return <main className="p-4 space-y-4">{back}<p role="status">Loading customer…</p></main>;
  if (details.isError || !details.data) return <main className="p-4 space-y-4">{back}<p role="alert">{details.error?.message || "Contact unavailable"}</p></main>;
  const { contact, conversations, orders, activity, shopify } = details.data;
  const conversationHref = contactConversationHref(contact.id, conversations);
  const assigned = team.data?.find(member => (member.memberId || member.id) === contact.assignedTo)?.name;
  const fields = ["name", "email", "phone", "tag", "pipelineStage", "assignedTo", "followUp", "followUpDate"] as const;
  const value = (field: typeof fields[number]) => draft[field] ?? String(contact[field] || "");
  const set = (field: string, input: string) => setDraft(previous => ({ ...previous, [field]: input }));
  const history = [
    ...activity.map(event => ({ id: event.id, title: event.eventType.replace(/_/g, " "), at: event.createdAt, detail: "" })),
    ...(notes.data || []).map(item => ({ id: `note-${item.id}`, title: `Note · ${item.createdByName || "Team member"}`, at: item.createdAt, detail: item.content })),
    ...(appointments.data || []).map(item => ({ id: `appointment-${item.id}`, title: item.title || item.appointmentType, at: item.appointmentDate, detail: item.status })),
  ].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
  return <main className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6 text-gray-900" data-testid="contact-details">
    {back}
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h1 className="break-words text-xl font-semibold">{webchatSafeDisplayName(contact)}</h1><p className="text-sm text-gray-500">{contact.pipelineStage || "No stage"} · {contact.tag || "No tag"}</p></div>
      {conversationHref ? <Link href={conversationHref}><Button variant="outline"><MessageSquare className="mr-2 h-4 w-4" />Open Conversation</Button></Link> : <p className="text-sm text-gray-500">No messaging conversation yet</p>}
    </header>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <section className={section} aria-label="Contact profile">
        <div className="flex justify-between items-center"><h2 className="font-semibold">Contact profile</h2><Button variant="ghost" size="sm" onClick={() => { setEditing(!editing); setEditVersion(contact.updatedAt ? String(contact.updatedAt) : undefined); setDraft({}); save.reset(); }}>{editing ? "Cancel" : "Edit"}</Button></div>
        {shopify && <p className="text-xs text-gray-500">Shopify synchronizes customer identity. Name, email, and phone are read-only here; update them in Shopify.</p>}
        {editing ? <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          const patch: Record<string, string | null> = {};
          for (const field of fields) if (field in draft && (!shopify || !["name", "email", "phone"].includes(field))) patch[field] = field === "followUpDate" ? (draft[field] ? new Date(draft[field]).toISOString() : null) : draft[field];
          if (Object.keys(patch).length) save.mutate(patch); else setEditing(false);
        }}>
          {(["name", "email", "phone", "tag", "followUp"] as const).map(field => <label className="block text-sm space-y-1" key={field}><span>{({ name: "Name", email: "Email", phone: "Phone", tag: "Tag", followUp: "Follow-up" })[field]}</span><Input type={field === "email" ? "email" : "text"} disabled={(shopify || !contact.updatedAt) && ["name", "email", "phone"].includes(field)} value={value(field)} onChange={event => set(field, event.target.value)} /></label>)}
          <label className="block text-sm space-y-1">Pipeline stage<select className="block w-full rounded-md border p-2" value={value("pipelineStage")} onChange={event => set("pipelineStage", event.target.value)}>{pipelineStageOptions(contact.pipelineStage).map(stage => <option key={stage}>{stage}</option>)}</select></label>
          <label className="block text-sm space-y-1">Assigned team member<select className="block w-full rounded-md border p-2" value={value("assignedTo")} onChange={event => set("assignedTo", event.target.value)}><option value="">Unassigned</option>{contact.assignedTo && !assigned && <option value={contact.assignedTo}>Assigned team member</option>}{team.data?.filter(member => member.status === "active").map(member => <option key={member.id} value={member.memberId || member.id}>{member.name}</option>)}</select></label>
          <label className="block text-sm space-y-1">Follow-up date<Input type="datetime-local" defaultValue={contact.followUpDate ? (() => { const local = new Date(contact.followUpDate); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); return local.toISOString().slice(0, 16); })() : ""} onChange={event => set("followUpDate", event.target.value)} /></label>
          {save.isError && <p role="alert" className="text-sm text-red-700">{save.error.message}<Button type="button" variant="ghost" onClick={() => { details.refetch(); setEditing(false); setDraft({}); }}>Refresh contact</Button></p>}
          <Button disabled={save.isPending} type="submit">{save.isPending ? "Saving…" : "Save changes"}</Button>
        </form> : <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [&>dd]:break-words [&>dt]:text-gray-500">
          <dt>Email</dt><dd>{contact.email || "—"}</dd><dt>Phone</dt><dd>{webchatPublicPhone(contact) || "—"}</dd>
          <dt>Channel</dt><dd>{getContactDisplayChannelLabel(details.data.displayChannel ?? contact.primaryChannel) || "No channel"}</dd><dt>Source</dt><dd>{contact.source || "Unavailable"}</dd>
          <dt>Assigned</dt><dd>{assigned || (contact.assignedTo ? "Assigned team member" : "Unassigned")}</dd>
          <dt>Lead score</dt><dd>{contact.leadScore ?? "—"}</dd><dt>Created</dt><dd>{date(contact.createdAt)}</dd><dt>Updated</dt><dd>{date(contact.updatedAt)}</dd>
          <dt>Follow-up</dt><dd>{contact.followUp || "None"}{contact.followUpDate && <div>{date(contact.followUpDate)}</div>}</dd>
        </dl>}
      </section>
      <div className="min-w-0 space-y-4">
        {shopify && <section className={section} aria-label="Shopify purchases"><h2 className="font-semibold">Shopify purchases</h2>{details.data.commerceCustomer && <p className="text-sm">{details.data.commerceCustomer.store || "Store unavailable"}{details.data.commerceCustomer.ordersCount !== null && ` · ${details.data.commerceCustomer.ordersCount} orders`}</p>}<p className="text-xs text-gray-500">Synchronized order history. Status reflects the last stored event.</p>
          {orders.length === 0 ? <p className="text-sm text-gray-500">No synchronized orders available.</p> : orders.map(order => <article key={order.id} className="border-t pt-3 space-y-1 text-sm break-words"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{order.number || "Order"}</h3><span>{[order.total, order.currency].filter(Boolean).join(" ") || "Total unavailable"}</span></div><p className="text-gray-500">{order.store || "Store unavailable"} · {date(order.createdAt)}</p><ul className="list-inside list-disc">{order.products.map((product, index) => <li key={index}>{product.name}{product.quantity !== null && ` × ${product.quantity}`}</li>)}</ul><p>Payment: {order.paymentStatus || "Unavailable"} · Fulfillment: {order.fulfillmentStatus || "Unavailable"}</p></article>)}
        </section>}
        <section className={section} aria-label="CRM notes"><h2 className="font-semibold">CRM notes</h2>
          {notes.isError ? <p role="alert">Notes could not be loaded.</p> : notes.isPending ? <p>Loading notes…</p> : !notes.data?.length ? <p className="text-sm text-gray-500">No notes yet.</p> : notes.data.map(item => <article key={item.id} className="border-t pt-2 text-sm"><p className="whitespace-pre-wrap break-words">{item.content}</p><p className="text-xs text-gray-500">{item.createdByName} · {date(item.createdAt)}</p></article>)}
          <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (note.trim()) addNote.mutate(); }}><label className="block text-sm" htmlFor="crm-note">Add a note</label><Textarea id="crm-note" value={note} onChange={event => setNote(event.target.value)} />{addNote.isError && <p role="alert" className="text-sm text-red-700">{addNote.error.message}</p>}<Button type="submit" disabled={!note.trim() || addNote.isPending}>Add note</Button></form>
        </section>
        <section className={section} aria-label="Activity timeline"><h2 className="font-semibold">Activity timeline</h2><p className="text-xs text-gray-500">Newest first · up to 200 persisted events</p>{appointments.isError && <p role="alert">Appointment activity could not be loaded.</p>}
          {!history.length ? <p className="text-sm text-gray-500">No recorded activity.</p> : <ol className="space-y-3">{history.map(item => <li key={item.id} className="border-l-2 border-gray-200 pl-3 text-sm"><p className="font-medium capitalize">{item.title}</p>{item.detail && <p className="whitespace-pre-wrap break-words">{item.detail}</p>}<time className="text-xs text-gray-500">{date(item.at)}</time></li>)}</ol>}
        </section>
      </div>
    </div>
  </main>;
}
