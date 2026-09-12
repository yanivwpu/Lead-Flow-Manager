/**
 * Workspace-specific Calendly event isolation.
 * Run: npx tsx tests/calendly-event-isolation.test.ts
 */
import assert from "node:assert/strict";
import {
  calendlyBookingSyncEnabled,
  calendlySelectionConfigPatch,
  extractCalendlyEventTypeUri,
  filterScheduledEventsBySelectedType,
  jsonContainsAnySecret,
  mapCalendlyEventTypeCollection,
  resolveCalendlyCustomerSchedulingUrlFromConfig,
  resolveCalendlyEventSelection,
  shouldIngestCalendlyPayloadForWorkspace,
} from "../shared/calendlyEventSelection";
import { toPublicIntegration, redactSecretsInText } from "../shared/integrationPublic";

const DEMO_URI = "https://api.calendly.com/event_types/AAAA-DEMO";
const SHOWING_URI = "https://api.calendly.com/event_types/BBBB-SHOWING";
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const SHOWING_URL = "https://calendly.com/yanivharamaty/property-showing-consultation";
const ACCOUNT_URL = "https://calendly.com/yanivharamaty";
const PAT = "calendly-pat-super-secret-token-xyz";

const rawEventTypes = [
  {
    uri: DEMO_URI,
    name: "WhachatCRM Live Product Demo",
    slug: "whachatcrm-live-product-demo",
    scheduling_url: DEMO_URL,
    duration: 30,
    locations: [{ kind: "google_conference" }],
  },
  {
    uri: SHOWING_URI,
    name: "Property Showing & Consultation",
    slug: "property-showing-consultation",
    scheduling_url: SHOWING_URL,
    duration: 45,
    locations: [{ kind: "physical" }],
  },
];

const types = mapCalendlyEventTypeCollection(rawEventTypes);
assert.equal(types.length, 2, "1. maps Product Demo and Property Showing event types");
assert.equal(types[0].name, "WhachatCRM Live Product Demo");
assert.equal(types[1].name, "Property Showing & Consultation");

const saasSelection = resolveCalendlyEventSelection(types, DEMO_URI);
assert.equal(saasSelection.selectionRequired, false);
assert.equal(saasSelection.selected?.uri, DEMO_URI, "2. SaaS workspace can select Product Demo");
const saasCfg = calendlySelectionConfigPatch(saasSelection);
assert.equal(saasCfg.calendlyPrimarySchedulingUrl, DEMO_URL);
assert.equal(saasCfg.calendlySelectedEventTypeUri, DEMO_URI);
assert.equal(calendlyBookingSyncEnabled(saasCfg), true);

const showingEvent = {
  uri: "https://api.calendly.com/scheduled_events/showing-1",
  name: "Property Showing & Consultation",
  event_type: SHOWING_URI,
  status: "active",
};
const demoEvent = {
  uri: "https://api.calendly.com/scheduled_events/demo-1",
  name: "WhachatCRM Live Product Demo",
  event_type: DEMO_URI,
  status: "active",
};
const scheduled = [demoEvent, showingEvent];

const pollMatched = filterScheduledEventsBySelectedType(scheduled, saasCfg);
assert.deepEqual(
  pollMatched.map((e) => e.uri),
  [demoEvent.uri],
  "3/4. background polling and manual sync import Product Demo only",
);
assert.equal(
  pollMatched.some((e) => e.event_type === SHOWING_URI),
  false,
  "5. Property Showing booking is ignored",
);

function inviteeBody(eventType: "invitee.created" | "invitee.canceled", eventTypeUri: string, extra: Record<string, unknown> = {}) {
  return {
    event: eventType,
    payload: {
      email: "lead@example.com",
      name: "Lead",
      uri: "https://api.calendly.com/scheduled_events/x/invitees/y",
      scheduled_event: {
        uri: "https://api.calendly.com/scheduled_events/x",
        name: eventTypeUri === DEMO_URI ? "WhachatCRM Live Product Demo" : "Property Showing & Consultation",
        event_type: eventTypeUri,
        status: eventType === "invitee.canceled" ? "canceled" : "active",
        ...extra,
      },
    },
  };
}

const demoCancel = shouldIngestCalendlyPayloadForWorkspace(saasCfg, inviteeBody("invitee.canceled", DEMO_URI));
assert.equal(demoCancel.ok, true, "6. Product Demo cancellation is processed");
assert.equal(demoCancel.reason, "matched");

const showingCancel = shouldIngestCalendlyPayloadForWorkspace(saasCfg, inviteeBody("invitee.canceled", SHOWING_URI));
assert.equal(showingCancel.ok, false, "7. Property Showing cancellation is ignored");
assert.equal(showingCancel.reason, "event_type_mismatch");

const demoReschedule = shouldIngestCalendlyPayloadForWorkspace(
  saasCfg,
  {
    event: "invitee.canceled",
    payload: {
      email: "lead@example.com",
      rescheduled: true,
      cancellation: { rescheduled: true },
      scheduled_event: { event_type: DEMO_URI, status: "canceled" },
    },
  },
);
assert.equal(demoReschedule.ok, true, "8. Product Demo reschedule is processed");

