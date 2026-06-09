import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { getPublicListingFlyerData } from "../inventory/inventoryDb";
import { buildListingShareUrl } from "@shared/inventory/listingViewUrl";
import {
  buildPublicListingFlyerHtml,
  buildPublicListingLoadErrorHtml,
  buildPublicListingNotFoundHtml,
  inventoryRowToFlyerListing,
} from "@shared/inventory/publicListingFlyer";
import { getRequestOrigin } from "../urlOrigins";

export function registerPublicListingRoutes(app: Express): void {
  app.get("/share/listings/:id", async (req: Request, res: Response) => {
    const listingId = req.params.id;
    const shareUrl = buildListingShareUrl(listingId, getRequestOrigin(req));

    try {
      const flyerData = await getPublicListingFlyerData(listingId, shareUrl);
      if (!flyerData) {
        res.status(404).type("html").send(buildPublicListingNotFoundHtml());
        return;
      }

      const qrDataUrl = await QRCode.toDataURL(shareUrl, {
        margin: 1,
        width: 240,
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
        listingId,
        shareUrl,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).type("html").send(buildPublicListingLoadErrorHtml());
    }
  });
}
