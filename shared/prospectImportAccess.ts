/** Who may access internal Growth Tools → Prospect Import. */

const DEFAULT_ALLOWED_EMAILS = ["yahabegood@gmail.com", "yanivharamaty@gmail.com"];

export function parseProspectImportAllowedEmails(): string[] {
  const raw = String(process.env.PROSPECT_IMPORT_ALLOWED_EMAILS || "").trim();
  if (!raw) return DEFAULT_ALLOWED_EMAILS.map((e) => e.toLowerCase());
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getProspectImportDestinationEmail(): string {
  return (
    String(process.env.PROSPECT_IMPORT_DESTINATION_EMAIL || "").trim().toLowerCase() ||
    "yahabegood@gmail.com"
  );
}

export type ProspectImportAccessUser = {
  id: string;
  email?: string | null;
};

export type ProspectImportAccessSession = {
  isAdmin?: boolean;
};

/** Platform admin session OR allowlisted workspace owner (YaBa). */
export function canAccessProspectImportTools(
  user: ProspectImportAccessUser | null | undefined,
  session?: ProspectImportAccessSession | null,
): boolean {
  if (!user?.id) return false;
  if (session?.isAdmin === true) return true;
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return false;
  return parseProspectImportAllowedEmails().includes(email);
}
