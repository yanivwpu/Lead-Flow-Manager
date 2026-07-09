import type {
  ProspectImportContactFilter,
  ProspectImportLocation,
  ProspectImportOptions,
  ProspectImportPreviewResult,
} from "@shared/prospectImport";

/**
 * Provider-agnostic interface for future import sources:
 * GoHighLevel, Shopify, HubSpot, CSV, Salesforce, Pipedrive.
 */
export interface ProspectImportProviderAdapter {
  readonly providerId: string;
  listLocations(): Promise<ProspectImportLocation[]>;
  getLocationMetadata?(locationKey: string): Promise<unknown>;
  preview(params: {
    locationKey: string;
    filters: ProspectImportContactFilter;
    destinationUserId: string;
  }): Promise<ProspectImportPreviewResult>;
  fetchForImport(params: {
    locationKey: string;
    filters: ProspectImportContactFilter;
    externalIds?: string[];
  }): Promise<unknown[]>;
}

export type ProspectImportRunContext = {
  jobId: string;
  destinationUserId: string;
  options: ProspectImportOptions;
  sourceLocationId?: string | null;
};
