/**
 * Inspect inventory source credential fields (decrypted key names only — no secret values).
 * Usage: npx tsx scripts/debug-source-credentials.ts [--all | <source-id>]
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventorySources } from "../shared/schema";
import { decryptSourceCredentials } from "../server/inventory/inventoryDb";
import { buildAdapterContext } from "../server/inventory/inventorySourceService";

const arg = (process.argv[2] || "--all").trim();

function describeCredentialField(key: string, raw: unknown, decrypted: unknown) {
  const rawStr = typeof raw === "string" ? raw : null;
  const decStr = typeof decrypted === "string" ? decrypted : null;
  return {
    key,
    rawType: raw == null ? "missing" : typeof raw,
    rawLength: rawStr?.length ?? 0,
    decryptedType: decrypted == null ? "missing" : typeof decrypted,
    decryptedLength: decStr?.length ?? 0,
    rawLooksEncrypted: rawStr ? rawStr.startsWith("enc:") || rawStr.length > 80 : false,
  };
}

async function main() {
  const sources =
    arg === "--all"
      ? await db.select().from(inventorySources)
      : await db.select().from(inventorySources).where(eq(inventorySources.id, arg));

  if (sources.length === 0) {
    console.error("No sources found for:", arg);
    process.exit(1);
  }

  for (const source of sources) {
    const rawEnc = (source.credentialsEnc || {}) as Record<string, unknown>;
    const decrypted = decryptSourceCredentials(rawEnc);
    const ctx = buildAdapterContext(source);

    const fields = ["serverToken", "accessToken", "clientId", "clientSecret"].map((key) =>
      describeCredentialField(key, rawEnc[key], decrypted[key]),
    );

    console.log(
      JSON.stringify(
        {
          id: source.id,
          provider: source.provider,
          displayName: source.displayName,
          userId: source.userId,
          connectionStatus: source.connectionStatus,
          isActive: source.isActive,
          rawCredentialKeys: Object.keys(rawEnc),
          decryptedCredentialKeys: Object.keys(decrypted),
          ctxCredentialKeys: Object.keys(ctx.credentials),
          fields,
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
