/**
 * POST /api/business-profile/logo
 * Authenticated first-party Business Profile logo upload.
 * Uses the same Inbox R2 helper as other tenant media (`uploadOutboundUserMedia`).
 */

import type { Express } from "express";
import multer from "multer";
import {
  BUSINESS_PROFILE_LOGO_ERROR_CODE,
  BUSINESS_PROFILE_LOGO_MAX_BYTES,
  publicBusinessProfileLogoErrorMessage,
} from "@shared/businessProfileLogo";
import {
  storeWidgetLogoRaster,
  WidgetLogoStorageUnavailableError,
} from "../mediaStorageService";
import {
  businessProfileLogoUploadAuth,
  inspectBusinessProfileLogoUpload,
} from "../businessProfileLogoUpload";

export function registerBusinessProfileLogoRoutes(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: BUSINESS_PROFILE_LOGO_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const type = (file.mimetype || "").split(";")[0].trim().toLowerCase();
      if (
        type === "image/jpeg" ||
        type === "image/jpg" ||
        type === "image/png" ||
        type === "image/webp" ||
        type === "application/octet-stream" ||
        type === "binary/octet-stream" ||
        !type
      ) {
        cb(null, true);
      } else {
        cb(new Error(publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE)));
      }
    },
  });

  app.post(
    "/api/business-profile/logo",
    (req: any, res: any, next: any) => {
      upload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE),
              code: BUSINESS_PROFILE_LOGO_ERROR_CODE.TOO_LARGE,
            });
          }
          return res.status(400).json({
            error: err.message || publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE),
            code: BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
          });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        const auth = businessProfileLogoUploadAuth(req.user);
        if (!auth.ok) {
          return res.status(auth.status).json({
            error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.UNAUTHORIZED),
            code: BUSINESS_PROFILE_LOGO_ERROR_CODE.UNAUTHORIZED,
          });
        }
        if (!req.file) {
          return res.status(400).json({
            error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE),
            code: BUSINESS_PROFILE_LOGO_ERROR_CODE.NO_FILE,
          });
        }
        const inspected = inspectBusinessProfileLogoUpload({
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        });
        if (!inspected.ok) {
          return res.status(inspected.status).json({
            error: inspected.error,
            code: inspected.code || BUSINESS_PROFILE_LOGO_ERROR_CODE.INVALID_TYPE,
          });
        }
        const stored = await storeWidgetLogoRaster({
          buffer: req.file.buffer,
          mimeType: inspected.mime,
          userId: auth.userId,
        });
        return res.json({ logoUrl: stored.logoUrl });
      } catch (error: unknown) {
        const unavailable = error instanceof WidgetLogoStorageUnavailableError;
        console.error("[business-profile] logo upload failed", error);
        return res.status(unavailable ? 503 : 500).json({
          error: publicBusinessProfileLogoErrorMessage(BUSINESS_PROFILE_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
          code: BUSINESS_PROFILE_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE,
        });
      }
    },
  );
}
