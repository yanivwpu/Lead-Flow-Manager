/** Read-only access to salesperson-scoped Calendly credentials. Never serialize to an API response. */
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { decryptCredential, encryptCredential, isEncrypted } from "./userTwilio";
import { calendlyGetCurrentUser } from "./calendlyApi";

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

/** Validate with Calendly before encrypting and storing a token. */
export async function connectSalespersonCalendly(salespersonId: string, token: string): Promise<{ schedulingUrl: string | null }> {
  if (!token || token.length > 4096) throw new Error("Invalid token");
  const response = await calendlyGetCurrentUser(token);
  if (!response.ok || !response.data?.resource?.uri) throw new Error("Calendly token validation failed");
  const uri = response.data.resource.uri;
  const schedulingUrl = response.data.resource.scheduling_url || null;
  const encrypted = encryptCredential(token);
  await db.execute(sql`
    INSERT INTO salesperson_calendly_connections
      (salesperson_id, encrypted_access_token, calendly_user_uri, calendly_scheduling_url, enabled, updated_at)
    VALUES (${salespersonId}, ${encrypted}, ${uri}, ${schedulingUrl}, TRUE, NOW())
    ON CONFLICT (salesperson_id) DO UPDATE SET
      encrypted_access_token = EXCLUDED.encrypted_access_token,
      calendly_user_uri = EXCLUDED.calendly_user_uri,
      calendly_scheduling_url = EXCLUDED.calendly_scheduling_url,
      enabled = TRUE, updated_at = NOW()
  `);
  return { schedulingUrl };
}

export async function salespersonCalendlyStatus(salespersonId: string): Promise<{ connected: boolean; schedulingUrl: string | null }> {
  const rows = await db.execute(sql`
    SELECT calendly_scheduling_url FROM salesperson_calendly_connections
    WHERE salesperson_id = ${salespersonId} AND enabled = TRUE
  `);
  return {
    connected: rows.rows.length > 0,
    schedulingUrl: rows.rows[0]?.calendly_scheduling_url ? String(rows.rows[0].calendly_scheduling_url) : null,
  };
}

export async function disconnectSalespersonCalendly(salespersonId: string): Promise<void> {
  await db.execute(sql`DELETE FROM salesperson_calendly_connections WHERE salesperson_id = ${salespersonId}`);
}
