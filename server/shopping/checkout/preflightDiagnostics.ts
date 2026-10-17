import { CatalogApiError } from '../../salesCatalog/shopify/api';
import { CHECKOUT_FAILURE_DETAILS, CheckoutError, type CheckoutFailureDetail } from './contract';

// Fixed, non-sensitive vocabulary only. Never derive API output from Error.message,
// provider payloads, SQL text/parameters, request bodies, tokens or checkout URLs.
export type VerificationStage = 'installation' | 'admin_metadata' | 'admin_variant' | 'selection' | 'storefront' | 'journal';
const reasons = ['failed','unavailable','access_denied','throttled','invalid_response',
  'graphql_selection_mismatch','graphql_error','changed','setup_required','api_version_mismatch','invalid_json'] as const;
type Reason = typeof reasons[number] | CheckoutFailureDetail;
export class CheckoutVerificationError extends Error {
  readonly code: string;
  constructor(stage: VerificationStage, reason: Reason) {
    super(`checkout_test_${stage}_${reason}`);
    this.code = this.message;
  }
}
export async function verificationStage<T>(stage: VerificationStage, run:()=>Promise<T>): Promise<T> {
  try { return await run(); }
  catch (error) {
    if (error instanceof CheckoutVerificationError) throw error;
    let reason: Reason = 'failed';
    if (error instanceof CatalogApiError) {
      if (error.detail === 'graphql_selection_mismatch' || error.detail === 'graphql_error') reason=error.detail;
      else if (['unavailable','access_denied','throttled','invalid_response'].includes(error.code)) reason=error.code;
    } else if (error instanceof CheckoutError) {
      if (CHECKOUT_FAILURE_DETAILS.includes(error.detail!)) reason=error.detail!;
      else if (['unavailable','throttled','invalid_response','changed','setup_required'].includes(error.code)) reason=error.code as Reason;
    }
    throw new CheckoutVerificationError(stage,reason);
  }
}
export function verificationFailure(stage: VerificationStage, reason: Reason = 'failed'): never {
  throw new CheckoutVerificationError(stage,reason);
}

const guardCodes = {
  development_installation_not_attested_shop: 'checkout_test_shop_identity_not_verified',
  development_installation_not_attested_plan: 'checkout_test_development_store_not_verified',
  development_installation_not_attested_app: 'checkout_test_app_identity_not_verified',
  development_installation_not_attested_scopes: 'checkout_test_product_inventory_permissions_not_verified',
  catalog_selection_unavailable_or_changed: 'checkout_test_selection_unavailable_or_changed',
  inventory_insufficient: 'checkout_test_inventory_insufficient',
  installation_changed: 'checkout_test_installation_changed',
} as const;
export class CheckoutGuardError extends Error {
  constructor(readonly guard: keyof typeof guardCodes) { super(guard); }
}
export function controlledFailureCode(error: unknown): string | undefined {
  return error instanceof CheckoutGuardError ? guardCodes[error.guard] : undefined;
}
