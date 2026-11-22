export function publicAgentPhoneHref(phone: string | null | undefined): string | null {
  const value = phone?.trim() || "";
  const digits = value.replace(/\D/g, "");
  return digits ? `tel:${value.startsWith("+") ? "+" : ""}${digits}` : null;
}

export const publicAgentContactFieldsHtml = `
  <label>Name<input name="name" autocomplete="name" maxlength="120" required /></label>
  <label>Email<input name="email" type="email" autocomplete="email" maxlength="200" /></label>
  <label>Phone<input name="phone" type="tel" autocomplete="tel" maxlength="40" /></label>`;
