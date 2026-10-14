/** Public, allowlisted projections: never send arbitrary commerce webhook payloads. */
export function contactDetailsSuppressed(contact: { sourceDetails?: unknown; customFields?: unknown }): boolean {
  return [contact.sourceDetails, contact.customFields].some(value => {
    const data = value as Record<string, unknown> | null;
    return Boolean(data && (data.redacted === true || data.suppressed === true || data.shopifyRedacted === true || data.redactedAt));
  });
}

export function projectShopifyOrder(data: Record<string, unknown>, createdAt: Date | string | null) {
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;
  return {
    store: text(data.shop), number: text(data.orderName), total: text(data.totalPrice),
    currency: text(data.currency), paymentStatus: text(data.financialStatus),
    fulfillmentStatus: text(data.fulfillmentStatus), createdAt,
    products: Array.isArray(data.lineItems) ? data.lineItems.map((item: Record<string, unknown>) => ({
      name: text(item?.title ?? item?.name), quantity: typeof item?.quantity === 'number' ? item.quantity : null,
    })).filter(item => item.name) : [],
  };
}

export function contactConversationHref(contactId: string, conversations: Array<{ id: string; channel: string }>): string | null {
  const conversation = conversations.find(item => !['shopify', 'woocommerce'].includes(item.channel));
  return conversation ? `/app/inbox/${encodeURIComponent(contactId)}?conversation=${encodeURIComponent(conversation.id)}` : null;
}

export function contactsReturnHref(search: string): string {
  const value = new URLSearchParams(search).get('returnTo');
  return value === '/app/contacts' || value?.startsWith('/app/contacts?') ? value : '/app/contacts';
}

export function shopifyContactContext(contact: { source?: string | null; sourceDetails?: unknown; customFields?: unknown }) {
  const custom = (contact.customFields || {}) as Record<string, unknown>;
  const source = (contact.sourceDetails || {}) as Record<string, unknown>;
  const metadata = (custom.lastCommerceMetadata || {}) as Record<string, unknown>;
  const snapshot = (custom.shopifyCustomerSync || {}) as Record<string, unknown>;
  const customerId = custom.shopifyCustomerId ?? source.shopifyCustomerId;
  const store = custom.shopifyShop ?? source.shop ?? (custom.lastCommerceSource === 'shopify' ? metadata.shop : null);
  return {
    linked: contact.source === 'shopify' || customerId != null || custom.lastCommerceSource === 'shopify',
    customerId, store: typeof store === 'string' ? store : null,
    ordersCount: typeof snapshot.ordersCount === 'number' ? snapshot.ordersCount : null,
    totalSpent: typeof snapshot.totalSpent === 'string' && /^\d+(\.\d+)?$/.test(snapshot.totalSpent) ? snapshot.totalSpent : null,
  };
}
