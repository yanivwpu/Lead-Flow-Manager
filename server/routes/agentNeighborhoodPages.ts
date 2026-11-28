import { Router, type Express, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { readCustomNeighborhoodBoundary } from "@shared/agent/neighborhoodCustomBoundary";
import { findNeighborhoodMapLocation } from "../agentPage/neighborhoodMapLocation";
import type { NeighborhoodMapLocation } from "../agentPage/neighborhoodMapLocation";
import type { PolygonBoundary } from "@shared/agent/neighborhoodListingGeo";
import { buildPublicAgentPageHtml } from "@shared/agent/publicAgentPageHtml";
import {
  buildNeighborhoodUrl, neighborhoodContentComplete,
  isOwnedNeighborhoodGuidePhotoUrl, NEIGHBORHOOD_GUIDE_MAX_PHOTOS,
  NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES,
} from "@shared/agent/neighborhoodPages";
import { inspectBusinessProfileLogoUpload } from "../businessProfileLogoUpload";
import { uploadOutboundUserMedia } from "../mediaStorageService";
import { findNeighborhoodListings } from "../agentPage/neighborhoodListings";
import { prepareWebchatVisitorImage } from "../webchatVisitorMedia";
import { canResolvePublicAgentPage } from "@shared/agent/publicAgentPage";
import { buildPublicAgentPageData } from "../agentPage/agentPageService";
import { getAgentPageSettingsRow } from "../agentPage/agentPageDb";
import { hasAgentPagePublicationAccess } from "../agentPage/agentPagePublication";
import { isAgentPageSlugConflictError } from "../agentPage/agentPageSettingsPatch";
import {
  createNeighborhoodPage, deleteNeighborhoodPage, getNeighborhoodPage,
  isPublishedNeighborhood, listNeighborhoodPages, updateNeighborhoodPage, type NeighborhoodPage,
} from "../agentPage/neighborhoodPages";
import { getAppOrigin } from "../urlOrigins";

const mapCenterQuery = z.object({
  name: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(60),
  country: z.string().trim().regex(/^[a-zA-Z]{2}$/),
});
const mapCenterCache = new Map<string, NeighborhoodMapLocation & { expires: number }>();
const mapCenterDailyQuota = new Map<string, { day: string; count: number }>();
let lastMapCenterLookup = 0;

const fields = z.object({
  name: z.string().trim().min(1).max(80).regex(/[\p{L}\p{N}]/u),
  city: z.string().trim().min(1).max(80).regex(/[\p{L}\p{N}]/u),
  state: z.string().trim().min(1).max(60).regex(/[\p{L}\p{N}]/u),
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).default("US"),
  publicLanguage: z.enum(["en", "he", "es"]).optional(),
  customBoundary: z.custom<PolygonBoundary>((value) => readCustomNeighborhoodBoundary(value) !== null)
    .transform((value) => readCustomNeighborhoodBoundary(value)!).nullable().optional(),
  content: z.string().trim().max(5000),
  photos: z.array(z.object({
    url: z.string().url().max(600),
    alt: z.string().trim().min(3).max(140),
  }).strict()).max(NEIGHBORHOOD_GUIDE_MAX_PHOTOS).optional(),
});

function settings(page: NeighborhoodPage, agentSlug: string | null) {
  const { id, name, city, state, country, publicLanguage, customBoundary, content, photos, slug, published, updatedAt } = page;
  return { id, name, city, state, country, publicLanguage, customBoundary, content, photos, slug, published, updatedAt: updatedAt.toISOString(), publicUrl: agentSlug && isPublishedNeighborhood(page)
    ? buildNeighborhoodUrl(agentSlug, slug, getAppOrigin()) : null };
}

function run(handler: (req: Request, res: Response, userId: string) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    if (!req.user) { res.sendStatus(401); return; }
    void handler(req, res, req.user.id).catch(next);
  };
}

