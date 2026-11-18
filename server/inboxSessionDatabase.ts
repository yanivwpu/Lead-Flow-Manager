/** Session locks and LISTEN must bypass Neon's transaction pooler. Normal ORM
 * traffic continues to use DATABASE_URL. No new database or credential is created. */
export function inboxSessionDatabaseUrl(
  env: Pick<
    NodeJS.ProcessEnv,
    "DATABASE_URL" | "DATABASE_URL_UNPOOLED"
  > = process.env,
): string {
  const configured =
    env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim();
  if (!configured) throw new Error("Inbox coordination requires DATABASE_URL");
  const url = new URL(configured);
  if (url.hostname.endsWith(".neon.tech") && url.hostname.startsWith("ep-"))
    url.hostname = url.hostname.replace(/-pooler(?=\.)/, "");
  return url.toString();
}
