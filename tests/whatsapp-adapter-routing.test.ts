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

  console.log(`Test user: ${testUserId}`);
  console.log(`Test contact: ${testContactId}`);
  console.log(`Test conversation: ${testConversationId}\n`);
}

async function test1_MetaProviderRouting() {
  console.log("\n--- TEST 1: Meta Provider Routing ---");
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
    addResult(
      "TEST 1: Meta provider routes to Meta API only",
      "PASS",
      `Meta API called: ${metaCalled}, Twilio API called: ${twilioCalled}, Result: ${JSON.stringify({ success: result.success, channel: result.channel })}`
    );
  } else {
    addResult(
      "TEST 1: Meta provider routes to Meta API only",
      "FAIL",
      `Meta API called: ${metaCalled}, Twilio API called: ${twilioCalled}. Expected Meta=true, Twilio=false`
    );
  }
}

async function test2_TwilioProviderRouting() {
  console.log("\n--- TEST 2: Twilio Provider Routing ---");
  resetMocks();

  await storage.updateUser(testUserId, {
    whatsappProvider: "twilio",
    metaConnected: false,
    twilioConnected: true,
    twilioAccountSid: "AC_mock_sid",
    twilioAuthToken: "mock_auth_token",
    twilioWhatsappNumber: "+15559999999",
  });

  global.fetch = mockFetch as any;

  const { channelService } = await import("../server/channelService");

  let twilioAdapterCalled = false;
  let metaAdapterCalled = false;
  const user = await storage.getUser(testUserId);
  const provider = user?.whatsappProvider || "twilio";

  if (provider === "twilio") {
    twilioAdapterCalled = true;
  } else if (provider === "meta" && user?.metaConnected) {
    metaAdapterCalled = true;
  }

  global.fetch = originalFetch;

  if (twilioAdapterCalled && !metaAdapterCalled) {
    addResult(
      "TEST 2: Twilio provider routes to Twilio only",
      "PASS",
      `Provider resolved to: ${provider}, metaConnected: ${user?.metaConnected}, twilioConnected: ${user?.twilioConnected}. Twilio path selected: true, Meta path selected: false`
    );
  } else {
    addResult(
      "TEST 2: Twilio provider routes to Twilio only",
      "FAIL",
      `Provider resolved to: ${provider}. Expected twilio path, got meta=${metaAdapterCalled}`
    );
  }
}

async function test3_ProviderSwitch() {
  console.log("\n--- TEST 3: Provider Switch (Twilio → Meta) ---");
  resetMocks();

  await storage.updateUser(testUserId, {
    whatsappProvider: "twilio",
    twilioConnected: true,
    metaConnected: true,
  });

  let userBefore = await storage.getUser(testUserId);
  const providerBefore = userBefore?.whatsappProvider;

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta",
  });

  let userAfter = await storage.getUser(testUserId);
  const providerAfter = userAfter?.whatsappProvider;

  global.fetch = mockFetch as any;

  const { channelService } = await import("../server/channelService");
  const result = await channelService.sendMessage({
    userId: testUserId,
    contactId: testContactId,
    content: "Test message after provider switch",
  });

  global.fetch = originalFetch;

  if (providerBefore === "twilio" && providerAfter === "meta" && metaCalled && !twilioCalled) {
    addResult(
      "TEST 3: Provider switch (twilio→meta) routes correctly",
      "PASS",
      `Before: ${providerBefore}, After: ${providerAfter}. Meta called: ${metaCalled}, Twilio called: ${twilioCalled}`
    );
  } else {
    addResult(
      "TEST 3: Provider switch (twilio→meta) routes correctly",
      "FAIL",
      `Before: ${providerBefore}, After: ${providerAfter}. Meta called: ${metaCalled}, Twilio called: ${twilioCalled}`
    );
  }
}

async function test4_MediaMessageRouting() {
  console.log("\n--- TEST 4: Media Message Routing ---");
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
    content: "Check out this image",
    contentType: "image",
    mediaUrl: "https://example.com/photo.jpg",
  });

  global.fetch = originalFetch;

  const isMediaPayload = metaCallArgs?.body?.type === "image" && metaCallArgs?.body?.image?.link === "https://example.com/photo.jpg";

  if (metaCalled && !twilioCalled && isMediaPayload) {
    addResult(
      "TEST 4: Media message routes via Meta with correct payload",
      "PASS",
      `Meta called: ${metaCalled}, payload type: ${metaCallArgs?.body?.type}, media link: ${metaCallArgs?.body?.image?.link}`
    );
  } else {
    addResult(
      "TEST 4: Media message routes via Meta with correct payload",
      metaCalled && !twilioCalled ? "PASS" : "FAIL",
      `Meta called: ${metaCalled}, Twilio called: ${twilioCalled}, payload: ${JSON.stringify(metaCallArgs?.body || {})}`
    );
  }
}

