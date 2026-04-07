/** Activate Pro plan for a user */
import { db } from "../drizzle/db";
import { users } from "@shared/schema";
import { eq, ilike } from "drizzle-orm";

async function main() {
  const userHandle = process.argv[2];
  if (!userHandle) {
    console.log("Usage: npx tsx --tsconfig tsconfig.json scripts/activate-pro-user.ts <email_or_name>");
    process.exit(1);
  }

  // Find user by email or name
  const user = await db.select().from(users).where(
    ilike(users.email, `%${userHandle}%`)
  ).limit(1).then(r => r[0]) || 
  await db.select().from(users).where(
    ilike(users.name, `%${userHandle}%`)
  ).limit(1).then(r => r[0]);

  if (!user) {
    console.log(`❌ User "${userHandle}" not found`);
    process.exit(1);
  }

  console.log(`Found user: ${user.name} (${user.email})`);
  console.log(`Current plan: ${user.subscriptionPlan}`);
  console.log(`Trial ends: ${user.trialEndsAt ? new Date(user.trialEndsAt).toLocaleDateString() : 'N/A'}`);

  // Update to Pro plan
  await db.update(users).set({ subscriptionPlan: "pro" }).where(eq(users.id, user.id));

  const updated = await db.select().from(users).where(eq(users.id, user.id)).then(r => r[0]);
  console.log(`\n✅ Updated to Pro plan`);
  console.log(`New plan: ${updated!.subscriptionPlan}`);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
