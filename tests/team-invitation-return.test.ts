import test from "node:test";
import assert from "node:assert/strict";
import { invitationReturnPath, rememberInvitationReturn, consumeInvitationReturn } from "../client/src/lib/teamInvitationReturn";
import fs from "node:fs";

test("invitation continuation only retains a local invitation capability and consumes it once", () => {
  const values = new Map<string,string>();
  (globalThis as any).sessionStorage = {setItem:(k:string,v:string)=>values.set(k,v),getItem:(k:string)=>values.get(k)||null,removeItem:(k:string)=>values.delete(k)};
  const path = "/team-invitation#member-id."+"A".repeat(43);
  try {
    for (const invalid of ["https://evil.example", "//evil.example", "/app/inbox", "/team-invitation#bad", "/team-invitation#id."+"A".repeat(43)+"?workspace=foreign"]) assert.equal(invitationReturnPath(invalid),null);
    rememberInvitationReturn(path); assert.equal(consumeInvitationReturn(),path); assert.equal(consumeInvitationReturn(),null);
    rememberInvitationReturn(path); rememberInvitationReturn(null); assert.equal(consumeInvitationReturn(),null);
  } finally { delete (globalThis as any).sessionStorage; }
});
test("all invitation UI messages exist in English, Spanish and Hebrew", () => {
  const locales = ["en","es","he"].map(lang=>JSON.parse(fs.readFileSync(`client/src/locales/${lang}.json`,"utf8")).teamInvite);
  for (const locale of locales) {
    assert.deepEqual(Object.keys(locale),Object.keys(locales[0]));
    assert.ok(Object.values(locale).every(text=>typeof text==="string" && text.length>0));
  }
});
