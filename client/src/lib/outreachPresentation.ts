import type { TFunction } from "i18next";
import { builderStatusLabel } from "./builderPresentation";

export function campaignStatusLabel(t: TFunction, status: string, fallback = status) {
  switch (status) {
    case "active_pending": return t("outreachUi.activePending");
    case "failed": return t("outreachUi.failed");
    default: {
      const label = builderStatusLabel(t, status);
      return label === status ? fallback : label;
    }
  }
}

export function templateStatusLabel(t: TFunction, status: string) {
  switch (status.trim().toLowerCase()) {
    case "approved": return t("messageLibrary.approved");
    case "pending": return t("builderFeedback.pendingStatus");
    case "rejected": return t("outreachUi.rejected");
    case "paused": return t("automations.paused");
    case "disabled": return t("outreachUi.disabled");
    default: return status;
  }
}

export function templateCategoryLabel(t: TFunction, category: string | null | undefined, fallback: string) {
  switch (category?.trim().toLowerCase()) {
    case "marketing": return t("outreachUi.marketing");
    case "utility": return t("outreachUi.utility");
    case "authentication": return t("outreachUi.authentication");
    default: return fallback;
  }
}

export function widgetOptionLabel(t: TFunction, value: string) {
  switch (value) {
    case "circle": return t("outreachUi.circle");
    case "pill": return t("outreachUi.pill");
    case "bubble": return t("outreachUi.bubble");
    case "message": return t("outreachUi.message");
    case "support": return t("outreachUi.support");
    case "chat": return t("outreachUi.chat");
    case "square": return t("outreachUi.square");
    case "rounded": return t("outreachUi.rounded");
    case "soft": return t("outreachUi.soft");
    case "compact": return t("outreachUi.compact");
    case "standard": return t("outreachUi.standard");
    case "wide": return t("outreachUi.wide");
    default: return value;
  }
}