export function registerAgentNeighborhoodPagesRoutes(app: Express): void {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: NEIGHBORHOOD_GUIDE_MAX_PHOTO_BYTES, files: 1 },
  });
  function ownedPhotos(userId: string, photos: Array<{ url: string; alt: string }> | undefined): boolean {
    return !photos || photos.every((photo) =>
      isOwnedNeighborhoodGuidePhotoUrl(photo.url, userId, process.env.CLOUDFLARE_R2_PUBLIC_URL));
  }
  function uploadOne(req: Request, res: Response, next: NextFunction): void {
    upload.single("file")(req, res, (error: unknown) => {
      if (error) {
        const e = error as { code?: string };
        res.status(e.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
          code: e.code === "LIMIT_FILE_SIZE" ? "imageSize" : "imageType",
          error: e.code === "LIMIT_FILE_SIZE" ? "Images must be 5 MB or smaller." : "Choose a JPG, PNG, or WebP image.",
        });
        return;
      }
      next();
    });
  }
  router.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    if (!req.user) { res.sendStatus(401); return; }
    void hasAgentPagePublicationAccess(req.user.id).then((allowed) => {
      if (allowed) next();
      else res.sendStatus(403);
    }).catch(next);
  });

  router.get("/", run(async (_req, res, userId) => {
    const [agent, pages] = await Promise.all([getAgentPageSettingsRow(userId), listNeighborhoodPages(userId)]);
    const liveSlug = agent && canResolvePublicAgentPage(agent) ? agent.agentPageSlug : null;
    res.json({ canPublish: Boolean(liveSlug), pages: pages.map((page) => settings(page, liveSlug)) });
  }));

  // Explicit click-to-locate only; never autocomplete or unbounded geocoding.
  // Reuse the platform's existing optional Google Places credential, without
  // exposing it to the browser or requiring a new map provider.
  router.get("/map-center", run(async (req, res, userId) => {
    const parsed = mapCenterQuery.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ code: "locationInvalid", error: "Enter a valid city, region and country first." });
    const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!key) return res.status(503).json({ code: "mapUnavailable", error: "Automatic map location is unavailable; enter map coordinates to center the map." });
    const { name, city, state, country } = parsed.data;
    const queryKey = [name, city, state, country].map((s) => s.toLowerCase()).join("|");
    const now = Date.now();
    const cached = mapCenterCache.get(queryKey);
    if (cached && cached.expires > now) return res.json({ latitude: cached.latitude, longitude: cached.longitude, precision: cached.precision });
    if (now - lastMapCenterLookup < 1000) return res.status(429).json({ code: "mapRetry", error: "Try locating again in a moment." });
    const day = new Date(now).toISOString().slice(0, 10);
    const usage = mapCenterDailyQuota.get(userId);
    if (usage?.day === day && usage.count >= 15) return res.status(429).json({ code: "mapLimit", error: "Daily map location limit reached. Enter coordinates manually." });
    if (mapCenterDailyQuota.size > 10000) mapCenterDailyQuota.clear();
    mapCenterDailyQuota.set(userId, { day, count: (usage?.day === day ? usage.count : 0) + 1 });
    lastMapCenterLookup = now;
    // Google Places and Geocoding APIs can have different enabled permissions.
    // Find an exact named geographic feature where available; otherwise return
    // the city only as an explicitly approximate starting point for map drawing.
    // Neither result is an official neighborhood boundary or MLS match.
    const resolved = await findNeighborhoodMapLocation({ name, city, state, country }, key);
    if (!resolved.location) {
      if (resolved.unavailable) {
        console.warn("[agent-neighborhoods] map-center provider unavailable (check Google Maps API permissions)");
        return res.status(503).json({
          code: "mapProvider", error: "Map search is temporarily unavailable. Check that Geocoding API or Places API (New) is enabled for the configured Google key, or center the map manually.",
        });
      }
      return res.status(404).json({
        code: "mapNotFound", error: "No matching neighborhood or city found. Verify the spelling and location, or center the map manually.",
      });
    }
    if (mapCenterCache.size > 2000) mapCenterCache.clear();
    mapCenterCache.set(queryKey, { ...resolved.location, expires: now + 7 * 24 * 3600000 });
    return res.json(resolved.location);
  }));

  router.post("/", run(async (req, res, userId) => {
    const parsed = fields.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "invalidPage", error: "Enter a neighborhood, city, state, and up to 5,000 characters of local content." });
    if (!ownedPhotos(userId, parsed.data.photos)) {
      return res.status(400).json({ code: "ownPhotos", error: "Choose photos uploaded to your own Neighborhood Page." });
    }
    if (parsed.data.photos?.length) return res.status(400).json({ code: "saveFirst", error: "Save the new neighborhood before uploading photos." });
    const page = await createNeighborhoodPage(userId, parsed.data);
    res.status(201).json(settings(page, null));
  }));

  router.put("/:id", run(async (req, res, userId) => {
    const parsed = fields.extend({ published: z.boolean(), expectedUpdatedAt: z.string().datetime().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ code: "invalidPage", error: "Enter a neighborhood, city, state, and up to 5,000 characters of local content." });
    if (!ownedPhotos(userId, parsed.data.photos)) {
      return res.status(400).json({ code: "ownPhotos", error: "Choose photos uploaded to your own Neighborhood Page." });
    }
    let liveSlug: string | null = null;
    if (parsed.data.published) {
      const agent = await getAgentPageSettingsRow(userId);
      if (!agent || !canResolvePublicAgentPage(agent)) return res.status(403).json({ code: "publishDisabled", error: "Enable your public Agent Page before publishing." });
      if (!neighborhoodContentComplete(parsed.data.content)) return res.status(400).json({ code: "publishIncomplete", error: "Add at least 240 characters of useful local information across two paragraphs, or one detailed paragraph with a section heading." });
      liveSlug = agent.agentPageSlug;
    }
    const id = String(req.params.id);
    const { expectedUpdatedAt, ...content } = parsed.data;
    const page = await updateNeighborhoodPage(userId, id, content, expectedUpdatedAt);
    if (!page) {
      if (expectedUpdatedAt && await getNeighborhoodPage(userId, id)) {
        return res.status(409).json({ code: "editConflict", error: "This page changed since you opened it. Review the saved version before editing again." });
      }
      return res.sendStatus(404);
    }
    res.json(settings(page, liveSlug));
  }));

  router.delete("/:id", run(async (req, res, userId) => {
    const version = z.string().datetime().optional().safeParse(req.query.expectedUpdatedAt);
    if (!version.success) return res.sendStatus(400);
    const id = String(req.params.id);
    if (await deleteNeighborhoodPage(userId, id, version.data)) return res.sendStatus(204);
    if (version.data && await getNeighborhoodPage(userId, id)) {
      return res.status(409).json({ code: "deleteConflict", error: "This page changed since you opened it. Review the saved version before deleting." });
    }
    res.sendStatus(404);
  }));

  // Owner-only, never indexable. Uploads are attached when the owner saves the page.
  router.post("/:id/photos", uploadOne, run(async (req, res, userId) => {
    const page = await getNeighborhoodPage(userId, String(req.params.id));
    if (!page) return res.sendStatus(404);
    if ((page.photos?.length ?? 0) >= NEIGHBORHOOD_GUIDE_MAX_PHOTOS) {
      return res.status(400).json({ code: "imageLimit", error: "Remove an existing photo before adding another." });
    }
    const file = (req as Request & { file?: {
      buffer: Buffer; originalname: string; mimetype: string; size: number;
    } }).file;
    if (!file?.buffer) return res.status(400).json({ code: "imageType", error: "Choose a JPG, PNG, or WebP image." });
    const checked = inspectBusinessProfileLogoUpload(file);
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });
    // Decode, constrain pixel dimensions, and strip metadata before placing photos on public pages.
    const prepared = await prepareWebchatVisitorImage({ buffer: file.buffer, declaredMime: checked.mime });
    if (!prepared.ok) return res.status(400).json({ code: "imageProcessing", error: "Could not process this image. Try a smaller JPG, PNG, or WebP." });
    // R2 is required: never put SEO photographs on Railway's ephemeral local disk.
    if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
        !process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || !process.env.CLOUDFLARE_R2_BUCKET ||
        !process.env.CLOUDFLARE_R2_PUBLIC_URL) {
      return res.status(503).json({ code: "imageStorage", error: "Photo storage is unavailable. Try again later." });
    }
    const stored = await uploadOutboundUserMedia({
      userId, buffer: prepared.buffer, contentType: prepared.mime,
      originChannel: "neighborhood-guide",
    });
    if (!isOwnedNeighborhoodGuidePhotoUrl(stored.mediaUrl, userId, process.env.CLOUDFLARE_R2_PUBLIC_URL)) {
      return res.status(503).json({ code: "imageVerification", error: "Could not verify the uploaded image. Try again." });
    }
    return res.status(201).json({ url: stored.mediaUrl });
  }));

  router.get("/:id/preview", run(async (req, res, userId) => {
    const [page, agent] = await Promise.all([getNeighborhoodPage(userId, String(req.params.id)), getAgentPageSettingsRow(userId)]);
    if (!page || !agent) return res.sendStatus(404);
    const data = await buildPublicAgentPageData(agent, getAppOrigin(), { profileOnly: true, preview: true });
    const neighborhoodListings = await findNeighborhoodListings({
      userId, neighborhood: page, appOrigin: getAppOrigin(), ownerPreview: true,
    });
    res.type("html").send(buildPublicAgentPageHtml({
      ...data, neighborhood: { ...page, parentUrl: canResolvePublicAgentPage(agent) ? data.pageUrl : "", preview: true },
      neighborhoodListings,
    }));
  }));

  router.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined;
    if (isAgentPageSlugConflictError(error) || (cause && isAgentPageSlugConflictError(cause))) {
      res.status(409).json({ code: "duplicateUrl", error: "You already have a neighborhood page with this URL." });
      return;
    }
    console.error("[agent-neighborhoods] settings failed", error);
    res.status(500).json({ code: "updateFailed", error: "Unable to update neighborhood pages." });
  });
  app.use("/api/agent-page/neighborhoods", router);
}
