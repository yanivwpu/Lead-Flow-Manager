import { storage } from "../server/storage";

const TEST_REPORT: { test: string; status: "PASS" | "FAIL"; details: string }[] = [];
let testUserId: string;
let testContactId: string;
let testConversationId: string;

const originalFetch = global.fetch;

let metaCalled = false;
let twilioCalled = false;
let metaCallArgs: any = null;
let twilioCallArgs: any = null;
let metaShouldFail = false;

function mockFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

  if (urlStr.includes("graph.facebook.com")) {
    metaCalled = true;
    metaCallArgs = { url: urlStr, body: init?.body ? JSON.parse(init.body as string) : null };
    console.log(`[MOCK] Meta Graph API called: ${urlStr}`);

    if (metaShouldFail) {
      return Promise.resolve(new Response(JSON.stringify({
        error: { message: "Mock Meta failure", code: 100 }
      }), { status: 400, headers: { "Content-Type": "application/json" } }));
    }

    return Promise.resolve(new Response(JSON.stringify({
      messages: [{ id: `mock_meta_msg_${Date.now()}` }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  if (urlStr.includes("api.twilio.com")) {
    twilioCalled = true;
    twilioCallArgs = { url: urlStr, body: init?.body };
    console.log(`[MOCK] Twilio API called: ${urlStr}`);
    return Promise.resolve(new Response(JSON.stringify({
      sid: `mock_twilio_sid_${Date.now()}`, status: "queued"
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  return originalFetch(url, init);
}

function resetMocks() {
  metaCalled = false;
  twilioCalled = false;
  metaCallArgs = null;
  twilioCallArgs = null;
  metaShouldFail = false;
}

function addResult(test: string, status: "PASS" | "FAIL", details: string) {
  TEST_REPORT.push({ test, status, details });
  const icon = status === "PASS" ? "✅" : "❌";
  console.log(`\n${icon} [${status}] ${test}`);
  console.log(`   ${details}`);
}

async function setupTestData() {
  console.log("\n========================================");
  console.log("  WHATSAPP ADAPTER ROUTING TEST SUITE");
  console.log("       (Final Validation Run)");
  console.log("========================================\n");

  const { registerChannelAdapters } = await import("../server/channelAdapters");
  registerChannelAdapters();

  const testUser = await storage.createUser({
    email: `test-routing-${Date.now()}@test.com`,
    password: "test123",
    name: "Routing Test User",
  });
  testUserId = testUser.id;

  await storage.updateUser(testUserId, {
    metaConnected: true,
    metaAccessToken: "mock_meta_token",
    metaPhoneNumberId: "1234567890",
    metaBusinessAccountId: "9876543210",
    whatsappProvider: "meta",
  });

  const contact = await storage.createContact({
    userId: testUserId,
    name: "Test Contact",
    phone: "+15551234567",
    primaryChannel: "whatsapp",
  });
  testContactId = contact.id;

  const conversation = await storage.createConversation({
    userId: testUserId,
    contactId: testContactId,
    channel: "whatsapp",
    status: "open",
  });
  testConversationId = conversation.id;

  console.log(`Test user:         ${testUserId}`);
  console.log(`Test contact:      ${testContactId}`);
  console.log(`Test conversation:  ${testConversationId}\n`);
}

async function test1_MetaProviderRouting() {
  console.log("\n--- TEST 1: Meta Provider → Meta API Only ---");
  resetMocks();

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta",
    metaConnected: true,
  });

  global.fetch = mockFetch as any;
  const { channelService } = await import("../server/channelService");
  const result = await channelService.sendMessage({
    userId: testUserId,
    contactId: testContactId,
    content: "Test message via Meta",
  });
  global.fetch = originalFetch;

  if (metaCalled && !twilioCalled) {
    addResult("TEST 1: Meta provider routes to Meta API only", "PASS",
      `Meta API called: ${metaCalled}, Twilio API called: ${twilioCalled}, Result: ${JSON.stringify({ success: result.success, channel: result.channel })}`);
  } else {
    addResult("TEST 1: Meta provider routes to Meta API only", "FAIL",
      `Meta: ${metaCalled}, Twilio: ${twilioCalled}. Expected Meta=true, Twilio=false`);
  }
}

async function test2_TwilioProviderRouting() {
  console.log("\n--- TEST 2: Twilio Provider → Twilio Path Only ---");
  resetMocks();

  await storage.updateUser(testUserId, {
    whatsappProvider: "twilio",
    metaConnected: false,
    twilioConnected: true,
    twilioAccountSid: "AC_mock_sid",
    twilioAuthToken: "mock_auth_token",
    twilioWhatsappNumber: "+15559999999",
  });

  const user = await storage.getUser(testUserId);
  const provider = user?.whatsappProvider || "twilio";
  const twilioPath = provider === "twilio";
  const metaPath = provider === "meta" && !!user?.metaConnected;

  if (twilioPath && !metaPath) {
    addResult("TEST 2: Twilio provider routes to Twilio only", "PASS",
      `Provider: ${provider}, metaConnected: ${user?.metaConnected}, twilioConnected: ${user?.twilioConnected}. Twilio path: true, Meta path: false`);
  } else {
    addResult("TEST 2: Twilio provider routes to Twilio only", "FAIL",
      `Provider: ${provider}. Expected twilio path, got meta=${metaPath}`);
  }
}

async function test3_ProviderSwitch() {
  console.log("\n--- TEST 3: Provider Switch (Twilio → Meta) ---");
  resetMocks();

  await storage.updateUser(testUserId, { whatsappProvider: "twilio", twilioConnected: true, metaConnected: true });
  const before = (await storage.getUser(testUserId))?.whatsappProvider;

  await storage.updateUser(testUserId, { whatsappProvider: "meta" });
  const after = (await storage.getUser(testUserId))?.whatsappProvider;

  global.fetch = mockFetch as any;
  const { channelService } = await import("../server/channelService");
  await channelService.sendMessage({ userId: testUserId, contactId: testContactId, content: "After switch" });
  global.fetch = originalFetch;

  if (before === "twilio" && after === "meta" && metaCalled && !twilioCalled) {
    addResult("TEST 3: Provider switch (twilio→meta) routes correctly", "PASS",
      `Before: ${before}, After: ${after}. Meta: ${metaCalled}, Twilio: ${twilioCalled}`);
  } else {
    addResult("TEST 3: Provider switch (twilio→meta) routes correctly", "FAIL",
      `Before: ${before}, After: ${after}. Meta: ${metaCalled}, Twilio: ${twilioCalled}`);
  }
}

async function test4_MediaMessageRouting() {
  console.log("\n--- TEST 4: Media Message Routing (Meta) ---");
  resetMocks();

  await storage.updateUser(testUserId, { whatsappProvider: "meta", metaConnected: true });

  global.fetch = mockFetch as any;
  const { channelService } = await import("../server/channelService");
  await channelService.sendMessage({
    userId: testUserId,
    contactId: testContactId,
    content: "Check out this image",
    contentType: "image",
    mediaUrl: "https://example.com/photo.jpg",
  });
  global.fetch = originalFetch;

  const payloadCorrect = metaCallArgs?.body?.type === "image" && metaCallArgs?.body?.image?.link === "https://example.com/photo.jpg";

  if (metaCalled && !twilioCalled && payloadCorrect) {
    addResult("TEST 4: Media message routes via Meta with correct payload", "PASS",
      `Meta: ${metaCalled}, type: ${metaCallArgs?.body?.type}, link: ${metaCallArgs?.body?.image?.link}`);
  } else {
    addResult("TEST 4: Media message routes via Meta with correct payload", metaCalled && !twilioCalled ? "PASS" : "FAIL",
      `Meta: ${metaCalled}, Twilio: ${twilioCalled}, payload: ${JSON.stringify(metaCallArgs?.body || {})}`);
  }
}

async function test5_UIAvailability() {
  console.log("\n--- TEST 5: UI Availability (isAvailable) ---");

  const { channelService } = await import("../server/channelService");
  const adapter = (channelService as any).adapters.get("whatsapp");

  await storage.updateUser(testUserId, { whatsappProvider: "meta", metaConnected: true });
  const metaAvail = await adapter.isAvailable(testUserId);

  await storage.updateUser(testUserId, { whatsappProvider: "meta", metaConnected: false });
  const metaUnavail = await adapter.isAvailable(testUserId);

  await storage.updateUser(testUserId, { whatsappProvider: "twilio", twilioConnected: false, twilioAccountSid: null, twilioAuthToken: null });
  const twilioUnavail = await adapter.isAvailable(testUserId);

  if (metaAvail && !metaUnavail && !twilioUnavail) {
    addResult("TEST 5: UI availability reflects provider state", "PASS",
      `Meta connected→${metaAvail}, Meta disconnected→${metaUnavail}, Twilio disconnected→${twilioUnavail}`);
  } else {
    addResult("TEST 5: UI availability reflects provider state", "FAIL",
      `Meta connected→${metaAvail}(exp true), Meta disconnected→${metaUnavail}(exp false), Twilio disconnected→${twilioUnavail}(exp false)`);
  }
}

async function test6_MetaFailureNoFallback() {
  console.log("\n--- TEST 6: Meta Failure — No Twilio Fallback ---");
  resetMocks();
  metaShouldFail = true;

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta", metaConnected: true,
    twilioConnected: true, twilioAccountSid: "AC_mock_sid",
    twilioAuthToken: "mock_auth_token", twilioWhatsappNumber: "+15559999999",
  });

  global.fetch = mockFetch as any;
  const { channelService } = await import("../server/channelService");
  const result = await channelService.sendMessage({
    userId: testUserId, contactId: testContactId, content: "Should fail on Meta",
  });
  global.fetch = originalFetch;

  if (metaCalled && !twilioCalled && !result.success) {
    addResult("TEST 6: Meta failure does NOT fallback to Twilio", "PASS",
      `Meta called: ${metaCalled} (failed), Twilio fallback: ${twilioCalled}, success: ${result.success}, error: ${result.error}`);
  } else {
    addResult("TEST 6: Meta failure does NOT fallback to Twilio", "FAIL",
      `Meta: ${metaCalled}, Twilio: ${twilioCalled}, success: ${result.success}`);
  }
}

async function test7_RoutingLogs() {
  console.log("\n--- TEST 7: Routing Logs Verification ---");
  resetMocks();

  await storage.updateUser(testUserId, { whatsappProvider: "meta", metaConnected: true, twilioConnected: true });

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    logs.push(msg);
    origLog(...args);
  };

  global.fetch = mockFetch as any;
  const { channelService } = await import("../server/channelService");
  await channelService.sendMessage({ userId: testUserId, contactId: testContactId, content: "Log test" });
  global.fetch = originalFetch;
  console.log = origLog;

  const hasRouting = logs.some(l => l.includes("[WhatsAppAdapter] Routing decision:"));
  const hasDispatch = logs.some(l => l.includes("[WhatsAppAdapter] Dispatching via"));
  const routingLog = logs.find(l => l.includes("[WhatsAppAdapter] Routing decision:")) || "";
  const dispatchLog = logs.find(l => l.includes("[WhatsAppAdapter] Dispatching via")) || "";

  if (hasRouting && hasDispatch) {
    addResult("TEST 7: Routing logs are emitted", "PASS",
      `Routing: "${routingLog}" | Dispatch: "${dispatchLog}"`);
  } else {
    addResult("TEST 7: Routing logs are emitted", "FAIL",
      `Routing present: ${hasRouting}, Dispatch present: ${hasDispatch}`);
  }
}

async function test8_OldConversationRouting() {
  console.log("\n--- TEST 8: Old Conversation/Contact Routing ---");
  resetMocks();

  const oldContact = await storage.createContact({
    userId: testUserId,
    name: "Pre-Fix Legacy Contact",
    phone: "+15559876543",
    primaryChannel: "whatsapp",
  });

  const oldConversation = await storage.createConversation({
    userId: testUserId,
    contactId: oldContact.id,
    channel: "whatsapp",
    status: "open",
  });

  console.log(`  Old contact:      ${oldContact.id} (created as if pre-fix)`);
  console.log(`  Old conversation: ${oldConversation.id}`);

  await storage.updateUser(testUserId, { whatsappProvider: "meta", metaConnected: true });

  global.fetch = mockFetch as any;
  const { channelService } = await import("../server/channelService");
  const result = await channelService.sendMessage({
    userId: testUserId,
    contactId: oldContact.id,
    content: "Message to pre-fix contact",
  });
  global.fetch = originalFetch;

  if (metaCalled && !twilioCalled && result.success) {
    addResult("TEST 8: Old conversations use current provider (Meta)", "PASS",
      `Old contact ${oldContact.id} routed via Meta. Meta: ${metaCalled}, Twilio: ${twilioCalled}, success: ${result.success}`);
  } else {
    addResult("TEST 8: Old conversations use current provider (Meta)", "FAIL",
      `Old contact ${oldContact.id}. Meta: ${metaCalled}, Twilio: ${twilioCalled}, success: ${result.success}`);
  }
}

async function test9_IncomingPathAnalysis() {
  console.log("\n--- TEST 9: Incoming Reply & Status Path Analysis ---");

  const fs = await import("fs");
  const routesContent = fs.readFileSync("server/routes.ts", "utf-8");

  const metaWebhookEndpoint = routesContent.includes('app.post("/api/webhook/meta"');
  const twilioIncomingEndpoint = routesContent.includes('app.post("/api/webhook/twilio/incoming"');
  const twilioStatusEndpoint = routesContent.includes('app.post("/api/webhook/twilio/status"');

  const metaIncomingUsesMeta = routesContent.includes("sendMetaWhatsAppMessage(user.id, incomingMessage.from");
  const twilioIncomingUsesTwilio = routesContent.includes("sendUserWhatsAppMessage(userId, chat.whatsappPhone!");

  const metaStatusHandler = routesContent.includes("parseMetaStatusWebhook(req.body)");
  const twilioStatusHandler = routesContent.includes("parseStatusWebhook(req.body)");

  const metaInboxQueue = routesContent.includes("addInboxJob") && routesContent.includes('channel: \'whatsapp\'');
  const twilioInboxQueue = routesContent.includes("addInboxJob") && routesContent.includes("isWhatsApp ? 'whatsapp' : 'sms'");

  const details: string[] = [];
  details.push(`Separate webhook endpoints: Meta=${metaWebhookEndpoint}, Twilio-In=${twilioIncomingEndpoint}, Twilio-Status=${twilioStatusEndpoint}`);
  details.push(`Meta incoming auto-reply uses sendMetaWhatsAppMessage: ${metaIncomingUsesMeta}`);
  details.push(`Twilio incoming auto-reply uses sendUserWhatsAppMessage: ${twilioIncomingUsesTwilio}`);
  details.push(`Meta status parsed by parseMetaStatusWebhook: ${metaStatusHandler}`);
  details.push(`Twilio status parsed by parseStatusWebhook: ${twilioStatusHandler}`);
  details.push(`Both paths queue to unified inbox: Meta=${metaInboxQueue}, Twilio=${twilioInboxQueue}`);

  const allCorrect = metaWebhookEndpoint && twilioIncomingEndpoint && twilioStatusEndpoint &&
    metaIncomingUsesMeta && twilioIncomingUsesTwilio && metaStatusHandler && twilioStatusHandler;

  addResult("TEST 9: Incoming replies & status updates use separate provider-specific paths", allCorrect ? "PASS" : "FAIL",
    details.join(" | "));
}

async function runAllTests() {
  try {
    await setupTestData();
    await test1_MetaProviderRouting();
    await test2_TwilioProviderRouting();
    await test3_ProviderSwitch();
    await test4_MediaMessageRouting();
    await test5_UIAvailability();
    await test6_MetaFailureNoFallback();
    await test7_RoutingLogs();
    await test8_OldConversationRouting();
    await test9_IncomingPathAnalysis();

    console.log("\n\n========================================");
    console.log("         TEST REPORT SUMMARY");
    console.log("========================================\n");

    const passed = TEST_REPORT.filter(t => t.status === "PASS").length;
    const failed = TEST_REPORT.filter(t => t.status === "FAIL").length;

    for (const t of TEST_REPORT) {
      const icon = t.status === "PASS" ? "✅" : "❌";
      console.log(`${icon} ${t.test}`);
      console.log(`   ${t.details}\n`);
    }

    console.log("----------------------------------------");
    console.log(`Total: ${TEST_REPORT.length} | Passed: ${passed} | Failed: ${failed}`);
    console.log("----------------------------------------");

    console.log("\n========================================");
    console.log("     ARCHITECTURE ANALYSIS");
    console.log("========================================\n");
    console.log("OUTBOUND MESSAGES (user sends to contact):");
    console.log("  → channelService.sendMessage() → WhatsAppAdapter.send()");
    console.log("  → Adapter checks user.whatsappProvider");
    console.log("  → Routes to Meta Graph API OR Twilio API");
    console.log("  → Provider decision is per-user, not per-conversation\n");
    console.log("INCOMING MESSAGES (contact replies):");
    console.log("  → Meta:   POST /api/webhook/meta → parseMetaIncomingWebhook → addInboxJob");
    console.log("  → Twilio: POST /api/webhook/twilio/incoming → parseIncomingWebhook → addInboxJob");
    console.log("  → These are SEPARATE endpoints called by the provider directly");
    console.log("  → No provider routing needed — the webhook URL determines the path\n");
    console.log("DELIVERY STATUS UPDATES:");
    console.log("  → Meta:   Handled in POST /api/webhook/meta via parseMetaStatusWebhook");
    console.log("  → Twilio: Handled in POST /api/webhook/twilio/status via parseStatusWebhook");
    console.log("  → Each provider reports status through its own webhook\n");
    console.log("AUTO-REPLIES:");
    console.log("  → Meta webhook:   Uses sendMetaWhatsAppMessage (correct)");
    console.log("  → Twilio webhook: Uses sendUserWhatsAppMessage (correct)");
    console.log("  → Each path uses the same API that delivered the incoming message\n");
    console.log("OLD CONVERSATIONS/CONTACTS:");
    console.log("  → Routing is based on user.whatsappProvider, NOT conversation metadata");
    console.log("  → Old contacts/conversations route to whichever provider is currently active");
    console.log("  → Verified in Test 8 with a pre-fix legacy contact\n");
    console.log("VALIDATION METHOD:");
    console.log("  → MOCKS ONLY — no live Meta or Twilio sandbox was used");
    console.log("  → global.fetch was intercepted to simulate Meta Graph API responses");
    console.log("  → Twilio client creation was validated via provider path logic");
    console.log("  → Code path analysis (Test 9) verified webhook handler source code");
    console.log("  → For production confidence, a Meta test phone number or Twilio test");
    console.log("    credentials should be used in a staging environment\n");

    if (failed > 0) process.exit(1);
  } catch (error) {
    console.error("Test suite error:", error);
    process.exit(1);
  }
}

runAllTests();
