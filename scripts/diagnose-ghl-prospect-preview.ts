/**
 * Diagnose Prospect Import preview filter skips against live GHL data.
 * Run: npx tsx scripts/diagnose-ghl-prospect-preview.ts
 */
import "dotenv/config";
import { PROSPECT_IMPORT_PRESET_TEMPLATES } from "../shared/prospectImport";
import { getIntegrationById, searchGhlContacts } from "../server/prospectImport/ghlApiClient";
import {
  explainGhlContactFilterRejection,
  sanitizeGhlContactForDiagnostics,
} from "../server/prospectImport/ghlContactFilters";
import { getGhlProspectApiToken } from "../server/prospectImport/ghlProspectApiToken";

const INTEGRATION_ID = process.env.GHL_DIAG_INTEGRATION_ID || "ef5203de-ed3b-40ba-b728-ee115e59c472";
const LOCATION_ID = process.env.GHL_DIAG_LOCATION_ID || "EOFOVqrgSM7x1c2WAV4m";
const TEMPLATE_NAME = process.env.GHL_DIAG_TEMPLATE || "Agency Prospects";

async function main() {
  const preset = PROSPECT_IMPORT_PRESET_TEMPLATES.find((t) => t.templateName === TEMPLATE_NAME);
  if (!preset) {
    throw new Error(`Unknown template: ${TEMPLATE_NAME}`);
  }

  const integration = await getIntegrationById(INTEGRATION_ID);
  if (!integration?.isActive) throw new Error("Integration not found or inactive");

  const resolved = await getGhlProspectApiToken(integration, LOCATION_ID);
  const filters = preset.filters;

  const { contacts, total } = await searchGhlContacts({
    token: resolved.token,
    locationId: resolved.locationId,
    page: 1,
    pageLimit: 20,
    query: filters.search,
  });

  const skipped = contacts
    .map((c) => {
      const skipReason = explainGhlContactFilterRejection(c, filters);
      if (!skipReason) return null;
      return {
        externalId: c.id,
        contact: sanitizeGhlContactForDiagnostics(c),
        skipReason,
      };
    })
    .filter(Boolean);

  const matched = contacts.filter((c) => !explainGhlContactFilterRejection(c, filters));

  console.log(
    JSON.stringify(
      {
        integrationId: INTEGRATION_ID,
        locationId: LOCATION_ID,
        appliedTemplate: TEMPLATE_NAME,
        activeFilters: filters,
        templateHiddenDefaults: {
          note: "Preset templates only set explicit filter fields; unset fields are not applied.",
          presetFields: Object.keys(preset.filters),
          notSetByPreset: [
            "contactSource",
            "assignedUserId",
            "createdAfter",
            "createdBefore",
            "lastActivityDays",
            "hasEmail",
            "hasPhone",
            "hasBoth",
            "search",
          ],
        },
        ghlPage1Returned: contacts.length,
        ghlTotalReported: total ?? null,
        matchedOnPage1: matched.length,
        skippedOnPage1: skipped.length,
        skippedContacts: skipped,
        matchedContactsSample: matched.slice(0, 5).map(sanitizeGhlContactForDiagnostics),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
