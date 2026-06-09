/** Copilot → composer insert payload (listing recommendations preserve Auto mode). */
export type CopilotComposerInsert =
  | string
  | {
      text: string;
      primaryPhotoUrl?: string | null;
      listingId?: string;
      preserveAiMode?: boolean;
    };

export function normalizeCopilotComposerInsert(
  draft: CopilotComposerInsert,
): { text: string; primaryPhotoUrl?: string | null; preserveAiMode: boolean } {
  if (typeof draft === "string") {
    return { text: draft, preserveAiMode: false };
  }
  return {
    text: draft.text,
    primaryPhotoUrl: draft.primaryPhotoUrl,
    preserveAiMode: draft.preserveAiMode ?? true,
  };
}
