import type { Express } from "express";
import { and, eq } from "drizzle-orm";
import { aiSettings, conversations } from "@shared/schema";
import { shoppingSettings, shoppingSettingsSchema } from "@shared/shoppingAssistant";
import { requireWorkspaceOffersAdmin } from "../workspaceOffers/offerAccess";
import type { CatalogDb } from "../salesCatalog/commerceStore";
export function registerShoppingRoutes(app:Express,database:CatalogDb,entitled:(id:string)=>Promise<boolean>,authorize=requireWorkspaceOffersAdmin) {
 app.get("/api/ai/shopping-settings",async(req,res)=>{
  const auth=await authorize(req,res);if(!auth)return;
  res.set("Cache-Control","private, no-store");
  try {
   const [row]=await database.select({config:aiSettings.shoppingAssistant}).from(aiSettings).where(eq(aiSettings.userId,auth.workspaceUserId)).limit(1);
   res.json({settings:shoppingSettings(row?.config),entitled:await entitled(auth.workspaceUserId),checkoutReady:false});
  }catch {res.status(503).json({error:"Shopping settings unavailable"});}
 });
 app.patch("/api/ai/shopping-settings",async(req,res)=>{
  const auth=await authorize(req,res);if(!auth)return;
  const parsed=shoppingSettingsSchema.safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Invalid shopping settings; checkout requires owner review"});
  try {
   if(parsed.data.enabled&&!await entitled(auth.workspaceUserId))return res.status(403).json({error:"Pro with AI Brain is required"});
   // Lock the owner, not an untrusted request ID, to serialize first-time settings creation.
   await database.transaction(async tx=>{
    const {users}=await import("@shared/schema");
    await tx.select({id:users.id}).from(users).where(eq(users.id,auth.workspaceUserId)).for("update");
    const [row]=await tx.select({id:aiSettings.id}).from(aiSettings).where(eq(aiSettings.userId,auth.workspaceUserId)).limit(1);
    if(row)await tx.update(aiSettings).set({shoppingAssistant:parsed.data,updatedAt:new Date()}).where(and(eq(aiSettings.id,row.id),eq(aiSettings.userId,auth.workspaceUserId)));
    else await tx.insert(aiSettings).values({userId:auth.workspaceUserId,shoppingAssistant:parsed.data});
   });
   res.json({settings:parsed.data,checkoutReady:false});
  }catch {res.status(503).json({error:"Shopping settings unavailable"});}
 });
 app.get("/api/conversations/:id/shopping",async(req,res)=>{
  if(!req.user?.id)return res.status(401).json({error:"Unauthorized"});
  res.set("Cache-Control","private, no-store");
  try {
   const [row]=await database.select({state:conversations.shoppingState}).from(conversations).where(and(eq(conversations.id,req.params.id),eq(conversations.userId,req.user.id))).limit(1);
   if(!row)return res.status(404).json({error:"Not found"});
   const raw=row.state as Record<string,unknown>;
   // Do not expose leases, consumed message IDs, cached replies or future cart secrets.
   const {version,step,intent,choices,selected,quantity,updatedAt}=raw;
   res.json({state:{version,step,intent,choices,selected,quantity,updatedAt}});
  }catch {res.status(503).json({error:"Shopping activity unavailable"});}
 });
}
