import type { Contact, ActivityEvent, ContactNote, Appointment, Conversation } from './schema';
import { getContactDisplayChannel, getContactDisplayChannelLabel } from './contactChannelDisplay';
import { webchatSafeDisplayName, webchatPublicPhone } from './webchatContactIdentity';

const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const date = (v: Date | string | null | undefined) => v ? new Date(v).toISOString() : null;

export function isShopifyLinked(contact: Pick<Contact, 'source' | 'customFields' | 'sourceDetails'>) {
  const cf = record(contact.customFields), sd = record(contact.sourceDetails);
  return contact.source === 'shopify' || cf.shopifyCustomerId != null || sd.shopifyCustomerId != null || cf.lastCommerceSource === 'shopify';
}

/** Never resurrect identities from historical commerce metadata. */
export function shopifyDetailsSuppressed(contact: Pick<Contact, 'customFields' | 'sourceDetails'>, shopRedacted = false) {
  const cf = record(contact.customFields), sd = record(contact.sourceDetails);
  return shopRedacted || cf.shopifyRedacted === true || cf.shopifySuppressed === true || sd.shopifyRedacted === true || sd.shopifySuppressed === true;
}

export function buildContactDetails(input: {
  contact: Contact; conversations: Conversation[]; events: ActivityEvent[];
  notes: ContactNote[]; appointments: Appointment[]; shopRedacted?: boolean;
}) {
  const { contact: c } = input;
  const linked = isShopifyLinked(c);
  const suppressed = linked && shopifyDetailsSuppressed(c, input.shopRedacted);
  const cf = record(c.customFields);
  const meta = record(cf.lastCommerceMetadata);
  const snapshot = record(cf.shopifyCustomerSync);
  // Project display fields only. No credentials, raw event payloads or customer IDs reach the page.
  const orders = new Map<string, {
    key: string; number: string | null; shop: string | null; total: string | null;
    currency: string | null; payment: string | null; fulfillment: string | null;
    date: string | null; dateSource: string; items: { title: string; quantity: number | null }[];
  }>();
  if (!suppressed) for (const event of input.events) {
    if (!/^shopify_order_(created|updated)$/.test(event.eventType)) continue;
    const d = record(event.eventData);
    if (d.redacted === true || d.suppressed === true) continue;
    const id = d.orderId != null ? String(d.orderId) : null;
    if (!id) continue;
    const key = `${text(d.shop) || ''}:${id}`;
    if (orders.has(key)) continue; // events arrive newest first; retain latest synchronized snapshot
    orders.set(key, {
      key, number: text(d.orderName), shop: text(d.shop), total: text(d.totalPrice),
      currency: text(d.currency), payment: text(d.financialStatus), fulfillment: text(d.fulfillmentStatus),
      date: text(d.orderCreatedAt) || date(event.createdAt),
      dateSource: text(d.orderCreatedAt) ? 'Ordered' : 'Synced',
      items: Array.isArray(d.lineItems) ? d.lineItems.map(record).map(item => ({
        title: text(item.title) || 'Product', quantity: typeof item.quantity === 'number' ? item.quantity : null,
      })) : [],
    });
  }
  const notes = (suppressed ? [] : input.notes).map(n => ({ id: n.id, content: n.content, author: n.createdByName, createdAt: date(n.createdAt) }));
  const timeline: { id: string; title: string; detail: string | null; date: string | null }[] = [];
  if (c.createdAt) timeline.push({ id: 'created', title: 'Contact created', detail: null, date: date(c.createdAt) });
  // Dates alone do not tell us which fields changed: do not fabricate an update story.
  for (const e of suppressed ? [] : input.events) {
    if (suppressed && e.eventType.startsWith('shopify_')) continue;
    if (!/^(stage_change|tag_change|assignment|contact_updated|note|follow_up|followup|appointment_|calendly_|automation_|workflow_|shopify_|ai_handoff)/.test(e.eventType)) continue;
    const d = record(e.eventData);
    if (d.redacted === true || d.suppressed === true) continue;
    timeline.push({ id: `event:${e.id}`, title: e.eventType.replace(/_/g, ' '),
      detail: text(d.title) || text(d.summary) || (text(d.from) && text(d.to) ? `${d.from} → ${d.to}` : null), date: date(e.createdAt) });
  }
  for (const n of notes) timeline.push({ id: `note:${n.id}`, title: 'CRM note', detail: n.content, date: n.createdAt });
  for (const a of suppressed ? [] : input.appointments) timeline.push({ id: `appointment:${a.id}`, title: "Appointment created", detail: `Current appointment: ${a.title || a.appointmentType} · ${date(a.appointmentDate)} · Status: ${a.status}`, date: date(a.createdAt) });
  timeline.sort((a,b) => (b.date || '').localeCompare(a.date || ''));
  return {
    profile: {
      id: c.id, name: suppressed && linked ? 'Customer data unavailable' : webchatSafeDisplayName(c),
      email: suppressed && linked ? null : c.email,
      phone: suppressed && linked ? null : webchatPublicPhone(c),
      channel: getContactDisplayChannelLabel(getContactDisplayChannel(c)), source: c.source,
      createdAt: date(c.createdAt), updatedAt: date(c.updatedAt),
      assignedTo: c.assignedTo, pipelineStage: c.pipelineStage, tag: c.tag, leadScore: c.leadScore,
      followUp: suppressed ? null : c.followUp, followUpDate: suppressed ? null : date(c.followUpDate), notes: suppressed ? null : c.notes,
      shopifyLinked: linked, identityReadOnly: linked,
    },
    conversations: (suppressed ? [] : input.conversations).map(v => ({ id: v.id, channel: v.channel })),
    notes, timeline,
    shopify: linked && !suppressed ? {
      shop: text(cf.shopifyShop) || text(meta.shop) || [...orders.values()][0]?.shop || null,
      orders: [...orders.values()], ordersCount: typeof snapshot.ordersCount === 'number' ? snapshot.ordersCount : typeof meta.ordersCount === 'number' ? meta.ordersCount : null,
      totalSpent: text(snapshot.totalSpent) || text(meta.totalSpent),
    } : null,
  };
}
export type ContactDetailsData = ReturnType<typeof buildContactDetails>;
