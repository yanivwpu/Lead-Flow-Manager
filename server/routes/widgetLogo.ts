/**
 * POST /api/widget-settings/logo
 * Authenticated first-party widget logo upload. Stores a raster under uploads/
 * and returns { logoUrl: "/objects/uploads/..." } — never tenant media/ keys.
 */

import type { Express } from "express";
import multer from "multer";
import { WIDGET_LOGO_MAX_BYTES } from "@shared/webchatWidgetLogoUpload";
import { storeWidgetLogoRaster } from "../mediaStorageService";
import {
  buildWidgetLogoFilename,
  inspectWidgetLogoUpload,
  widgetLogoUploadAuth,
} from "../widgetLogoUpload";

export function registerWidgetLogoRoutes(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: WIDGET_LOGO_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const type = (file.mimetype || "").split(";")[0].trim().toLowerCase();
      if (type === "image/jpeg" || type === "image/jpg" || type === "image/png" || type === "image/webp") {
        cb(null, true);
      } else {
        cb(new Error("Logo must be a JPEG, PNG, or WebP file."));
      }
    },
  });

  app.post(
    "/api/widget-settings/logo",
    (req: any, res: any, next: any) => {
      upload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({ error: "Logo must be 5 MB or smaller." });
          }
          return res.status(400).json({ error: err.message || "Upload error" });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        const auth = widgetLogoUploadAuth(req.user);
        if (!auth.ok) {
          return res.status(auth.status).json({ error: auth.error });
        }
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }
        const inspected = inspectWidgetLogoUpload({
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        });
        if (!inspected.ok) {
          return res.status(inspected.status).json({ error: inspected.error });
        }
        const filename = buildWidgetLogoFilename(auth.userId, inspected.ext);
        const stored = await storeWidgetLogoRaster({
          buffer: req.file.buffer,
          mimeType: inspected.mime,
          filename,
        });
        return res.json({ logoUrl: stored.logoUrl });
      } catch (error: any) {
        console.error(
          `[WidgetLogo] Storage failure — userId=${req.user?.id}` +
            ` mime=${req.file?.mimetype}` +
            ` size=${req.file?.size}B` +
            ` error="${error?.message || "unknown"}"`,
        );
        return res.status(500).json({ error: "Upload failed" });
      }
    },
  );
}
