/**
 * Best-effort transcode to WhatsApp-friendly MP4 (H.264 + AAC, yuv420p, faststart).
 * Requires `ffmpeg-static` (bundled binary). If unavailable or ffmpeg errors, callers surface a friendly error.
 */

import { createRequire } from "module";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

let cachedFfmpegPath: string | null | undefined;

export function getBundledFfmpegPath(): string | null {
  if (cachedFfmpegPath !== undefined) return cachedFfmpegPath;
  try {
    const req = createRequire(import.meta.url);
    const mod = req("ffmpeg-static") as string | null | undefined;
    cachedFfmpegPath = typeof mod === "string" && mod.length > 0 ? mod : null;
  } catch {
    cachedFfmpegPath = null;
  }
  return cachedFfmpegPath;
}

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  const ffmpeg = getBundledFfmpegPath();
  if (!ffmpeg) {
    return Promise.resolve({ code: 127, stderr: "ffmpeg-static binary not available" });
  }
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8").slice(0, 4000);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stderr }));
    child.on("error", (err) => resolve({ code: 1, stderr: err.message }));
  });
}

/**
 * Transcode arbitrary video bytes to H.264/AAC MP4. Input format detected from container bytes.
 * @returns MP4 buffer or null if ffmpeg not installed / failed.
 */
export async function transcodeVideoBufferToWhatsAppMp4(input: Buffer): Promise<
  | { ok: true; buffer: Buffer }
  | { ok: false; message: string }
> {
  const ffmpeg = getBundledFfmpegPath();
  if (!ffmpeg) {
    return {
      ok: false,
      message: "Video transcoding is not available on this server (missing ffmpeg binary).",
    };
  }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wa-tpl-vid-"));
  const inPath = path.join(dir, "in.bin");
  const outPath = path.join(dir, "out.mp4");
  try {
    await fs.writeFile(inPath, input);
    const args = [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inPath,
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-level",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-f",
      "mp4",
      outPath,
    ];
    const { code, stderr } = await runFfmpeg(args);
    if (code !== 0) {
      const retryNoAudio = await runFfmpeg([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inPath,
        "-c:v",
        "libx264",
        "-profile:v",
        "baseline",
        "-level",
        "3.1",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-movflags",
        "+faststart",
        "-an",
        "-f",
        "mp4",
        outPath,
      ]);
      if (retryNoAudio.code !== 0) {
        return {
          ok: false,
          message: stderr.trim() || `ffmpeg exited with code ${code}`,
        };
      }
    }
    const out = await fs.readFile(outPath);
    if (!out.length) {
      return { ok: false, message: "ffmpeg produced an empty file." };
    }
    return { ok: true, buffer: out };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
