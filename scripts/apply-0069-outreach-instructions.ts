import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const file = join(process.cwd(), "migrations/0069_prospect_outreach_instructions.sql");
  const body = readFileSync(file, "utf8");
  await db.execute(sql.raw(body));
  console.log("[ProspectOutreachInstructions] migration 0069 applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
