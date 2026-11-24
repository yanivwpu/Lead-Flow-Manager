import assert from "node:assert/strict";
import test from "node:test";
import {parseProspectCsv,filterProspectCsv,ProspectCsvError,PROSPECT_CSV_MAX_ROWS} from "../shared/prospectCsvImport";
test("CSV handles BOM, quoted commas/newlines, mapped columns and no consent inference",()=>{
 const s='\uFEFFFirst_Name,Last Name,Email Address,Phone,Company,Tags\r\n"Ana","Silva",ana@example.com,15551234567,"A, Inc","agency;shopify"\r\n"Mary\nJane",Lee,mary@example.org,,Consulting,';
 const r=parseProspectCsv(s);
 assert.equal(r.length,2);assert.equal(r[0].name,"Ana Silva");assert.equal(r[0].company,"A, Inc");
 assert.equal(r[1].name,"Mary\nJane Lee");
 assert.deepEqual(r[0].tags,["agency","shopify"]);
 assert.deepEqual(filterProspectCsv(r,{hasEmail:true}).length,2);
 assert.deepEqual(filterProspectCsv(r,{hasBoth:true}).length,1);
 assert.ok(!("consent" in r[0]));
});
test("reject malformed, unbounded and invalid CSV rows",()=>{
 for(const csv of ["", "wrong,columns\nabc,def", "name,email\nA,not-email","name\n\"unclosed", "name\nA".repeat(PROSPECT_CSV_MAX_ROWS+2)]) assert.throws(()=>parseProspectCsv(csv),ProspectCsvError);
});
