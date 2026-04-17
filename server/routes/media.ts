/**
 * Outbound Media Upload
 * ---------------------
 * POST /api/media/upload  (authenticated)
 *
 * Accepts a single file up to 16 MB, validates its MIME type, derives a safe
 * extension from the MIME type (never from the original filename), and stores
 * the file in Replit Object Storage.  Returns a permanent public HTTPS URL
 * that Twilio and Meta can fetch without authentication.
 *
 * Storage strategy
 * ----------------
 * - PRIMARY (production):  Replit Object Storage via the GCS-compatible
 *   sidecar.  Files land at `PRIVATE_OBJECT_DIR/uploads/<filename>` and are
 *   served through the existing `/objects/*` Express proxy route, which
 *   requires NO session auth — any HTTP client can fetch the URL.
 *
 * - FALLBACK (local dev): When PRIVATE_OBJECT_DIR is not set (e.g. a bare
 *   Node.js dev environment without the Replit sidecar), files are written
 *   to `{cwd}/uploads/` and served from `/uploads/<filename>`.  These URLs
 *   are only reachable from the same machine and will NOT survive a restart,
 *   so this path must never be used in production.
 *
 * Supported MIME types (16 MB max each)
 * ---------------------------------------
 *  image/jpeg, image/png, image/webp → type "image"
 *  application/pdf                   → type "document"
 *  audio/mpeg, audio/m4a, audio/ogg  → type "audio"
 *  video/mp4                         → type "video"
 *
 * Response shape (unchanged — no downstream code needs to change)
 * ---------------------------------------------------------------
 *  { mediaUrl, mediaType, mediaFilename, mimeType }
 *
 * Legacy note
 * -----------
 * Historical outbound messages that point to /uploads/* URLs remain
 * readable via the static /uploads Express route.  Only new uploads use
 * /objects/*.
 */

import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

// ---------------------------------------------------------------------------
// MIME type → friendly media type
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg":        "image",
  "image/jpg":         "image",
  "image/png":         "image",
  "image/webp":        "image",
  "application/pdf":   "document",
  "audio/mpeg":        "audio",
  "audio/mp3":         "audio",
  "audio/m4a":         "audio",
  "audio/x-m4a":       "audio",
  "audio/ogg":         "audio",
  "audio/opus":        "audio",
  "video/mp4":         "video",
};

// MIME type → safe file extension (never trust the original filename extension)
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg":        ".jpg",
  "image/jpg":         ".jpg",
  "image/png":         ".png",
  "image/webp":        ".webp",
  "application/pdf":   ".pdf",
  "audio/mpeg":        ".mp3",
  "audio/mp3":         ".mp3",
  "audio/m4a":         ".m4a",
  "audio/x-m4a":       ".m4a",
  "audio/ogg":         ".ogg",
  "audio/opus":        ".ogg",
  "video/mp4":         ".mp4",
};

// ---------------------------------------------------------------------------
// Storage helper
// ---------------------------------------------------------------------------
interface UploadResult {
  mediaUrl: string;
  storedOn: "object-storage" | "local-disk";
}

async function uploadMediaBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
  appUrl: string
): Promise<UploadResult> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (privateObjectDir) {
    // Object Storage path (production)
    // PRIVATE_OBJECT_DIR = "/replit-objstore-<id>/.private"
    const dirParts = privateObjectDir.split("/").filter(Boolean);
    const bucketName = dirParts[0];
    const prefix = dirParts.slice(1).join("/"); // ".private"
    const objectName = `${prefix}/uploads/${filename}`; // ".private/uploads/123.jpg"

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType: mimeType,
      metadata: { "Cache-Control": "public, max-age=31536000" },
    });

    // /objects/ is served by the existing Express proxy without any auth check.
    // Twilio and Meta can GET this URL directly without any credentials.
    const mediaUrl = `${appUrl}/objects/uploads/${filename}`;
    return { mediaUrl, storedOn: "object-storage" };
  }

  // Local disk fallback — dev only, not production-safe
  console.warn(
    "[MediaUpload] PRIVATE_OBJECT_DIR not set — falling back to local disk. " +
    "This is fine for local development but files will NOT survive a restart."
  );
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  const mediaUrl = `${appUrl}/uploads/${filename}`;
  return { mediaUrl, storedOn: "local-disk" };
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------
export function registerMediaRoutes(app: Express): void {
  // Memory storage — no bytes touch local disk in the multer layer
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new Error(
          `Unsupported file type: ${file.mimetype}. ` +
          "Allowed: JPEG, PNG, WebP, PDF, MP3, M4A, OGG, MP4"
        ));
      }
    },
  });

  app.post(
    "/api/media/upload",
    // Inline multer error handler so size/type errors return clean JSON
    (req: any, res: any, next: any) => {
      upload.single("file")(req, res, (err: any) => {
        if (err) {
          if (err.code === "LIMIT_FILE_SIZE") {
            console.warn(`[MediaUpload] Rejected — file too large: ${req.headers["content-length"]} bytes`);
            return res.status(413).json({ error: "File too large. Maximum size is 16 MB." });
          }
          console.warn(`[MediaUpload] Multer rejection: ${err.message}`);
          return res.status(400).json({ error: err.message || "Upload error" });
        }
        next();
      });
    },
    async (req: any, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        if (!req.file) {
          return res.status(400).json({ error: "No file provided" });
        }

        // Build base URL — prefer explicit APP_URL, fall back to Replit domain
        const appUrl =
          process.env.APP_URL ||
          `https://${(process.env.REPLIT_DOMAINS || "").split(",")[0]}`;

        const ext = MIME_TO_EXT[req.file.mimetype] || ".bin";
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        const mediaType = ALLOWED_MIME_TYPES[req.file.mimetype] || "document";

        const { mediaUrl, storedOn } = await uploadMediaBuffer(
          req.file.buffer,
          req.file.mimetype,
          filename,
          appUrl
        );

        console.log(
          `[MediaUpload] OK — userId=${req.user.id}` +
          ` originalName="${req.file.originalname}"` +
          ` storedAs="${filename}"` +
          ` mime=${req.file.mimetype}` +
          ` size=${req.file.size}B` +
          ` backend=${storedOn}` +
          ` url=${mediaUrl}`
        );

        return res.json({
          mediaUrl,
          mediaType,
          mediaFilename: req.file.originalname,
          mimeType: req.file.mimetype,
        });
      } catch (error: any) {
        // Log full error detail — never log req.user credentials
        console.error(
          `[MediaUpload] Storage failure — userId=${req.user?.id}` +
          ` mime=${req.file?.mimetype}` +
          ` size=${req.file?.size}B` +
          ` error="${error.message}"` +
          ` backend=${process.env.PRIVATE_OBJECT_DIR ? "object-storage" : "local-disk"}`
        );
        return res.status(500).json({ error: error.message || "Upload failed" });
      }
    }
  );
}
