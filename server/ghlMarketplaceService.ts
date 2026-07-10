import { and, eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  ghlMarketplaceInstalls,
  integrations,
  users,
  type GhlMarketplaceInstall,
  type Integration,
} from "@shared/schema";
import { storage } from "./storage";

type StoredOAuthTokenPayload = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  userType?: string;
  locationId?: string;
  companyId?: string;
  scope?: string;
};

export function extractOAuthTokensFromRawPayload(raw: unknown): StoredOAuthTokenPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) return null;

  return {
    access_token: accessToken,
    refresh_token:
      typeof payload.refresh_token === "string" ? payload.refresh_token.trim() : undefined,
    expires_in: typeof payload.expires_in === "number" ? payload.expires_in : undefined,
    userType: typeof payload.userType === "string" ? payload.userType : undefined,
    locationId: typeof payload.locationId === "string" ? payload.locationId : undefined,
    companyId: typeof payload.companyId === "string" ? payload.companyId : undefined,
    scope: typeof payload.scope === "string" ? payload.scope : undefined,
  };
}

export function hasRecoverableOAuthTokens(raw: unknown): boolean {
  return extractOAuthTokensFromRawPayload(raw) !== null;
}

function normalizeRecoveryEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isActiveMarketplaceInstall(row: GhlMarketplaceInstall): boolean {
  return (row.installationStatus || "").toLowerCase() !== "uninstalled";
}

function estimateTokenExpiry(
  row: GhlMarketplaceInstall,
  payload: StoredOAuthTokenPayload,
): string | null {
  const issuedAt = row.createdAt ?? row.installDate;
  if (!issuedAt) return null;
  const expiresIn = payload.expires_in ?? 86400;
  return new Date(issuedAt.getTime() + expiresIn * 1000).toISOString();
}

export type OAuthRecoveryEligibilityDiagnostic = {
  marketplaceInstallId: string;
  source: string | null;
  companyId: string;
  locationId: string | null;
  agencyEmail: string | null;
  whachatUserId: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  tokenExpiry: string | null;
  currentSessionUserId: string;
  currentSessionEmail: string | null;
  sessionIsAdmin: boolean;
  recoveryAllowlistEligible: boolean;
  ownershipMatchByUserId: boolean;
  ownershipMatchByEmail: boolean;
  ownershipMatchByCompany: boolean;
  adminOverrideEligible: boolean;
  finalRecoverable: boolean;
  rejectionReason: string | null;
  ownedCompanyIdsForSession: string[];
};

function buildOwnedCompanyIds(
  rows: GhlMarketplaceInstall[],
  userId: string,
  normalizedEmail: string | null,
): Set<string> {
  const ownedCompanyIds = new Set<string>();
  for (const row of rows) {
    if (!isActiveMarketplaceInstall(row)) continue;
    if (row.whachatUserId === userId) ownedCompanyIds.add(row.companyId);
    if (normalizedEmail && row.agencyEmail && normalizeRecoveryEmail(row.agencyEmail) === normalizedEmail) {
      ownedCompanyIds.add(row.companyId);
    }
  }
  return ownedCompanyIds;
}

