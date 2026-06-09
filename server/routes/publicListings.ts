import type { Express, Request, Response } from "express";
import QRCode from "qrcode";
import { getPublicListingFlyerData } from "../inventory/inventoryDb";
import { buildListingShareUrl } from "@shared/inventory/listingViewUrl";
import {
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
} from "@shared/inventory/publicListingFlyer";
import { getRequestOrigin } from "../urlOrigins";

export function registerPublicListingRoutes(app: Express): void {
  app.get("/share/listings/:id", async (req: Request, res: Response) => {
    try {
      const shareUrl = buildListingShareUrl(req.params.id, getRequestOrigin(req));
      const flyerData = await getPublicListingFlyerData(req.params.id, shareUrl);
      if (!flyerData) {
        res.status(404).type("text/plain").send("Listing not found or no longer available.");
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
      });

      res.type("html").send(html);
    } catch (error) {
      console.error("[public-listing] share page", error);
      res.status(500).type("text/plain").send("Unable to load listing.");
    }
  });
}
