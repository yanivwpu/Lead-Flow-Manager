import { inboxSessionDatabaseUrl } from "./inboxSessionDatabase";
import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "pg";

const locks = new Pool({
  connectionString: inboxSessionDatabaseUrl(),
  max: 4,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10000,
});
const held = new AsyncLocalStorage<{ key: string; alive: boolean }>();
export class InboxCoordinationError extends Error {
  constructor(
    public code: string,
    public status = 409,
    public details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
/** Separate session locks avoid holding row locks while existing storage/provider code uses its pool. */
async function postgresFence<T>(
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  if (held.getStore()?.key === key) {
    assertInboxFence();
    return work();
  }
  const client = await locks.connect();
  let acquired = false;
  const state = { key, alive: true };
  const lost = () => {
    state.alive = false;
  };
  client.on("error", lost);
  try {
    const result = await client.query(
      "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
      [`inbox:${key}`],
    );
    acquired = result.rows[0].acquired;
    if (!acquired) throw new InboxCoordinationError("send_in_progress");
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        held.run(state, work),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            state.alive = false;
            reject(new InboxCoordinationError("delivery_unknown", 409));
          }, 60000);
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  } finally {
    if (acquired && state.alive)
      await client
        .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
          `inbox:${key}`,
        ])
        .catch(lost);
    client.removeListener("error", lost);
    client.release(!state.alive);
  }
}
export function assertInboxFence() {
  if (held.getStore() && !held.getStore()!.alive)
    throw new InboxCoordinationError("delivery_unknown");
}
// Dependency seam used by isolated PGlite fixtures. Production uses session advisory locks.
export const inboxSendRuntime = { withFence: postgresFence };
export function inboxScope(input: {
  contactId: string;
  channel: string;
  conversationId?: string | null;
  attemptId?: string;
}) {
  return input.channel === "email"
    ? `email:${input.conversationId || `new:${input.attemptId}`}`
    : `contact:${input.contactId}:${input.channel}`;
}
export function closeInboxDispatchPool() {
  return locks.end();
}
