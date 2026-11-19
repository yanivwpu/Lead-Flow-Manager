import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
export type ReplyActivity = { id: string; createdAt: string; generatedBy?: string | null };
export type ReplySnapshot = { revision: string; aiEpoch: number };
export const replySnapshotKey = (id: string | null | undefined) => ["/api/conversations", id, "reply-snapshot"];
export function useInboxReplySnapshot(id: string | null | undefined) {
  return useQuery<ReplySnapshot>({ queryKey: replySnapshotKey(id), enabled: false }).data;
}
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
  snapshot: ReplySnapshot | undefined;
}) {
  const claim = useRef<DraftClaim | null>(null);
  const [conflict, updateConflict] = useState<string | null>(null);
  const [latestReply, setLatestReply] = useState<ReplyActivity | null>(null);
  function setConflict(code: string | null, latest?: ReplyActivity) {
    updateConflict(code);
    setLatestReply(latest || null);
  }
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
    // An abandoned, never-submitted claim is not a draft after an empty reload.
    // Submitted claims retain their retry ID/revision even after an uncertain send.
    if (!input.text && claim.current?.submittedText === undefined) {
      claim.current = null;
      if (key) try { sessionStorage.removeItem(key); } catch {}
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
      const snapshot = input.snapshot;
      if (input.conversationId && !snapshot) {
        throw Object.assign(new Error("reply_state_unavailable"), { sendPayload: { code: "reply_state_unavailable" } });
      }
      next = {
        storageKey: key,
        sendAttemptId: crypto.randomUUID(),
        replyRevision:
          snapshot?.revision || "0/-",
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
      const snapshot = input.snapshot;
      if (input.conversationId && !snapshot) return;
      save({
        storageKey: key,
        sendAttemptId: crypto.randomUUID(),
        replyRevision:
          snapshot?.revision || "0/-",
        aiEpoch: snapshot?.aiEpoch || 0,
      });
    }
  }, [input.text, key, input.snapshot, input.conversationId]);
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
  return { prepare, sent, reviewed, conflict, latestReply, setConflict, storageKey: key };
}
