import { and, eq, inArray, sql } from "drizzle-orm";
import type { Contact } from "@shared/schema";
import { contacts, conversations, messages, prospectImportJobs, prospectIntelligence, type ProspectImportJob } from "@shared/schema";
import type {
  ProspectImportPipelineStage,
  ProspectImportUndoPreview,
} from "@shared/prospectImport";
import { db } from "../../drizzle/db";
import { storage } from "../storage";

const BLOCKED_STAGES = new Set<ProspectImportPipelineStage>(["Customer", "Partner"]);

type ProspectImportMeta = {
  importJobId?: string;
  createdByImportJob?: boolean;
};

function readProspectImportMeta(contact: Contact): ProspectImportMeta | null {
  const sd = (contact.sourceDetails || {}) as Record<string, unknown>;
  const fromSource = sd.prospectImport as ProspectImportMeta | undefined;
  if (fromSource?.importJobId) return fromSource;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const fromCustom = cf.prospectImport as ProspectImportMeta | undefined;
  return fromCustom?.importJobId ? fromCustom : null;
}

export function getContactsCreatedByImportJob(allContacts: Contact[], jobId: string): Contact[] {
  return allContacts.filter((c) => {
    const meta = readProspectImportMeta(c);
    if (!meta || meta.importJobId !== jobId) return false;
    if (meta.createdByImportJob === false) return false;
    if (meta.createdByImportJob === true) return true;
    return c.source === "import";
  });
}

/** A Shopify import links EXISTING merchant customers; Undo unlinks the Prospect AI
 * review record only. It must NEVER delete the merchant's customer/contact/messages.
 */
