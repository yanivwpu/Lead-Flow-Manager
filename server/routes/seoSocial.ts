import type { Express, RequestHandler } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { findForbiddenPublicClaims } from "../../shared/seoPolicy";
import { SEO_SOCIAL_STARTERS, validateSeoSocialStarter } from "../seo/socialDraftStarters";

const CAMPAIGN_KEY = "starter-owner-review-oct-2026";
const SAFE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function nextDate(offset: number): string {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset + 1));
  return utc.toISOString().slice(0, 10);
}

/** Creates one initial editorial inventory, idempotently. Future AI-generated campaigns must use distinct keys. */
export async function seedSeoSocialDrafts(): Promise<void> {
  for (const item of SEO_SOCIAL_STARTERS) {
    if (!validateSeoSocialStarter(item) || findForbiddenPublicClaims(item.body).length) {
      throw new Error("A social starter failed public-claim validation");
    }
    await db.execute(sql`
      INSERT INTO seo_social_drafts
        (campaign_key,seed_key,channel,topic,target_keyword,destination_url,body,suggested_date)
      VALUES
        (${CAMPAIGN_KEY},${item.key},${item.channel},${item.topic},${item.keyword},
         ${item.destinationUrl},${item.body},${nextDate(item.day)}::date)
      ON CONFLICT (campaign_key,seed_key) DO NOTHING
    `);
  }
}

export function registerSeoSocialRoutes(app: Express, requireAdmin: RequestHandler): void {
  app.get("/api/admin/seo-intelligence/social-drafts", requireAdmin, async (_req, res) => {
    try {
      await seedSeoSocialDrafts();
      const result = await db.execute(sql`
        SELECT id::text,channel,topic,target_keyword AS "targetKeyword",destination_url AS "destinationUrl",
               body,suggested_date AS "suggestedDate",status,version,approved_version AS "approvedVersion"
        FROM seo_social_drafts ORDER BY suggested_date, CASE channel WHEN 'linkedin' THEN 0 WHEN 'facebook' THEN 1 ELSE 2 END, seed_key
        LIMIT 100
      `);
      res.setHeader("Cache-Control", "no-store");
      res.json({ items: result.rows, publicationEnabled: false, kind: "curated_starter_drafts" });
    } catch (error) {
      console.error("[SEO Social] draft queue unavailable", error instanceof Error ? error.message : "unknown");
      res.status(503).json({ error: "Social draft review is temporarily unavailable" });
    }
  });

  app.patch("/api/admin/seo-intelligence/social-drafts/:id", requireAdmin, async (req, res) => {
    const id = String(req.params.id ?? "");
    const version = req.body?.expectedVersion;
    const action = req.body?.action;
    if (!SAFE_UUID.test(id) || !Number.isSafeInteger(version) || version < 1 ||
        !["edit", "approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid draft review operation" });
    }

    try {
      let changed;
      if (action === "edit") {
        const body = req.body?.body;
        if (typeof body !== "string" || body.trim().length < 60 || body.length > 1800 ||
            findForbiddenPublicClaims(body).length) {
          return res.status(400).json({ error: "Draft needs 60–1800 characters and supported product claims" });
        }
        changed = await db.execute(sql`
          UPDATE seo_social_drafts
          SET body=${body.trim()},status='needs_review',version=version+1,
              approved_version=NULL,approved_at=NULL,updated_at=NOW()
          WHERE id=${id}::uuid AND version=${version} RETURNING id,version,status
        `);
      } else if (action === "approve") {
        changed = await db.execute(sql`
          UPDATE seo_social_drafts
          SET status='approved',approved_version=version,approved_at=NOW(),updated_at=NOW()
          WHERE id=${id}::uuid AND version=${version} AND status='needs_review'
          RETURNING id,version,status
        `);
      } else {
        changed = await db.execute(sql`
          UPDATE seo_social_drafts
          SET status='rejected',approved_version=NULL,approved_at=NULL,updated_at=NOW()
          WHERE id=${id}::uuid AND version=${version} AND status='needs_review'
          RETURNING id,version,status
        `);
      }
      if (!changed.rows.length) return res.status(409).json({ error: "Draft was changed or already reviewed; refresh the queue" });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ updated: true, draft: changed.rows[0], publicationEnabled: false });
    } catch {
      return res.status(503).json({ error: "Could not save social draft review" });
    }
  });
}
