import { channelService } from "./channelService";
import { db } from "../drizzle/db";
import { channelSettings } from "@shared/schema";
import { eq, and } from "drizzle-orm";

type IgConversation = {
  id: string;
  updated_time?: string;
  messages?: {
    data?: Array<{
      id?: string;
      message?: string;
      created_time?: string;
      from?: { id?: string; username?: string };
      to?: { data?: Array<{ id?: string; username?: string }> };
    }>;
  };
};

function asBool(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function safeDate(d: string | undefined): Date | null {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Dev-mode fallback: poll Instagram DMs via Graph API.
 * Intended only for debugging when webhooks aren't delivering.
 *
 * Env:
 * - INSTAGRAM_POLLING_ENABLED=true
 * - INSTAGRAM_POLL_INTERVAL_MS=7000 (optional)
 */
export function startInstagramDevPolling() {
  const enabled = asBool(process.env.INSTAGRAM_POLLING_ENABLED);
  const isProd = process.env.NODE_ENV === "production";
  if (!enabled || isProd) return;

  const intervalMs = Number(process.env.INSTAGRAM_POLL_INTERVAL_MS || "7000");
  const GRAPH = "https://graph.facebook.com/v19.0";

  // Track newest processed message timestamp per (userId,pageId,instagramAccountId).
  const lastSeenByKey = new Map<string, number>();
  let running = false;

  console.log("[IG Poll] Enabled (dev mode)", { intervalMs });

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Poll all connected Instagram channel settings.
      // This is dev-only, so we keep it simple and conservative.
      const igSettings = await db
        .select()
        .from(channelSettings)
        .where(and(eq(channelSettings.channel, "instagram" as any), eq(channelSettings.isConnected, true)));

      if (igSettings.length === 0) return;

      for (const s of igSettings) {
        const cfg = (s.config as any) ?? {};
        const instagramAccountId: string | undefined =
          cfg.instagramAccountId ?? cfg.instagramId ?? cfg.instagram_id;
        const pageId: string | undefined = cfg.pageId ?? cfg.page_id;
        const accessToken: string | undefined =
          cfg.accessToken ?? cfg.pageAccessToken ?? cfg.page_access_token;

        if (!instagramAccountId || !accessToken) continue;

        const key = `${s.userId}::${pageId || "noPage"}::${instagramAccountId}`;
        const lastSeen = lastSeenByKey.get(key) ?? 0;

        const url =
          `${GRAPH}/${encodeURIComponent(instagramAccountId)}/conversations` +
          `?fields=id,updated_time,messages.limit(25){id,message,created_time,from,to}` +
          `&limit=25` +
          `&access_token=${encodeURIComponent(accessToken)}`;

        let data: any = null;
        try {
          const resp = await fetch(url);
          data = await resp.json().catch(() => ({}));
          if (!resp.ok) {
            console.warn("[IG Poll] conversations failed", {
              userId: s.userId,
              instagramAccountId,
              status: resp.status,
              error: data?.error?.message ?? null,
            });
            continue;
          }
        } catch (err: any) {
          console.warn("[IG Poll] conversations network error", {
            userId: s.userId,
            instagramAccountId,
            message: err?.message || String(err),
          });
          continue;
        }

        const conversations: IgConversation[] = Array.isArray(data?.data) ? data.data : [];
        if (conversations.length === 0) continue;

        let newMaxSeen = lastSeen;

        for (const conv of conversations) {
          const msgs = Array.isArray(conv.messages?.data) ? conv.messages!.data! : [];
          for (const m of msgs) {
            const msgId = m.id;
            const created = safeDate(m.created_time);
            const createdMs = created?.getTime() ?? 0;
            if (!msgId || !createdMs) continue;

            // Only process messages strictly newer than the last seen watermark.
            if (createdMs <= lastSeen) continue;

            const fromId = m.from?.id;
            if (!fromId) continue;

            // Treat messages "from" the IG business account as outbound echoes; ignore.
            if (fromId === instagramAccountId) {
              newMaxSeen = Math.max(newMaxSeen, createdMs);
              continue;
            }

            const text = (m.message || "").trim();
            if (!text) {
              newMaxSeen = Math.max(newMaxSeen, createdMs);
              continue;
            }

            console.log("[IG Poll] inbound candidate", {
              userId: s.userId,
              instagramAccountId,
              fromId,
              messageId: msgId,
              created_time: m.created_time,
              preview: text.slice(0, 80),
            });

            // Store exactly like webhook: unified inbox write path with dedupe by externalMessageId.
            await channelService.processIncomingMessage({
              userId: s.userId,
              channel: "instagram",
              channelContactId: fromId,
              contactName: m.from?.username || fromId,
              content: text,
              contentType: "text",
              externalMessageId: msgId,
            });

            newMaxSeen = Math.max(newMaxSeen, createdMs);
          }
        }

        if (newMaxSeen > lastSeen) {
          lastSeenByKey.set(key, newMaxSeen);
        }
      }
    } catch (err: any) {
      console.error("[IG Poll] tick error", err?.message || err);
    } finally {
      running = false;
    }
  };

  // Initial slight delay, then interval.
  setTimeout(() => tick().catch(() => {}), 1500);
  setInterval(() => tick().catch(() => {}), Math.max(5000, Math.min(intervalMs, 10000)));
}

