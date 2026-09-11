/**
 * Business profile schema, representative-name persistence, and hydration.
 * Run: npx tsx tests/business-profile-schema.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyBusinessProfileDisplayNamePatch,
  businessProfileDisplayNameFromPatch,
  businessProfilePatchSchema,
  hydrateBusinessProfileDisplayName,
  persistBusinessProfileDisplayName,
} from "../shared/businessProfileSchema";
import {
  pickExplicitWebchatAgentName,
  pickVerifiedWebchatCompanyName,
  resolvePublicWebchatPresentation,
  toVisitorSafePublicWebchatPayload,
} from "../shared/webchatWidgetBranding";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

{
  const valid = businessProfilePatchSchema.safeParse({
    displayName: "Jane Agent",
    businessName: "Summit Realty",
    publicPhone: "+1 512-555-0100",
    publicEmail: "jane@broker.com",
    publicWebsite: "https://summit.example.com",
    aboutText: "Serving Austin buyers since 2010.",
    companyLogo: "data:image/png;base64,abc",
  });
  assert.equal(valid.success, true, "valid business profile patch");

  const emptyEmail = businessProfilePatchSchema.safeParse({ publicEmail: "" });
  assert.equal(emptyEmail.success, true, "empty email allowed");

  const badEmail = businessProfilePatchSchema.safeParse({ publicEmail: "not-an-email" });
  assert.equal(badEmail.success, false, "invalid email rejected");

  const clearedName = businessProfilePatchSchema.safeParse({ displayName: null });
  assert.equal(clearedName.success, true, "null displayName allowed");
  assert.equal(clearedName.success && clearedName.data.displayName, null);

  const emptyName = businessProfilePatchSchema.safeParse({ displayName: "" });
  assert.equal(emptyName.success, true, "empty displayName allowed");
}

{
  assert.equal(persistBusinessProfileDisplayName("Samantha P"), "Samantha P");
  assert.equal(persistBusinessProfileDisplayName("  Samantha P  "), "Samantha P");
  assert.equal(persistBusinessProfileDisplayName(""), null);
  assert.equal(persistBusinessProfileDisplayName("   "), null);
  assert.equal(persistBusinessProfileDisplayName(null), null);
  assert.equal(persistBusinessProfileDisplayName(undefined), null);

  assert.equal(businessProfileDisplayNameFromPatch({}), undefined);
  assert.equal(businessProfileDisplayNameFromPatch({ displayName: "Samantha P" }), "Samantha P");
  assert.equal(businessProfileDisplayNameFromPatch({ displayName: null }), null);
  assert.equal(businessProfileDisplayNameFromPatch({ displayName: "" }), null);
  assert.equal(businessProfileDisplayNameFromPatch({ displayName: "   " }), null);
}

{
  const identity = {
    userName: "Samantha P",
    email: "samantha@affordablepompano.com",
    contactName: "Samantha P",
  };

  let stored: string | null = null;
  stored = applyBusinessProfileDisplayNamePatch(stored, { displayName: "Samantha P" });
  assert.equal(stored, "Samantha P");
  assert.equal(
    hydrateBusinessProfileDisplayName({ knowledgeDisplayName: stored, ...identity }),
    "Samantha P",
  );

  stored = applyBusinessProfileDisplayNamePatch(stored, { displayName: "  " });
  assert.equal(stored, null);
  stored = applyBusinessProfileDisplayNamePatch("Samantha P", { displayName: "" });
  assert.equal(stored, null);
  stored = applyBusinessProfileDisplayNamePatch("Samantha P", { displayName: null });
  assert.equal(stored, null);

  const afterClearSave = hydrateBusinessProfileDisplayName({
    knowledgeDisplayName: stored,
    ...identity,
  });
  assert.equal(afterClearSave, "");

  const afterRemount = hydrateBusinessProfileDisplayName({
    knowledgeDisplayName: stored,
    ...identity,
  });
  assert.equal(afterRemount, "");

  const afterRefetch = hydrateBusinessProfileDisplayName({
    knowledgeDisplayName: stored,
    ...identity,
  });
  assert.equal(afterRefetch, "");

  stored = applyBusinessProfileDisplayNamePatch(stored, {});
  assert.equal(stored, null);
  assert.equal(
    hydrateBusinessProfileDisplayName({ knowledgeDisplayName: stored, ...identity }),
    "",
  );

  let cache: { displayName: string; businessName: string } = {
    displayName: "Samantha P",
    businessName: "Affordable Pompano HVAC",
  };
  const saved = {
    displayName: hydrateBusinessProfileDisplayName({ knowledgeDisplayName: stored }),
    businessName: cache.businessName,
  };
  cache = saved;
  assert.equal(cache.displayName, "");
  assert.equal(cache.businessName, "Affordable Pompano HVAC");
  assert.equal(
    hydrateBusinessProfileDisplayName({ knowledgeDisplayName: persistBusinessProfileDisplayName(cache.displayName), ...identity }),
    "",
  );

  const company = pickVerifiedWebchatCompanyName({
    businessName: cache.businessName,
    displayName: persistBusinessProfileDisplayName(cache.displayName),
  });
  assert.equal(company, "Affordable Pompano HVAC");
  const agentName = pickExplicitWebchatAgentName({
    displayName: persistBusinessProfileDisplayName(cache.displayName),
  });
  assert.equal(agentName, "");
  const publicWidget = resolvePublicWebchatPresentation({
    settings: { brandName: "", name: identity.userName, email: identity.email },
    businessName: company,
    agentName,
  });
  assert.equal(publicWidget.agentName, "");
  assert.equal(publicWidget.displayName, "Affordable Pompano HVAC");
  assert.doesNotMatch(JSON.stringify(publicWidget), /Samantha P/);
  const payload = toVisitorSafePublicWebchatPayload(publicWidget);
  assert.equal(payload.agentName, "");
  assert.doesNotMatch(JSON.stringify(payload), /Samantha P/);
}

{
  const service = read("server/businessProfileService.ts");
  assert.match(service, /hydrateBusinessProfileDisplayName/);
  assert.match(service, /persistBusinessProfileDisplayName/);
  assert.doesNotMatch(service, /userRow\?\.name/);
  assert.doesNotMatch(service, /users\.name/);
  assert.doesNotMatch(service, /knowledge\?\.displayName\) \|\| /);

  const route = read("server/routes/businessProfile.ts");
  assert.match(route, /businessProfileDisplayNameFromPatch\(patch\)/);
  assert.doesNotMatch(route, /displayName: patch\.displayName \?\? undefined/);

  const settings = read("client/src/components/settings/BusinessProfileSettings.tsx");
  assert.match(settings, /setQueryData\(\["\/api\/business-profile"\], saved\)/);
  assert.match(settings, /invalidateQueries\(\{ queryKey: \["\/api\/widget-settings"\] \}\)/);
  assert.match(settings, /displayName: displayName\.trim\(\) \|\| null/);
  assert.match(settings, /setDisplayName\(profile\.displayName \|\| ""\)/);
  assert.doesNotMatch(settings, /setDisplayName\(profile\.displayName \|\| user/);
  assert.doesNotMatch(settings, /value=\{displayName \|\| user/);
  assert.doesNotMatch(settings, /beforeunload|autosave/);

  const aibrain = read("client/src/pages/AIBrain.tsx");
  assert.doesNotMatch(aibrain, /displayName: k\.displayName \|\|/);
  assert.doesNotMatch(aibrain, /displayName:[\s\S]{0,80}user\?\.name/);
}

console.log("business-profile-schema.test.ts: OK");
