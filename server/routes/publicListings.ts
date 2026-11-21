import type { Express, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import QRCode from "qrcode";
import { getPublicListingFlyerData, getPublicShareListing } from "../inventory/inventoryDb";
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
import { buildListingCanonicalShareUrl, extractListingShareSegmentFromUrl } from "@shared/inventory/listingViewUrl";
import { getPublicListingAddressSlug } from "@shared/inventory/publicListingPublication";
import { publicAgentLeadBodySchema } from "@shared/agent/agentPageSchema";
import { getRequestOrigin } from "../urlOrigins";
import { requirePublicListingSchemaReady } from "../middleware/requirePublicListingSchemaReady";
import { hasAgentPagePublicationAccess } from "../agentPage/agentPagePublication";
import { processPublicListingLead } from "../agentPage/publicAgentPageLeadService";

const listingInquirySchema = publicAgentLeadBodySchema.pick({ name: true, email: true, phone: true, message: true });

function logPublicListingShare(event: string, payload: Record<string, unknown>): void {
  console.info(JSON.stringify({ tag: "[public-listing:share]", event, ...payload }));
}

// Direct-share URLs resolve when MLS compliance passes; indexing requires explicit publish.
export function registerPublicListingRoutes(app: Express): void {
  const viewLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
  const inquiryLimiter = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false,
    message: { error: "Too many inquiries. Please try again shortly." } });

  app.get("/share/listings/:identifier", viewLimiter, requirePublicListingSchemaReady, async (req: Request, res: Response) => {
    const identifier = req.params.identifier?.trim() ?? "";
    const appOrigin = getRequestOrigin(req);
    const startedAt = Date.now();
    // URL and rendered address eligibility can change on the next MLS sync.
    res.setHeader("Cache-Control", "no-store");

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

      if (isListingShareUuid(identifier)) {
        const canonicalSegment = extractListingShareSegmentFromUrl(flyerData.shareUrl);
        if (canonicalSegment && !isListingShareUuid(canonicalSegment) && canonicalSegment !== identifier) {
          logPublicListingShare("redirect_uuid_to_slug", {
            identifier,
            listingId: flyerData.listing.id,
            canonicalSegment,
          });
          res.redirect(302, flyerData.shareUrl);
          return;
        }
      }

      const qrDataUrl = await QRCode.toDataURL(flyerData.shareUrl, {
        margin: 1,
        width: 320,
        errorCorrectionLevel: "M",
      });
      const inquiryEnabled = await hasAgentPagePublicationAccess(flyerData.listing.userId).catch(() => false);

      const html = buildPublicListingFlyerHtml({
        listing: inventoryRowToFlyerListing(flyerData.listing),
        agent: flyerData.agent,
        shareUrl: flyerData.shareUrl,
        qrDataUrl,
        companyLogoUrl: flyerData.companyLogoUrl,
        allowSearchIndexing: flyerData.indexedPublicListing,
        inquiryPath: inquiryEnabled ? `/api/public/listings/${encodeURIComponent(flyerData.listing.id)}/leads` : undefined,
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

  app.post("/api/public/listings/:listingId/leads", inquiryLimiter, requirePublicListingSchemaReady, async (req, res) => {
    const { listingId } = req.params;
    if (!isListingShareUuid(listingId)) return res.status(404).json({ error: "This listing inquiry form is unavailable." });
    const parsed = listingInquirySchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Enter valid contact details." });

    try {
      const listing = await getPublicShareListing(listingId);
      if (!listing || !(await hasAgentPagePublicationAccess(listing.userId))) {
        return res.status(404).json({ error: "This listing inquiry form is unavailable." });
      }
      const publicSlug = getPublicListingAddressSlug(listing.publicSlug, listing.listingCompliance);
      const listingUrl = buildListingCanonicalShareUrl({ listingId: listing.id, publicSlug }, getRequestOrigin(req));
      const outcome = await processPublicListingLead(listing, listingUrl, parsed.data);
      if (!outcome.ok) return res.status(outcome.status).json({ error: outcome.error });
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("[public-listing] inquiry failed", error);
      return res.status(500).json({ error: "Unable to send inquiry." });
    }
  });
}
