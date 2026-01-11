import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./auth-context";

interface PresenceViewer {
  userId: string;
  userName: string;
  isTyping: boolean;
}

interface PresenceState {
  viewers: PresenceViewer[];
  isConnected: boolean;
}

export function usePresence(chatId: string | null) {
  const { user } = useAuth();
  const [state, setState] = useState<PresenceState>({
    viewers: [],
    isConnected: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!user) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/presence`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "auth",
        userId: user.id,
        userName: user.name,
      }));
      setState(prev => ({ ...prev, isConnected: true }));

      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "heartbeat" }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === "presence_update") {
          const otherViewers = message.viewers.filter(
            (v: PresenceViewer) => v.userId !== user.id
          );
          setState(prev => ({ ...prev, viewers: otherViewers }));
        }
      } catch (error) {
        console.error("Presence message parse error:", error);
      }
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false, viewers: [] }));
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [user]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
    };
  }, [connect]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;

    ws.send(JSON.stringify({ type: "join_chat", chatId }));

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave_chat", chatId }));
      }
    };
  }, [chatId, state.isConnected]);

  const setTyping = useCallback((isTyping: boolean) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !chatId) return;

    ws.send(JSON.stringify({
      type: isTyping ? "typing" : "stop_typing",
      chatId,
    }));
  }, [chatId]);

  const otherViewers = state.viewers.filter(v => v.userId !== user?.id);

  return {
    viewers: otherViewers,
    isConnected: state.isConnected,
    setTyping,
  };
}
