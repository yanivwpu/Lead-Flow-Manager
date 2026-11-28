import { publicRealEstateText } from "./publicRealEstateLocale";

export function publicAgentPhoneHref(phone: string | null | undefined): string | null {
  const value = phone?.trim() || "";
  const digits = value.replace(/\D/g, "");
  return digits ? `tel:${value.startsWith("+") ? "+" : ""}${digits}` : null;
}

export function publicAgentContactFieldsHtml(language: unknown = "en") {
  const text = (key: "Name" | "Email" | "Phone") => publicRealEstateText(language, key);
  return `
  <label>${text("Name")}<input name="name" autocomplete="name" maxlength="120" required /></label>
  <label>${text("Email")}<input name="email" type="email" dir="ltr" autocomplete="email" maxlength="200" /></label>
  <label>${text("Phone")}<input name="phone" type="tel" dir="ltr" autocomplete="tel" maxlength="40" /></label>`;
}
