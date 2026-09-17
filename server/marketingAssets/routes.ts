/**
 * Workspace Marketing Materials API.
 * Authenticated CRUD + byte-sniffed upload. Never returns R2 keys or private credentials.
 */

import type { Express, Request, Response } from "express";
import multer from "multer";
import {
  inspectMarketingAssetBuffer,
  marketingAssetUploadErrorMessage,
  parseMarketingAssetWrite,
  sanitizeMarketingFilename,
} from "@shared/marketingAssets";
import { WEBCHAT_PDF_MAX_BYTES, webchatMediaDeliveryHeaders } from "@shared/webchatDocumentPolicy";
import { WEBCHAT_IMAGE_MAX_BYTES } from "@shared/webchatImagePolicy";
import { uploadOutboundUserMedia, readOwnedStoredMedia, deleteOwnedStoredMedia } from "../mediaStorageService";
import { requireMarketingAssetsAdmin } from "./assetAccess";
import {
  createMarketingAsset,
  getMarketingAsset,
  listMarketingAssets,
  softDeleteMarketingAsset,
  toMarketingAssetView,
  updateMarketingAsset,
} from "./assetStore";

const MULTER_MAX = Math.max(WEBCHAT_IMAGE_MAX_BYTES, WEBCHAT_PDF_MAX_BYTES);

function publicAsset(view: ReturnType<typeof toMarketingAssetView>) {
  return {
    ...view,
    fileUrl: `/api/marketing-assets/${view.id}/file`,
  };
}

export function registerMarketingAssetRoutes(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MULTER_MAX },
    fileFilter: (_req, file, cb) => {
      const type = (file.mimetype || "").split(";")[0].trim().toLowerCase();
      if (
        type === "image/jpeg" ||
        type === "image/jpg" ||
        type === "image/png" ||
        type === "image/webp" ||
        type === "application/pdf" ||
        type === "application/octet-stream" ||
        type === "binary/octet-stream" ||
        !type
      ) {
        cb(null, true);
      } else {
        cb(new Error(marketingAssetUploadErrorMessage("unsafe_type")));
      }
    },
  });

  app.get("/api/marketing-assets", async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketingAssetsAdmin(req, res);
      if (!auth) return;
      const assets = await listMarketingAssets(auth.workspaceUserId);
      res.json({ assets: assets.map(publicAsset) });
    } catch (error) {
      console.error("[MarketingAssets] list failed:", error);
      res.status(500).json({ error: "Failed to load marketing materials" });
    }
  });

  app.post(
    "/api/marketing-assets",
    (req: Request, res: Response, next) => {
      upload.single("file")(req, res, (err: unknown) => {
        if (err) {
          const multerErr = err as { code?: string; message?: string };
          if (multerErr.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              error: marketingAssetUploadErrorMessage("too_large", MULTER_MAX),
            });
          }
          return res.status(400).json({
            error: multerErr.message || marketingAssetUploadErrorMessage("unsafe_type"),
          });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const auth = await requireMarketingAssetsAdmin(req, res);
        if (!auth) return;
        const file = (req as Request & { file?: { buffer: Buffer; mimetype: string; originalname: string } }).file;
        if (!file?.buffer?.length) {
          return res.status(400).json({ error: marketingAssetUploadErrorMessage("empty") });
        }
        const inspected = inspectMarketingAssetBuffer(file.buffer, file.mimetype);
        if (!inspected.ok) {
          const status = inspected.reason === "too_large" ? 413 : 400;
          return res.status(status).json({
            error: marketingAssetUploadErrorMessage(inspected.reason, inspected.maxBytes),
          });
        }
        const meta = parseMarketingAssetWrite({
          displayName: req.body?.displayName || req.body?.name || file.originalname,
          description: req.body?.description,
          language: req.body?.language,
          topics: req.body?.topics || req.body?.tags,
          enabled: req.body?.enabled === "false" ? false : true,
        });
        if (!meta.ok) {
          return res.status(400).json({ error: meta.error });
        }
        let uploaded: { mediaUrl: string; mediaStorageKey: string } | null = null;
        try {
          uploaded = await uploadOutboundUserMedia({
            userId: auth.workspaceUserId,
            buffer: file.buffer,
            contentType: inspected.mime,
            originChannel: "marketing-assets",
          });
          const row = await createMarketingAsset({
            userId: auth.workspaceUserId,
            displayName: meta.data.displayName,
            description: meta.data.description,
            language: meta.data.language,
            topics: meta.data.topics,
            enabled: meta.data.enabled,
            kind: inspected.kind,
            mimeType: inspected.mime,
            originalFilename: sanitizeMarketingFilename(file.originalname, inspected.mime),
            mediaUrl: uploaded.mediaUrl,
            mediaStorageKey: uploaded.mediaStorageKey,
            mediaSize: file.buffer.length,
          });
          res.status(201).json({ asset: publicAsset(toMarketingAssetView(row)) });
        } catch (error) {
          if (uploaded) {
            await deleteOwnedStoredMedia({
              userId: auth.workspaceUserId,
              mediaUrl: uploaded.mediaUrl,
              mediaStorageKey: uploaded.mediaStorageKey,
            }).catch(() => false);
          }
          throw error;
        }
      } catch (error) {
        console.error("[MarketingAssets] upload failed:", error);
        res.status(500).json({ error: "Failed to upload marketing material" });
      }
    },
  );

  app.patch("/api/marketing-assets/:id", async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketingAssetsAdmin(req, res);
      if (!auth) return;
      const result = await updateMarketingAsset(auth.workspaceUserId, req.params.id, req.body);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json({ asset: publicAsset(toMarketingAssetView(result.row)) });
    } catch (error) {
      console.error("[MarketingAssets] update failed:", error);
      res.status(500).json({ error: "Failed to update marketing material" });
    }
  });

  app.delete("/api/marketing-assets/:id", async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketingAssetsAdmin(req, res);
      if (!auth) return;
      const result = await softDeleteMarketingAsset(auth.workspaceUserId, req.params.id);
      if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
      }
      res.json({ ok: true, asset: publicAsset(toMarketingAssetView(result.row)) });
    } catch (error) {
      console.error("[MarketingAssets] delete failed:", error);
      res.status(500).json({ error: "Failed to delete marketing material" });
    }
  });

  app.get("/api/marketing-assets/:id/file", async (req: Request, res: Response) => {
    try {
      const auth = await requireMarketingAssetsAdmin(req, res);
      if (!auth) return;
      const row = await getMarketingAsset(auth.workspaceUserId, req.params.id);
      if (!row || row.deletedAt || row.userId !== auth.workspaceUserId) {
        return res.status(404).json({ error: "Material not found" });
      }
      const stored = await readOwnedStoredMedia({
        userId: auth.workspaceUserId,
        mediaUrl: row.mediaUrl,
        mediaStorageKey: row.mediaStorageKey,
      });
      if (!stored) {
        return res.status(404).json({ error: "Material not found" });
      }
      const download = req.query.download === "1";
      const filename = sanitizeMarketingFilename(row.originalFilename, row.mimeType);
      const headers = webchatMediaDeliveryHeaders({
        mime: row.mimeType,
        filename,
        isDocument: row.kind === "document" || row.mimeType === "application/pdf",
        download,
      });
      for (const [name, value] of Object.entries(headers)) {
        res.setHeader(name, value);
      }
      return res.status(200).send(stored.buffer);
    } catch (error) {
      console.error("[MarketingAssets] file failed:", error);
      res.status(404).json({ error: "Material not found" });
    }
  });
}
