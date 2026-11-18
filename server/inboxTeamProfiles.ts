import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { users, teamMembers } from "@shared/schema";
import type { ReplySender } from "@shared/inboxTeam";
/** Only profiles with current/retained membership evidence in this workspace are disclosed. */
export async function inboxTeamProfiles(workspaceId: string, ids: string[]): Promise<Map<string, ReplySender>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const profiles = await db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users).where(and(
    inArray(users.id, unique),
    or(eq(users.id, workspaceId), sql`EXISTS (SELECT 1 FROM ${teamMembers} WHERE ${teamMembers.ownerId} = ${workspaceId} AND ${teamMembers.memberId} = ${users.id})`),
  ));
  return new Map(profiles.map(p => [p.id, { ...p, name: p.name || "" }]));
}
