/** Detect a Meta Instagram account claimed by more than one workspace. */
export type InstagramWorkspaceConnection = {
  userId: string;
  channel: string;
  isConnected: boolean | null;
  config: unknown;
};
export type InstagramIdentity = { instagramAccountId?: string | null; pageId?: string | null };
const id = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
export function isInstagramConnectedInAnotherWorkspace(
  rows: readonly InstagramWorkspaceConnection[],
  workspaceUserId: string,
  identity: InstagramIdentity,
): boolean {
  const ids = new Set(
    [identity.instagramAccountId, identity.pageId].map(id).filter((v): v is string => v !== null),
  );
  if (!workspaceUserId || ids.size === 0) return false;
  return rows.some((row) => {
    if (row.channel !== "instagram" || row.isConnected !== true || row.userId === workspaceUserId) return false;
    const cfg = row.config && typeof row.config === "object" && !Array.isArray(row.config)
      ? row.config as Record<string, unknown> : {};
    return [cfg.instagramAccountId, cfg.instagramId, cfg.instagram_id, cfg.pageId, cfg.page_id]
      .some((value) => { const candidate = id(value); return candidate !== null && ids.has(candidate); });
  });
}
