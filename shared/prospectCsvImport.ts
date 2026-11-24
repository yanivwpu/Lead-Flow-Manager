/** Bounded RFC 4180 parser for user-uploaded prospect CSVs.
 * No contact writes, no consent inference, and no arbitrary column persistence.
 */
import type { ProspectImportContactFilter, ProspectImportMatchedSnapshot } from "./prospectImport";

export const PROSPECT_CSV_MAX_BYTES = 512 * 1024;
export const PROSPECT_CSV_MAX_ROWS = 1000;
export class ProspectCsvError extends Error {}

const HEADERS: Record<string, string[]> = {
  name: ["name", "full name", "contact name"],
  first: ["first name", "firstname", "given name"],
  last: ["last name", "lastname", "surname", "family name"],
  email: ["email", "email address", "e mail"],
  phone: ["phone", "phone number", "mobile", "mobile phone", "telephone"],
  company: ["company", "company name", "business", "organization", "organisation"],
  tags: ["tags", "tag", "labels"],
};
function normalizeHeader(s: string): string { return s.toLowerCase().replace(/[\uFEFF_\-]+/g, " ").replace(/\s+/g, " ").trim(); }
function safeField(s: string, max = 254): string {
  const clean = s.replace(/[\u0000-\u0008\u000B\u000E-\u001F\u007F]/g,"").trim();
  return clean.slice(0,max);
}
export function parseProspectCsv(text: string): ProspectImportMatchedSnapshot[] {
  if (typeof text !== "string" || !text.trim()) throw new ProspectCsvError("Choose a non-empty CSV file.");
  if (Buffer.byteLength(text, "utf8") > PROSPECT_CSV_MAX_BYTES) throw new ProspectCsvError("CSV exceeds 512 KB.");
  const records: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i=0;i<input.length;i++) {
    const c=input[i];
    if (quoted) {
      if (c==='"' && input[i+1]==='"') { field+='"'; i++; }
      else if (c==='"') quoted=false;
      else field+=c;
    } else if (c==='"') {
      if (field!=="") throw new ProspectCsvError("Invalid CSV quoting.");
      quoted=true;
    } else if (c===",") { row.push(field); field=""; }
    else if (c==="\r" || c==="\n") {
      if (c==="\r" && input[i+1]==="\n") i++;
      row.push(field); field="";
      if (row.some(v=>v.trim())) records.push(row);
      row=[];
      if (records.length>PROSPECT_CSV_MAX_ROWS+1) throw new ProspectCsvError("CSV is limited to 1,000 data rows.");
    } else field+=c;
    if (field.length > 2048) throw new ProspectCsvError("CSV field too long.");
  }
  if (quoted) throw new ProspectCsvError("Unclosed CSV quoted field.");
  row.push(field);
  if (row.some(v=>v.trim())) records.push(row);
  if (records.length<2) throw new ProspectCsvError("CSV needs a header and at least one contact.");
  if (records.length-1>PROSPECT_CSV_MAX_ROWS) throw new ProspectCsvError("CSV is limited to 1,000 data rows.");
  const header=records[0].map(normalizeHeader);
  const index=(k:keyof typeof HEADERS)=>header.findIndex(h=>HEADERS[k].includes(h));
  const ix={name:index("name"),first:index("first"),last:index("last"),email:index("email"),phone:index("phone"),company:index("company"),tags:index("tags")};
  if (ix.name<0&&ix.first<0&&ix.last<0&&ix.email<0&&ix.phone<0) {
    throw new ProspectCsvError("CSV needs Name, First Name, Email, or Phone columns.");
  }
  const at=(cols:string[],i:number)=>i<0?"":safeField(cols[i]||"");
  const out:ProspectImportMatchedSnapshot[]=[];
  for (const [n,cols] of records.slice(1).entries()) {
    if (cols.length>header.length+1) throw new ProspectCsvError(`Row ${n+2} has too many columns.`);
    const email=at(cols,ix.email).toLowerCase();
    const phone=at(cols,ix.phone).replace(/[^\d+() \-]/g,"").slice(0,32);
    if (email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ProspectCsvError(`Invalid email on row ${n+2}.`);
    if (phone&&phone.replace(/\D/g,"").length<7) throw new ProspectCsvError(`Invalid phone on row ${n+2}.`);
    const name=at(cols,ix.name)||[at(cols,ix.first),at(cols,ix.last)].filter(Boolean).join(" ")||email||phone;
    // Contact imports need a durable identity for deduplication and safe re-imports.
    if (!name || (!email && !phone)) continue;
    const company=at(cols,ix.company);
    const tags=at(cols,ix.tags,).split(/[;|]/).map(v=>safeField(v,50)).filter(Boolean).slice(0,10);
    out.push({
      externalId:`csv-row-${n+2}`,
      name:safeField(name,200),
      ...(company?{company}:{}),
      ...(email?{email}:{}),
      ...(phone?{phone}:{}),
      tags,
      source:"csv",
    });
  }
  if (!out.length) throw new ProspectCsvError("No usable contacts in CSV.");
  return out;
}
export function filterProspectCsv(rows:ProspectImportMatchedSnapshot[], filters:ProspectImportContactFilter) {
  const term=String(filters.search||"").trim().toLowerCase();
  return rows.filter(r=>(!term||[r.name,r.company,r.email].some(s=>String(s||"").toLowerCase().includes(term)))
    &&(!filters.hasEmail||!!r.email)
    &&(!filters.hasPhone||!!r.phone)
    &&(!filters.hasBoth||!!r.email&&!!r.phone));
}