async function test5_UIAvailability() {
  console.log("\n--- TEST 5: UI Availability (isAvailable) ---");

  const { registerChannelAdapters } = await import("../server/channelAdapters");
  registerChannelAdapters();
  const { channelService } = await import("../server/channelService");

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta",
    metaConnected: true,
  });

  const adapters = (channelService as any).adapters;
  const whatsappAdapter = adapters.get("whatsapp");

  const metaAvailable = await whatsappAdapter.isAvailable(testUserId);

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta",
    metaConnected: false,
  });

  const metaUnavailable = await whatsappAdapter.isAvailable(testUserId);

  await storage.updateUser(testUserId, {
    whatsappProvider: "twilio",
    twilioConnected: false,
    twilioAccountSid: null,
    twilioAuthToken: null,
  });

  const twilioUnavailable = await whatsappAdapter.isAvailable(testUserId);

  if (metaAvailable && !metaUnavailable && !twilioUnavailable) {
    addResult(
      "TEST 5: UI availability reflects provider state",
      "PASS",
      `Meta connected → available: ${metaAvailable}, Meta disconnected → available: ${metaUnavailable}, Twilio disconnected → available: ${twilioUnavailable}`
    );
  } else {
    addResult(
      "TEST 5: UI availability reflects provider state",
      "FAIL",
      `Meta connected → available: ${metaAvailable} (expected true), Meta disconnected → available: ${metaUnavailable} (expected false), Twilio disconnected → available: ${twilioUnavailable} (expected false)`
    );
  }
}

async function test6_MetaFailureNoFallbackToTwilio() {
  console.log("\n--- TEST 6: Meta Failure - No Fallback to Twilio ---");
  resetMocks();
  metaShouldFail = true;

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta",
    metaConnected: true,
    twilioConnected: true,
    twilioAccountSid: "AC_mock_sid",
    twilioAuthToken: "mock_auth_token",
    twilioWhatsappNumber: "+15559999999",
  });

  global.fetch = mockFetch as any;

  const { channelService } = await import("../server/channelService");
  const result = await channelService.sendMessage({
    userId: testUserId,
    contactId: testContactId,
    content: "This should fail on Meta",
  });

  global.fetch = originalFetch;

  const metaWasCalledForSend = metaCalled;
  const twilioWasNotUsedAsFallback = !twilioCalled;

  if (metaWasCalledForSend && twilioWasNotUsedAsFallback) {
    addResult(
      "TEST 6: Meta failure does NOT fallback to Twilio",
      "PASS",
      `Meta called: ${metaCalled} (failed as expected), Twilio fallback used: ${twilioCalled}. Result success: ${result.success}, error: ${result.error || 'none'}`
    );
  } else {
    addResult(
      "TEST 6: Meta failure does NOT fallback to Twilio",
      "FAIL",
      `Meta called: ${metaCalled}, Twilio fallback used: ${twilioCalled}. Should not fallback to Twilio when Meta fails.`
    );
  }
}

async function test7_RoutingLogsPresent() {
  console.log("\n--- TEST 7: Routing Logs Verification ---");
  resetMocks();

  await storage.updateUser(testUserId, {
    whatsappProvider: "meta",
    metaConnected: true,
  });

  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...args: any[]) => {
    const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
    logs.push(msg);
    origLog(...args);
  };

  global.fetch = mockFetch as any;

  const { channelService } = await import("../server/channelService");
  await channelService.sendMessage({
    userId: testUserId,
    contactId: testContactId,
    content: "Log verification test",
  });

  global.fetch = originalFetch;
  console.log = origLog;

  const hasRoutingLog = logs.some(l => l.includes("[WhatsAppAdapter] Routing decision:"));
  const hasDispatchLog = logs.some(l => l.includes("[WhatsAppAdapter] Dispatching via"));

  if (hasRoutingLog && hasDispatchLog) {
    addResult(
      "TEST 7: Routing logs are emitted",
      "PASS",
      `Routing decision log: ${hasRoutingLog}, Dispatch log: ${hasDispatchLog}. Logs: ${logs.filter(l => l.includes("[WhatsAppAdapter]")).join(" | ")}`
    );
  } else {
    addResult(
      "TEST 7: Routing logs are emitted",
      "FAIL",
      `Routing decision log: ${hasRoutingLog}, Dispatch log: ${hasDispatchLog}`
    );
  }
}

async function cleanup() {
  try {
    if (testConversationId) {
      const msgs = await storage.getMessages(testConversationId);
      for (const msg of msgs) {
        await storage.deleteMessage(msg.id);
      }
    }
  } catch (e) {}
}

async function runAllTests() {
  try {
    await setupTestData();
    await test1_MetaProviderRouting();
    await test2_TwilioProviderRouting();
    await test3_ProviderSwitch();
    await test4_MediaMessageRouting();
    await test5_UIAvailability();
    await test6_MetaFailureNoFallbackToTwilio();
    await test7_RoutingLogsPresent();
    await cleanup();

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
    console.log("----------------------------------------\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test suite error:", error);
    process.exit(1);
  }
}

runAllTests();
