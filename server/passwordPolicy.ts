/** Applies to newly chosen passwords only; existing login credentials remain valid. */
export const PASSWORD_MIN_LENGTH = 15;

export function validateNewPassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password must be a string";
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  // bcrypt silently truncates after 72 bytes. Reject rather than weaken passwords.
  if (Buffer.byteLength(password, "utf8") > 72) return "Password must be at most 72 UTF-8 bytes";
  return null;
}
