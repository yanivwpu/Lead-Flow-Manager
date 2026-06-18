import {
  AGENT_PAGE_VISITOR_NAME,
  buildWebchatLeadCustomFields,
  contactNeedsWebchatIdentity,
  extractIdentityHints,
  isAnonymousWebchatVisitorName,
  isWebchatVisitorId,
  resolveWebchatLeadSource,
  resolveWebchatVisitorDisplayName,
  WEBSITE_VISITOR_NAME,
} from "../shared/agent/webchatLeadContext";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// Visitor naming
assert(
  resolveWebchatVisitorDisplayName("agent_page") === AGENT_PAGE_VISITOR_NAME,
  "agent page visitor name",
);
assert(
  resolveWebchatVisitorDisplayName(undefined) === WEBSITE_VISITOR_NAME,
  "default website visitor name",
);
assert(isAnonymousWebchatVisitorName(AGENT_PAGE_VISITOR_NAME), "agent page is anonymous");
assert(!isAnonymousWebchatVisitorName("Jane Doe"), "real name is not anonymous");

// Lead source resolution
assert(
  resolveWebchatLeadSource({ source: "agent_page" }) === "agent_page",
  "explicit source param",
);
assert(
  resolveWebchatLeadSource({ parentUrl: "https://app.example.com/agents/jane-smith" }) === "agent_page",
  "parent URL agent page path",
);
assert(
  resolveWebchatLeadSource({ parentUrl: "https://example.com/pricing" }) === undefined,
  "non-agent parent URL",
);

// Custom fields
const cf = buildWebchatLeadCustomFields("agent_page", "visitor_123");
assert(cf.sourcePage === "agent_page", "sourcePage set");
assert(cf.leadSource === "Agent Page", "leadSource label set");
assert(cf.webchatVisitorId === "visitor_123", "visitor id preserved");

// Identity extraction
const hints = extractIdentityHints("I'm Sarah Lee — sarah@example.com or 555-123-4567");
assert(hints.email === "sarah@example.com", "email extracted");
assert(hints.phone === "5551234567", "phone normalized");
assert(hints.name === "Sarah Lee", "name extracted");

const nameOnly = extractIdentityHints("Michael Chen");
assert(nameOnly.name === "Michael Chen", "bare name accepted");

assert(isWebchatVisitorId("visitor_1700000_abc"), "visitor id detected");
assert(!isWebchatVisitorId("5551234567"), "real phone not visitor id");

// Contact info need
assert(
  contactNeedsWebchatIdentity({
    name: AGENT_PAGE_VISITOR_NAME,
    email: null,
    phone: "visitor_123",
  }),
  "anonymous visitor needs identity",
);
assert(
  !contactNeedsWebchatIdentity({
    name: "Jane Doe",
    email: "jane@example.com",
    phone: null,
  }),
  "named contact with email ok",
);

console.log("webchat-lead-flow.test.ts: all assertions passed");
