/**
 * Inspect gohighlevel integrations rows (no tokens printed).
 * Run: npx tsx scripts/inspect-ghl-integration.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { integrations, users } from "../shared/schema";

async function main() {
  const rows = await db.select().from(integrations).where(eq(integrations.type, "gohighlevel"));
  for (const r of rows) {
    const cfg = (r.config || {}) as Record<string, unknown>;
    const userRows = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, r.userId))
      .limit(1);
    const user = userRows[0];
    console.log(
      JSON.stringify(
        {
          integrationId: r.id,
          userId: r.userId,
          userEmail: user?.email ?? null,
          userName: user?.name ?? null,
          name: r.name,
          isActive: r.isActive,
          userType: cfg.userType ?? null,
          companyId: cfg.companyId ?? null,
          locationId: cfg.locationId ?? null,
          access_token_present: Boolean(r.accessToken),
          refresh_token_present: Boolean(r.refreshToken),
          tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null,
          installedAt: cfg.installedAt ?? null,
          reconnectedAt: cfg.reconnectedAt ?? null,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
