/**
 * Visitor-facing Website Chat name sources.
 * Company name comes from verified AI Brain / Business Profile only —
 * never users.name, login name, email, contact, or team-member identity.
 */

import { storage } from "./storage";
import {
  pickExplicitWebchatAgentName,
  pickVerifiedWebchatCompanyName,
} from "@shared/webchatWidgetBranding";

export async function loadWebchatPublicNameFallbacks(userId: string): Promise<{
  companyName: string;
  agentName: string;
}> {
  const knowledge = await storage.getAiBusinessKnowledge(userId);
  return {
    companyName: pickVerifiedWebchatCompanyName(knowledge),
    agentName: pickExplicitWebchatAgentName(knowledge),
  };
}
