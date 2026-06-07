import {
  automationSendGuardBlockUserMessage,
  RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES,
} from "../shared/automationSendGuardMessages";
import { isConversationInactiveForAutomation } from "../server/automationSendGuard";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function conv(status: string) {
  return { status } as { status: string };
}

function run() {
  for (const status of RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES) {
    assert(
      isConversationInactiveForAutomation(conv(status) as any, { allowReEngagementTemplateSend: true }) ===
        false,
      `re-engagement allows ${status}`
    );
    assert(
      isConversationInactiveForAutomation(conv(status) as any) === true,
      `automation blocks ${status} without re-engagement flag`
    );
  }

  assert(isConversationInactiveForAutomation(conv("blocked") as any, { allowReEngagementTemplateSend: true }), "blocked stays blocked");
  assert(isConversationInactiveForAutomation(conv("deleted") as any, { allowReEngagementTemplateSend: true }), "deleted stays blocked");
  assert(!isConversationInactiveForAutomation(conv("open") as any), "open is active");
  assert(!isConversationInactiveForAutomation(conv("pending") as any), "pending is active");

  assert(
    automationSendGuardBlockUserMessage("conversation_inactive", "resolved").includes("resolved"),
    "resolved user message"
  );
  assert(
    automationSendGuardBlockUserMessage("duplicate").includes("last minute"),
    "duplicate user message"
  );
  assert(
    automationSendGuardBlockUserMessage("do_not_contact").includes("do-not-contact"),
    "dnc user message"
  );

  console.log("automation-send-guard.test.ts: all passed");
}

run();