export async function evaluateUnlinkedOAuthRecoveryEligibility(params: {
  userId: string;
  userEmail?: string | null;
  sessionIsAdmin?: boolean;
  recoveryAllowlistEligible?: boolean;
}): Promise<OAuthRecoveryEligibilityDiagnostic[]> {
  const rows = await db.select().from(ghlMarketplaceInstalls);
  const normalizedEmail = params.userEmail ? normalizeRecoveryEmail(params.userEmail) : null;
  const ownedCompanyIds = buildOwnedCompanyIds(rows, params.userId, normalizedEmail);
  const adminOverrideEligible = Boolean(params.sessionIsAdmin);
  const allowlistOverrideEligible = Boolean(params.recoveryAllowlistEligible);

  return rows
    .filter((row) => row.source === "oauth" && !row.integrationId)
    .map((row) => {
      const tokenPayload = extractOAuthTokensFromRawPayload(row.rawPayload);
      const ownershipMatchByUserId = row.whachatUserId === params.userId;
      const ownershipMatchByEmail = Boolean(
        normalizedEmail &&
          row.agencyEmail &&
          normalizeRecoveryEmail(row.agencyEmail) === normalizedEmail,
      );
      const ownershipMatchByCompany = ownedCompanyIds.has(row.companyId);

      let rejectionReason: string | null = null;
      if (row.integrationId) rejectionReason = "already_linked";
      else if (!isActiveMarketplaceInstall(row)) rejectionReason = "uninstalled";
      else if (!tokenPayload) rejectionReason = "missing_tokens_in_raw_payload";
      else if (
        !adminOverrideEligible &&
        !allowlistOverrideEligible &&
        !ownershipMatchByUserId &&
        !ownershipMatchByEmail &&
        !ownershipMatchByCompany
      ) {
        rejectionReason = "no_ownership_match";
      }

      const finalRecoverable = Boolean(
        !row.integrationId &&
          isActiveMarketplaceInstall(row) &&
          tokenPayload &&
          (adminOverrideEligible ||
            allowlistOverrideEligible ||
            ownershipMatchByUserId ||
            ownershipMatchByEmail ||
            ownershipMatchByCompany),
      );

      return {
        marketplaceInstallId: row.id,
        source: row.source ?? null,
        companyId: row.companyId,
        locationId: row.locationId ?? null,
        agencyEmail: row.agencyEmail ?? null,
        whachatUserId: row.whachatUserId ?? null,
        hasAccessToken: Boolean(tokenPayload?.access_token),
        hasRefreshToken: Boolean(tokenPayload?.refresh_token),
        tokenExpiry: tokenPayload ? estimateTokenExpiry(row, tokenPayload) : null,
        currentSessionUserId: params.userId,
        currentSessionEmail: params.userEmail ?? null,
        sessionIsAdmin: Boolean(params.sessionIsAdmin),
        recoveryAllowlistEligible: Boolean(params.recoveryAllowlistEligible),
        ownershipMatchByUserId,
        ownershipMatchByEmail,
        ownershipMatchByCompany,
        adminOverrideEligible,
        finalRecoverable,
        rejectionReason: finalRecoverable ? null : rejectionReason,
        ownedCompanyIdsForSession: [...ownedCompanyIds],
      };
    });
}

export type RecoverableMarketplaceInstall = GhlMarketplaceInstall & {
  tokenPayload: StoredOAuthTokenPayload;
};

export async function listRecoverableMarketplaceInstallsForUser(
  userId: string,
  userEmail?: string | null,
  options?: { isPlatformAdmin?: boolean; isRecoveryAllowlisted?: boolean },
): Promise<RecoverableMarketplaceInstall[]> {
  const rows = await db.select().from(ghlMarketplaceInstalls);
  const normalizedEmail = userEmail ? normalizeRecoveryEmail(userEmail) : null;
  const ownedCompanyIds = buildOwnedCompanyIds(rows, userId, normalizedEmail);
  const canOverride = Boolean(options?.isPlatformAdmin || options?.isRecoveryAllowlisted);

  return rows
    .filter((row) => {
      if (row.integrationId) return false;
      if (!isActiveMarketplaceInstall(row)) return false;
      const tokenPayload = extractOAuthTokensFromRawPayload(row.rawPayload);
      if (!tokenPayload) return false;

      if (canOverride) return true;
      if (row.whachatUserId === userId) return true;
      if (normalizedEmail && row.agencyEmail && normalizeRecoveryEmail(row.agencyEmail) === normalizedEmail) {
        return true;
      }
      if (ownedCompanyIds.has(row.companyId)) return true;
      return false;
    })
    .map((row) => ({
      ...row,
      tokenPayload: extractOAuthTokensFromRawPayload(row.rawPayload)!,
    }))
    .sort((a, b) => {
      const oauthBoost = (row: RecoverableMarketplaceInstall) => (row.source === "oauth" ? 1 : 0);
      const score = oauthBoost(b) - oauthBoost(a);
      if (score !== 0) return score;
      return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
    });
}

export type GhlInstallRow = {
  id: string;
  source: "integration" | "marketplace" | "merged";
  agency: string;
  agencyOwner: string;
  agencyEmail: string;
  subAccountName: string;
  locationId: string;
  companyId: string;
  installDate: string | null;
  installationStatus: string;
  uninstallDate: string | null;
  pricePlan: string;
  billingStatus: string;
  lastSyncDate: string | null;
  tokenExpiresAt: string | null;
  integrationId: string | null;
  whachatUserId: string | null;
  whachatUserName: string;
  whachatUserEmail: string;
  isActive: boolean;
  whiteLabeled: boolean | null;
  userType: string;
};

