/** Explicit CSV upload -> tenant-scoped dry-run -> one-time import job.
 * Reuses GHL's audited dedup, job history, and undo without provider credentials.
 */
import crypto from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { prospectImportJobs, prospectImportPreviewJobs } from "@shared/schema";
import type { ProspectImportContactFilter, ProspectImportOptions, ProspectImportPreviewResult, ProspectImportJobSummary, ProspectImportMatchedSnapshot } from "@shared/prospectImport";
import { PROSPECT_IMPORT_PREVIEW_ROWS_CAP } from "@shared/prospectImport";
import { parseProspectCsv, filterProspectCsv } from "@shared/prospectCsvImport";
import { storage } from "../storage";
import { INCLUDE_INBOX_IDENTITIES } from "@shared/contactCrmVisibility";
import { assembleProspectPreviewResult } from "./prospectImportDedup";
import { runProspectImportJob, getProspectImportJob } from "./prospectImportService";

const CSV_PROVIDER="csv-upload";
const CSV_LOCATION="csv";
const CSV_PREVIEW_TTL=15*60*1000;

export async function previewCsvProspects(input: {
  csvText:string;
  filters:ProspectImportContactFilter;
  destinationUserId:string;
  initiatedByUserId:string;
}):Promise<ProspectImportPreviewResult> {
  const rows=parseProspectCsv(input.csvText);
  // Opportunistically remove expired CSV previews; never touch GHL previews.
  await db.delete(prospectImportPreviewJobs).where(and(
    eq(prospectImportPreviewJobs.integrationId,CSV_PROVIDER),
    lt(prospectImportPreviewJobs.createdAt,new Date(Date.now()-CSV_PREVIEW_TTL))
  ));
  const filters:ProspectImportContactFilter={
    search:String(input.filters?.search||"").slice(0,120),
    hasEmail:input.filters?.hasEmail===true,
    hasPhone:input.filters?.hasPhone===true,
    hasBoth:input.filters?.hasBoth===true,
    importLimit:Math.min(Math.max(Number(input.filters?.importLimit)||100,1),1000),
  };
  const matches=filterProspectCsv(rows,filters);
  const fingerprint=crypto.createHash("sha256").update(input.destinationUserId+"\0"+input.csvText+"\0"+JSON.stringify(filters)).digest("hex");
  const snapshot=matches.slice(0,filters.importLimit);
  const [job]=await db.insert(prospectImportPreviewJobs).values({
    integrationId:CSV_PROVIDER,locationId:CSV_LOCATION,
    destinationUserId:input.destinationUserId,initiatedByUserId:input.initiatedByUserId,
    filters,filterFingerprint:fingerprint,
    scanScope:String(rows.length),importLimit:filters.importLimit,
    status:"completed",progressScanned:rows.length,progressTarget:rows.length,
    progressMatches:matches.length,scanComplete:true,scanStoppedEarly:false,
    matchedSnapshots:snapshot,allMatchedExternalIds:snapshot.map(row=>row.externalId),
    scannedAt:new Date(),completedAt:new Date(),
  }).returning({id:prospectImportPreviewJobs.id});
  const existing=await storage.getContacts(input.destinationUserId,50000,INCLUDE_INBOX_IDENTITIES);
  const preview=assembleProspectPreviewResult({
    rows:snapshot,destinationContacts:existing,skippedByFilters:rows.length-matches.length,
    totalFound:matches.length,totalContactsScanned:rows.length,scanComplete:true,scannedAt:new Date().toISOString(),
    previewJobId:job.id,filterFingerprint:fingerprint,truncated:matches.length>PROSPECT_IMPORT_PREVIEW_ROWS_CAP,
  });
  return {...preview,contacts:preview.contacts.slice(0,PROSPECT_IMPORT_PREVIEW_ROWS_CAP)};
}
export async function startCsvProspectImport(input:{
  previewJobId:string;filterFingerprint:string;batchName:string;
  selectedExternalIds?:string[];importReason?:string;
  initiatedByUserId:string;destinationUserId:string;
}):Promise<ProspectImportJobSummary> {
  const batchName=String(input.batchName||"").trim().slice(0,120);
  if(!batchName) throw new Error("Batch name required.");
  if(!/^[0-9a-f]{64}$/.test(String(input.filterFingerprint||""))) throw new Error("Preview expired; preview your file again.");
  const row=await db.transaction(async tx=>{
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.previewJobId},0))`);
    const [preview]=await tx.select().from(prospectImportPreviewJobs).where(and(
      eq(prospectImportPreviewJobs.id,input.previewJobId),
      eq(prospectImportPreviewJobs.integrationId,CSV_PROVIDER),
      eq(prospectImportPreviewJobs.destinationUserId,input.destinationUserId),
      eq(prospectImportPreviewJobs.initiatedByUserId,input.initiatedByUserId),
      eq(prospectImportPreviewJobs.status,"completed"),
    )).limit(1);
    if(!preview || preview.filterFingerprint!==input.filterFingerprint ||
       !preview.scannedAt || Date.now()-preview.scannedAt.getTime()>CSV_PREVIEW_TTL)
      throw new Error("CSV preview is unavailable or expired; preview again.");
    const prior=await tx.select({id:prospectImportJobs.id}).from(prospectImportJobs).where(and(
      eq(prospectImportJobs.destinationUserId,input.destinationUserId),
      eq(prospectImportJobs.previewJobId,preview.id)
    )).limit(1);
    if(prior.length) throw new Error("This CSV preview has already been imported.");
    const pool=(Array.isArray(preview.matchedSnapshots)?preview.matchedSnapshots:[]) as ProspectImportMatchedSnapshot[];
    const requested=input.selectedExternalIds?.length?input.selectedExternalIds:pool.map(p=>p.externalId);
    const distinct=new Set(requested);
    if(distinct.size!==requested.length || distinct.size===0 || distinct.size>1000 ||
       !requested.every(id=>typeof id==="string"&&pool.some(p=>p.externalId===id)))
      throw new Error("CSV selection is invalid; preview again.");
    const snapshots=pool.filter(row=>distinct.has(row.externalId)).slice(0,preview.importLimit);
    const options:ProspectImportOptions={
      batchName,internalTag:"Imported-CSV",
      importReason: String(input.importReason||"General prospecting").slice(0,120),
      skipDuplicates:true,updateMissingFieldsOnly:false,
      selectedExternalIds:snapshots.map(s=>s.externalId),
    };
    const [created]=await tx.insert(prospectImportJobs).values({
      destinationUserId:input.destinationUserId,initiatedByUserId:input.initiatedByUserId,
      provider:"csv",batchName,importReason:options.importReason,sourceIntegrationId:null,
      sourceLocationId:CSV_LOCATION,status:"pending",filters:preview.filters,importOptions:options,
      selectedExternalIds:options.selectedExternalIds,previewTotal:pool.length,
      previewJobId:preview.id,progressTotal:snapshots.length,
      resultDetails:{previewSnapshots:snapshots},
    }).returning({id:prospectImportJobs.id});
    // The durable import job owns selected rows now; drop upload snapshots so
    // they do not remain duplicated in preview storage.
    await tx.update(prospectImportPreviewJobs).set({
      matchedSnapshots:[],allMatchedExternalIds:[],previewResult:null
    }).where(eq(prospectImportPreviewJobs.id,preview.id));
    return created;
  });
  setImmediate(()=>{void runProspectImportJob(row.id).catch(()=>console.error("[ProspectImport] CSV job failed"));});
  const summary=await getProspectImportJob(row.id,input.destinationUserId);
  if(!summary) throw new Error("Import job unavailable");
  return summary;
}
