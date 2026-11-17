import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { storage } from "./storage";
import { getAppOrigin } from "./urlOrigins";
import type { InboxWorkspaceAccess } from "./inboxWorkspaceAccess";

type Identity = InboxWorkspaceAccess & { userName: string };
type Authenticate = (req: IncomingMessage) => Promise<Identity>;
interface ClientConnection extends Identity {
  ws: WebSocket;
  request: IncomingMessage;
  authenticate: Authenticate;
  chatId: string | null;
  isTyping: boolean;
  lastSeen: number;
  queue: Promise<void>;
}
const clients = new Map<WebSocket, ClientConnection>();
const INBOX_EVENTS = new Set(["new_message", "contact_updated", "ai_review_draft", "appointment_booked", "booking_confirmed", "buyer_preferences_updated"]);

export function presenceOriginAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin || origin === "null") return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol)) return false;
    if (origin === getAppOrigin()) return true;
    return process.env.NODE_ENV !== "production" && parsed.host === req.headers.host;
  } catch { return false; }
}

export function setupPresenceServer(server: Server, authenticate: Authenticate) {
  const authenticated = new WeakMap<IncomingMessage, Identity>();
  const wss = new WebSocketServer({
    server, path: "/ws/presence", maxPayload: 4096,
    verifyClient(info, done) {
      if (!presenceOriginAllowed(info.req)) return done(false, 403, "Forbidden");
      authenticate(info.req).then(identity => {
        authenticated.set(info.req, identity);
        done(true);
      }).catch(() => done(false, 401, "Unauthorized"));
    },
  });
  wss.on("connection", (ws, request) => {
    const identity = authenticated.get(request);
    if (!identity) { ws.close(1008, "Unauthorized"); return; }
    const client: ClientConnection = {
      ...identity, ws, request, authenticate, chatId: null, isTyping: false,
      lastSeen: Date.now(), queue: Promise.resolve(),
    };
    clients.set(ws, client);
    ws.on("message", data => enqueue(client, async () => {
      const message = JSON.parse(data.toString());
      if (!message || typeof message !== "object") return;
      // Legacy clients still send auth; the frame never establishes identity.
      if ((message.userId !== undefined && message.userId !== client.actorUserId) ||
          (message.workspaceId !== undefined && message.workspaceId !== client.workspaceUserId)) {
        ws.close(1008, "Identity mismatch"); return;
      }
      switch (message.type) {
        case "auth": send(client, { type: "auth_success" }); break;
        case "join_chat": {
          const id = message.chatId;
          if (typeof id !== "string" || !id || id.length > 128) return;
          // Both current conversations and the existing legacy Chats page use this transport.
          const conversation = await storage.getConversation(id);
          const resource = conversation ?? await storage.getChat(id);
          if (!resource || resource.userId !== client.workspaceUserId) {
            send(client, { type: "error", code: "forbidden_room" }); return;
          }
          const previous = client.chatId;
          client.chatId = id; client.isTyping = false;
          if (previous && previous !== id) await broadcastChatPresence(previous, client.workspaceUserId);
          await broadcastChatPresence(id, client.workspaceUserId);
          break;
        }
        case "leave_chat": {
          if (message.chatId !== client.chatId) return;
          const id = client.chatId; client.chatId = null; client.isTyping = false;
          if (id) await broadcastChatPresence(id, client.workspaceUserId);
          break;
        }
        case "typing":
        case "stop_typing": {
          if (!client.chatId || message.chatId !== client.chatId) {
            send(client, { type: "error", code: "forbidden_room" }); return;
          }
          client.isTyping = message.type === "typing";
          await broadcastChatPresence(client.chatId, client.workspaceUserId);
          break;
        }
        case "heartbeat": send(client, { type: "heartbeat_ack" }); break;
      }
      client.lastSeen = Date.now();
    }));
    ws.on("close", () => disconnect(client));
    ws.on("error", () => disconnect(client));
  });
  const cleanup = setInterval(() => {
    for (const client of clients.values()) {
      if (Date.now() - client.lastSeen > 60000) client.ws.close(1008, "Session idle");
      else enqueue(client, async () => {}); // Detect expired sessions and revoked memberships while idle.
    }
  }, 30000);
  cleanup.unref();
  wss.on("close", () => clearInterval(cleanup));
  return wss;
}

async function validate(client: ClientConnection): Promise<boolean> {
  if (clients.get(client.ws) !== client || client.ws.readyState !== WebSocket.OPEN) return false;
  try {
    const fresh = await client.authenticate(client.request);
    if (fresh.actorUserId !== client.actorUserId || fresh.workspaceUserId !== client.workspaceUserId) throw new Error("Changed session");
    if (client.chatId) {
      const resource = await storage.getConversation(client.chatId) ?? await storage.getChat(client.chatId);
      if (!resource || resource.userId !== fresh.workspaceUserId) throw new Error("Room access expired");
    }
    client.role = fresh.role;
    client.userName = fresh.userName;
    return clients.get(client.ws) === client && client.ws.readyState === WebSocket.OPEN;
  } catch {
    disconnect(client);
    client.ws.close(1008, "Access expired");
    return false;
  }
}

function enqueue(client: ClientConnection, action: () => Promise<void>) {
  client.queue = client.queue.then(async () => {
    if (await validate(client)) await action();
  }).catch(() => {
    client.ws.close(1008, "Invalid presence message");
  });
}
function send(client: ClientConnection, payload: Record<string, unknown>) {
  if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(payload));
}
function disconnect(client: ClientConnection) {
  if (!clients.delete(client.ws)) return;
  if (client.chatId) void broadcastChatPresence(client.chatId, client.workspaceUserId);
}

export function revokePresenceMembership(workspaceUserId: string, actorUserId: string | null) {
  for (const client of clients.values()) {
    if (client.workspaceUserId === workspaceUserId && client.actorUserId === actorUserId) {
      disconnect(client); client.ws.close(1008, "Membership changed");
    }
  }
}

/** Keep non-Inbox account notifications private to the account holder. */
export function notifyUser(userId: string, payload: Record<string, unknown>) {
  for (const client of clients.values()) {
    const allowed = INBOX_EVENTS.has(String(payload.type))
      ? client.workspaceUserId === userId
      : client.actorUserId === userId;
    if (allowed) enqueue(client, async () => { send(client, payload); });
  }
}

async function broadcastChatPresence(chatId: string, workspaceUserId: string) {
  const room = [...clients.values()].filter(c => c.chatId === chatId && c.workspaceUserId === workspaceUserId);
  const valid: ClientConnection[] = [];
  for (const client of room) if (await validate(client)) valid.push(client);
  const viewers = new Map<string, { userId: string; userName: string; isTyping: boolean }>();
  for (const client of valid) {
    const existing = viewers.get(client.actorUserId);
    viewers.set(client.actorUserId, { userId: client.actorUserId, userName: client.userName,
      isTyping: client.isTyping || existing?.isTyping === true });
  }
  for (const client of valid) send(client, { type: "presence_update", chatId, viewers: [...viewers.values()] });
}
