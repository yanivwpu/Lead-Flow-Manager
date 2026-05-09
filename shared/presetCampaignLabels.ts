/**
 * Human-readable labels for `preset_campaigns.status`.
 * `active_pending` = user chose “launch” but automated audience sends are not wired yet.
 */
export function getPresetCampaignStatusLabel(status: string): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "active_pending":
      return "Active — sends not scheduled yet";
    case "active":
      return "Active";
    case "paused":
      return "Paused";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}
