/**
 * Read-only sandbox identity check. Prints booleans only. Does not modify data.
 * Run: npx tsx scripts/inspect-ghl-sandbox-identity.ts
 */
import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls, integrations } from "../shared/schema";
import { isGhlMarketplaceUninstalled } from "../shared/ghlConnectionState";

const INTEGRATION_ID = "ef5203de-ed3b-40ba-b728-ee115e59c472";
const LOCATION_ROW_ID = "091cb29e-ac2b-461e-a092-d0329913b90f";
const AGENCY_ROW_ID = "6b4150e0-b7c5-4efd-b405-6e34a53b06fd";
const EXPECTED_LOCATION_ID = "EOFOVqrgSM7x1c2WAV4m";
const EXPECTED_COMPANY_ID = "Jyk3C3jKACswbgW8duhg";

async function main() {
  const [integration] = await db
    .select({
      id: integrations.id,
      isActive: integrations.isActive,
      accessToken: integrations.accessToken,
      refreshToken: integrations.refreshToken,
      config: integrations.config,
    })
    .from(integrations)
    .where(eq(integrations.id, INTEGRATION_ID))
    .limit(1);

  const marketplaceRows = await db
    .select({
      id: ghlMarketplaceInstalls.id,
      locationId: ghlMarketplaceInstalls.locationId,
      companyId: ghlMarketplaceInstalls.companyId,
      installationStatus: ghlMarketplaceInstalls.installationStatus,
      source: ghlMarketplaceInstalls.source,
      integrationId: ghlMarketplaceInstalls.integrationId,
      whachatUserId: ghlMarketplaceInstalls.whachatUserId,
    })
    .from(ghlMarketplaceInstalls)
    .where(inArray(ghlMarketplaceInstalls.id, [LOCATION_ROW_ID, AGENCY_ROW_ID]));

  const locationRow = marketplaceRows.find((r) => r.id === LOCATION_ROW_ID) ?? null;
  const agencyRow = marketplaceRows.find((r) => r.id === AGENCY_ROW_ID) ?? null;
  const cfg = (integration?.config || {}) as Record<string, unknown>;

  console.log(
    JSON.stringify(
      {
        integrationFound: Boolean(integration),
        accessCredentialsAbsent: !String(integration?.accessToken || "").trim(),
        refreshCredentialsAbsent: !String(integration?.refreshToken || "").trim(),
        integrationInactive: integration ? integration.isActive === false : null,
        locationRowFound: Boolean(locationRow),
        agencyRowFound: Boolean(agencyRow),
        locationRowUninstalled: locationRow
          ? isGhlMarketplaceUninstalled(locationRow.installationStatus)
          : null,
        agencyRowUninstalled: agencyRow
          ? isGhlMarketplaceUninstalled(agencyRow.installationStatus)
          : null,
        bothMarketplaceRowsUninstalled:
          Boolean(locationRow) &&
          Boolean(agencyRow) &&
          isGhlMarketplaceUninstalled(locationRow?.installationStatus) &&
          isGhlMarketplaceUninstalled(agencyRow?.installationStatus),
        locationRowCompanyIdRestored: locationRow?.companyId === EXPECTED_COMPANY_ID,
        locationRowCompanyIdIsUnknown:
          String(locationRow?.companyId || "").trim().toLowerCase() === "unknown",
        locationIdMatches: locationRow?.locationId === EXPECTED_LOCATION_ID,
        integrationConfigLocationMatches: cfg.locationId === EXPECTED_LOCATION_ID,
        integrationConfigCompanyMatches: cfg.companyId === EXPECTED_COMPANY_ID,
        locationRowSource: locationRow?.source ?? null,
        agencyRowSource: agencyRow?.source ?? null,
        locationRowStatus: locationRow?.installationStatus ?? null,
        agencyRowStatus: agencyRow?.installationStatus ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : "inspect failed");
    process.exit(1);
  });
