import { crmAppointmentStatus, crmAppointmentType, crmChannelLabel, crmInquiryLabel, crmStageLabel, crmTagLabel } from "@/lib/crmPresentation";
import { useTranslation } from "react-i18next";
import { formatRegionalDate } from "@/lib/regionalFormatting";
import { ContactSuppressionStatus } from "@/components/ContactSuppressionStatus";
import { useEffect, useState } from "react";
import { Link, useRoute, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Contact, ContactNote } from "@shared/schema";
import { contactConversationHref, contactsReturnHref } from "@shared/contactDetails";
import { webchatPublicPhone } from "@shared/webchatContactIdentity";
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
  inquirySource?: string;
  commerceCustomer?: { store: string | null; ordersCount: number | null; totalSpent: string | null };
  orders: Array<{ id: string; store: string | null; number: string | null; total: string | null; currency: string | null; paymentStatus: string | null; fulfillmentStatus: string | null; createdAt: string | null; products: Array<{ name: string | null; quantity: number | null }> }>;
  activity: Array<{ id: string; eventType: string; createdAt: string | null }>;
};

async function request(path: string, method = "GET", body?: unknown, version?: string) {
  const response = await fetch(path, { method, credentials: "include", headers: body ? { "Content-Type": "application/json", ...(version ? { "X-Contact-Updated-At": version } : {}) } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || "Unable to load customer information"), { status: response.status });
  }
  return response.json();
}

const section = "min-w-0 rounded-lg border border-gray-200 bg-white p-4 space-y-3";

export function ContactDetails() {
  const [, params] = useRoute("/app/contacts/:id");
  const { user } = useAuth();
  return <ContactDetailsContent key={`${user?.id}:${params?.id}`} id={params?.id} />;
}

