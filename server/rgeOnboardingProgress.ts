import { storage } from "./storage";

export const RGE_ONBOARDING_PROGRESS_ASSET_TYPE = "onboarding";
export const RGE_ONBOARDING_PROGRESS_ASSET_KEY = "guided_launch_v2_progress";

export type RgeOnboardingProgress = {
  step: number;
  formValues?: Record<string, unknown>;
  updatedAt: string;
};

export async function getRgeOnboardingProgress(userId: string): Promise<RgeOnboardingProgress | null> {
  const row = await storage.getUserTemplateDataByKey(
    userId,
    "realtor-growth-engine",
    RGE_ONBOARDING_PROGRESS_ASSET_TYPE,
    RGE_ONBOARDING_PROGRESS_ASSET_KEY,
  );
  const def = row?.definition as RgeOnboardingProgress | undefined;
  if (!def || typeof def.step !== "number") return null;
  const step = Math.min(5, Math.max(1, Math.floor(def.step)));
  return {
    step,
    formValues: def.formValues && typeof def.formValues === "object" ? def.formValues : undefined,
    updatedAt: typeof def.updatedAt === "string" ? def.updatedAt : new Date().toISOString(),
  };
}

export async function saveRgeOnboardingProgress(
  userId: string,
  progress: { step: number; formValues?: Record<string, unknown> },
): Promise<RgeOnboardingProgress> {
  const step = Math.min(5, Math.max(1, Math.floor(progress.step)));
  const payload: RgeOnboardingProgress = {
    step,
    formValues: progress.formValues,
    updatedAt: new Date().toISOString(),
  };
  await storage.upsertUserTemplateData(
    userId,
    "realtor-growth-engine",
    RGE_ONBOARDING_PROGRESS_ASSET_TYPE,
    RGE_ONBOARDING_PROGRESS_ASSET_KEY,
    payload,
  );
  return payload;
}
