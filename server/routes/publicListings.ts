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
import { getRequestOrigin } from "../urlOrigins";

export function registerPublicListingRoutes(app: Express): void {
  app.get("/share/listings/:identifier", async (req: Request, res: Response) => {
    const identifier = req.params.identifier;
    const appOrigin = getRequestOrigin(req);

    try {
      let flyerData = await getPublicListingFlyerData(identifier, appOrigin);
      if (flyerData && listingNeedsFlyerColumnBackfill(flyerData.listing)) {
        const repaired = await backfillFlyerColumnsForListingId(flyerData.listing.id);
        if (repaired) {
          flyerData = await getPublicListingFlyerData(identifier, appOrigin);
        }
      }
      if (!flyerData) {
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
      });

      res.type("html").send(html);
    } catch (error) {
      console.error("[public-listing] share page failed", {
        identifier,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).type("html").send(buildPublicListingLoadErrorHtml());
    }
  });
}
