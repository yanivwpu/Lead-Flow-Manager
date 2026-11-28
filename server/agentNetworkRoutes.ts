import type { Express, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../drizzle/db";
import { requireAuth } from "./auth";
import { evaluateGrowthEngineAccess } from "./growthEngineEntitlements";
import { storage } from "./storage";

export const NETWORK_TERMS_VERSION = "2026-11-28-v1";
export async function ensureAgentNetworkSchema() {
  await db.execute(sql.raw("CREATE TABLE IF NOT EXISTS rge_network_members (\n user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,\n display_name text NOT NULL, brokerage text NOT NULL, country text NOT NULL, region text NOT NULL, city text NOT NULL,\n active boolean NOT NULL DEFAULT true, consent_version text NOT NULL, consent_at timestamptz NOT NULL DEFAULT now()\n);\nCREATE TABLE IF NOT EXISTS rge_network_referrals (\n id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n sender_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n recipient_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n sender_name text NOT NULL, recipient_name text NOT NULL, description text NOT NULL,\n proposed_percent numeric(5,2) CHECK (proposed_percent BETWEEN 0 AND 100),\n status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),\n created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz, sender_seen_at timestamptz,\n CHECK (sender_id <> recipient_id)\n);\nCREATE INDEX IF NOT EXISTS rge_network_referrals_sender_idx ON rge_network_referrals(sender_id,created_at DESC);\nCREATE INDEX IF NOT EXISTS rge_network_referrals_recipient_idx ON rge_network_referrals(recipient_id,created_at DESC);\n"));
}

const base = "/api/templates/realtor-growth-engine/network";
const field = z.string().trim().min(1).max(120);
const enrollment = z.object({displayName:field, brokerage:field, country:field, region:field, city:field, consent:z.literal(true), version:z.literal(NETWORK_TERMS_VERSION)}).strict();
const proposal = z.object({recipientId:z.string().min(1).max(100),description:z.string().trim().min(1).max(1500),proposedPercent:z.number().min(0).max(100).nullable()}).strict();
const response = z.object({status:z.enum(["accepted","declined"])}).strict();
async function eligible(id:string) {
  const user = await storage.getUser(id);
  if (!user || user.deletionRequestedAt) return false;
  const entitlement = await storage.getTemplateEntitlement(id,"realtor-growth-engine");
  return Boolean(entitlement && entitlement.status !== "locked" && (await evaluateGrowthEngineAccess(id,{readOnly:true})).ok);
}
async function active(id:string) {
  const r=await db.execute(sql`SELECT 1 FROM rge_network_members WHERE user_id=${id} AND active AND consent_version=${NETWORK_TERMS_VERSION}`);
  return r.rows.length>0;
}
type Handler = (req:Request,res:Response,id:string)=>Promise<unknown>;
function route(handler:Handler, access=true) {
  return async (req:Request,res:Response) => {
    try {
      const id=req.user?.id;
      res.set("Cache-Control","private, no-store");
      if (!id) return res.status(401).json({error:"unauthorized"});
      if(access && !(await eligible(id))) return res.status(403).json({error:"network_access_required"});
      await handler(req,res,id);
    } catch {
      res.status(500).json({error:"network_unavailable"});
    }
  };
}
export function registerAgentNetworkRoutes(app:Express) {
  app.get(base,requireAuth,route(async (_req,res,id)=>{
    const member=await db.execute(sql`SELECT display_name AS "displayName",brokerage,country,region,city,active,consent_version AS "version" FROM rge_network_members WHERE user_id=${id}`);
    const referrals=await db.execute(sql`SELECT id,sender_name AS "senderName",recipient_name AS "recipientName",description,proposed_percent AS "proposedPercent",status,created_at AS "createdAt",responded_at AS "respondedAt",sender_seen_at AS "senderSeenAt",sender_id=${id} AS outgoing FROM rge_network_referrals WHERE sender_id=${id} OR recipient_id=${id} ORDER BY created_at DESC LIMIT 200`);
    res.json({member:member.rows[0]??null,referrals:referrals.rows});
  }));
  app.put(base+"/membership",requireAuth,route(async(req,res,id)=>{
    const parsed=enrollment.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:"invalid_enrollment"});
    const v=parsed.data;
    await db.execute(sql`INSERT INTO rge_network_members(user_id,display_name,brokerage,country,region,city,consent_version) VALUES (${id},${v.displayName},${v.brokerage},${v.country},${v.region},${v.city},${v.version}) ON CONFLICT(user_id) DO UPDATE SET display_name=EXCLUDED.display_name,brokerage=EXCLUDED.brokerage,country=EXCLUDED.country,region=EXCLUDED.region,city=EXCLUDED.city,active=true,consent_version=EXCLUDED.consent_version,consent_at=CASE WHEN rge_network_members.active AND rge_network_members.consent_version=EXCLUDED.consent_version THEN rge_network_members.consent_at ELSE now() END`);
    res.json({ok:true});
  }));
  app.delete(base+"/membership",requireAuth,route(async(_req,res,id)=>{
    await db.execute(sql`UPDATE rge_network_members SET active=false WHERE user_id=${id}`);
    res.json({ok:true});
  },false));
  app.get(base+"/directory",requireAuth,route(async(req,res,id)=>{
    if(!await active(id))return res.status(403).json({error:"join_required"});
    const q=z.string().trim().max(120).catch("").parse(req.query.q??"");
    const rows=await db.execute(sql`SELECT user_id AS id,display_name AS "displayName",brokerage,country,region,city FROM rge_network_members WHERE active AND consent_version=${NETWORK_TERMS_VERSION} AND user_id<>${id} AND (position(lower(${q}) in lower(concat_ws(' ',display_name,brokerage,country,region,city)))>0 OR ${q}='') ORDER BY display_name LIMIT 100`);
    const visible=await Promise.all(rows.rows.map(async row=>await eligible(String(row.id))?row:null));
    res.json(visible.filter(Boolean));
  }));
  app.post(base+"/referrals",requireAuth,route(async(req,res,id)=>{
    const parsed=proposal.safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:"invalid_proposal"});
    const v=parsed.data;
    if(v.recipientId===id||!await active(id)||!await eligible(v.recipientId))return res.status(403).json({error:"recipient_unavailable"});
    const result=await db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`);
      const quota=await tx.execute(sql`SELECT count(*)::int AS count FROM rge_network_referrals WHERE sender_id=${id} AND created_at>now()-interval '24 hours'`);
      if(Number(quota.rows[0]?.count)>=20)return "limit";
      const inserted=await tx.execute(sql`INSERT INTO rge_network_referrals(sender_id,recipient_id,sender_name,recipient_name,description,proposed_percent) SELECT s.user_id,r.user_id,s.display_name,r.display_name,${v.description},${v.proposedPercent} FROM rge_network_members s CROSS JOIN rge_network_members r WHERE s.user_id=${id} AND r.user_id=${v.recipientId} AND s.active AND r.active AND s.consent_version=${NETWORK_TERMS_VERSION} AND r.consent_version=${NETWORK_TERMS_VERSION} RETURNING id`);
      return inserted.rows.length?"ok":"unavailable";
    });
    if(result!=="ok")return res.status(result==="limit"?429:409).json({error:result});
    res.status(201).json({ok:true});
  }));
  app.post(base+"/referrals/:id/respond",requireAuth,route(async(req,res,id)=>{
    const parsed=response.safeParse(req.body);
    const ref=z.string().uuid().safeParse(req.params.id);
    if(!parsed.success||!ref.success)return res.status(400).json({error:"invalid_response"});
    const updated=await db.execute(sql`UPDATE rge_network_referrals SET status=${parsed.data.status},responded_at=now(),sender_seen_at=null WHERE id=${ref.data}::uuid AND recipient_id=${id} AND status='pending' RETURNING id`);
    if(!updated.rows.length)return res.status(409).json({error:"response_unavailable"});
    res.json({ok:true});
  }));
  app.post(base+"/referrals/seen",requireAuth,route(async(_req,res,id)=>{
    await db.execute(sql`UPDATE rge_network_referrals SET sender_seen_at=now() WHERE sender_id=${id} AND responded_at IS NOT NULL AND sender_seen_at IS NULL`);
    res.json({ok:true});
  }));
}
