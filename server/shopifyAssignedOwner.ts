/** An administrative store binding outranks both shop lookup and synthetic email. */
export async function resolveAssignedOwner<T extends { id: string; shopifyShop?: string | null }>(
  shop: string,
  deps: { targetId: (shop: string) => Promise<string | undefined>;
    user: (id: string) => Promise<T | undefined>;
    shopOwner: (shop: string) => Promise<T | undefined> },
): Promise<T | undefined> {
  const targetId = await deps.targetId(shop);
  if (!targetId) return undefined;
  const owner = await deps.user(targetId);
  const existing = await deps.shopOwner(shop);
  // An unavailable/deleted target or another mapping is never permission to fall back.
  if (!owner || owner.id !== targetId ||
      (owner.shopifyShop != null && owner.shopifyShop !== shop) ||
      (existing && existing.id !== targetId)) throw new Error("SHOPIFY_ASSIGNED_OWNER_UNAVAILABLE");
  return owner;
}
