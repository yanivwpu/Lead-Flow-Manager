export type ProbeStatus = "supported" | "unsupported" | "unavailable" | "configuration_required";
export type ProbeDiagnostic = { capability: string; status: ProbeStatus; reason: string };
export type ShopifyAgenticProbe = {
  enabled: boolean;
  readOnly: true;
  cartCreationEnabled: false;
  checkoutEnabled: false;
  diagnostics: ProbeDiagnostic[];
  comparison?: { existingProducts: number; standardProducts: number; overlappingProducts: number };
};
