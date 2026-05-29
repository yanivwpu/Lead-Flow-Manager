import type { InventoryProvider } from "@shared/inventory/inventoryProviderSchema";
import type { InventorySourceForm } from "@/lib/inventoryApi";

export type InventoryFormField =
  | "originatingSystemName"
  | "accessToken"
  | "clientId"
  | "clientSecret"
  | "datasetId"
  | "serverToken";

export type InventoryFormFieldErrors = Partial<Record<InventoryFormField, string>>;

export type InventoryFormValidationResult =
  | { valid: true }
  | { valid: false; errors: InventoryFormFieldErrors; firstInvalidField: InventoryFormField };

const FIELD_ELEMENT_IDS: Record<InventoryFormField, string> = {
  originatingSystemName: "inventory-originating-system",
  accessToken: "inventory-access-token",
  clientId: "inventory-client-id",
  clientSecret: "inventory-client-secret",
  datasetId: "inventory-dataset-id",
  serverToken: "inventory-server-token",
};

function firstInvalidField(
  errors: InventoryFormFieldErrors,
  order: InventoryFormField[],
): InventoryFormField {
  for (const field of order) {
    if (errors[field]) return field;
  }
  return order[0];
}

function validateMlsGridForm(
  form: InventorySourceForm,
  isUpdate: boolean,
  hasStoredCredentials: boolean,
): InventoryFormValidationResult {
  const errors: InventoryFormFieldErrors = {};
  const order: InventoryFormField[] = ["originatingSystemName", "accessToken"];

  if (!form.originatingSystemName.trim()) {
    errors.originatingSystemName = "Enter your originating system name.";
  }

  const needsToken = !isUpdate || (!hasStoredCredentials && !form.accessToken.trim());
  if (needsToken && !form.accessToken.trim()) {
    errors.accessToken = "Access token is required.";
  }

  if (Object.keys(errors).length === 0) return { valid: true };
  return { valid: false, errors, firstInvalidField: firstInvalidField(errors, order) };
}

function validateTrestleForm(
  form: InventorySourceForm,
  isUpdate: boolean,
  hasStoredCredentials: boolean,
): InventoryFormValidationResult {
  const errors: InventoryFormFieldErrors = {};
  const order: InventoryFormField[] = ["originatingSystemName", "clientId", "clientSecret"];

  if (!form.originatingSystemName.trim()) {
    errors.originatingSystemName = "Enter your originating system name.";
  }

  const needsCredentials = !isUpdate || !hasStoredCredentials;
  if (needsCredentials) {
    if (!form.clientId.trim()) {
      errors.clientId = "Client ID is required.";
    }
    if (!form.clientSecret.trim()) {
      errors.clientSecret = "Client secret is required.";
    }
  }

  if (Object.keys(errors).length === 0) return { valid: true };
  return { valid: false, errors, firstInvalidField: firstInvalidField(errors, order) };
}

function validateBridgeForm(
  form: InventorySourceForm,
  isUpdate: boolean,
  hasStoredCredentials: boolean,
): InventoryFormValidationResult {
  const errors: InventoryFormFieldErrors = {};
  const order: InventoryFormField[] = ["datasetId", "serverToken"];

  if (!form.datasetId.trim()) {
    errors.datasetId = "Dataset ID is required.";
  }

  const needsToken = !isUpdate || (!hasStoredCredentials && !form.serverToken.trim());
  if (needsToken && !form.serverToken.trim()) {
    errors.serverToken = "Server token is required.";
  }

  if (Object.keys(errors).length === 0) return { valid: true };
  return { valid: false, errors, firstInvalidField: firstInvalidField(errors, order) };
}

/** Client-side required-field validation — incomplete forms, not system errors. */
export function validateInventorySourceForm(params: {
  provider: InventoryProvider;
  form: InventorySourceForm;
  isUpdate: boolean;
  hasStoredCredentials: boolean;
}): InventoryFormValidationResult {
  switch (params.provider) {
    case "mls_grid":
      return validateMlsGridForm(params.form, params.isUpdate, params.hasStoredCredentials);
    case "trestle":
      return validateTrestleForm(params.form, params.isUpdate, params.hasStoredCredentials);
    case "bridge_interactive":
      return validateBridgeForm(params.form, params.isUpdate, params.hasStoredCredentials);
    default:
      return { valid: true };
  }
}

export function focusInventoryFormField(field: InventoryFormField): void {
  const id = FIELD_ELEMENT_IDS[field];
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (el instanceof HTMLElement) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
}

export function inventoryFieldHasError(
  errors: InventoryFormFieldErrors,
  field: InventoryFormField,
): boolean {
  return Boolean(errors[field]);
}
