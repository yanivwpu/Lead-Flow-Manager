import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

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

export function registerMediaRoutes(app: Express): void {
  const uploadDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
      },
    }),
    limits: { fileSize: 16 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES[file.mimetype]) {
        cb(null, true);
      } else {
        cb(new Error("Unsupported file type. Allowed: JPEG, PNG, WebP, PDF, MP3, M4A, OGG, MP4"));
      }
    },
  });

  app.post("/api/media/upload", upload.single("file"), async (req: any, res) => {
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

      const mediaUrl = `${appUrl}/uploads/${path.basename(req.file.path)}`;
      const mediaType = ALLOWED_MIME_TYPES[req.file.mimetype] || "document";

      console.log(
        `[MediaUpload] userId=${req.user.id} file=${req.file.originalname} ` +
        `size=${req.file.size} mime=${req.file.mimetype} url=${mediaUrl}`
      );

      return res.json({
        mediaUrl,
        mediaType,
        mediaFilename: req.file.originalname,
        mimeType: req.file.mimetype,
      });
    } catch (error: any) {
      if (req.file && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch {}
      }
      console.error("[MediaUpload] Error:", error);
      return res.status(500).json({ error: error.message || "Upload failed" });
    }
  });
}