const showingReschedule = shouldIngestCalendlyPayloadForWorkspace(
  saasCfg,
  {
    event: "invitee.created",
    payload: {
      email: "lead@example.com",
      scheduled_event: { event_type: SHOWING_URI, status: "active" },
    },
  },
);
assert.equal(showingReschedule.ok, false, "9. Property Showing reschedule is ignored");

const webhookFilter = shouldIngestCalendlyPayloadForWorkspace(saasCfg, inviteeBody("invitee.created", SHOWING_URI));
assert.equal(webhookFilter.ok, false, "10. webhook path applies the same event filter");
assert.equal(shouldIngestCalendlyPayloadForWorkspace(saasCfg, inviteeBody("invitee.created", DEMO_URI)).ok, true);

const aiUrl = resolveCalendlyCustomerSchedulingUrlFromConfig({
  ...saasCfg,
  calendlyPrimarySchedulingUrl: ACCOUNT_URL,
});
assert.equal(aiUrl, DEMO_URL, "11. AI Brain/Copilot/chatbot use the specific Product Demo URL");
assert.equal(aiUrl.includes("yanivharamaty") && !aiUrl.endsWith("/yanivharamaty"), true);
assert.notEqual(aiUrl, ACCOUNT_URL);

const realtorCfg = calendlySelectionConfigPatch(resolveCalendlyEventSelection(types, SHOWING_URI));
const demoForSaas = shouldIngestCalendlyPayloadForWorkspace(saasCfg, inviteeBody("invitee.created", DEMO_URI));
const demoForRealtor = shouldIngestCalendlyPayloadForWorkspace(realtorCfg, inviteeBody("invitee.created", DEMO_URI));
const showingForSaas = shouldIngestCalendlyPayloadForWorkspace(saasCfg, inviteeBody("invitee.created", SHOWING_URI));
const showingForRealtor = shouldIngestCalendlyPayloadForWorkspace(realtorCfg, inviteeBody("invitee.created", SHOWING_URI));
assert.equal(demoForSaas.ok, true);
assert.equal(demoForRealtor.ok, false);
assert.equal(showingForSaas.ok, false);
assert.equal(showingForRealtor.ok, true, "12. two workspaces stay isolated by event-type URI");

const singleType = mapCalendlyEventTypeCollection([rawEventTypes[0]]);
const legacySingle = resolveCalendlyEventSelection(singleType);
assert.equal(legacySingle.selectionRequired, false, "13. existing single-event integrations auto-select");
assert.equal(legacySingle.selected?.uri, DEMO_URI);
const legacyCfg = calendlySelectionConfigPatch(legacySingle);
assert.equal(calendlyBookingSyncEnabled(legacyCfg), true);
assert.equal(filterScheduledEventsBySelectedType(scheduled, legacyCfg).length, 1);

const unresolved = resolveCalendlyEventSelection(types);
assert.equal(unresolved.selected, null, "14. multiple events without a selection do not silently pick one");
assert.equal(unresolved.selectionRequired, true);
const pausedCfg = {
  ...calendlySelectionConfigPatch(unresolved),
  calendlyPrimarySchedulingUrl: ACCOUNT_URL,
};
assert.equal(calendlyBookingSyncEnabled(pausedCfg), false);
assert.equal(filterScheduledEventsBySelectedType(scheduled, pausedCfg).length, 0);
assert.equal(shouldIngestCalendlyPayloadForWorkspace(pausedCfg, inviteeBody("invitee.created", DEMO_URI)).ok, false);
assert.equal(shouldIngestCalendlyPayloadForWorkspace(pausedCfg, inviteeBody("invitee.created", SHOWING_URI)).reason, "event_selection_required");
assert.equal(resolveCalendlyCustomerSchedulingUrlFromConfig(pausedCfg), "");

const publicIntegration = toPublicIntegration({
  id: "int-1",
  type: "calendly",
  accessToken: PAT,
  config: {
    accessToken: PAT,
    webhookSigningKey: "signing-secret",
    calendlySelectedEventTypeUri: DEMO_URI,
    calendlySelectedEventSchedulingUrl: DEMO_URL,
  },
});
assert.equal(jsonContainsAnySecret(publicIntegration, [PAT, "signing-secret"]), false, "15. tokens never appear in client responses");
assert.equal((publicIntegration.config as { accessToken: string }).accessToken, "••••••••");
const logLine = redactSecretsInText(JSON.stringify({ accessToken: PAT, calendlySelectedEventTypeUri: DEMO_URI }));
assert.equal(logLine.includes(PAT), false, "15. tokens never appear in logs");

assert.equal(extractCalendlyEventTypeUri(inviteeBody("invitee.created", DEMO_URI)), DEMO_URI);
assert.equal(
  extractCalendlyEventTypeUri({ payload: { scheduled_event: { event_type: { uri: SHOWING_URI } } } }),
  SHOWING_URI,
);

const unnamedDirectBooking = shouldIngestCalendlyPayloadForWorkspace(saasCfg, {
  event: "invitee.created",
  payload: {
    email: "direct@calendly.com",
    scheduled_event: { event_type: SHOWING_URI },
  },
});
assert.equal(unnamedDirectBooking.ok, false, "direct Calendly Property Showing booking without tracking params is rejected");

console.log("calendly-event-isolation.test.ts passed");
