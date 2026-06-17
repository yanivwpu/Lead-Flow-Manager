import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { getPublicListingFlyerData } from "../inventory/inventoryDb";
import {
  backfillFlyerColumnsForListingId,
  listingNeedsFlyerColumnBackfill,
} from "../inventory/inventoryFlyerBackfill";
import {
  buildPublicListingFlyerHtml,
  buildPublicListingLoadErrorHtml,
  buildPublicListingNotFoundHtml,
  inventoryRowToFlyerListing,
} from "@shared/inventory/publicListingFlyer";
import { isListingShareUuid } from "@shared/inventory/listingPublicSlug";
import { getRequestOrigin } from "../urlOrigins";
import { requirePublicListingSchemaReady } from "../middleware/requirePublicListingSchemaReady";

function logPublicListingShare(event: string, payload: Record<string, unknown>): void {
  console.info(JSON.stringify({ tag: "[public-listing:share]", event, ...payload }));
}

// Direct-share URLs resolve when MLS compliance passes; indexing requires explicit publish.
export function registerPublicListingRoutes(app: Express): void {
  app.get("/share/listings/:identifier", requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    const identifier = req.params.identifier?.trim() ?? "";
    const appOrigin = getRequestOrigin(req);
    const startedAt = Date.now();

    logPublicListingShare("request_start", {
      identifier,
      identifierType: isListingShareUuid(identifier) ? "uuid" : "slug",
      appOrigin,
    });

    try {
      let flyerData = await getPublicListingFlyerData(identifier, appOrigin);
      logPublicListingShare("flyer_data_loaded", {
        identifier,
        found: !!flyerData,
        listingId: flyerData?.listing.id ?? null,
        publicSlug: flyerData?.listing.publicSlug ?? null,
        ms: Date.now() - startedAt,
      });

      if (flyerData && listingNeedsFlyerColumnBackfill(flyerData.listing)) {
        logPublicListingShare("flyer_backfill_start", { identifier, listingId: flyerData.listing.id });
        const repaired = await backfillFlyerColumnsForListingId(flyerData.listing.id);
        if (repaired) {
          flyerData = await getPublicListingFlyerData(identifier, appOrigin);
          logPublicListingShare("flyer_backfill_done", {
            identifier,
            listingId: flyerData?.listing.id ?? null,
          });
        }
      }

      if (!flyerData) {
        logPublicListingShare("not_found", {
          identifier,
          ms: Date.now() - startedAt,
          note: "No active/coming_soon row in inventory_listings for uuid or public_slug",
        });
        res.status(404).type("html").send(buildPublicListingNotFoundHtml());
        return;
      }

      const qrDataUrl = await QRCode.toDataURL(flyerData.shareUrl, {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
      });

      const html = buildPublicListingFlyerHtml({
        listing: inventoryRowToFlyerListing(flyerData.listing),
        agent: flyerData.agent,
        shareUrl: flyerData.shareUrl,
        qrDataUrl,
        companyLogoUrl: flyerData.companyLogoUrl,
        allowSearchIndexing: flyerData.indexedPublicListing,
      });

      logPublicListingShare("render_ok", {
        identifier,
        listingId: flyerData.listing.id,
        ms: Date.now() - startedAt,
      });
      res.type("html").send(html);
    } catch (error) {
      console.error(
        JSON.stringify({
          tag: "[public-listing:share]",
          event: "render_failed",
          identifier,
          ms: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : undefined,
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
      res.status(500).type("html").send(buildPublicListingLoadErrorHtml());
    }
  });
}
