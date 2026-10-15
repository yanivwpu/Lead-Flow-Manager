import { z } from "zod";
export const CATALOG_FRESH_MS = 15 * 60_000;
export const SHOPIFY_CATALOG_SCOPES = [
  "read_products",
  "read_inventory",
] as const;
export const commerceFiltersSchema = z
  .object({
    minPrice: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/)
      .optional(),
    maxPrice: z
      .string()
      .regex(/^\d{1,12}(\.\d{1,6})?$/)
      .optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    category: z.string().max(200).optional(),
    collectionId: z.string().max(200).optional(),
    variantId: z.string().max(200).optional(),
    availability: z
      .enum(["available", "out_of_stock", "not_tracked", "unknown"])
      .optional(),
  })
  .strict();
export const commerceAnnotationSchema = z
  .object({
    aiGuidance: z.string().max(1500).nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    merchantTags: z.array(z.string().max(40)).max(20).optional(),
  })
  .strict();
export type CommerceFilters = z.infer<typeof commerceFiltersSchema>;
export type CommerceVariant = {
  id: string;
  externalId: string;
  title: string;
  sku: string | null;
  options: unknown;
  price: string | null;
  compareAtPrice: string | null;
  currency: string | null;
  tracked: boolean | null;
  quantity: number | null;
  inventoryPolicy: string | null;
  availableForSale: boolean | null;
  requiresComponents: boolean;
  verifiedAt: Date | string;
  availability?: string;
};
export type CommerceProduct = {
  id: string;
  userId: string;
  sourceId: string;
  externalId: string;
  title: string;
  description: string;
  productType: string | null;
  vendor: string | null;
  status: string;
  published: boolean;
  productUrl: string | null;
  aiGuidance: string | null;
  notes: string | null;
  merchantTags: unknown;
  syncedAt: Date | string;
  freshness: string;
  variantCount: number;
  minPrice: string | null;
  maxPrice: string | null;
  currency: string | null;
  variants: CommerceVariant[];
  images: Array<{ url: string; altText: string | null }>;
  collections: Array<{ id: string; title: string }>;
};
export function variantAvailability(
  variant: Pick<
    CommerceVariant,
    | "tracked"
    | "quantity"
    | "inventoryPolicy"
    | "availableForSale"
    | "requiresComponents"
    | "verifiedAt"
  >,
  input: { published: boolean; sourceHealthy: boolean; now?: number },
): string {
  if (!input.published) return "not_published";
  if (
    !input.sourceHealthy ||
    !Number.isFinite(new Date(variant.verifiedAt).getTime()) ||
    (input.now ?? Date.now()) - new Date(variant.verifiedAt).getTime() >
      CATALOG_FRESH_MS
  )
    return "stale";
  if (variant.availableForSale === null || variant.requiresComponents)
    return "unknown";
  if (!variant.availableForSale) return "out_of_stock";
  if (variant.tracked === false) return "not_tracked";
  if (variant.tracked === null) return "unknown";
  if (variant.inventoryPolicy === "CONTINUE") return "available";
  return variant.quantity === null
    ? "unknown"
    : variant.quantity > 0
      ? "available"
      : "out_of_stock";
}
export function verifiedProductUrl(
  raw: unknown,
  allowedHosts: string[],
): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      allowedHosts.includes(url.hostname.toLowerCase())
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function catalogSearchTerms(message: string): string {
  const stop = new Set(
    "do you have this that item product products recommend which what how much does specific cost sizes size available availability is it in stock under over between and the a an please me show would can for i want buy to of color colour cuanto tienes precio producto productos en de el la hay azul talla comprar".split(
      " ",
    ),
  );
  return message
    .toLowerCase()
    .replace(/(?:[$€£₪]|\b(?:usd|eur|ils))\s*\d+(?:\.\d+)?/g, " ")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((t) => t && !stop.has(t) && !/^\d+$/.test(t))
    .slice(0, 12)
    .join(" ");
}