function shopifyReviewContactIds(job: ProspectImportJob): string[] {
  const details=(job.resultDetails||{}) as {linkedContactIds?:unknown};
  return Array.isArray(details.linkedContactIds)
    ? [...new Set(details.linkedContactIds.filter((id):id is string=>typeof id==="string"&&/^[0-9a-f-]{36}$/i.test(id)))].slice(0,250)
    : [];
}
function canUnlinkShopifyReview(contact: Contact|undefined, row:typeof prospectIntelligence.$inferSelect|undefined, jobId:string):boolean {
  if(!contact||!row||row.importJobId!==jobId)return false;
  const sd=(contact.sourceDetails||{}) as Record<string,unknown>;
  const meta=sd.prospectImport && typeof sd.prospectImport==="object" ? sd.prospectImport as Record<string,unknown> : {};
  const raw=(row.rawResult||{}) as Record<string,unknown>;
  return sd.prospectImportProvider==="shopify" && meta.importJobId===jobId
    && meta.createdByImportJob===false && raw.shopifyCustomerReviewOnly===true
    && row.analysisStatus==="needs_review" && row.reviewStatus==="needs_review"
    && row.approvedAt==null && row.outreachSentAt==null && row.outreachStatus==="not_sent"
    && (row.enrichmentStatus==="none"||row.enrichmentStatus==null);
}
async function previewShopifyReviewUnlink(job: ProspectImportJob): Promise<ProspectImportUndoPreview> {
  const ids=shopifyReviewContactIds(job);
  if(!ids.length)return {jobId:job.id,deletableCount:0,blockedCount:0,blockedReasons:[]};
  const [contactRows,intelRows]=await Promise.all([
    db.select().from(contacts).where(and(eq(contacts.userId,job.destinationUserId),inArray(contacts.id,ids))),
    db.select().from(prospectIntelligence).where(inArray(prospectIntelligence.contactId,ids)),
  ]);
  const contactById=new Map(contactRows.map(c=>[c.id,c]));
  const rowById=new Map(intelRows.map(r=>[r.contactId,r]));
  const deletableCount=ids.filter(id=>canUnlinkShopifyReview(contactById.get(id),rowById.get(id),job.id)).length;
  const blockedCount=ids.length-deletableCount;
  return {jobId:job.id,deletableCount,blockedCount,
    blockedReasons:blockedCount?[{reason:"Review changed or already unlinked; customer records preserved",count:blockedCount}]:[]};
}
async function executeShopifyReviewUnlink(job:ProspectImportJob,undoneByUserId:string) {
  return db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"shopify-prospect-undo:"+job.id},0))`);
    const [current]=await tx.select().from(prospectImportJobs).where(eq(prospectImportJobs.id,job.id)).for("update").limit(1);
    if(!current||current.undoStatus==="undone")throw new Error("Shopify review import already undone");
    const ids=shopifyReviewContactIds(current);
    const contactRows=ids.length?await tx.select().from(contacts).where(and(
      eq(contacts.userId,current.destinationUserId),inArray(contacts.id,ids))).for("update"):[];
    const piRows=ids.length?await tx.select().from(prospectIntelligence).where(
      inArray(prospectIntelligence.contactId,ids)).for("update"):[];
    const byId=new Map(contactRows.map(c=>[c.id,c]));
    const byPi=new Map(piRows.map(p=>[p.contactId,p]));
    let deleted=0,blocked=0;
    for(const id of ids){
      const contact=byId.get(id),pi=byPi.get(id);
      if(!canUnlinkShopifyReview(contact,pi,current.id)){blocked++;continue;}
      const sd=(contact!.sourceDetails||{}) as Record<string,unknown>;
      const {prospectImportProvider:_provider,prospectImport:_import,...preserved}=sd;
      await tx.delete(prospectIntelligence).where(and(
        eq(prospectIntelligence.contactId,id),eq(prospectIntelligence.importJobId,current.id)
      ));
      await tx.update(contacts).set({sourceDetails:preserved}).where(and(
        eq(contacts.id,id),eq(contacts.userId,current.destinationUserId)
      ));
      deleted++;
    }
    const undoStatus=blocked?"partial" as const:"undone" as const;
    await tx.update(prospectImportJobs).set({undoStatus,undoneAt:new Date(),undoneByUserId})
      .where(eq(prospectImportJobs.id,current.id));
    return {deleted,blocked,undoStatus};
  });
}

async function contactHasMessages(contactId: string): Promise<boolean> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.contactId, contactId))
    .limit(1);
  return rows.length > 0;
}

export function evaluateContactUndoEligibility(
  contact: Contact,
  hasMessages: boolean,
): { canDelete: boolean; reason?: string } {
  const stage = (contact.pipelineStage || "Imported") as ProspectImportPipelineStage;
  if (BLOCKED_STAGES.has(stage)) {
    return { canDelete: false, reason: `Converted to ${stage}` };
  }
  if (stage !== "Imported") {
    return { canDelete: false, reason: `Pipeline stage is ${stage}` };
  }
  if (hasMessages) {
    return { canDelete: false, reason: "Has conversations with messages" };
  }
  return { canDelete: true };
}

export async function classifyUndoCandidates(
  destinationUserId: string,
  jobId: string,
): Promise<{
  deletable: Contact[];
  blocked: { contact: Contact; reason: string }[];
}> {
  const allContacts = await storage.getContacts(destinationUserId, 50000);
  const candidates = getContactsCreatedByImportJob(allContacts, jobId);

  const deletable: Contact[] = [];
  const blocked: { contact: Contact; reason: string }[] = [];

  for (const contact of candidates) {
    const eligibility = evaluateContactUndoEligibility(
      contact,
      await contactHasMessages(contact.id),
    );
    if (!eligibility.canDelete) {
      blocked.push({ contact, reason: eligibility.reason ?? "Blocked" });
      continue;
    }
    deletable.push(contact);
  }

  return { deletable, blocked };
}

export async function previewProspectImportUndo(
  jobId: string,
  workspaceUserId?: string,
): Promise<ProspectImportUndoPreview | null> {
  const rows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return null;
  if (workspaceUserId && job.destinationUserId !== workspaceUserId) return null;
  if (job.provider === "shopify") return previewShopifyReviewUnlink(job);

  const { deletable, blocked } = await classifyUndoCandidates(job.destinationUserId, jobId);

  const reasonCounts = new Map<string, number>();
  for (const b of blocked) {
    reasonCounts.set(b.reason, (reasonCounts.get(b.reason) ?? 0) + 1);
  }

  return {
    jobId,
    deletableCount: deletable.length,
    blockedCount: blocked.length,
    blockedReasons: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

export async function executeProspectImportUndo(params: {
  jobId: string;
  undoneByUserId: string;
  workspaceUserId?: string;
}): Promise<{ deleted: number; blocked: number; undoStatus: "partial" | "undone" }> {
  const rows = await db.select().from(prospectImportJobs).where(eq(prospectImportJobs.id, params.jobId)).limit(1);
  const job = rows[0];
  if (!job) throw new Error("Import job not found");
  if (params.workspaceUserId && job.destinationUserId !== params.workspaceUserId) {
    throw new Error("Import job not found");
  }
  if (job.undoStatus === "undone") throw new Error("This import batch was already undone");
  if (job.provider === "shopify") return executeShopifyReviewUnlink(job,params.undoneByUserId);

  const { deletable, blocked } = await classifyUndoCandidates(job.destinationUserId, params.jobId);

  for (const contact of deletable) {
    await storage.deleteContact(contact.id);
  }

  const undoStatus = resolveUndoJobStatus(blocked.length);
  await db
    .update(prospectImportJobs)
    .set({
      undoStatus,
      undoneAt: new Date(),
      undoneByUserId: params.undoneByUserId,
    })
    .where(eq(prospectImportJobs.id, params.jobId));

  return { deleted: deletable.length, blocked: blocked.length, undoStatus };
}

export function resolveUndoJobStatus(blockedCount: number): "partial" | "undone" {
  return blockedCount > 0 ? "partial" : "undone";
}

export async function canUndoImportJob(job: typeof prospectImportJobs.$inferSelect): Promise<{
  canUndo: boolean;
  reason?: string;
}> {
  if (job.status !== "completed") return { canUndo: false, reason: "Import not completed" };
  if (job.undoStatus === "undone") return { canUndo: false, reason: "Already undone" };
  if ((job.resultImported ?? 0) === 0) return { canUndo: false, reason: "No contacts were imported" };

  const preview = await previewProspectImportUndo(job.id);
  if (!preview) return { canUndo: false, reason: "Job not found" };
  if (preview.deletableCount === 0) {
    return { canUndo: false, reason: "No deletable contacts remain from this batch" };
  }
  return { canUndo: true };
}
