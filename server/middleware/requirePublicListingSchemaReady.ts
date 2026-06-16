import type { Request, Response, NextFunction } from "express";
import { isPublicListingSchemaReady } from "../publicListingSchemaReady";

export function requirePublicListingSchemaReady(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isPublicListingSchemaReady()) {
    res.status(503).type("text/plain").send("Public listing schema not ready");
    return;
  }
  next();
}
