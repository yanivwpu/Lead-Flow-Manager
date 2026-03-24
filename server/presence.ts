import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

interface PresenceUser {
  id: string;
  name: string;
  chatId: string | null;
  isTyping: boolean;
  lastSeen: number;
}

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
}

const clients: Map<WebSocket, ClientConnection> = new Map();
const chatPresence: Map<string, Set<string>> = new Map();
const userPresence: Map<string, PresenceUser> = new Map();

export function setupPresenceServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/presence" });

  wss.on("connection", (ws: WebSocket) => {
    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (error) {
        console.error("Presence WebSocket parse error:", error);
      }
    });

    ws.on("close", () => {
      handleDisconnect(ws);
    });

    ws.on("error", (error) => {
      console.error("Presence WebSocket error:", error);
      handleDisconnect(ws);
    });
  });

  setInterval(() => {
    const now = Date.now();
    userPresence.forEach((user, odlUserId) => {
      if (now - user.lastSeen > 60000) {
        leaveChat(user.id, user.chatId);
        userPresence.delete(user.id);
      }
    });
  }, 30000);

  console.log("Presence WebSocket server ready");
}

function handleMessage(ws: WebSocket, message: any) {
  switch (message.type) {
    case "auth":
      handleAuth(ws, message);
      break;
    case "join_chat":
      handleJoinChat(ws, message);
      break;
    case "leave_chat":
      handleLeaveChat(ws, message);
      break;
    case "typing":
      handleTyping(ws, message);
      break;
    case "stop_typing":
      handleStopTyping(ws, message);
      break;
    case "heartbeat":
      handleHeartbeat(ws);
      break;
  }
}

function handleAuth(ws: WebSocket, message: { userId: string; userName: string }) {
  const { userId, userName } = message;
  
  clients.set(ws, { ws, userId, userName });
  userPresence.set(userId, {
    id: userId,
    name: userName,
    chatId: null,
    isTyping: false,
    lastSeen: Date.now(),
  });

  ws.send(JSON.stringify({ type: "auth_success" }));
}

function handleJoinChat(ws: WebSocket, message: { chatId: string }) {
  const client = clients.get(ws);
  if (!client) return;

  const { chatId } = message;
  const user = userPresence.get(client.userId);
  
  if (user?.chatId && user.chatId !== chatId) {
    leaveChat(client.userId, user.chatId);
  }

  if (!chatPresence.has(chatId)) {
    chatPresence.set(chatId, new Set());
  }
  chatPresence.get(chatId)!.add(client.userId);

  if (user) {
    user.chatId = chatId;
    user.isTyping = false;
    user.lastSeen = Date.now();
  }

  broadcastChatPresence(chatId);
}

function handleLeaveChat(ws: WebSocket, message: { chatId: string }) {
  const client = clients.get(ws);
  if (!client) return;

  leaveChat(client.userId, message.chatId);
}

function leaveChat(userId: string, chatId: string | null) {
  if (!chatId) return;

  const viewers = chatPresence.get(chatId);
  if (viewers) {
    viewers.delete(userId);
    if (viewers.size === 0) {
      chatPresence.delete(chatId);
    } else {
      broadcastChatPresence(chatId);
    }
  }

  const user = userPresence.get(userId);
  if (user && user.chatId === chatId) {
    user.chatId = null;
    user.isTyping = false;
  }
}

function handleTyping(ws: WebSocket, message: { chatId: string }) {
  const client = clients.get(ws);
  if (!client) return;

  const user = userPresence.get(client.userId);
  if (user) {
    user.isTyping = true;
    user.lastSeen = Date.now();
  }

  broadcastChatPresence(message.chatId);
}

function handleStopTyping(ws: WebSocket, message: { chatId: string }) {
  const client = clients.get(ws);
  if (!client) return;

  const user = userPresence.get(client.userId);
  if (user) {
    user.isTyping = false;
    user.lastSeen = Date.now();
  }

  broadcastChatPresence(message.chatId);
}

function handleHeartbeat(ws: WebSocket) {
  const client = clients.get(ws);
  if (!client) return;

  const user = userPresence.get(client.userId);
  if (user) {
    user.lastSeen = Date.now();
  }

  ws.send(JSON.stringify({ type: "heartbeat_ack" }));
}

function handleDisconnect(ws: WebSocket) {
  const client = clients.get(ws);
  if (!client) return;

  const user = userPresence.get(client.userId);
  if (user?.chatId) {
    leaveChat(client.userId, user.chatId);
  }

  userPresence.delete(client.userId);
  clients.delete(ws);
}

export function notifyUser(userId: string, payload: Record<string, unknown>) {
  clients.forEach((client) => {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(payload));
    }
  });
}

function broadcastChatPresence(chatId: string) {
  const viewers = chatPresence.get(chatId);
  if (!viewers) return;

  const presenceList: { userId: string; userName: string; isTyping: boolean }[] = [];
  
  viewers.forEach((userId) => {
    const user = userPresence.get(userId);
    if (user) {
      const client = Array.from(clients.values()).find(c => c.userId === userId);
      presenceList.push({
        userId: user.id,
        userName: client?.userName || user.name,
        isTyping: user.isTyping,
      });
    }
  });

  const message = JSON.stringify({
    type: "presence_update",
    chatId,
    viewers: presenceList,
  });

  clients.forEach((client) => {
    const user = userPresence.get(client.userId);
    if (user?.chatId === chatId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
    }
  });
}
