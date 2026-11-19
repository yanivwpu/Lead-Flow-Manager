import { inboxSessionDatabaseUrl } from "./inboxSessionDatabase";
import { Client } from "pg";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { abortWebchatGeneration } from "./webchatGenerationAbort";
const origin = randomUUID();
const events = new EventEmitter();
const CHANNEL = "whachat_inbox_events";
interface BusEvent {
  origin: string;
  workspaceId: string;
  payload: Record<string, unknown>;
}
export function onInboxEvent(
  listener: (workspaceId: string, payload: Record<string, unknown>) => void,
) {
  events.on("event", listener);
  return () => {
    events.off("event", listener);
  };
}
function receive(workspaceId: string, payload: Record<string, unknown>) {
  if (
    payload.type === "ai_control_changed" &&
    typeof payload.conversationId === "string"
  )
    abortWebchatGeneration(payload.conversationId);
  events.emit("event", workspaceId, payload);
}
export function publishInboxEvent(
  workspaceId: string,
  payload: Record<string, unknown>,
) {
  receive(workspaceId, payload);
  // IDs and event kind only: no message content, draft text, tokens or private account events.
  const safe = Object.fromEntries(
    Object.entries(payload).filter(([key]) =>
      [
        "type",
        "contactId",
        "conversationId",
        "messageId",
        "chatId",
        "replyWindowReopened",
      ].includes(key),
    ),
  );
  const event: BusEvent = { origin, workspaceId, payload: safe };
  void db
    .execute(sql`SELECT pg_notify(${CHANNEL},${JSON.stringify(event)})`)
    .catch(() => {
      // Existing HTTP polling remains recovery for a disconnected notification transport.
    });
}
export function onInboxBusReady(listener: () => void) {
  events.on("connected", listener);
  return () => {
    events.off("connected", listener);
  };
}
let connected = false;
export function inboxBusConnected() {
  return connected;
}
let started = false;
export function startInboxRealtimeBus() {
  if (started) return;
  started = true;
  let timer: ReturnType<typeof setTimeout>;
  const connect = async () => {
    const client = new Client({
      connectionString: inboxSessionDatabaseUrl(),
      application_name: "whachat-inbox-events",
    });
    let reconnecting = false;
    const reconnect = () => {
      connected = false;
      if (reconnecting) return;
      reconnecting = true;
      void client.end().catch(() => {});
      timer = setTimeout(() => void connect(), 2000);
      timer.unref();
    };
    client.on("error", reconnect);
    client.on("end", reconnect);
    client.on("notification", (message) => {
      try {
        const event = JSON.parse(message.payload || "") as BusEvent;
        if (
          event.origin !== origin &&
          typeof event.workspaceId === "string" &&
          event.payload &&
          typeof event.payload.type === "string"
        )
          receive(event.workspaceId, event.payload);
      } catch {
        /* invalid internal frame */
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      connected = true;
      events.emit("connected");
    } catch {
      reconnect();
    }
  };
  void connect();
}
