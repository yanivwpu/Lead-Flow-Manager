import assert from "node:assert/strict";
import test from "node:test";
import { GmailEmailProvider, normalizeGmailApiMessage } from "../server/emailChannel/gmailProvider";

const mailbox = "owner@example.com";
const recipient = "broker@example.com";

function message(id: string, labelIds: string[], from = mailbox, to = recipient) {
  return {
    id,
    threadId: "thread",
    labelIds,
    payload: { headers: [{ name: "From", value: from }, { name: "To", value: to }] },
  };
}

test("drafts never normalize, even with a SENT label or a different From address", () => {
  assert.equal(normalizeGmailApiMessage(message("draft", ["DRAFT"])), null);
  assert.equal(normalizeGmailApiMessage(message("draft", ["DRAFT", "SENT"])), null);
  assert.equal(normalizeGmailApiMessage(message("draft", ["DRAFT"], "alias@example.com")), null);
});

test("Gmail SENT controls outbound direction, including for send-as aliases", () => {
  assert.equal(normalizeGmailApiMessage(message("incoming", ["INBOX"], recipient, mailbox))?.direction, "inbound");
  assert.equal(normalizeGmailApiMessage(message("self", ["INBOX"], mailbox, mailbox))?.direction, "inbound");
  assert.equal(normalizeGmailApiMessage(message("unlabeled", []))?.direction, "inbound");
  assert.equal(normalizeGmailApiMessage(message("sent", ["SENT"]))?.direction, "outbound");
  assert.equal(normalizeGmailApiMessage(message("alias-sent", ["SENT"], "alias@example.com"))?.direction, "outbound");
});

test("bootstrap and bounded resync share draft filtering at messages.get", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: string) => {
    const url = new URL(input);
    switch (url.pathname) {
      case "/gmail/v1/users/me/messages":
        assert.equal(url.searchParams.get("q"), "(in:inbox OR in:sent)");
        return Response.json({ messages: [{ id: "draft" }, { id: "inbound" }, { id: "sent" }] });
      case "/gmail/v1/users/me/profile":
        return Response.json({ emailAddress: mailbox, historyId: "20" });
      case "/gmail/v1/users/me/messages/draft":
        return Response.json(message("draft", ["DRAFT"]));
      case "/gmail/v1/users/me/messages/inbound":
        return Response.json(message("inbound", ["INBOX"], recipient, mailbox));
      case "/gmail/v1/users/me/messages/sent":
        return Response.json(message("sent", ["SENT"]));
      case "/v1/userinfo":
        return Response.json({});
      default:
        assert.fail(`Unexpected request ${url}`);
    }
  });
  const provider = new GmailEmailProvider();
  const recent = await provider.listRecentMessages({ accessToken: "test-token", afterDate: null });
  assert.deepEqual(recent.messages.map(({ providerMessageId, direction }) => [providerMessageId, direction]), [
    ["inbound", "inbound"],
    ["sent", "outbound"],
  ]);
});

test("history handles autosaves, a new ID on send, and SENT label transitions once per message", async (t) => {
  const rawMessages = new Map([
    ["draft-2", message("draft-2", ["DRAFT"])],
    ["sent", message("sent", ["SENT"])],
    ["transition", message("transition", ["DRAFT"])],
  ]);
  const historyRequests: string[] = [];
  const messageRequests: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    assert.equal(init?.method ?? "GET", "GET");
    if (url.pathname === "/gmail/v1/users/me/history") {
      assert.deepEqual(url.searchParams.getAll("historyTypes"), ["messageAdded", "labelAdded"]);
      const start = url.searchParams.get("startHistoryId");
      const page = url.searchParams.get("pageToken");
      historyRequests.push(`${start}/${page ?? ""}`);
      if (start === "1") {
        return Response.json({
          history: [{ messagesAdded: ["draft-1", "draft-2", "transition"].map((id) => ({ message: { id } })) }],
          historyId: "10",
        });
      }
      assert.equal(start, "10");
      if (!page) {
        return Response.json({
          history: [{ messagesAdded: [{ message: { id: "sent" } }] }],
          nextPageToken: "more",
          historyId: "20",
        });
      }
      assert.equal(page, "more");
      return Response.json({
        history: [{
          labelsAdded: [
            { message: { id: "sent" }, labelIds: ["SENT"] },
            { message: { id: "transition" }, labelIds: ["SENT"] },
            { message: { id: "irrelevant" }, labelIds: ["STARRED"] },
          ],
        }],
        historyId: "21",
      });
    }
    assert.match(url.pathname, /^\/gmail\/v1\/users\/me\/messages\/[^/]+$/);
    const id = url.pathname.split("/").pop()!;
    messageRequests.push(id);
    const raw = rawMessages.get(id);
    return raw ? Response.json(raw) : new Response(null, { status: 404 });
  });

  const provider = new GmailEmailProvider();
  const accessToken = "test-token";
  const autosaves = await provider.historyList({ accessToken, startHistoryId: "1" });
  assert.deepEqual(await Promise.all(autosaves.messageIds.map((id) => provider.getMessage(accessToken, id))), [
    null, null, null,
  ]);

  rawMessages.delete("draft-2");
  rawMessages.set("transition", message("transition", ["SENT"]));
  const sent = await provider.historyList({ accessToken, startHistoryId: autosaves.historyId! });
  assert.equal(sent.historyId, "21");
  const normalized = await Promise.all(sent.messageIds.map((id) => provider.getMessage(accessToken, id)));
  assert.deepEqual(normalized.map((msg) => [msg?.providerMessageId, msg?.direction]), [
    ["sent", "outbound"],
    ["transition", "outbound"],
  ]);
  assert.deepEqual(historyRequests, ["1/", "10/", "10/more"]);
  assert.deepEqual(messageRequests, ["draft-1", "draft-2", "transition", "sent", "transition"]);
});

test("message reads use current labels and surface transient failures for retry", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () =>
    Response.json(message("transition", ["DRAFT"])),
  );
  const provider = new GmailEmailProvider();
  assert.equal(await provider.getMessage("test-token", "transition"), null);
  fetchMock.mock.mockImplementationOnce(async () => new Response(null, { status: 503 }));
  await assert.rejects(provider.getMessage("test-token", "transition"), /messages.get failed \(503\)/);
});
