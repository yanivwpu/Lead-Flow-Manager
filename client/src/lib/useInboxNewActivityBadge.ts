/**
 * App-shell Inbox new-activity badge (sidebar / mobile nav).
 * Independent of per-conversation unread / Needs Reply.
 *
 * Mount `useInboxNewActivityRealtime()` once in AppLayout.
 * Badges and Inbox ack use the shared React Query cache.
 */
import { useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import {
  INBOX_ACTIVITY_QUERY_KEY,
  formatInboxActivityBadge,
  isInboxAppPath,
  type InboxActivityPayload,
} from "@shared/inboxNewActivity";

async function fetchInboxActivity(): Promise<InboxActivityPayload> {
  const res = await apiRequest("GET", "/api/inbox/activity");
  return (await res.json()) as InboxActivityPayload;
}

export function useInboxNewActivityBadge() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: INBOX_ACTIVITY_QUERY_KEY,
    queryFn: fetchInboxActivity,
    enabled: Boolean(user?.id),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const setCount = useCallback(
    (count: number, lastInboxCheckedAt?: string | null) => {
      queryClient.setQueryData<InboxActivityPayload>(INBOX_ACTIVITY_QUERY_KEY, (prev) => ({
        count: Math.max(0, Math.floor(Number(count) || 0)),
        lastInboxCheckedAt:
          lastInboxCheckedAt !== undefined
            ? lastInboxCheckedAt
            : prev?.lastInboxCheckedAt ?? null,
      }));
    },
    [queryClient],
  );

  const ack = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await apiRequest("POST", "/api/inbox/activity/ack");
      const payload = (await res.json()) as InboxActivityPayload;
      queryClient.setQueryData(INBOX_ACTIVITY_QUERY_KEY, payload);
    } catch {
      /* non-fatal */
    }
  }, [queryClient, user?.id]);

  const count = query.data?.count ?? 0;
  const label = formatInboxActivityBadge(count);

  return {
    count,
    label,
    isLoading: query.isLoading,
    ack,
    setCount,
  };
}

/** Single app-shell WS subscriber — call once from AppLayout. */
export function useInboxNewActivityRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;

    let ws: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let destroyed = false;

    const connect = () => {
      if (destroyed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/ws/presence`);

      ws.onopen = () => {
        ws!.send(
          JSON.stringify({
            type: "auth",
            userId: user.id,
            userName: user.name || "Agent",
          }),
        );
        heartbeat = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "heartbeat" }));
          }
        }, 25_000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type !== "new_message") return;
          // Visible Inbox will ack; applying the incremented count here races and can stick the badge.
          if (
            typeof document !== "undefined" &&
            document.visibilityState === "visible" &&
            isInboxAppPath(window.location.pathname)
          ) {
            return;
          }
          if (typeof msg.inboxNewActivityCount === "number") {
            queryClient.setQueryData<InboxActivityPayload>(INBOX_ACTIVITY_QUERY_KEY, (prev) => ({
              count: Math.max(0, Math.floor(msg.inboxNewActivityCount)),
              lastInboxCheckedAt: prev?.lastInboxCheckedAt ?? null,
            }));
          } else {
            void queryClient.invalidateQueries({ queryKey: INBOX_ACTIVITY_QUERY_KEY });
          }
        } catch {
          /* ignore */
        }
      };

      ws.onclose = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      destroyed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [user?.id, user?.name, queryClient]);
}

/** Ack when Inbox is mounted and the document is visible; re-ack on visibility restore. */
export function useAckInboxActivityWhenVisible() {
  const { ack } = useInboxNewActivityBadge();
  const ackRef = useRef(ack);
  ackRef.current = ack;

  useEffect(() => {
    const maybeAck = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void ackRef.current();
      }
    };
    maybeAck();
    const onVis = () => maybeAck();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return {
    ackIfVisible: () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void ackRef.current();
      }
    },
  };
}
