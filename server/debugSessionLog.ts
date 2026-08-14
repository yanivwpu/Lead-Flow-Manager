/**
 * Debug-mode session log sink (session 34aeaf).
 * Development-only — never register or write in production.
 */
import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";

const LOG_FILE = path.join(process.cwd(), "debug-34aeaf.log");

function isDebugSessionLogEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

export function appendDebug34aeafLog(payload: Record<string, unknown>): void {
  if (!isDebugSessionLogEnabled()) return;
  try {
    const line = JSON.stringify({
      sessionId: "34aeaf",
      timestamp: Date.now(),
      ...payload,
    });
    fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
  } catch {
    /* ignore */
  }
}

export function registerDebugSessionLogRoute(app: Express): void {
  if (!isDebugSessionLogEnabled()) return;
  app.post("/api/_debug/session-log", (req: Request, res: Response) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      appendDebug34aeafLog({
        source: "client",
        ...body,
      });
      res.status(204).end();
    } catch {
      res.status(204).end();
    }
  });
}
