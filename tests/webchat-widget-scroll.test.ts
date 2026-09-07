/**
 * WidgetFrame conversation-grade scrolling for tall structured forms.
 * Run: npx tsx --test tests/webchat-widget-scroll.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideWebchatScrollAction,
  mergeWebchatPolledMessages,
  patchWebchatPolledMessage,
  refreshWebchatVisitorMediaUrl,
  webchatDistanceFromBottom,
  webchatIdsEqual,
  webchatIsNearBottom,
  webchatMessageIds,
  webchatMessageIdsKey,
  WEBCHAT_NEAR_BOTTOM_PX,
} from "../shared/webchatWidgetScroll";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const formMsg = { id: "form-1", contentType: "form", content: "Please share your details" };
const textOut = { id: "hi", contentType: "text", content: "Hi" };
const confirm = { id: "result-1", contentType: "form_result", content: "Form submitted" };
const image = {
  id: "img-1",
  contentType: "image",
  content: null as string | null,
  mediaUrl: "https://cdn.example/img?sig=aaa",
};

test("long form initially shows title and first field (scroll to form start, not bottom)", () => {
  const decision = decideWebchatScrollAction({
    prevIds: [],
    nextMessages: [textOut, formMsg],
    nearBottom: true,
    userInitiated: false,
    alreadyRevealedFormIds: new Set(),
    expectConfirmation: false,
  });
  assert.equal(decision.action, "form-start");
  assert.equal(decision.messageId, "form-1");
});

test("visitor can scroll from bottom to top and remains there across multiple polls", () => {
  const revealed = new Set<string>(["form-1"]);
  const payload = [textOut, formMsg];
  let prevIds = webchatMessageIds(payload);
  let nearBottom = false;
  for (let poll = 0; poll < 4; poll++) {
    const merged = mergeWebchatPolledMessages(payload, [
      { ...textOut },
      { ...formMsg },
    ]);
    assert.equal(merged, payload);
    const decision = decideWebchatScrollAction({
      prevIds,
      nextMessages: merged,
      nearBottom,
      userInitiated: false,
      alreadyRevealedFormIds: revealed,
      expectConfirmation: false,
    });
    assert.equal(decision.action, "preserve", `poll ${poll}`);
    prevIds = webchatMessageIds(merged);
  }
});

test("multiple polls do not spring the form downward", () => {
  const revealed = new Set<string>(["form-1"]);
  let prev = [
    { ...formMsg },
    { ...image, mediaUrl: "https://cdn.example/img?exp=1&sig=aaa" },
  ];
  const heldScrollTop = 96;
  for (let poll = 0; poll < 5; poll++) {
    const incomingUrl =
      poll === 0
        ? "https://cdn.example/img?exp=1&sig=aaa"
        : `https://cdn.example/img?exp=${poll + 1}&sig=rot${poll}`;
    const merged = mergeWebchatPolledMessages(prev, [
      { ...formMsg },
      { ...image, mediaUrl: incomingUrl },
    ]);
    const decision = decideWebchatScrollAction({
      prevIds: webchatMessageIds(prev),
      nextMessages: merged,
      nearBottom: false,
      userInitiated: false,
      alreadyRevealedFormIds: revealed,
      expectConfirmation: false,
    });
    assert.equal(decision.action, "preserve", `poll ${poll}`);
    assert.notEqual(decision.action, "form-start");
    assert.notEqual(decision.action, "bottom");
    assert.equal(heldScrollTop, 96);
    prev = merged;
  }
  assert.equal(prev[1]!.mediaUrl, "https://cdn.example/img?exp=5&sig=rot4");
});

test("identical polling payload preserves object identity and scroll decision", () => {
  const prev = [image];
  const polled = [{ ...image }];
  const merged = mergeWebchatPolledMessages(prev, polled);
  assert.equal(merged, prev);
  assert.equal(merged[0]!.mediaUrl, image.mediaUrl);
  assert.equal(
    decideWebchatScrollAction({
      prevIds: webchatMessageIds(prev),
      nextMessages: merged,
      nearBottom: false,
      userInitiated: false,
      alreadyRevealedFormIds: new Set(),
      expectConfirmation: false,
    }).action,
    "preserve",
  );
});

test("new message while user is reading older content does not yank the viewport", () => {
  const decision = decideWebchatScrollAction({
    prevIds: ["form-1"],
    nextMessages: [formMsg, { id: "agent-2", contentType: "text", content: "Thanks" }],
    nearBottom: false,
    userInitiated: false,
    alreadyRevealedFormIds: new Set(["form-1"]),
    expectConfirmation: false,
  });
  assert.equal(decision.action, "preserve");
});

test("new message while already at bottom remains visible", () => {
  const decision = decideWebchatScrollAction({
    prevIds: ["hi"],
    nextMessages: [textOut, { id: "agent-2", contentType: "text", content: "Next" }],
    nearBottom: true,
    userInitiated: false,
    alreadyRevealedFormIds: new Set(),
    expectConfirmation: false,
  });
  assert.equal(decision.action, "bottom");
});

test("form submission confirmation becomes visible", () => {
  const decision = decideWebchatScrollAction({
    prevIds: ["form-1"],
    nextMessages: [formMsg, confirm],
    nearBottom: false,
    userInitiated: false,
    alreadyRevealedFormIds: new Set(["form-1"]),
    expectConfirmation: true,
  });
  assert.equal(decision.action, "confirmation");
  assert.equal(decision.messageId, "result-1");
});

test("same IDs + refreshed mediaUrl updates the image URL and preserves scroll", () => {
  const prev = [{ ...image }];
  const rotated = "https://cdn.example/img?exp=2&sig=bbb";
  const merged = mergeWebchatPolledMessages(prev, [{ ...image, mediaUrl: rotated }]);
  assert.notEqual(merged, prev);
  assert.equal(merged[0]!.mediaUrl, rotated);
  assert.equal(webchatMessageIdsKey(prev), webchatMessageIdsKey(merged));
  const heldScrollTop = 140;
  const decision = decideWebchatScrollAction({
    prevIds: webchatMessageIds(prev),
    nextMessages: merged,
    nearBottom: false,
    userInitiated: false,
    alreadyRevealedFormIds: new Set(),
    expectConfirmation: false,
  });
  assert.equal(decision.action, "preserve");
  assert.equal(heldScrollTop, 140);
});

test("expired URL followed by a new signed URL is adopted for retry/recovery", () => {
  const expired = "/api/webchat/wgt_a/vis/media/img-1?exp=1&sig=old";
  const fresh = "/api/webchat/wgt_a/vis/media/img-1?exp=999999&sig=new";
  assert.equal(refreshWebchatVisitorMediaUrl(expired, fresh), fresh);
  assert.equal(refreshWebchatVisitorMediaUrl(expired, null), null);
  assert.equal(refreshWebchatVisitorMediaUrl("blob:http://local/1", null), "blob:http://local/1");
  const afterExpire = mergeWebchatPolledMessages(
    [{ ...image, mediaUrl: expired }],
    [{ ...image, mediaUrl: expired }],
  );
  const recovered = mergeWebchatPolledMessages(afterExpire, [{ ...image, mediaUrl: fresh }]);
  assert.equal(recovered[0]!.mediaUrl, fresh);
  assert.equal(
    decideWebchatScrollAction({
      prevIds: ["img-1"],
      nextMessages: recovered,
      nearBottom: false,
      userInitiated: false,
      alreadyRevealedFormIds: new Set(),
      expectConfirmation: false,
    }).action,
    "preserve",
  );
  const bubble = read("client/src/components/webchat/WebchatMediaBubble.tsx");
  assert.match(bubble, /\[props\.src\]/);
  assert.match(bubble, /setPhase\("loading"\)/);
  assert.match(bubble, /setCacheBust\(0\)/);
  assert.match(bubble, /href=\{props\.src\}/);
});

test("same IDs + unchanged URL does not replace rows or count as a new message", () => {
  const first = [{ ...image }];
  const again = mergeWebchatPolledMessages(first, [{ ...image, mediaUrl: image.mediaUrl }]);
  assert.equal(again, first);
  const patchedSame = patchWebchatPolledMessage(first[0]!, { ...first[0]! });
  assert.equal(patchedSame, first[0]);
  assert.equal(
    decideWebchatScrollAction({
      prevIds: ["img-1"],
      nextMessages: again,
      nearBottom: true,
      userInitiated: false,
      alreadyRevealedFormIds: new Set(),
      expectConfirmation: false,
    }).action,
    "preserve",
  );
});

test("media URL rotation does not count as a new message", () => {
  const first = [{ ...image }];
  const afterPoll = mergeWebchatPolledMessages(first, [
    { ...image, mediaUrl: "https://cdn.example/img?sig=rotated" },
  ]);
  assert.equal(webchatMessageIdsKey(first), webchatMessageIdsKey(afterPoll));
  assert.equal(afterPoll[0]!.id, "img-1");
  assert.equal(afterPoll[0]!.mediaUrl, "https://cdn.example/img?sig=rotated");
  assert.equal(
    decideWebchatScrollAction({
      prevIds: ["img-1"],
      nextMessages: afterPoll,
      nearBottom: false,
      userInitiated: false,
      alreadyRevealedFormIds: new Set(),
      expectConfirmation: false,
    }).action,
    "preserve",
  );
});

test("caption and status updates do not break dedupe or scrolling", () => {
  const prev = [{ ...image, content: "Before", status: "sent" as const }];
  const merged = mergeWebchatPolledMessages(prev, [
    { ...image, content: "After caption", status: "delivered", mediaUrl: image.mediaUrl },
  ]);
  assert.equal(merged[0]!.id, "img-1");
  assert.equal(merged[0]!.content, "After caption");
  assert.equal(merged[0]!.status, "delivered");
  assert.equal(merged[0]!.mediaUrl, image.mediaUrl);
  assert.deepEqual(webchatMessageIds(merged), ["img-1"]);
  assert.equal(
    decideWebchatScrollAction({
      prevIds: ["img-1"],
      nextMessages: merged,
      nearBottom: false,
      userInitiated: false,
      alreadyRevealedFormIds: new Set(),
      expectConfirmation: false,
    }).action,
    "preserve",
  );
});

test("form and button payload refresh keeps identity and does not scroll", () => {
  const prev = [
    {
      id: "form-1",
      contentType: "form",
      content: "Please share your details",
      templateVariables: { webchatForm: { id: "lead_capture", title: "Old", fields: [] } },
    },
  ];
  const merged = mergeWebchatPolledMessages(prev, [
    {
      id: "form-1",
      contentType: "form",
      content: "Please share your details",
      templateVariables: {
        webchatForm: { id: "lead_capture", title: "New title", fields: [{ id: "email", type: "email", label: "Email" }] },
        chatbotButtons: [{ label: "OK", value: "ok" }],
      },
    },
  ]);
  assert.notEqual(merged, prev);
  assert.equal(merged[0]!.id, "form-1");
  assert.equal(
    (merged[0]!.templateVariables as { webchatForm: { title: string } }).webchatForm.title,
    "New title",
  );
  assert.equal(
    decideWebchatScrollAction({
      prevIds: ["form-1"],
      nextMessages: merged,
      nearBottom: true,
      userInitiated: false,
      alreadyRevealedFormIds: new Set(["form-1"]),
      expectConfirmation: false,
    }).action,
    "preserve",
  );
});

test("near-bottom threshold and sending a message resume pin", () => {
  assert.equal(webchatIsNearBottom(1920, 2000, 80), true);
  assert.equal(webchatDistanceFromBottom(0, 2000, 400) > WEBCHAT_NEAR_BOTTOM_PX, true);
  assert.equal(webchatIsNearBottom(0, 2000, 400), false);
  const afterSend = decideWebchatScrollAction({
    prevIds: ["form-1"],
    nextMessages: [formMsg, { id: "opt_1", contentType: "text", content: "Hello" }],
    nearBottom: false,
    userInitiated: true,
    alreadyRevealedFormIds: new Set(["form-1"]),
    expectConfirmation: false,
  });
  assert.equal(afterSend.action, "bottom");
});

test("already revealed form is not repositioned on a later poll that adds no ids", () => {
  const decision = decideWebchatScrollAction({
    prevIds: ["form-1"],
    nextMessages: [formMsg],
    nearBottom: true,
    userInitiated: false,
    alreadyRevealedFormIds: new Set(["form-1"]),
    expectConfirmation: false,
  });
  assert.equal(decision.action, "preserve");
  assert.equal(webchatIdsEqual(["form-1"], webchatMessageIds([formMsg])), true);
});

test("WidgetFrame uses conversation-grade scroll and does not spring on poll", () => {
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /decideWebchatScrollAction/);
  assert.match(frame, /mergeWebchatPolledMessages/);
  assert.match(frame, /webchat-message-list/);
  assert.match(frame, /webchat-form-msg-/);
  assert.match(frame, /\[overflow-anchor:none\]/);
  assert.match(frame, /userInitiatedScrollRef/);
  assert.match(frame, /expectFormConfirmationRef/);
  assert.match(frame, /block: "start"/);
  assert.match(frame, /inputRef\.current\?\.focus\(\)/);
  assert.match(frame, /flex-shrink-0/);
  assert.match(frame, /overflow-x-hidden/);
  assert.match(frame, /min-w-0 flex-1 overflow-y-auto/);
  assert.doesNotMatch(frame, /messagesEndRef/);
  assert.doesNotMatch(frame, /ResizeObserver/);
  assert.doesNotMatch(frame, /MutationObserver/);
  assert.match(frame, /preserveScrollTopRef\.current = scroller\.scrollTop/);
  assert.match(frame, /scroller\.scrollTop = preserveScrollTopRef\.current/);
  const scrollFx = frame.slice(frame.indexOf("useLayoutEffect"), frame.indexOf("const markFailed"));
  assert.match(scrollFx, /\[deduped, applyScrollDecision\]/);
  assert.match(scrollFx, /prevIds: prevMessageIdsRef\.current/);
  assert.doesNotMatch(frame, /messagesEndRef\.current\?\.scrollIntoView/);
  assert.doesNotMatch(frame, /behavior: "smooth"/);
  assert.match(read("client/src/pages/WidgetChat.tsx"), /WebchatWidget/);
  const scrollSrc = read("shared/webchatWidgetScroll.ts");
  assert.match(scrollSrc, /refreshWebchatVisitorMediaUrl/);
  assert.match(scrollSrc, /idsUnchanged/);
  assert.doesNotMatch(scrollSrc, /JSON\.stringify\(input\.nextMessages\)/);
});
