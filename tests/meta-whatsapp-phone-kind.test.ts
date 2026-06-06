import {
  classifyMetaWhatsAppPhone,
  mapGraphPhoneRowToDiscoveryFields,
} from "../server/metaWhatsAppPhoneKind";
import { decideEmbeddedSignupPhoneSelection } from "../server/whatsappEmbeddedSignup";
import type { EnrichedWabaPhoneChoice } from "../server/whatsappEmbeddedSignup";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  const sandbox = classifyMetaWhatsAppPhone({
    displayPhoneNumber: "+1 555 0100",
    verifiedName: "My Business",
    accountMode: "SANDBOX",
  });
  assert(sandbox.kind === "test", "sandbox account_mode");

  const prod = classifyMetaWhatsAppPhone({
    displayPhoneNumber: "+1 415 555 0100",
    verifiedName: "Acme Realty",
    platformType: "CLOUD_API",
    status: "CONNECTED",
    codeVerificationStatus: "VERIFIED",
  });
  assert(prod.kind === "production", "production line");

  const unknown = classifyMetaWhatsAppPhone({
    verifiedName: "Something",
  });
  assert(unknown.kind === "unknown", "missing display -> unknown");

  const mapped = mapGraphPhoneRowToDiscoveryFields({
    id: "123",
    display_phone_number: "+15551234567",
    verified_name: "Shop",
    platform_type: "CLOUD_API",
    account_mode: "LIVE",
    status: "CONNECTED",
    code_verification_status: "VERIFIED",
    quality_rating: "GREEN",
  });
  assert(mapped.id === "123" && mapped.platformType === "CLOUD_API", "map graph row");

  const choices: EnrichedWabaPhoneChoice[] = [
    {
      wabaId: "w1",
      phoneNumbers: [
        {
          id: "p1",
          displayPhoneNumber: "+15551230001",
          verifiedName: "Test Number",
          phoneKind: "test",
          phoneKindReasons: ["verified_name_contains_test"],
        },
      ],
    },
  ];
  const pickTestOnly = decideEmbeddedSignupPhoneSelection(choices);
  assert(pickTestOnly.mode === "pending_pick", "test-only requires picker");

  const unknownOnly: EnrichedWabaPhoneChoice[] = [
    {
      wabaId: "w1",
      phoneNumbers: [
        {
          id: "p2",
          verifiedName: "No display",
          phoneKind: "unknown",
          phoneKindReasons: ["missing_display_phone_number"],
        },
      ],
    },
  ];
  const pickUnknown = decideEmbeddedSignupPhoneSelection(unknownOnly);
  assert(pickUnknown.mode === "pending_pick", "unknown never auto-picks");
  assert(
    pickUnknown.mode === "pending_pick" && pickUnknown.pendingReason.includes("unknown"),
    "unknown pending reason",
  );

  const prodOnly: EnrichedWabaPhoneChoice[] = [
    {
      wabaId: "w1",
      phoneNumbers: [
        {
          id: "p3",
          displayPhoneNumber: "+14155551234",
          verifiedName: "Acme",
          phoneKind: "production",
          phoneKindReasons: ["passed_heuristic_and_graph_checks"],
        },
      ],
    },
  ];
  const pickProd = decideEmbeddedSignupPhoneSelection(prodOnly);
  assert(pickProd.mode === "auto", "single production auto-picks");

  console.log("meta-whatsapp-phone-kind.test.ts: all passed");
}

run();