function ContactDetailsContent({ id }: { id: string | undefined }) {
  const { t, i18n } = useTranslation();
  const date = (value: string | Date | null | undefined) => value
    ? formatRegionalDate(new Date(value), i18n.language, { dateStyle: "medium", timeStyle: "short" })
    : "—";
  const search = useSearch();
  const selectedShopifyOrder = new URLSearchParams(search).get("shopifyOrderEvent");
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
  useEffect(() => {
    if (!selectedShopifyOrder ||
        !details.data?.orders.some(order => order.id === selectedShopifyOrder)) return;
    // After contact ownership and the async order list have loaded, scroll to
    // the exact Shopify purchase instead of the top of the customer profile.
    const frame = requestAnimationFrame(() => {
      const card = document.getElementById(`shopify-order-${selectedShopifyOrder}`);
      card?.scrollIntoView({ block:"center" });
      card?.focus({ preventScroll:true });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedShopifyOrder, details.data]);
  const save = useMutation({
    mutationFn: (patch: Record<string, string | null>) => request(path, "PATCH", patch, ["name", "email", "phone"].some(field => field in patch) ? editVersion : undefined),
    onSuccess: () => { setEditing(false); setDraft({}); cache.invalidateQueries({ queryKey: key }); cache.invalidateQueries({ queryKey: ["/api/contacts"] }); },
  });
  const addNote = useMutation({ mutationFn: () => request(`${path}/notes`, "POST", { content: note.trim() }), onSuccess: () => { setNote(""); cache.invalidateQueries({ queryKey: withUserQueryScope([`${path}/notes`], user?.id) }); } });
  const back = <Link href={contactsReturnHref(search)} className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("contacts.title")}</Link>;
  if (details.isPending) return <main className="p-4 space-y-4">{back}<p role="status">{t("crmUi.loadingCustomer")}</p></main>;
  if (details.isError || !details.data) return <main className="p-4 space-y-4">{back}<p role="alert">{t("crmDetails.contactUnavailable")}</p></main>;
  const { contact, conversations, orders, activity, shopify } = details.data;
  const conversationHref = contactConversationHref(contact.id, conversations);
  const assigned = team.data?.find(member => (member.memberId || member.id) === contact.assignedTo)?.name;
  const fields = ["name", "email", "phone", "tag", "pipelineStage", "assignedTo", "followUp", "followUpDate"] as const;
  const value = (field: typeof fields[number]) => draft[field] ?? String(contact[field] || "");
  const set = (field: string, input: string) => setDraft(previous => ({ ...previous, [field]: input }));
  const activityLabel = (eventType: string) => {
    switch (eventType) {
      case "shopify_order_created": return t("crmDetails.orderCreated");
      case "shopify_order_paid": return t("crmDetails.orderPaid");
      case "shopify_order_fulfilled": return t("crmDetails.orderFulfilled");
      case "shopify_order_cancelled":
      case "shopify_order_canceled": return t("crmDetails.orderCanceled");
      case "shopify_order_refunded": return t("crmDetails.orderRefunded");
      default: return eventType.replace(/_/g, " ");
    }
  };
  const saveErrorStatus = save.error && "status" in save.error ? save.error.status : undefined;
  const history = [
    ...activity.map(event => ({ id: event.id, title: activityLabel(event.eventType), at: event.createdAt, detail: "" })),
    ...(notes.data || []).map(item => ({ id: `note-${item.id}`, title: t("crmDetails.noteBy", { name: item.createdByName || t("crmDetails.teamMember") }), at: item.createdAt, detail: item.content })),
    ...(appointments.data || []).map(item => ({ id: `appointment-${item.id}`, title: item.title || crmAppointmentType(t, item.appointmentType), at: item.appointmentDate, detail: crmAppointmentStatus(t, item.status) })),
  ].sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
  return <main className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6 text-gray-900" data-testid="contact-details">
    {back}
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0"><h1 dir="auto" className="break-words text-xl font-semibold">{contact.name}</h1><p className="text-sm text-gray-500">{crmStageLabel(t, contact.pipelineStage)} · {crmTagLabel(t, contact.tag)}</p></div>
      {conversationHref ? <Link href={conversationHref}><Button variant="outline"><MessageSquare className="me-2 h-4 w-4" />{t("crmUi.openConversation")}</Button></Link> : <p className="text-sm text-gray-500">{t("crmUi.noConversation")}</p>}
    </header>
    <ContactSuppressionStatus contactId={contact.id} identityRevision={JSON.stringify([contact.email, contact.phone])} />

    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <section className={section} aria-label={t("crmUi.contactProfile")}>
        <div className="flex justify-between items-center"><h2 className="font-semibold">{t("crmUi.contactProfile")}</h2><Button variant="ghost" size="sm" onClick={() => { setEditing(!editing); setEditVersion(contact.updatedAt ? String(contact.updatedAt) : undefined); setDraft({}); save.reset(); }}>{editing ? t("inboxUi.cancel") : t("common.edit")}</Button></div>
        {shopify && <p className="text-xs text-gray-500">{t("crmDetails.shopifyReadOnly")}</p>}
        {editing ? <form className="space-y-3" onSubmit={event => {
          event.preventDefault();
          const patch: Record<string, string | null> = {};
          for (const field of fields) if (field in draft && (!shopify || !["name", "email", "phone"].includes(field))) patch[field] = field === "followUpDate" ? (draft[field] ? new Date(draft[field]).toISOString() : null) : draft[field];
          if (Object.keys(patch).length) save.mutate(patch); else setEditing(false);
        }}>
          {(["name", "email", "phone", "tag", "followUp"] as const).map(field => <label className="block text-sm space-y-1" key={field}><span>{({ name: t("contacts.fieldName"), email: t("contacts.fieldEmail"), phone: t("contacts.fieldPhone"), tag: t("contacts.colTag"), followUp: t("inboxUi.followUp") })[field]}</span><Input dir={field === "email" || field === "phone" ? "ltr" : "auto"} type={field === "email" ? "email" : "text"} disabled={(shopify || !contact.updatedAt) && ["name", "email", "phone"].includes(field)} value={value(field)} onChange={event => set(field, event.target.value)} /></label>)}
          <label className="block text-sm space-y-1">{t("crmUi.pipelineStage")}<select className="block w-full rounded-md border p-2" value={value("pipelineStage")} onChange={event => set("pipelineStage", event.target.value)}>{pipelineStageOptions(contact.pipelineStage).map(stage => <option key={stage} value={stage}>{crmStageLabel(t, stage)}</option>)}</select></label>
          <label className="block text-sm space-y-1">{t("crmUi.assignedTeamMember")}<select className="block w-full rounded-md border p-2" value={value("assignedTo")} onChange={event => set("assignedTo", event.target.value)}><option value="">{t("crmUi.unassigned")}</option>{contact.assignedTo && !assigned && <option value={contact.assignedTo}>{t("crmUi.assignedTeamMember")}</option>}{team.data?.filter(member => member.status === "active").map(member => <option key={member.id} value={member.memberId || member.id}>{member.name}</option>)}</select></label>
          {team.isError && <p role="alert" className="text-sm text-red-700">{t("crmDetails.teamFailed")}</p>}
          <label className="block text-sm space-y-1">{t("crmUi.followUpDate")}<Input type="datetime-local" defaultValue={contact.followUpDate ? (() => { const local = new Date(contact.followUpDate); local.setMinutes(local.getMinutes() - local.getTimezoneOffset()); return local.toISOString().slice(0, 16); })() : ""} onChange={event => set("followUpDate", event.target.value)} /></label>
          {save.isError && <p role="alert" className="text-sm text-red-700">{saveErrorStatus === 409 ? t("crmDetails.contactChanged") : saveErrorStatus === 400 ? t("crmDetails.invalidContactFields") : t("crmDetails.contactSaveFailed")}<Button type="button" variant="ghost" onClick={() => { details.refetch(); setEditing(false); setDraft({}); }}>{t("crmUi.refreshContact")}</Button></p>}
          <Button disabled={save.isPending} type="submit">{save.isPending ? t("workspaceUi.saving") : t("crmUi.saveChanges")}</Button>
        </form> : <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm [&>dd]:break-words [&>dt]:text-gray-500">
          <dt>{t("contacts.fieldEmail")}</dt><dd><bdi dir="ltr">{contact.email || "—"}</bdi></dd><dt>{t("contacts.fieldPhone")}</dt><dd><bdi dir="ltr">{webchatPublicPhone(contact) || "—"}</bdi></dd>
          <dt>{t("contacts.colChannel")}</dt><dd>{details.data.inquirySource ? t("crmUi.contactForm") : crmChannelLabel(t, details.data.displayChannel ?? contact.primaryChannel)}</dd>
          <dt>{t("crmUi.source")}</dt><dd>{details.data.inquirySource ? crmInquiryLabel(t, details.data.inquirySource) : (contact.source === "webchat" ? t("inboxUi.websiteChat") : contact.source || t("crmDetails.unavailable"))}</dd>
          <dt>{t("crmUi.assigned")}</dt><dd>{assigned || (contact.assignedTo ? t("crmUi.assignedTeamMember") : t("crmUi.unassigned"))}</dd>
          <dt>{t("inboxUi.leadScore")}</dt><dd>{contact.leadScore ?? "—"}</dd><dt>{t("crmUi.created")}</dt><dd>{date(contact.createdAt)}</dd><dt>{t("crmUi.updated")}</dt><dd>{date(contact.updatedAt)}</dd>
          <dt>{t("inboxUi.followUp")}</dt><dd>{contact.followUp || t("common.none")}{contact.followUpDate && <div>{date(contact.followUpDate)}</div>}</dd>
        </dl>}
      </section>
      <div className="min-w-0 space-y-4">
        {shopify && <section className={section} aria-label={t("crmDetails.shopifyPurchases")}><h2 className="font-semibold">{t("crmDetails.shopifyPurchases")}</h2>{details.data.commerceCustomer && <p className="text-sm">{details.data.commerceCustomer.store || t("crmDetails.storeUnavailable")}{details.data.commerceCustomer.ordersCount !== null && ` · ${t("crmDetails.orderCount", { count: details.data.commerceCustomer.ordersCount })}`}</p>}<p className="text-xs text-gray-500">{t("crmDetails.orderHistory")}</p>
          {orders.length === 0 ? <p className="text-sm text-gray-500">{t("crmDetails.noOrders")}</p> : orders.map(order => <article key={order.id} id={`shopify-order-${order.id}`} tabIndex={-1}
            className={`border-t pt-3 space-y-1 text-sm break-words rounded-sm outline-none ${selectedShopifyOrder === order.id ? "ring-2 ring-emerald-500 ring-offset-2" : ""}`}><div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{order.number || t("crmDetails.order")}</h3><span>{[order.total, order.currency].filter(Boolean).join(" ") || t("crmDetails.totalUnavailable")}</span></div><p className="text-gray-500">{order.store || t("crmDetails.storeUnavailable")} · {date(order.createdAt)}</p><ul className="list-inside list-disc">{order.products.map((product, index) => <li key={index}>{product.name}{product.quantity !== null && ` × ${product.quantity}`}</li>)}</ul><p>{t("crmDetails.orderPayment", { status: order.paymentStatus || t("crmDetails.unavailable") })} · {t("crmDetails.orderFulfillment", { status: order.fulfillmentStatus || t("crmDetails.unavailable") })}</p></article>)}
        </section>}
        <section className={section} aria-label={t("crmUi.notes")}><h2 className="font-semibold">{t("crmUi.notes")}</h2>
          {notes.isError ? <p role="alert">{t("crmUi.notesFailed")}</p> : notes.isPending ? <p>{t("crmUi.loadingNotes")}</p> : !notes.data?.length ? <p className="text-sm text-gray-500">{t("crmUi.noNotes")}</p> : notes.data.map(item => <article key={item.id} className="border-t pt-2 text-sm"><p dir="auto" className="whitespace-pre-wrap break-words">{item.content}</p><p className="text-xs text-gray-500">{item.createdByName} · {date(item.createdAt)}</p></article>)}
          <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (note.trim()) addNote.mutate(); }}><label className="block text-sm" htmlFor="crm-note">{t("crmUi.writeNote")}</label><Textarea dir="auto" id="crm-note" value={note} onChange={event => setNote(event.target.value)} />{addNote.isError && <p role="alert" className="text-sm text-red-700">{t("crmDetails.noteFailed")}</p>}<Button type="submit" disabled={!note.trim() || addNote.isPending}>{t("crmUi.addNote")}</Button></form>
        </section>
        <section className={section} aria-label={t("crmUi.activityTimeline")}><h2 className="font-semibold">{t("crmUi.activityTimeline")}</h2><p className="text-xs text-gray-500">{t("contactProfile.recentActivity")}</p>{appointments.isError && <p role="alert">{t("contactProfile.appointmentsFailed")}</p>}
          {!history.length ? <p className="text-sm text-gray-500">{t("contactProfile.noActivity")}</p> : <ol className="space-y-3">{history.map(item => <li key={item.id} className="border-s-2 border-gray-200 ps-3 text-sm"><p className="font-medium capitalize">{item.title}</p>{item.detail && <p dir="auto" className="whitespace-pre-wrap break-words">{item.detail}</p>}<time className="text-xs text-gray-500">{date(item.at)}</time></li>)}</ol>}
        </section>
      </div>
    </div>
  </main>;
}
