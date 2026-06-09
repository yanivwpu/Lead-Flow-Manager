/**
 * Business profile schema validation.
 * Run: npx tsx tests/business-profile-schema.test.ts
 */
import { businessProfilePatchSchema } from "../shared/businessProfileSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const valid = businessProfilePatchSchema.safeParse({
  displayName: "Jane Agent",
  businessName: "Summit Realty",
  publicPhone: "+1 512-555-0100",
  publicEmail: "jane@broker.com",
  publicWebsite: "https://summit.example.com",
  aboutText: "Serving Austin buyers since 2010.",
  companyLogo: "data:image/png;base64,abc",
});
assert(valid.success, "valid business profile patch");

const emptyEmail = businessProfilePatchSchema.safeParse({ publicEmail: "" });
assert(emptyEmail.success, "empty email allowed");

const badEmail = businessProfilePatchSchema.safeParse({ publicEmail: "not-an-email" });
assert(!badEmail.success, "invalid email rejected");

console.log("business-profile-schema.test.ts: OK");
