import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const file = join(process.cwd(), "migrations/0062_prospect_intelligence_outreach_lifecycle.sql");
  const body = readFileSync(file, "utf8");
  await db.execute(sql.raw(body));
  console.log("[ProspectOutreachLifecycle] migration 0062 applied");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
