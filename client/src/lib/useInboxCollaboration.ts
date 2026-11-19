import { useEffect, useRef, useState } from "react";
export type ReplySnapshot = { revision: string; aiEpoch: number };
interface DraftClaim {
  sendAttemptId: string;
  replyRevision: string;
  aiEpoch: number;
  storageKey: string;
  submittedText?: string;
  reviewedRevision?: string;
}
export function useInboxDraftClaim(input: {
  actorId?: string;
  scope: string | null;
  text: string;
  conversationId?: string | null;
  getSnapshot: () => ReplySnapshot | undefined;
}) {
  const claim = useRef<DraftClaim | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const key =
    input.scope && input.actorId
      ? `inbox-claim:${input.actorId}:${input.scope}`
      : null;
  useEffect(() => {
    try {
      claim.current = key
        ? JSON.parse(sessionStorage.getItem(key) || "null")
        : null;
    } catch {
      claim.current = null;
    }
    setConflict(null);
  }, [key]);
  function save(next: DraftClaim) {
    claim.current = next;
    try {
      sessionStorage.setItem(next.storageKey, JSON.stringify(next));
    } catch {
      /* private storage */
    }
  }
  function prepare(submittedText = input.text) {
    if (!key) throw new Error("reply_context_required");
    let next = claim.current;
    if (!next || next.storageKey !== key) {
      const snapshot = input.getSnapshot();
      next = {
        storageKey: key,
        sendAttemptId: crypto.randomUUID(),
        replyRevision:
          snapshot?.revision || (input.conversationId ? "unobserved" : "0/-"),
        aiEpoch: snapshot?.aiEpoch || 0,
      };
    }
    if (
      next.submittedText !== undefined &&
      next.submittedText !== submittedText
    )
      next = { ...next, sendAttemptId: crypto.randomUUID() };
    save({ ...next, submittedText });
    return {
      ...claim.current!,
      conversationId: input.conversationId || undefined,
    };
  }
  useEffect(() => {
    if (input.text && !claim.current && key) {
      const snapshot = input.getSnapshot();
      save({
        storageKey: key,
        sendAttemptId: crypto.randomUUID(),
        replyRevision:
          snapshot?.revision || (input.conversationId ? "unobserved" : "0/-"),
        aiEpoch: snapshot?.aiEpoch || 0,
      });
    }
  }, [input.text, key]);
  function sent(attempt?: DraftClaim) {
    const k = attempt?.storageKey || key;
    if (k)
      try {
        sessionStorage.removeItem(k);
      } catch {}
    if (claim.current?.storageKey === k) claim.current = null;
    if (k === key) setConflict(null);
  }
  function reviewed(snapshot: ReplySnapshot) {
    const next = claim.current?.storageKey === key ? claim.current : prepare();
    save({
      ...next,
      replyRevision: snapshot.revision,
      reviewedRevision: snapshot.revision,
      aiEpoch: snapshot.aiEpoch,
    });
    setConflict("reviewed");
  }
  return { prepare, sent, reviewed, conflict, setConflict, storageKey: key };
}
