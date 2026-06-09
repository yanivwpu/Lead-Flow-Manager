import type { Express, Request, Response } from "express";
import { getPublicShareListing } from "../inventory/inventoryDb";
import { pickPrimaryPhotoUrl } from "@shared/inventory/listingViewUrl";
import { formatListingPriceForComposer, formatBedsBathsForComposer } from "@shared/inventory/inventoryComposerDraft";

function parsePhotos(raw: unknown): { url: string; order?: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { url?: unknown; order?: unknown };
      if (typeof row.url !== "string" || !/^https?:\/\//i.test(row.url)) return null;
      return { url: row.url, order: typeof row.order === "number" ? row.order : idx };
    })
    .filter(Boolean) as { url: string; order?: number }[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderSharePage(listing: NonNullable<Awaited<ReturnType<typeof getPublicShareListing>>>): string {
  const photos = parsePhotos(listing.photos);
  const photo = pickPrimaryPhotoUrl(photos);
  const price = formatListingPriceForComposer(listing.priceCents) || "Price on request";
  const bedsBaths = formatBedsBathsForComposer(
    listing.beds != null ? Number(listing.beds) : null,
    listing.baths != null ? Number(listing.baths) : null,
  );
  const location = [listing.city, listing.state].filter(Boolean).join(", ");
  const title = location || "Property listing";
  const description = (listing.description || "").trim().slice(0, 500);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
    img { width: 100%; border-radius: 12px; object-fit: cover; max-height: 360px; background: #e2e8f0; }
    h1 { font-size: 1.35rem; margin: 16px 0 4px; }
    .price { font-size: 1.25rem; font-weight: 600; margin: 0 0 8px; }
    .meta { color: #475569; margin: 0 0 12px; }
    .desc { line-height: 1.5; color: #334155; white-space: pre-wrap; }
  </style>
</head>
<body>
  <main>
    ${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(title)}" />` : ""}
    <h1>${escapeHtml(title)}</h1>
    <p class="price">${escapeHtml(price)}</p>
    ${bedsBaths ? `<p class="meta">${escapeHtml(bedsBaths)}</p>` : ""}
    ${description ? `<p class="desc">${escapeHtml(description)}</p>` : ""}
  </main>
</body>
</html>`;
}

export function registerPublicListingRoutes(app: Express): void {
  app.get("/share/listings/:id", async (req: Request, res: Response) => {
    try {
      const listing = await getPublicShareListing(req.params.id);
      if (!listing) {
        res.status(404).type("text/plain").send("Listing not found or no longer available.");
        return;
      }
      res.type("html").send(renderSharePage(listing));
    } catch (error) {
      console.error("[public-listing] share page", error);
      res.status(500).type("text/plain").send("Unable to load listing.");
    }
  });
}
