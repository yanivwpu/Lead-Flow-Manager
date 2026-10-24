import type { RequestHandler } from "express";
import { ecommercePilotAccountMatches, isEcommercePilotOwner, type EcommercePilotEnv, type EcommercePilotOwner } from "./pilotAccess";

export function createEcommercePilotGuard(deps: {
  env: EcommercePilotEnv;
  getOwner: (id: string) => Promise<EcommercePilotOwner | undefined>;
}): RequestHandler {
  return async (req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" });
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    const accountId = (req.user as { id?: string }).id;
    if (!ecommercePilotAccountMatches(accountId, deps.env)) {
      res.status(404).json({ error: "Not available" }); return;
    }
    if (!["GET", "HEAD"].includes(req.method) &&
        (req.get("origin") !== "https://app.whachatcrm.com" ||
         req.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")) {
      res.status(403).json({ error: "Invalid origin or content type" }); return;
    }
    try {
      if (!isEcommercePilotOwner(await deps.getOwner(accountId), deps.env)) {
        res.status(404).json({ error: "Not available" }); return;
      }
      next();
    } catch { res.status(503).json({ error: "Pilot access unavailable" }); }
  };
}

