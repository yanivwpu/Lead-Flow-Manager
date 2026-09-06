import { randomBytes } from "crypto";
import {
  TELEGRAM_WEBHOOK_PUBLIC_ID_PREFIX,
  TIKTOK_LEAD_PUBLIC_ID_PREFIX,
  WIDGET_PUBLIC_ID_PREFIX,
} from "@shared/opaquePublicToken";

export function generateOpaquePublicId(prefix: string): string {
  return `${prefix}${randomBytes(24).toString("hex")}`;
}

export function generateWidgetPublicId(): string {
  return generateOpaquePublicId(WIDGET_PUBLIC_ID_PREFIX);
}

export function generateTelegramWebhookPublicId(): string {
  return generateOpaquePublicId(TELEGRAM_WEBHOOK_PUBLIC_ID_PREFIX);
}

export function generateTelegramWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function generateTiktokLeadPublicId(): string {
  return generateOpaquePublicId(TIKTOK_LEAD_PUBLIC_ID_PREFIX);
}