export type GhlMarketplaceInstallInput = {
  agency?: string | null;
  companyId: string;
  locationId?: string | null;
  subAccountName?: string | null;
  whiteLabeled?: boolean | null;
  agencyOwner?: string | null;
  agencyEmail?: string | null;
  installDate?: Date | string | null;
  installationStatus?: string | null;
  uninstallDate?: Date | string | null;
  pricePlan?: string | null;
  billingStatus?: string | null;
  source?: string;
  rawPayload?: Record<string, unknown>;
};

function unknown(value: string | null | undefined): string {
  if (value == null || String(value).trim() === "") return "Unknown";
  return String(value).trim();
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeInstallKey(locationId: string | null | undefined, companyId: string): string {
  return `${(locationId || "").trim()}::${companyId.trim()}`;
}

function mapIntegrationToRow(
  integration: Integration,
  user: { name?: string | null; email?: string | null; subscriptionPlan?: string | null; billingPlan?: string | null; subscriptionStatus?: string | null } | undefined,
  marketplace?: GhlMarketplaceInstall | null,
): GhlInstallRow {
  const config = (integration.config || {}) as Record<string, unknown>;
  const locationId = unknown((config.locationId as string) || marketplace?.locationId);
  const companyId = unknown((config.companyId as string) || marketplace?.companyId);

  return {
    id: integration.id,
    source: marketplace ? "merged" : "integration",
    agency: unknown(marketplace?.agency),
    agencyOwner: unknown(marketplace?.agencyOwner),
    agencyEmail: unknown(marketplace?.agencyEmail || user?.email),
    subAccountName: unknown(marketplace?.subAccountName || integration.name),
    locationId,
    companyId,
    installDate:
      (config.installedAt as string) ||
      marketplace?.installDate?.toISOString() ||
      integration.createdAt?.toISOString() ||
      null,
    installationStatus: integration.isActive
      ? unknown(marketplace?.installationStatus || "Active")
      : unknown(marketplace?.installationStatus || "Uninstalled"),
    uninstallDate: marketplace?.uninstallDate?.toISOString() || null,
    pricePlan: unknown(marketplace?.pricePlan || user?.subscriptionPlan || user?.billingPlan),
    billingStatus: unknown(marketplace?.billingStatus || user?.subscriptionStatus),
    lastSyncDate: integration.lastSyncAt?.toISOString() || marketplace?.lastSyncedAt?.toISOString() || null,
    tokenExpiresAt: integration.tokenExpiresAt?.toISOString() || null,
    integrationId: integration.id,
    whachatUserId: integration.userId,
    whachatUserName: unknown(user?.name),
    whachatUserEmail: unknown(user?.email),
    isActive: !!integration.isActive,
    whiteLabeled: marketplace?.whiteLabeled ?? null,
    userType: unknown((config.userType as string) || null),
  };
}

function mapMarketplaceOnlyToRow(
  row: GhlMarketplaceInstall,
  user?: { name?: string | null; email?: string | null } | null,
): GhlInstallRow {
  return {
    id: row.id,
    source: "marketplace",
    agency: unknown(row.agency),
    agencyOwner: unknown(row.agencyOwner),
    agencyEmail: unknown(row.agencyEmail),
    subAccountName: unknown(row.subAccountName),
    locationId: unknown(row.locationId),
    companyId: unknown(row.companyId),
    installDate: row.installDate?.toISOString() || null,
    installationStatus: unknown(row.installationStatus),
    uninstallDate: row.uninstallDate?.toISOString() || null,
    pricePlan: unknown(row.pricePlan),
    billingStatus: unknown(row.billingStatus),
    lastSyncDate: row.lastSyncedAt?.toISOString() || null,
    tokenExpiresAt: null,
    integrationId: row.integrationId,
    whachatUserId: row.whachatUserId,
    whachatUserName: unknown(user?.name),
    whachatUserEmail: unknown(user?.email),
    isActive: (row.installationStatus || "").toLowerCase() !== "uninstalled",
    whiteLabeled: row.whiteLabeled ?? null,
    userType: "Unknown",
  };
}

export async function upsertGhlMarketplaceInstall(
  input: GhlMarketplaceInstallInput,
): Promise<GhlMarketplaceInstall> {
  const companyId = input.companyId?.trim();
  if (!companyId) throw new Error("companyId is required");

  const locationId = input.locationId?.trim() || null;
  const now = new Date();

  const existing = locationId
    ? await db
        .select()
        .from(ghlMarketplaceInstalls)
        .where(
          and(
            eq(ghlMarketplaceInstalls.locationId, locationId),
            eq(ghlMarketplaceInstalls.companyId, companyId),
          ),
        )
        .limit(1)
    : await db
        .select()
        .from(ghlMarketplaceInstalls)
        .where(
          and(
            eq(ghlMarketplaceInstalls.companyId, companyId),
            sql`${ghlMarketplaceInstalls.locationId} IS NULL`,
          ),
        )
        .limit(1);

  const patch = {
    agency: input.agency ?? undefined,
    companyId,
    locationId: locationId ?? undefined,
    subAccountName: input.subAccountName ?? undefined,
    whiteLabeled: input.whiteLabeled ?? undefined,
    agencyOwner: input.agencyOwner ?? undefined,
    agencyEmail: input.agencyEmail ?? undefined,
    installDate: parseDate(input.installDate) ?? undefined,
    installationStatus: input.installationStatus ?? undefined,
    uninstallDate: parseDate(input.uninstallDate) ?? undefined,
    pricePlan: input.pricePlan ?? undefined,
    billingStatus: input.billingStatus ?? undefined,
    source: input.source ?? "webhook",
    rawPayload: input.rawPayload ?? {},
    lastSyncedAt: now,
    updatedAt: now,
  };

  if (existing[0]) {
    const [updated] = await db
      .update(ghlMarketplaceInstalls)
      .set(patch)
      .where(eq(ghlMarketplaceInstalls.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(ghlMarketplaceInstalls)
    .values({
      agency: input.agency ?? null,
      companyId,
      locationId,
      subAccountName: input.subAccountName ?? null,
      whiteLabeled: input.whiteLabeled ?? null,
      agencyOwner: input.agencyOwner ?? null,
      agencyEmail: input.agencyEmail ?? null,
      installDate: parseDate(input.installDate),
      installationStatus: input.installationStatus ?? "Active",
      uninstallDate: parseDate(input.uninstallDate),
      pricePlan: input.pricePlan ?? null,
      billingStatus: input.billingStatus ?? null,
      source: input.source ?? "webhook",
      rawPayload: input.rawPayload ?? {},
      lastSyncedAt: now,
    })
    .returning();
  return created;
}

export async function linkMarketplaceInstallToIntegration(
  locationId: string | null | undefined,
  companyId: string | null | undefined,
  integration: Integration,
): Promise<void> {
  if (!companyId && !locationId) return;

  const conditions = [];
  if (locationId) conditions.push(eq(ghlMarketplaceInstalls.locationId, locationId));
  if (companyId) conditions.push(eq(ghlMarketplaceInstalls.companyId, companyId));

  const rows = await db
    .select()
    .from(ghlMarketplaceInstalls)
    .where(conditions.length === 2 ? and(...conditions) : conditions[0])
    .limit(1);

  if (rows[0]) {
    await db
      .update(ghlMarketplaceInstalls)
      .set({
        integrationId: integration.id,
        whachatUserId: integration.userId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ghlMarketplaceInstalls.id, rows[0].id));
    return;
  }

  const config = (integration.config || {}) as Record<string, unknown>;
  await upsertGhlMarketplaceInstall({
    companyId: companyId || (config.companyId as string) || "unknown",
    locationId: locationId || (config.locationId as string) || null,
    subAccountName: integration.name,
    installDate: (config.installedAt as string) || integration.createdAt || new Date(),
    installationStatus: integration.isActive ? "Active" : "Uninstalled",
    source: "oauth",
  });

  const linked = await db
    .select()
    .from(ghlMarketplaceInstalls)
    .where(
      and(
        eq(ghlMarketplaceInstalls.companyId, companyId || (config.companyId as string) || "unknown"),
        locationId
          ? eq(ghlMarketplaceInstalls.locationId, locationId)
          : sql`${ghlMarketplaceInstalls.locationId} IS NULL`,
      ),
    )
    .limit(1);

  if (linked[0]) {
    await db
      .update(ghlMarketplaceInstalls)
      .set({
        integrationId: integration.id,
        whachatUserId: integration.userId,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ghlMarketplaceInstalls.id, linked[0].id));
  }
}

export async function markMarketplaceUninstalled(
  locationId: string | null | undefined,
  companyId?: string | null,
): Promise<void> {
  const now = new Date();
  const conditions = [];
  if (locationId) conditions.push(eq(ghlMarketplaceInstalls.locationId, locationId));
  if (companyId) conditions.push(eq(ghlMarketplaceInstalls.companyId, companyId));
  if (conditions.length === 0) return;

  await db
    .update(ghlMarketplaceInstalls)
    .set({
      installationStatus: "Uninstalled",
      uninstallDate: now,
      lastSyncedAt: now,
      updatedAt: now,
    })
    .where(conditions.length === 2 ? and(...conditions) : conditions[0]);
}

export function extractInstallFromWebhook(body: Record<string, unknown>): GhlMarketplaceInstallInput | null {
  const locationId =
    (body.locationId as string) ||
    (body.location_id as string) ||
    ((body.location as Record<string, unknown>)?.id as string) ||
    null;
  const companyId =
    (body.companyId as string) ||
    (body.company_id as string) ||
    ((body.company as Record<string, unknown>)?.id as string) ||
    null;

  if (!locationId && !companyId) return null;

  const install = (body.install as Record<string, unknown>) || body;
  return {
    agency:
      (install.agency as string) ||
      (install.agencyName as string) ||
      (body.agency as string) ||
      null,
    companyId: companyId || "unknown",
    locationId,
    subAccountName:
      (install.subAccount as string) ||
      (install.locationName as string) ||
      (install.name as string) ||
      null,
    whiteLabeled:
      typeof install.whiteLabeled === "boolean"
        ? install.whiteLabeled
        : typeof install.white_labeled === "boolean"
          ? install.white_labeled
          : null,
    agencyOwner: (install.agencyOwner as string) || (install.ownerName as string) || null,
    agencyEmail: (install.agencyEmail as string) || (install.ownerEmail as string) || null,
    installDate:
      (install.installDate as string) ||
      (install.installedAt as string) ||
      (body.timestamp as string) ||
      new Date().toISOString(),
    installationStatus: "Active",
    pricePlan: (install.pricePlan as string) || (install.plan as string) || null,
    billingStatus: (install.billingStatus as string) || null,
    source: "webhook",
    rawPayload: body,
  };
}

const CSV_COLUMN_MAP: Record<string, keyof GhlMarketplaceInstallInput> = {
  agency: "agency",
  "company id": "companyId",
  companyid: "companyId",
  "company": "companyId",
  "sub-account": "subAccountName",
  subaccount: "subAccountName",
  "sub account": "subAccountName",
  "location id": "locationId",
  locationid: "locationId",
  "location": "locationId",
  "white-labeled": "whiteLabeled",
  whitelabeled: "whiteLabeled",
  "white labeled": "whiteLabeled",
  "agency owner": "agencyOwner",
  agencyowner: "agencyOwner",
  owner: "agencyOwner",
  "agency email": "agencyEmail",
  agencyemail: "agencyEmail",
  email: "agencyEmail",
  "install date": "installDate",
  installdate: "installDate",
  installed: "installDate",
  "installation status": "installationStatus",
  installationstatus: "installationStatus",
  status: "installationStatus",
  "uninstall date": "uninstallDate",
  uninstalldate: "uninstallDate",
  "price plan": "pricePlan",
  priceplan: "pricePlan",
  plan: "pricePlan",
  "billing status": "billingStatus",
  billingstatus: "billingStatus",
};

function normalizeCsvHeader(header: string): string {
  return header
    .replace(/^\ufeff/, "")
    .toLowerCase()
    .replace(/"/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectDelimiter(line: string): string {
  const tabs = (line.match(/\t/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return tabs > commas ? "\t" : ",";
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

export async function importGhlInstallsFromCsv(csvText: string): Promise<{ imported: number; errors: string[] }> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { imported: 0, errors: ["CSV must include a header row and at least one data row"] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter).map(normalizeCsvHeader);
  const errors: string[] = [];
  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const values = parseDelimitedLine(lines[i], delimiter);
    if (values.every((v) => !v)) continue;

    const row: Partial<GhlMarketplaceInstallInput> = { source: "csv" };
    headers.forEach((header, idx) => {
      const key = CSV_COLUMN_MAP[header];
      if (!key) return;
      const raw = values[idx]?.replace(/^"|"$/g, "").trim();
      if (!raw) return;
      if (key === "whiteLabeled") {
        row.whiteLabeled = ["yes", "true", "1", "y"].includes(raw.toLowerCase());
      } else {
        (row as Record<string, unknown>)[key] = raw;
      }
    });

    if (!row.companyId) {
      errors.push(`Row ${i + 1}: missing Company ID`);
      continue;
    }

    try {
      await upsertGhlMarketplaceInstall(row as GhlMarketplaceInstallInput);
      imported++;
    } catch (err: unknown) {
      errors.push(`Row ${i + 1}: ${(err as Error)?.message || "upsert failed"}`);
    }
  }

  return { imported, errors };
}

export async function listGhlInstallationsForAdmin(): Promise<GhlInstallRow[]> {
  const allIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));

  const marketplaceRows = await db.select().from(ghlMarketplaceInstalls);
  const allUsers = await storage.getAllUsers();
  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const marketplaceByKey = new Map(
    marketplaceRows.map((r) => [normalizeInstallKey(r.locationId, r.companyId), r]),
  );

  const merged: GhlInstallRow[] = [];
  const seenKeys = new Set<string>();

  for (const integration of allIntegrations) {
    const config = (integration.config || {}) as Record<string, unknown>;
    const key = normalizeInstallKey(config.locationId as string, (config.companyId as string) || "unknown");
    seenKeys.add(key);
    const marketplace = marketplaceByKey.get(key);
    const user = userMap.get(integration.userId);
    merged.push(mapIntegrationToRow(integration, user, marketplace));
  }

  for (const row of marketplaceRows) {
    const key = normalizeInstallKey(row.locationId, row.companyId);
    if (seenKeys.has(key)) continue;
    const user = row.whachatUserId ? userMap.get(row.whachatUserId) : undefined;
    merged.push(mapMarketplaceOnlyToRow(row, user));
  }

  merged.sort((a, b) => {
    const aTime = a.installDate ? new Date(a.installDate).getTime() : 0;
    const bTime = b.installDate ? new Date(b.installDate).getTime() : 0;
    return bTime - aTime;
  });

  return merged;
}

export async function countActiveGhlMarketplaceInstalls(): Promise<number> {
  const rows = await db
    .select({ installationStatus: ghlMarketplaceInstalls.installationStatus })
    .from(ghlMarketplaceInstalls);
  return rows.filter((r) => (r.installationStatus || "").toLowerCase() !== "uninstalled").length;
}

function isGhlMarketplacePaidPlan(pricePlan: string | null | undefined): boolean {
  if (!pricePlan || !String(pricePlan).trim()) return false;
  const normalized = String(pricePlan).toLowerCase();
  if (normalized.includes("free")) return false;
  if (normalized.includes("trial")) return false;
  return true;
}

/** Users with an active GHL marketplace install on a non-free, non-trial price plan. */
export async function getGhlMarketplacePaidUserIds(): Promise<Set<string>> {
  const rows = await db
    .select({
      whachatUserId: ghlMarketplaceInstalls.whachatUserId,
      pricePlan: ghlMarketplaceInstalls.pricePlan,
      installationStatus: ghlMarketplaceInstalls.installationStatus,
    })
    .from(ghlMarketplaceInstalls);

  const ids = new Set<string>();
  for (const row of rows) {
    if (!row.whachatUserId) continue;
    if ((row.installationStatus || "").toLowerCase() === "uninstalled") continue;
    if (!isGhlMarketplacePaidPlan(row.pricePlan)) continue;
    ids.add(row.whachatUserId);
  }
  return ids;
}

export async function getGhlUserIds(): Promise<Set<string>> {
  const ghlIntegrations = await db
    .select({ userId: integrations.userId })
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));
  const marketplaceUsers = await db
    .select({ userId: ghlMarketplaceInstalls.whachatUserId })
    .from(ghlMarketplaceInstalls)
    .where(sql`${ghlMarketplaceInstalls.whachatUserId} IS NOT NULL`);

  const ids = new Set<string>();
  for (const row of ghlIntegrations) ids.add(row.userId);
  for (const row of marketplaceUsers) {
    if (row.userId) ids.add(row.userId);
  }
  return ids;
}

export type BackfillGhlMarketplaceResult = {
  scanned: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
};

function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === "";
}

function hasRichMarketplaceData(row: GhlMarketplaceInstall): boolean {
  if (row.source === "csv") return true;
  const filled = [row.agency, row.agencyOwner, row.agencyEmail, row.subAccountName, row.pricePlan].filter(
    (v) => !isBlank(v),
  ).length;
  return filled >= 2;
}

async function findMarketplaceInstallByKey(
  locationId: string | null,
  companyId: string,
): Promise<GhlMarketplaceInstall | undefined> {
  if (locationId) {
    const rows = await db
      .select()
      .from(ghlMarketplaceInstalls)
      .where(
        and(
          eq(ghlMarketplaceInstalls.locationId, locationId),
          eq(ghlMarketplaceInstalls.companyId, companyId),
        ),
      )
      .limit(1);
    return rows[0];
  }

  const rows = await db
    .select()
    .from(ghlMarketplaceInstalls)
    .where(
      and(eq(ghlMarketplaceInstalls.companyId, companyId), sql`${ghlMarketplaceInstalls.locationId} IS NULL`),
    )
    .limit(1);
  return rows[0];
}

function buildIntegrationBackfillPatch(
  integration: Integration,
  user: { name?: string | null; email?: string | null; subscriptionPlan?: string | null; billingPlan?: string | null; subscriptionStatus?: string | null } | undefined,
  existing: GhlMarketplaceInstall | null,
): Record<string, unknown> | null {
  const config = (integration.config || {}) as Record<string, unknown>;
  const locationId = (config.locationId as string | undefined)?.trim() || null;
  const companyId = (config.companyId as string | undefined)?.trim() || "unknown";
  const now = new Date();

  const fromIntegration = {
    companyId,
    locationId,
    subAccountName: integration.name || null,
    installDate: parseDate((config.installedAt as string) || integration.createdAt),
    installationStatus: integration.isActive ? "Active" : "Uninstalled",
    uninstallDate: integration.isActive ? null : existing?.uninstallDate ?? now,
    pricePlan: user?.subscriptionPlan || user?.billingPlan || null,
    billingStatus: user?.subscriptionStatus || null,
    agencyEmail: user?.email || null,
    integrationId: integration.id,
    whachatUserId: integration.userId,
    lastSyncedAt: integration.lastSyncAt || now,
    source: existing ? existing.source : "integration_backfill",
    rawPayload: {
      ...((existing?.rawPayload as Record<string, unknown>) || {}),
      backfillIntegration: {
        integrationId: integration.id,
        userId: integration.userId,
        userType: config.userType ?? null,
        tokenExpiresAt: integration.tokenExpiresAt?.toISOString() ?? null,
        scope: config.scope ?? null,
        isActive: integration.isActive,
        backfilledAt: now.toISOString(),
      },
    },
  };

  if (!existing) {
    return fromIntegration;
  }

  const rich = hasRichMarketplaceData(existing);
  const patch: Record<string, unknown> = { updatedAt: now };

  const linkFields: (keyof typeof fromIntegration)[] = [
    "integrationId",
    "whachatUserId",
    "lastSyncedAt",
  ];
  for (const key of linkFields) {
    const next = fromIntegration[key];
    const prev = existing[key as keyof GhlMarketplaceInstall];
    if (next != null && next !== prev) {
      patch[key] = next;
    }
  }

  if (!rich) {
    const mergeFields: (keyof typeof fromIntegration)[] = [
      "subAccountName",
      "installDate",
      "installationStatus",
      "uninstallDate",
      "pricePlan",
      "billingStatus",
      "agencyEmail",
      "locationId",
    ];
    for (const key of mergeFields) {
      const next = fromIntegration[key];
      const prev = existing[key as keyof GhlMarketplaceInstall];
      if (next != null && (isBlank(prev as string | null) || prev == null)) {
        patch[key] = next;
      }
    }
    if (isBlank(existing.source)) {
      patch.source = "integration_backfill";
    }
  }

  patch.rawPayload = fromIntegration.rawPayload;

  const mutableKeys = Object.keys(patch).filter((k) => k !== "updatedAt" && k !== "rawPayload");
  if (mutableKeys.length === 0 && !rich) {
    // Only rawPayload would change — still update if integration link metadata is new
    const existingPayload = (existing.rawPayload as Record<string, unknown>) || {};
    if (JSON.stringify(existingPayload.backfillIntegration) === JSON.stringify((fromIntegration.rawPayload as Record<string, unknown>).backfillIntegration)) {
      return null;
    }
  }

  if (mutableKeys.length === 0 && rich) {
    const needsLink =
      isBlank(existing.integrationId) ||
      isBlank(existing.whachatUserId) ||
      existing.integrationId !== integration.id ||
      existing.whachatUserId !== integration.userId;
    if (!needsLink) return null;
  }

  return patch;
}

export async function backfillGhlMarketplaceInstallsFromIntegrations(options?: {
  dryRun?: boolean;
}): Promise<BackfillGhlMarketplaceResult> {
  const dryRun = !!options?.dryRun;
  const result: BackfillGhlMarketplaceResult = {
    scanned: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const ghlIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));

  const allUsers = await storage.getAllUsers();
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  for (const integration of ghlIntegrations) {
    result.scanned++;
    const config = (integration.config || {}) as Record<string, unknown>;
    const locationId = (config.locationId as string | undefined)?.trim() || null;
    const companyId = (config.companyId as string | undefined)?.trim() || "unknown";

    if (!locationId && companyId === "unknown") {
      result.skipped++;
      console.warn(
        `[ghl-backfill] Integration ${integration.id}: missing locationId and companyId — skipped`,
      );
      continue;
    }

    try {
      const existing = await findMarketplaceInstallByKey(locationId, companyId);
      const user = userMap.get(integration.userId);
      const patch = buildIntegrationBackfillPatch(integration, user, existing ?? null);

      if (!existing) {
        if (dryRun) {
          console.log("[dry-run] insert", {
            integrationId: integration.id,
            locationId,
            companyId,
            userId: integration.userId,
          });
          result.inserted++;
          continue;
        }

        const values = buildIntegrationBackfillPatch(integration, user, null)!;
        await db.insert(ghlMarketplaceInstalls).values({
          agency: null,
          companyId: values.companyId as string,
          locationId: values.locationId as string | null,
          subAccountName: values.subAccountName as string | null,
          whiteLabeled: null,
          agencyOwner: null,
          agencyEmail: values.agencyEmail as string | null,
          installDate: values.installDate as Date | null,
          installationStatus: (values.installationStatus as string) || "Active",
          uninstallDate: values.uninstallDate as Date | null,
          pricePlan: values.pricePlan as string | null,
          billingStatus: values.billingStatus as string | null,
          integrationId: values.integrationId as string,
          whachatUserId: values.whachatUserId as string,
          lastSyncedAt: values.lastSyncedAt as Date,
          source: "integration_backfill",
          rawPayload: values.rawPayload,
        });
        result.inserted++;
        continue;
      }

      if (!patch) {
        result.skipped++;
        continue;
      }

      if (dryRun) {
        console.log("[dry-run] update", {
          marketplaceId: existing.id,
          integrationId: integration.id,
          fields: Object.keys(patch).filter((k) => k !== "updatedAt"),
        });
        result.updated++;
        continue;
      }

      await db
        .update(ghlMarketplaceInstalls)
        .set(patch as Partial<typeof ghlMarketplaceInstalls.$inferInsert>)
        .where(eq(ghlMarketplaceInstalls.id, existing.id));
      result.updated++;
    } catch (err: unknown) {
      result.errors.push(
        `Integration ${integration.id}: ${(err as Error)?.message || "backfill failed"}`,
      );
    }
  }

  return result;
}
