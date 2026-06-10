/**
 * Verify public listing SEO slug resolution for one listing.
 * Usage: npx tsx scripts/verify-listing-seo-slug.ts <listing-uuid>
 */
import "dotenv/config";
import {
  buildListingPublicSlug,
} from "../shared/inventory/listingPublicSlug";
import {
  buildListingCanonicalShareUrl,
} from "../shared/inventory/listingViewUrl";
import {
  buildListingSeoMeta,
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
} from "../shared/inventory/publicListingFlyer";
import {
  ensurePublicSlugForListing,
  getPublicListingFlyerData,
  resolvePublicShareListing,
} from "../server/inventory/inventoryDb";
import { getAppOrigin } from "../server/urlOrigins";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings } from "../shared/schema";

const listingId = (process.argv[2] || "").trim();
if (!listingId) {
  console.error("Usage: npx tsx scripts/verify-listing-seo-slug.ts <listing-uuid>");
  process.exit(1);
}

async function main() {
  const origin = getAppOrigin();

  const [row] = await db
    .select()
    .from(inventoryListings)
    .where(eq(inventoryListings.id, listingId))
    .limit(1);
  if (!row) throw new Error("listing not found");

  const expectedSlug = buildListingPublicSlug({
    id: row.id,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    zip: row.zip,
  });

  const slug = await ensurePublicSlugForListing(listingId);
  const byUuid = await resolvePublicShareListing(listingId);
  const bySlug = slug ? await resolvePublicShareListing(slug) : null;
  const flyerData = await getPublicListingFlyerData(listingId, origin);

  const canonical = flyerData
    ? buildListingCanonicalShareUrl(
        { listingId: flyerData.listing.id, publicSlug: flyerData.listing.publicSlug },
        origin,
      )
    : null;

  const html = flyerData
    ? buildPublicListingFlyerHtml({
        listing: inventoryRowToFlyerListing(flyerData.listing),
        agent: flyerData.agent,
        shareUrl: flyerData.shareUrl,
        qrDataUrl: "data:image/png;base64,TEST",
        companyLogoUrl: flyerData.companyLogoUrl,
      })
    : "";

  const seo = flyerData
    ? buildListingSeoMeta({
        listing: inventoryRowToFlyerListing(flyerData.listing),
        agent: flyerData.agent,
        shareUrl: flyerData.shareUrl,
      })
    : null;

  console.log(
    JSON.stringify(
      {
        listingId,
        expectedSlug,
        assignedSlug: slug,
        uuidLookupOk: byUuid?.id === listingId,
        slugLookupOk: bySlug?.id === listingId,
        canonicalUrl: canonical,
        shareUrlFromFlyerData: flyerData?.shareUrl,
        canonicalInHtml: canonical ? html.includes(`href="${canonical}"`) : false,
        seoTitle: seo?.title,
        uuidUrl: `${origin}/share/listings/${listingId}`,
        slugUrl: slug ? `${origin}/share/listings/${slug}` : null,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
