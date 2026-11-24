/** Merchant-owned Shopify customers -> Prospect AI review-only links.
 * No Admin API customer export, additional Shopify grants, CRM customer creation,
 * AI qualification, conversation creation, email or messaging.
 * Source: customers already synchronized to the merchant's own WhachatCRM CRM.
 */
import crypto from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { contacts, integrations, prospectImportJobs, prospectImportPreviewJobs, prospectIntelligence, users, type Contact } from "@shared/schema";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { isShopifyContactInstallationActive } from "@shared/shopifyContactPrivacy";
import { linkedShopifyCustomerId } from "@shared/shopifyProspectCustomerGuard";
import { customerPrivacyLocked } from "../shopifyPrivacyRequests";
import { storage } from "../storage";
import { INCLUDE_INBOX_IDENTITIES } from "@shared/contactCrmVisibility";

const SOURCE = "shopify-existing-contacts";
const TTL_MS = 15 * 60_000;
const MAX_PREVIEW = 250;
const obj = (v:unknown):Record<string,unknown> =>
  v && typeof v==="object" && !Array.isArray(v) ? v as Record<string,unknown> : {};
const str = (v:unknown) => typeof v==="string" ? v : "";
export class ShopifyProspectImportError extends Error { constructor(message:string,public status=400){ super(message); } }
export type ShopifyProspectCustomerPreviewRow = {
  contactId:string; name:string; email:string|null; phone:string|null;
  emailConsent:"subscribed"|"unsubscribed"|"not_subscribed"|"pending"|"unknown";
  smsConsent:"subscribed"|"unsubscribed"|"not_subscribed"|"pending"|"unknown";
  alreadyInReview:boolean;
};
export type ShopifyProspectCustomerPreview = {
  previewJobId:string;fingerprint:string;shop:string;
  syncedTotal:number;shown:number;alreadyInReview:number;available:number;
  rows:ShopifyProspectCustomerPreviewRow[];
  expiresInMinutes:number;
};
function consentState(v:unknown):ShopifyProspectCustomerPreviewRow["emailConsent"] {
  const state = str(obj(v).state).toLowerCase();
  return ["subscribed","unsubscribed","not_subscribed","pending"].includes(state)
    ? state as ShopifyProspectCustomerPreviewRow["emailConsent"] : "unknown";
}
async function ownedShop(userId:string):Promise<string> {
  const [owner]=await db.select().from(users).where(eq(users.id,userId)).limit(1);
  if(!owner||!isShopifyContactInstallationActive(owner))
    throw new ShopifyProspectImportError("Connect an active Shopify store in this workspace first.",403);
  const shop=normalizeShopifyShopDomain(owner.shopifyShop);
  if(!shop)throw new ShopifyProspectImportError("Connected Shopify shop is invalid.",403);
  const [integration]=await db.select().from(integrations).where(and(
    eq(integrations.userId,userId),eq(integrations.type,"shopify"),eq(integrations.isActive,true)
  )).limit(1);
  const configuredShop=obj(integration?.config).shop;
  if(!integration || (configuredShop!=null && normalizeShopifyShopDomain(configuredShop)!==shop))
    throw new ShopifyProspectImportError("The Shopify connection needs to be restored in this workspace.",403);
  return shop;
}
export async function previewShopifyCustomers(userId:string,initiatedByUserId:string):Promise<ShopifyProspectCustomerPreview> {
  if(userId!==initiatedByUserId)throw new ShopifyProspectImportError("Shopify customer import must stay in the owning workspace.",403);
  const shop=await ownedShop(userId);
  const all=await storage.getContacts(userId,50000,INCLUDE_INBOX_IDENTITIES);
  const synced=all.filter(c=>linkedShopifyCustomerId(c,shop)).slice(0,1000);
  const candidate=synced.slice(0,MAX_PREVIEW);
  const existing=candidate.length?await db.select({contactId:prospectIntelligence.contactId}).from(prospectIntelligence)
    .where(inArray(prospectIntelligence.contactId,candidate.map(c=>c.id))):[];
  const already=new Set(existing.map(r=>r.contactId));
  const rows:ShopifyProspectCustomerPreviewRow[]=[];
  for(const contact of candidate){
    const customerId=linkedShopifyCustomerId(contact,shop);
    if(!customerId)continue;
    if(await customerPrivacyLocked(shop,{id:customerId,email:contact.email,phone:contact.phone})) continue;
    const snapshot=obj(obj(contact.customFields).shopifyCustomerSync);
    const consent=obj(snapshot.consent);
    rows.push({
      contactId:contact.id,name:contact.name,email:contact.email,phone:contact.phone,
      emailConsent:consentState(consent.email_marketing_consent),
      smsConsent:consentState(consent.sms_marketing_consent),
      alreadyInReview:already.has(contact.id),
    });
  }
  const fingerprint=crypto.createHash("sha256").update(JSON.stringify([userId,shop,rows.map(r=>r.contactId)])).digest("hex");
  // No name, email, phone or marketing state is duplicated into preview job storage.
  await db.delete(prospectImportPreviewJobs).where(and(
    eq(prospectImportPreviewJobs.integrationId,SOURCE),
    eq(prospectImportPreviewJobs.destinationUserId,userId),
    lt(prospectImportPreviewJobs.createdAt,new Date(Date.now()-TTL_MS))
  ));
  const [job]=await db.insert(prospectImportPreviewJobs).values({
    integrationId:SOURCE,locationId:shop,destinationUserId:userId,initiatedByUserId,
    filters:{reviewOnly:true},filterFingerprint:fingerprint,
    scanScope:String(synced.length),importLimit:MAX_PREVIEW,
    status:"completed",progressScanned:synced.length,progressTarget:synced.length,
    progressMatches:rows.length,scanComplete:synced.length<=MAX_PREVIEW,
    scanStoppedEarly:synced.length>MAX_PREVIEW,
    allMatchedExternalIds:rows.map(r=>r.contactId),
    matchedSnapshots:[],scannedAt:new Date(),completedAt:new Date(),
  }).returning({id:prospectImportPreviewJobs.id});
  return {previewJobId:job.id,fingerprint,shop,syncedTotal:synced.length,
    shown:rows.length,alreadyInReview:rows.filter(r=>r.alreadyInReview).length,
    available:rows.filter(r=>!r.alreadyInReview).length,rows,expiresInMinutes:15};
}
export type ShopifyProspectReviewImportResult = {
  id:string;status:"completed";provider:"shopify";batchName:string;
  imported:number;skipped:number;duplicates:number;errors:number;
  progressCurrent:number;progressTotal:number;
};
export async function importShopifyCustomers(input:{
  workspaceUserId:string;initiatedByUserId:string;
  previewJobId:string;fingerprint:string;selectedContactIds:string[];
  batchName:string;confirmReviewOnly:boolean;confirmMerchantAuthority:boolean;
}):Promise<ShopifyProspectReviewImportResult> {
  if(!input.confirmReviewOnly||!input.confirmMerchantAuthority)
    throw new ShopifyProspectImportError("Confirm merchant authority and review-only customer handling.");
  if(input.workspaceUserId!==input.initiatedByUserId)
    throw new ShopifyProspectImportError("Shopify import requires the owning workspace.",403);
  const name=str(input.batchName).trim();
  if(!name||name.length>120)throw new ShopifyProspectImportError("Enter a batch name up to 120 characters.");
  const chosen=[...new Set(input.selectedContactIds)];
  if(!chosen.length||chosen.length>MAX_PREVIEW||chosen.some(id=>!/^[-0-9a-f]{36}$/i.test(id)))
    throw new ShopifyProspectImportError("Select 1–250 customers from the preview.");
  const shop=await ownedShop(input.workspaceUserId);
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${shop},0))`);
    const [owner]=await tx.select().from(users).where(eq(users.id,input.workspaceUserId)).for("update").limit(1);
    if(!owner||!isShopifyContactInstallationActive(owner)||normalizeShopifyShopDomain(owner.shopifyShop)!==shop)
      throw new ShopifyProspectImportError("Shopify installation changed. Preview again.",403);
    const [preview]=await tx.select().from(prospectImportPreviewJobs).where(and(
      eq(prospectImportPreviewJobs.id,input.previewJobId),
      eq(prospectImportPreviewJobs.integrationId,SOURCE),
      eq(prospectImportPreviewJobs.destinationUserId,input.workspaceUserId),
      eq(prospectImportPreviewJobs.initiatedByUserId,input.initiatedByUserId),
      eq(prospectImportPreviewJobs.locationId,shop),
      eq(prospectImportPreviewJobs.status,"completed")
    )).for("update").limit(1);
    if(!preview||preview.filterFingerprint!==input.fingerprint||!preview.scannedAt ||
      Date.now()-preview.scannedAt.getTime()>TTL_MS)
      throw new ShopifyProspectImportError("Preview expired or changed. Preview Shopify customers again.");
    const allowed=new Set(Array.isArray(preview.allMatchedExternalIds)?preview.allMatchedExternalIds:[]);
    if(chosen.some(id=>!allowed.has(id)))throw new ShopifyProspectImportError("Selection doesn't match this store's preview.");
    const previous=await tx.select({id:prospectImportJobs.id}).from(prospectImportJobs).where(and(
      eq(prospectImportJobs.destinationUserId,input.workspaceUserId),eq(prospectImportJobs.previewJobId,preview.id)
    )).limit(1);
    if(previous.length)throw new ShopifyProspectImportError("This Shopify preview has already been imported.");
    const [job]=await tx.insert(prospectImportJobs).values({
      destinationUserId:input.workspaceUserId,initiatedByUserId:input.initiatedByUserId,
      provider:"shopify",batchName:name,importReason:"Merchant customer review only",
      sourceLocationId:shop,status:"running",
      filters:{reviewOnly:true},importOptions:{batchName:name,internalTag:"Imported-Shopify",
        skipDuplicates:true,updateMissingFieldsOnly:false},
      selectedExternalIds:chosen,previewTotal:allowed.size,previewJobId:preview.id,
      progressTotal:chosen.length,
    }).returning({id:prospectImportJobs.id});
    const found=await tx.select().from(contacts).where(and(
      eq(contacts.userId,input.workspaceUserId),inArray(contacts.id,chosen)
    )).for("update");
    const byId=new Map(found.map(c=>[c.id,c]));
    const existing=await tx.select({id:prospectIntelligence.contactId}).from(prospectIntelligence)
      .where(inArray(prospectIntelligence.contactId,chosen));
    const existingIds=new Set(existing.map(x=>x.id));
    let imported=0,skipped=0;
    const linkedIds:string[]=[];
    for(const id of chosen){
      const contact=byId.get(id);
      const customerId=contact&&linkedShopifyCustomerId(contact,shop);
      if(!contact||!customerId||existingIds.has(id)){skipped++;continue;}
      if(await customerPrivacyLocked(shop,{id:customerId,email:contact.email,phone:contact.phone},tx)){
        skipped++;continue;
      }
      const sd=obj(contact.sourceDetails);
      if(sd.prospectImportProvider||sd.prospectImport){skipped++;continue;}
      const meta={importJobId:job.id,batchName:name,importedAt:new Date().toISOString(),
        createdByImportJob:false,shopifyCustomerId:customerId,reviewOnly:true};
      await tx.insert(prospectIntelligence).values({
        contactId:id,importJobId:job.id,
        analysisStatus:"needs_review",reviewStatus:"needs_review",needsReview:true,
        rawResult:{shopifyCustomerReviewOnly:true},
      });
      await tx.update(contacts).set({
        sourceDetails:{...sd,prospectImportProvider:"shopify",prospectImport:meta}
      }).where(and(eq(contacts.id,id),eq(contacts.userId,input.workspaceUserId)));
      linkedIds.push(id);imported++;
    }
    await tx.update(prospectImportJobs).set({
      status:"completed",progressCurrent:chosen.length,resultImported:imported,
      resultSkipped:skipped,resultDuplicates:skipped,resultErrors:0,
      resultDetails:{linkedContactIds:linkedIds,createdContactIds:[],existingShopifyCustomers:true,reviewOnly:true},
      completedAt:new Date(),
    }).where(eq(prospectImportJobs.id,job.id));
    await tx.update(prospectImportPreviewJobs).set({
      allMatchedExternalIds:[],matchedSnapshots:[],previewResult:null
    }).where(eq(prospectImportPreviewJobs.id,preview.id));
    return {id:job.id,status:"completed" as const,provider:"shopify" as const,
      batchName:name,imported,skipped,duplicates:skipped,errors:0,
      progressCurrent:chosen.length,progressTotal:chosen.length};
  });
}
