/**
 * Resolve which workspace Prospect Review / Campaign / Import APIs operate on.
 *
 * Customer Prospect AI: always the authenticated user (activation required).
 * Legacy allowlisted Growth Tools: fall back to the configured destination workspace.
 */

import { eq } from "drizzle-orm";
import { prospectAiActivations } from "@shared/schema";
import { isProspectAiPlanEligible } from "@shared/prospectAI";
import { db } from "../../drizzle/db";
import { subscriptionService } from "../subscriptionService";
import { canAccessProspectImportTools } from "@shared/prospectImportAccess";
import { resolveProspectImportDestinationUserId } from "./prospectImportService";

export async function isProspectAiActivatedForWorkspace(workspaceUserId: string): Promise<boolean> {
  const rows = await db
    .select({ status: prospectAiActivations.status })
    .from(prospectAiActivations)
    .where(eq(prospectAiActivations.workspaceUserId, workspaceUserId))
    .limit(1);
  return rows[0]?.status === "active";
}

export async function canAccessProspectWorkspaceTools(params: {
  userId: string;
  email?: string | null;
  isAdmin?: boolean;
}): Promise<boolean> {
  if (
    canAccessProspectImportTools(
      { id: params.userId, email: params.email },
      { isAdmin: params.isAdmin === true },
    )
  ) {
    return true;
  }

  const activated = await isProspectAiActivatedForWorkspace(params.userId);
  if (!activated) return false;

  const limits = await subscriptionService.getUserLimits(params.userId);
  if (!limits) return false;
  return isProspectAiPlanEligible(limits.plan);
}

/**
 * Prefer the caller's workspace when Prospect AI is activated.
 * Otherwise keep the legacy fixed destination for allowlisted internal tooling.
 */
export async function resolveProspectWorkspaceUserId(callerUserId: string): Promise<string> {
  if (await isProspectAiActivatedForWorkspace(callerUserId)) {
    return callerUserId;
  }
  return resolveProspectImportDestinationUserId();
}

export function assertContactInWorkspace(
  contact: { userId: string } | null | undefined,
  workspaceUserId: string,
): void {
  if (!contact || contact.userId !== workspaceUserId) {
    throw new Error("Prospect not found in this workspace");
  }
}
