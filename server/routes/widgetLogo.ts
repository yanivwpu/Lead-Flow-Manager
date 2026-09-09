/**
 * POST /api/widget-settings/logo
 * Authenticated first-party widget logo upload. Stores a raster with the same
 * Inbox R2 helper (`uploadOutboundUserMedia` → `media/{tenant}/web-upload/`)
 * and returns { logoUrl: "/objects/uploads/..." }.
 */

import type { Express } from "express";
import multer from "multer";
import {
  WIDGET_LOGO_ERROR_CODE,
  WIDGET_LOGO_MAX_BYTES,
  publicWidgetLogoErrorMessage,
} from "@shared/webchatWidgetLogoUpload";
import {
  storeWidgetLogoRaster,
  WidgetLogoStorageUnavailableError,
} from "../mediaStorageService";
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
        cb(new Error(publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE)));
      }
    },
  });

  app.post(
    "/api/widget-settings/logo",
    (req: any, res: any, next: any) => {
      upload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.TOO_LARGE),
              code: WIDGET_LOGO_ERROR_CODE.TOO_LARGE,
            });
          }
          return res.status(400).json({
            error: err.message || publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.INVALID_TYPE),
            code: WIDGET_LOGO_ERROR_CODE.INVALID_TYPE,
          });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        const auth = widgetLogoUploadAuth(req.user);
        if (!auth.ok) {
          return res.status(auth.status).json({
            error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.UNAUTHORIZED),
            code: WIDGET_LOGO_ERROR_CODE.UNAUTHORIZED,
          });
        }
        if (!req.file) {
          return res.status(400).json({
            error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.NO_FILE),
            code: WIDGET_LOGO_ERROR_CODE.NO_FILE,
          });
        }
        const inspected = inspectWidgetLogoUpload({
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        });
        if (!inspected.ok) {
          return res.status(inspected.status).json({
            error: inspected.error,
            code: inspected.code || WIDGET_LOGO_ERROR_CODE.INVALID_TYPE,
          });
        }
        const filename = buildWidgetLogoFilename(auth.userId, inspected.ext);
        // #region agent log
        fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'D',location:'widgetLogo.ts:post',message:'logo handler after inspect',data:{mime:inspected.mime,ext:inspected.ext,bytes:req.file.size,filenameLen:filename.length},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const stored = await storeWidgetLogoRaster({
          buffer: req.file.buffer,
          mimeType: inspected.mime,
          filename,
          userId: auth.userId,
        });
        return res.json({ logoUrl: stored.logoUrl });
      } catch (error: any) {
        const unavailable = error instanceof WidgetLogoStorageUnavailableError;
        // #region agent log
        fetch('http://127.0.0.1:7388/ingest/30f90c73-9e82-48da-9aa8-296c7e653663',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'5b3c3c'},body:JSON.stringify({sessionId:'5b3c3c',hypothesisId:'D',location:'widgetLogo.ts:catch',message:'logo handler storage catch',data:{unavailable,errName:error?.name||'Error',code:error?.code||null},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        console.error(
          `[WidgetLogo] Storage failure — userId=${req.user?.id}` +
            ` mime=${req.file?.mimetype}` +
            ` size=${req.file?.size}B` +
            ` name=${error?.name || "Error"}`,
        );
        return res.status(unavailable ? 503 : 500).json({
          error: publicWidgetLogoErrorMessage(WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE),
          code: WIDGET_LOGO_ERROR_CODE.STORAGE_UNAVAILABLE,
        });
      }
    },
  );
}
