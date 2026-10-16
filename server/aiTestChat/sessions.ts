import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, lte, or } from "drizzle-orm";
import { aiTestSessions } from "@shared/schema";
import {
  testShoppingActivity,
  type TestChatMessage,
  type TestChatView,
} from "@shared/aiTestChat";
import type { ShoppingState } from "@shared/shoppingAssistant";
import type { CatalogDb } from "../salesCatalog/commerceStore";
import type { ShoppingSessionStore, ShoppingTurn } from "../shopping/service";
export class TestChatError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export type TestOwner = { workspaceUserId: string; actorUserId: string };
type Session = typeof aiTestSessions.$inferSelect;
const TTL = 30 * 60_000,
  LEASE = 120_000;
function view(row: Session): TestChatView {
  return {
    id: row.id,
    testMode: true,
    channel: "webchat",
    expiresAt: row.expiresAt.toISOString(),
    transcript: row.transcript as TestChatMessage[],
    state: testShoppingActivity(row.shoppingState as Partial<ShoppingState>),
  };
}
/** Dedicated internal transport: no CRM messages/contacts/activity events or delivery imports. */
export function createTestChatSessions(db: CatalogDb, now = Date.now) {
  const owner = (auth: TestOwner) =>
    and(
      eq(aiTestSessions.userId, auth.workspaceUserId),
      eq(aiTestSessions.actorId, auth.actorUserId),
    );
  async function get(auth: TestOwner, id: string) {
    const [row] = await db
      .select()
      .from(aiTestSessions)
      .where(
        and(
          owner(auth),
          eq(aiTestSessions.id, id),
          gt(aiTestSessions.expiresAt, new Date(now())),
        ),
      )
      .limit(1);
    if (!row) throw new TestChatError(404, "session_expired");
    return row;
  }
  return {
    async create(auth: TestOwner): Promise<TestChatView> {
      // One bounded session per administrator. Reopening resumes it until reset/expiry.
      const [row] = await db
        .insert(aiTestSessions)
        .values({
          userId: auth.workspaceUserId,
          actorId: auth.actorUserId,
          expiresAt: new Date(now() + TTL),
        })
        .onConflictDoNothing()
        .returning();
      if (row) return view(row);
      const [existing] = await db
        .select()
        .from(aiTestSessions)
        .where(owner(auth))
        .limit(1);
      if (existing.expiresAt.getTime() > now()) return view(existing);
      await db
        .delete(aiTestSessions)
        .where(
          and(owner(auth), lte(aiTestSessions.expiresAt, new Date(now()))),
        );
      return this.create(auth);
    },
    async read(auth: TestOwner, id: string) {
      return view(await get(auth, id));
    },
    async reset(auth: TestOwner, id: string) {
      const rows = await db
        .delete(aiTestSessions)
        .where(and(owner(auth), eq(aiTestSessions.id, id)))
        .returning({ id: aiTestSessions.id });
      if (!rows.length) throw new TestChatError(404, "session_expired");
    },
    async turn(
      auth: TestOwner,
      id: string,
      eventId: string,
      text: string,
      run: (input: {
        history: TestChatMessage[];
        sessions: ShoppingSessionStore;
      }) => Promise<string>,
    ) {
      const token = randomUUID(),
        stamp = now();
      const [row] = await db
        .update(aiTestSessions)
        .set({ leaseToken: token, leaseUntil: new Date(stamp + LEASE) })
        .where(
          and(
            owner(auth),
            eq(aiTestSessions.id, id),
            gt(aiTestSessions.expiresAt, new Date(stamp)),
            or(
              isNull(aiTestSessions.leaseUntil),
              lt(aiTestSessions.leaseUntil, new Date(stamp)),
            ),
          ),
        )
        .returning();
      if (!row) {
        await get(auth, id);
        throw new TestChatError(409, "turn_processing");
      }
      try {
        const history = row.transcript as TestChatMessage[];
        const previous = history.find((m) => m.id === eventId);
        if (previous) {
          if (previous.content !== text)
            throw new TestChatError(409, "event_conflict");
          if (stamp - new Date(previous.at).getTime() > 60_000)
            throw new TestChatError(409, "repeat_as_new_turn");
          return view(row); // A repeated HTTP request never generates or verifies twice.
        }
        if (history.length >= 40)
          throw new TestChatError(409, "reset_required");
        if (row.lastTurnAt && stamp - row.lastTurnAt.getTime() < 1000)
          throw new TestChatError(429, "retry_shortly");
        let next =
          (row.shoppingState as ShoppingState)?.version === 1
            ? (row.shoppingState as ShoppingState)
            : null;
        const inbound: TestChatMessage = {
          id: eventId,
          role: "user",
          content: text,
          at: new Date(stamp).toISOString(),
        };
        const transcript = [...history, inbound];
        const sessions: ShoppingSessionStore = {
          async withTurn<T>(
            turn: ShoppingTurn,
            callback: (
              state: ShoppingState | null,
              save: (s: ShoppingState) => Promise<void>,
            ) => Promise<T>,
          ) {
            // Same persisted-turn identity contract as production, scoped to the leased internal session.
            if (
              turn.userId !== auth.workspaceUserId ||
              turn.conversationId !== id ||
              turn.eventId !== eventId ||
              turn.text !== text ||
              turn.channel !== "webchat"
            )
              throw new TestChatError(403, "invalid_test_turn");
            return callback(next, async (state) => {
              next = state;
            });
          },
        };
        const reply = await run({ history: transcript, sessions });
        const [saved] = await db
          .update(aiTestSessions)
          .set({
            transcript: [
              ...transcript,
              {
                id: randomUUID(),
                role: "assistant",
                content: reply.slice(0, 16000),
                at: new Date(now()).toISOString(),
              },
            ],
            shoppingState: next ?? {},
            lastTurnAt: new Date(stamp),
            leaseToken: null,
            leaseUntil: null,
          })
          .where(
            and(
              owner(auth),
              eq(aiTestSessions.id, id),
              eq(aiTestSessions.leaseToken, token),
              gt(aiTestSessions.leaseUntil, new Date(now())),
              gt(aiTestSessions.expiresAt, new Date(now())),
            ),
          )
          .returning();
        if (!saved) throw new TestChatError(409, "session_changed");
        return view(saved);
      } finally {
        await db
          .update(aiTestSessions)
          .set({ leaseToken: null, leaseUntil: null })
          .where(
            and(
              owner(auth),
              eq(aiTestSessions.id, id),
              eq(aiTestSessions.leaseToken, token),
            ),
          );
      }
    },
  };
}
