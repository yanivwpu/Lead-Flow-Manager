import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { createBacklinkReviewQueue, type BacklinkResearchRecord } from "../seo/backlinkResearch";
import type { Express, RequestHandler } from "express";

const states = new Set(["needs_review", "rejected", "approved_for_draft", "contacted", "link_verified", "closed"]);
const validKinds = new Set(["gsc_links_export", "manual_research", "partner_submission", "provider_export"]);
function parseRecord(input: unknown): BacklinkResearchRecord {
  if (!input || typeof input !== "object") throw new Error("Invalid record");
  const r = input as Record<string, unknown>;
  const required = ["sourceUrl", "targetUrl", "topic", "evidence", "sourceKind", "sourceReference", "intent", "placement", "contactPermission", "verifiedAt"];
  for (const key of required) if (typeof r[key] !== "string" || !String(r[key]).trim() || String(r[key]).length > 3000) throw new Error("Missing or excessive "+key);
  for (const key of ["sourceRelevant", "targetLive", "independentEditorialFit"]) if (typeof r[key] !== "boolean") throw new Error("Missing verification "+key);
  if (!validKinds.has(String(r.sourceKind))) throw new Error("Invalid source kind");
  if (!["existing_backlink","editorial_opportunity"].includes(String(r.intent))) throw new Error("Invalid link intent");
  if (!["shopify","realtor","whatsapp-crm","automation","other"].includes(String(r.topic))) throw new Error("Invalid topic");
  if (!["editorial","directory","partner","paid","unknown"].includes(String(r.placement))) throw new Error("Invalid placement");
  if (!["explicit","unknown","opted_out"].includes(String(r.contactPermission))) throw new Error("Invalid contact permission");
  const record = r as BacklinkResearchRecord;
  if (record.evidence.trim().length < 30 || record.sourceReference.trim().length < 6) throw new Error("Missing source evidence");
  return record;
}

export function registerSeoBacklinkRoutes(app: Express, requireAdmin: RequestHandler) {
  app.get("/api/admin/seo-intelligence/backlinks", requireAdmin, async (_req,res) => {
    try {
      const rows = await db.execute(sql`SELECT id, source_url AS "sourceUrl", target_url AS "targetUrl", source_host AS "sourceHost", topic, evidence, source_kind AS "sourceKind", source_reference AS "sourceReference", placement, intent, score, status, notes, created_at AS "createdAt", updated_at AS "updatedAt" FROM seo_backlink_opportunities ORDER BY CASE WHEN status='needs_review' THEN 0 ELSE 1 END, score DESC, created_at DESC LIMIT 200`);
      res.json({ items: rows.rows });
    } catch { res.status(503).json({error:"Backlink storage not ready"}); }
  });
  app.post("/api/admin/seo-intelligence/backlinks/import", requireAdmin, async (req,res) => {
    try {
      if (!Array.isArray(req.body?.records) || req.body.records.length < 1 || req.body.records.length > 100) return res.status(400).json({error:"Submit 1–100 verified research records"});
      const records = req.body.records.map(parseRecord);
      const reviewed = createBacklinkReviewQueue(records);
      let inserted = 0;
      for (const item of reviewed) {
        const record = item.record;
        const url = new URL(record.sourceUrl);
        const status = item.reviewStatus;
        const reasons = item.reasons.join(", ");
        const result = await db.execute(sql`INSERT INTO seo_backlink_opportunities(source_url,target_url,source_host,topic,evidence,source_kind,source_reference,placement,intent,score,status,notes)
          VALUES (${record.sourceUrl},${record.targetUrl},${url.hostname.toLowerCase()},${record.topic},${record.evidence},${record.sourceKind},${record.sourceReference},${record.placement},${record.intent},${item.score},${status},${reasons})
          ON CONFLICT(source_url,target_url) DO NOTHING RETURNING id`);
        inserted += result.rows.length;
      }
      res.json({ inserted, evaluated: reviewed.length, rejected: reviewed.filter(i=>i.reviewStatus==="rejected").length });
    } catch (error) { res.status(400).json({error:error instanceof Error?error.message:"Unable to import links"}); }
  });
  app.patch("/api/admin/seo-intelligence/backlinks/:id", requireAdmin, async (req,res) => {
    const status = req.body?.status;
    const notes = req.body?.notes;
    if (typeof status !== "string" || !states.has(status) || typeof notes !== "string" || notes.length > 2000) return res.status(400).json({error:"Invalid review update"});
    // No outreach action here: 'contacted' and 'link_verified' record externally verified outcomes only.
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({error:"Invalid identifier"});
    try {
      const result = await db.execute(sql`UPDATE seo_backlink_opportunities SET status=${status}, notes=${notes}, updated_at=now() WHERE id=${req.params.id} RETURNING id`);
      if (!result.rows.length) return res.status(404).json({error:"Opportunity not found"});
      res.json({updated:true});
    } catch {res.status(503).json({error:"Unable to update backlink review"});}
  });
}
