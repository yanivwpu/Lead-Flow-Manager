import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

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

// Derive a safe extension from the MIME type — never trust the original filename extension
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
// Storage helper — uploads buffer to object storage, returns a permanent URL.
// Falls back to local disk when PRIVATE_OBJECT_DIR is not configured.
// ---------------------------------------------------------------------------
interface UploadResult {
  mediaUrl: string;
  storedOn: "object-storage" | "local-disk";
}

async function uploadMediaBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string, // already safe (MIME-derived extension)
  appUrl: string
): Promise<UploadResult> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;

  if (privateObjectDir) {
    // ---- Object Storage path ------------------------------------------------
    // PRIVATE_OBJECT_DIR looks like: /replit-objstore-<id>/.private
    // Parse bucket + object name from it
    const dirParts = privateObjectDir.split("/").filter(Boolean);
    // dirParts[0] = bucket name, dirParts[1..] = prefix within bucket
    const bucketName = dirParts[0];
    const prefix = dirParts.slice(1).join("/"); // e.g. ".private"
    const objectName = `${prefix}/uploads/${filename}`; // e.g. ".private/uploads/123.jpg"

    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      contentType: mimeType,
      metadata: {
        "Cache-Control": "public, max-age=31536000",
      },
    });

    // The /objects/ route in the existing storage router serves any path under
    // PRIVATE_OBJECT_DIR without requiring auth — Twilio/Meta can fetch freely.
    const mediaUrl = `${appUrl}/objects/uploads/${filename}`;
    return { mediaUrl, storedOn: "object-storage" };
  }

  // ---- Local disk fallback (dev only) ---------------------------------------
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, buffer);
  const mediaUrl = `${appUrl}/uploads/${filename}`;
  return { mediaUrl, storedOn: "local-disk" };
}

// ---------------------------------------------------------------------------

export function registerMediaRoutes(app: Express): void {
  // Use memory storage — no disk writes in the multer layer
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WebP, PDF, MP3, M4A, OGG, MP4"));
      }
    },
  });

  app.post("/api/media/upload", (req: any, res: any, next: any) => {
    upload.single("file")(req, res, (err: any) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ error: "File too large. Maximum size is 16 MB." });
        }
        return res.status(400).json({ error: err.message || "Upload error" });
      }
      next();
    });
  }, async (req: any, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

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
        `[MediaUpload] userId=${req.user.id} file=${req.file.originalname} ` +
        `size=${req.file.size} mime=${req.file.mimetype} storedOn=${storedOn} url=${mediaUrl}`
      );

      return res.json({
        mediaUrl,
        mediaType,
        mediaFilename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
    } catch (error: any) {
      console.error("[MediaUpload] Error:", error);
      return res.status(500).json({ error: error.message || "Upload failed" });
    }
  });
}
