import type { TestChatView } from "@shared/aiTestChat";

/**
 * After an uncertain POST /turn response, make one read-only check of the
 * server-owned session. A committed turn contains both the exact event ID and
 * the following assistant message; anything else is NOT proof of completion.
 *
 * Never auto-POST or invent a new event ID during recovery.
 */
export function committedTestChatTurn(
  candidate: unknown,
  expectedSessionId: string,
  event: { eventId: string; text: string },
): candidate is TestChatView {
  if (!candidate || typeof candidate !== "object") return false;
  const view = candidate as Partial<TestChatView>;
  if (view.id !== expectedSessionId || !Array.isArray(view.transcript)) return false;
  const index = view.transcript.findIndex(message =>
    message?.role === "user" &&
    message.id === event.eventId &&
    message.content === event.text
  );
  const reply = index >= 0 ? view.transcript[index + 1] : undefined;
  return reply?.role === "assistant" &&
    typeof reply.content === "string" &&
    typeof reply.id === "string" &&
    reply.id !== event.eventId;
}
