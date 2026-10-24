/** Read-only access to salesperson-scoped Calendly credentials. Never serialize to an API response. */
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { decryptCredential, isEncrypted } from "./userTwilio";

export type SalespersonCalendlyConnection = {
  salespersonId: string;
  token: string;
  calendlyUserUri: string | null;
  schedulingUrl: string | null;
};

export async function getSalespersonCalendlyConnections(): Promise<SalespersonCalendlyConnection[]> {
  const result = await db.execute(sql`
    SELECT salesperson_id, encrypted_access_token, calendly_user_uri, calendly_scheduling_url
    FROM salesperson_calendly_connections WHERE enabled = TRUE
  `);
  const output: SalespersonCalendlyConnection[] = [];
  for (const row of result.rows) {
    const raw = String(row.encrypted_access_token || "");
    // Never accept plaintext database credentials.
    if (!isEncrypted(raw)) continue;
    try {
      const token = decryptCredential(raw);
      if (!token) continue;
      output.push({
        salespersonId: String(row.salesperson_id),
        token,
        calendlyUserUri: row.calendly_user_uri ? String(row.calendly_user_uri) : null,
        schedulingUrl: row.calendly_scheduling_url ? String(row.calendly_scheduling_url) : null,
      });
    } catch (error) {
      console.warn("[SalespersonCalendly] Credential decrypt failed", { salespersonId: row.salesperson_id });
    }
  }
  return output;
}
