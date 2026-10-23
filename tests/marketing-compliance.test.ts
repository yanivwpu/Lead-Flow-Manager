import assert from "node:assert/strict";
import { issueOptOutToken, readOptOutToken, normalizeMarketingEmail, normalizeMarketingPhone, addMarketingFooter, assertStagingMarketingRecipient, inboundStopIdentity } from "../server/marketingCompliance/policy";
import { toRfc2822 } from "../server/emailChannel/gmailProvider";
import { safeTextLinks } from "../shared/safeTextLinks";
import { isProspectEmailUnsubscribeSignal as isStop } from "../shared/prospectEmailSuppression";
const secret = "a sufficiently long isolated test secret 120";
const identity = { workspace: "tenant-a", email: "Person@Example.com" };
const token = issueOptOutToken(identity, secret);
assert.deepEqual(readOptOutToken(token, secret), { workspace: "tenant-a", email: "person@example.com" });
assert.notEqual(token, issueOptOutToken(identity, secret));
assert(!token.includes("person"));
assert.throws(() => readOptOutToken(token, "different sufficiently long secret for testing"));
assert.throws(() => readOptOutToken(token.slice(0, 20) + (token[20] === "X" ? "Y" : "X") + token.slice(21), secret));
assert.throws(() => readOptOutToken("invalid", secret));
assert.throws(() => issueOptOutToken(identity, "short"));
assert.equal(normalizeMarketingEmail("  Üser@EXAMPLE.COM "), "üser@example.com");
assert.equal(normalizeMarketingPhone("+1 (202) 555-0123"), "+12025550123");
assert.throws(() => normalizeMarketingPhone("2025550123"));
const bodies = addMarketingFooter({ text: "Hello\nhttps://example.com/path?x=1&y=2", brand: "A & B", address: "123 Example Road\nLondon", url: `https://mail.example.com/api/marketing/unsubscribe/${token}` });
assert(bodies.text.includes("123 Example Road"));
assert(bodies.text.includes(`https://mail.example.com/api/marketing/unsubscribe/${token}`));
assert(bodies.html.includes("A &amp; B"));
assert(bodies.html.includes("<footer>"));
assert.throws(() => addMarketingFooter({ text: "Hi", address: "", brand: "B", url: "https://e.test" }));
assert.throws(() => addMarketingFooter({ text: "Hi", address: "Road", brand: "B", url: "javascript:alert(1)" }));
const raw = toRfc2822({ from: "sender@example.com", to: ["person@example.com"], subject: "Hello", textBody: bodies.text, htmlBody: bodies.html, unsubscribeUrl: `https://mail.example.com/api/marketing/unsubscribe/${token}` });
for (const expected of ["text/plain", "text/html", "List-Unsubscribe: <https://", "List-Unsubscribe-Post: List-Unsubscribe=One-Click", "123 Example Road"]) assert(raw.includes(expected), expected);
assert(!toRfc2822({ from: "sender@example.com", to: ["person@example.com"], subject: "Receipt", textBody: "Paid" }).includes("List-Unsubscribe"));
for (const field of ["subject", "from"] as const) assert.throws(() => toRfc2822({ from: "a@b.test", to: ["p@b.test"], subject: "Hi", textBody: "Hi", [field]: "bad\r\nBcc: victim@example.com" }));
assert.throws(() => toRfc2822({ from: "a@b.test", to: ["p@b.test"], subject: "Hi", textBody: "Hi", unsubscribeUrl: "https://e.test/\r\nX: bad" }));
assert.throws(() => assertStagingMarketingRecipient(["person@example.com"], { NODE_ENV: "production", APP_ENV: "staging", MARKETING_SENDS_ENABLED: "staging-only", MARKETING_TEST_RECIPIENT: "person@example.com" }));
assert.throws(() => assertStagingMarketingRecipient(["person@example.com"], {}));
const env = { NODE_ENV: "test", APP_ENV: "staging", MARKETING_SENDS_ENABLED: "staging-only", MARKETING_TEST_RECIPIENT: "person@example.com" };
assertStagingMarketingRecipient(["Person@example.com"], env);
assert.throws(() => assertStagingMarketingRecipient(["other@example.com"], env));
assert.throws(() => assertStagingMarketingRecipient(["person@example.com", "person@example.com"], env));
assert.equal(safeTextLinks('<img src=x onerror=bad> https://example.com/a?x=1&y=2. javascript:alert(1)').filter(p => p.href).length, 1);
assert.equal(safeTextLinks("https://user:password@example.com").filter(p => p.href).length, 0);
for (const body of ["Stop", "Please remove me from your list.", "unsubscribe", "Do not contact me", "STOP MESSAGING ME"]) assert(isStop({ body }), body);
for (const body of ["Please stop by tomorrow.", "We use the word unsubscribe in our footer", "> Stop", "Thanks\nOn Monday Alice wrote:\nStop", "Can we stop discussing this and book a call?"]) assert(!isStop({ body }), body);
console.log("ok - opaque tokens, staging hold, MIME headers/footer, XSS, explicit STOP classification");

