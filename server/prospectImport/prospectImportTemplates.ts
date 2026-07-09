import { and, desc, eq } from "drizzle-orm";
import { prospectImportTemplates } from "@shared/schema";
import type {
  ProspectImportContactFilter,
  ProspectImportInternalTag,
  ProspectImportProvider,
  ProspectImportReason,
  ProspectImportTemplate,
} from "@shared/prospectImport";
import { db } from "../../drizzle/db";

function mapTemplateRow(row: typeof prospectImportTemplates.$inferSelect): ProspectImportTemplate {
  return {
    id: row.id,
    templateName: row.templateName,
    provider: row.provider as ProspectImportProvider,
    filters: (row.filters || {}) as ProspectImportContactFilter,
    defaultInternalTag: (row.defaultInternalTag as ProspectImportInternalTag | null) ?? null,
    defaultImportReason: row.defaultImportReason,
    defaultImportLimit: row.defaultImportLimit,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function listProspectImportTemplates(userId: string): Promise<ProspectImportTemplate[]> {
  const rows = await db
    .select()
    .from(prospectImportTemplates)
    .where(eq(prospectImportTemplates.createdByUserId, userId))
    .orderBy(desc(prospectImportTemplates.updatedAt));
  return rows.map(mapTemplateRow);
}

export async function saveProspectImportTemplate(params: {
  userId: string;
  templateName: string;
  provider: ProspectImportProvider;
  filters: ProspectImportContactFilter;
  defaultInternalTag?: ProspectImportInternalTag;
  defaultImportReason?: ProspectImportReason | string;
  defaultImportLimit?: number;
}): Promise<ProspectImportTemplate> {
  const [row] = await db
    .insert(prospectImportTemplates)
    .values({
      createdByUserId: params.userId,
      templateName: params.templateName.trim(),
      provider: params.provider,
      filters: params.filters,
      defaultInternalTag: params.defaultInternalTag ?? null,
      defaultImportReason: params.defaultImportReason ?? null,
      defaultImportLimit: params.defaultImportLimit ?? 100,
      updatedAt: new Date(),
    })
    .returning();
  return mapTemplateRow(row);
}

export async function deleteProspectImportTemplate(userId: string, templateId: string): Promise<boolean> {
  const rows = await db
    .delete(prospectImportTemplates)
    .where(
      and(
        eq(prospectImportTemplates.id, templateId),
        eq(prospectImportTemplates.createdByUserId, userId),
      ),
    )
    .returning({ id: prospectImportTemplates.id });
  return rows.length > 0;
}
