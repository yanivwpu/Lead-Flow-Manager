/**
 * Pure ownership helpers. Foreign resources always look like "not found".
 */

export const FOREIGN_RESOURCE_HTTP_STATUS = 404;
export const FOREIGN_RESOURCE_BODY = { error: "Not found" } as const;

export type OwnedRow = { userId?: string | null; workspaceId?: string | null; workspaceUserId?: string | null };

export function rowWorkspaceId(row: OwnedRow | null | undefined): string | null {
  if (!row) return null;
  return row.userId || row.workspaceUserId || row.workspaceId || null;
}

export function isOwnedByWorkspace(row: OwnedRow | null | undefined, workspaceUserId: string): boolean {
  if (!row || !workspaceUserId) return false;
  return rowWorkspaceId(row) === workspaceUserId;
}

export function ownedOrNull<T extends OwnedRow>(
  row: T | null | undefined,
  workspaceUserId: string,
): T | null {
  return isOwnedByWorkspace(row, workspaceUserId) ? (row as T) : null;
}

export function ownershipMismatch(parts: {
  jobUserId?: string | null;
  contactUserId?: string | null;
  conversationUserId?: string | null;
  workflowUserId?: string | null;
  flowUserId?: string | null;
  payloadUserId?: string | null;
}): boolean {
  const ids = [
    parts.jobUserId,
    parts.contactUserId,
    parts.conversationUserId,
    parts.workflowUserId,
    parts.flowUserId,
    parts.payloadUserId,
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  if (ids.length === 0) return true;
  return ids.some((id) => id !== ids[0]);
}