const { prospectMarketingQualityIssues } = await import("../shared/prospectMarketingQuality");
assert.deepEqual(prospectMarketingQualityIssues("שלום", "שלום, אפשר לדבר?"), []);
assert.deepEqual(prospectMarketingQualityIssues("Una idea", "Hola. ¿Te interesa una demo?"), []);
assert(prospectMarketingQualityIssues("Re: Demo", "As we discussed, happy to").length >= 2);
assert(prospectMarketingQualityIssues("Hi", "Want a demo? Can we call?").length > 0);
assert.deepEqual(prospectMarketingQualityIssues("Idea", "See https://example.com/?a=1&b=2. Would a demo help?"), []);

// Exercise the actual Gmail send/reply code with fetch replaced by a fake provider.
const { gmailEmailProvider } = await import("../server/emailChannel/gmailProvider");
const originalFetch = globalThis.fetch;
let providerCalls = 0;
try {
  globalThis.fetch = (async (url, init) => {
    assert(String(url).endsWith("/users/me/messages/send"));
    providerCalls++;
    const request = JSON.parse(String(init?.body));
    const mime = Buffer.from(request.raw, "base64url").toString("utf8");
    for (const expected of ["text/plain", "text/html", "List-Unsubscribe-Post: List-Unsubscribe=One-Click", "123 Example Road"]) assert(mime.includes(expected));
    return new Response(JSON.stringify({ id: "fake-message", threadId: "fake-thread" }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const params = { accessToken: "fake-token-not-a-credential", from: "sender@example.com", textBody: bodies.text, htmlBody: bodies.html, payload: { mailboxId: "fake-mailbox", to: ["person@example.com"], subject: "Hello", marketingUnsubscribeUrl: `https://mail.example.com/api/marketing/unsubscribe/${token}` } };
  assert((await gmailEmailProvider.sendNewEmail(params)).success);
  assert((await gmailEmailProvider.replyToThread({ ...params, threadId: "fake-thread" })).success);
  assert.equal(providerCalls, 2);
  globalThis.fetch = (async () => { throw new Error("network fixture"); }) as typeof fetch;
  await assert.rejects(gmailEmailProvider.sendNewEmail(params), /ambiguous_provider_delivery/);
} finally { globalThis.fetch = originalFetch; }

assert.equal(safeTextLinks("See https://example.com/path_(balanced)").find(p => p.href)?.href, "https://example.com/path_(balanced)");
assert.equal(safeTextLinks("https://example.com/path").find(p => p.href)?.href, "https://example.com/path");

const { prospectEmailUnsubscribeScope } = await import("../shared/prospectEmailSuppression");
assert.equal(prospectEmailUnsubscribeScope("Stop emailing me"), "email");
assert.equal(prospectEmailUnsubscribeScope("STOP\n\nOn Monday wrote:\nold mail"), "all");

assert.equal(safeTextLinks("See https://example.com!", true).find(p => p.href)?.href, "https://example.com");

assert.equal(prospectEmailUnsubscribeScope("Please stop contacting me"), "all");
assert.equal(prospectEmailUnsubscribeScope("Stop messaging me"), "all");

assert.deepEqual(inboundStopIdentity("12025550123", "malformed legacy email"), {phone:"+12025550123",email:undefined});
assert.deepEqual(inboundStopIdentity("+12025550123", " Person@Example.com "), {phone:"+12025550123",email:"person@example.com"});

for (const request of ["Please unsubscribe me from future emails", "STOP please", "Hi, please remove me from your list. Thanks!", "Not interested. Could you please unsubscribe me?"]) assert(isStop({body:request}),request);
for (const prose of ["Stop by tomorrow", "The unsubscribe link is broken", "I do not want to unsubscribe", "Please do not unsubscribe me"]) assert(!isStop({body:prose}),prose);
assert.equal(prospectEmailUnsubscribeScope("STOP please"),"all");

for (const subject of ["Unsubscribe", "Re: Unsubscribe", "STOP", "Please remove me from your list"]) {
  assert(isStop({subject,body:"Sent from my iPhone",fromEmail:"person@example.com"}),subject);
}
assert.equal(prospectEmailUnsubscribeScope("Sent from my iPhone","STOP"),"all");
assert.equal(prospectEmailUnsubscribeScope("STOP","Unsubscribe"),"all");
assert(!isStop({subject:"Stop by tomorrow",body:"Sent from my iPhone"}));
assert(!isStop({subject:"Delivery failure",body:"Unsubscribe",fromEmail:"mailer-daemon@example.com"}));

const {isTransientOutreachFailure} = await import("../shared/prospectOutreachFailureScope");
assert(!isTransientOutreachFailure("ambiguous_provider_delivery: timeout; reconcile before retry"));

for (const request of ["Please stop sending me emails.","Stop sending emails to me", "Please stop sending me any more marketing emails.","Stop sending me messages!"]) {
 assert(isStop({body:request}),request);
 assert(isStop({subject:request,body:"Sent from my iPhone"}),request);
}
assert.equal(prospectEmailUnsubscribeScope("Please stop sending me emails."),"email");
assert.equal(prospectEmailUnsubscribeScope("Stop sending me messages!"),"all");
for(const body of ["Please stop sending me code snippets.","Please do not stop sending me emails.","> Please stop sending me emails."]) assert(!isStop({body}),body);

for(const body of ["Stop texting me", "Stop sending me texts", "Please stop sending me any more promotional messages.", "Stop sending me marketing texts."]) {
 assert(isStop({body}),body);
 assert.equal(prospectEmailUnsubscribeScope(body),"all",body);
}
assert.equal(prospectEmailUnsubscribeScope("Stop sending me marketing emails."),"email");

const optOutExamples: Array<[string,"all"|"email"]> = [
 ["Stop sending me text messages","all"],["Please stop sending me SMS messages.","all"],
 ["Please stop sending me any more promotional text messages.","all"],
 ["Stop sending me email messages.","email"],["Stop receiving marketing emails.","email"],
 ["Please do not email me again.","email"],["Don't send me any more emails.","email"],
 ["Do not text me again.","all"],["Never message me again.","all"],
 ["I would like to unsubscribe from your mailing list.","email"],
 ["Take me off your email list please.","email"],["No more text messages please.","all"],
 ["No more emails please.","email"],["Stop everything.","all"],
];
for(const [body,scope] of optOutExamples) {
 assert(isStop({body}),body);assert.equal(prospectEmailUnsubscribeScope(body),scope,body);
 assert(isStop({subject:body,body:"Sent from my iPhone"}),body);
}
for(const body of ["Please do not unsubscribe me.","Don't stop sending me emails.","I don't want to unsubscribe.","The text messages feature has a stop button.","Stop sending me code samples.","> Stop sending me text messages","Thanks\nOn Monday Alice wrote:\nStop sending me text messages"]) assert(!isStop({body}),body);

for(const [body,scope] of [["Please stop sending me these text messages.","all"],["Stop sending me mail.","email"],["Please opt me out of your emails.","email"],["I'd like to unsubscribe.","email"],["Stop sending me WhatsApp messages.","all"]] as const) {assert(isStop({body}),body);assert.equal(prospectEmailUnsubscribeScope(body),scope,body);}
