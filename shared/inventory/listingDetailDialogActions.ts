/** Copilot listing modal — every displayed match is agent-share eligible. */
export function shouldShowCopilotListingActions(listingId: string | null | undefined): boolean {
  return !!listingId;
}
