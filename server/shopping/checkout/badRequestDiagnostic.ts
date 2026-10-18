import { STOREFRONT_API_VERSION } from "./shopify";
// Read-only admin diagnosis only. Return fixed categories, never raw JSON or error text.
const fields = new Set(['node','id','availableForSale','quantityRule','minimum','maximum','increment',
  'requiresComponents','selectedOptions','name','value','price','amount','currencyCode','product','requiresSellingPlan']);
const codes: Record<string,string> = Object.assign(Object.create(null), {
  GRAPHQL_PARSE_FAILED:'graphql_parse_error', PARSE_ERROR:'graphql_parse_error', parseError:'graphql_parse_error',
  GRAPHQL_VALIDATION_FAILED:'graphql_validation_error', undefinedField:'graphql_undefined_field',
  selectionMismatch:'graphql_selection_mismatch', argumentNotAccepted:'graphql_argument_rejected',
  missingRequiredArguments:'graphql_required_argument_missing', variableMismatch:'graphql_variable_invalid',
  variableRequiresValidType:'graphql_variable_invalid', variableNotUsed:'graphql_variable_invalid',
  ACCESS_DENIED:'graphql_access_denied', TOKEN_ACCESS_REQUIRED:'graphql_access_denied',
  MAX_COMPLEXITY_EXCEEDED:'graphql_complexity_exceeded', MAX_COST_EXCEEDED:'graphql_complexity_exceeded',
  SHOP_INACTIVE:'shop_inactive', SHOP_LOCKED:'shop_locked', THROTTLED:'graphql_throttled',
});
export function classifyBadRequest(value: unknown): string {
  if (!value || typeof value!=='object') return 'unclassified';
  const errors = (value as {errors?:unknown}).errors;
  if (errors && !Array.isArray(errors) && typeof errors==='object' &&
      typeof (errors as {query?:unknown}).query==='string') return 'request_envelope_rejected';
  if (!Array.isArray(errors) || !errors.length || errors.length>8) return 'unclassified';
  const categories = new Set<string>(), rejectedFields = new Set<string>();
  for (const error of errors) {
    const code = error?.extensions?.code;
    const category = typeof code==='string' && Object.prototype.hasOwnProperty.call(codes,code) ? codes[code] : undefined;
    if (!category) return 'graphql_error_unclassified';
    categories.add(category);
    const field = error?.extensions?.fieldName;
    if (typeof field==='string' && fields.has(field)) rejectedFields.add(field);
  }
  if (categories.size!==1) return 'graphql_errors_mixed';
  const category = [...categories][0];
  return rejectedFields.size===1 ? `${category}_${[...rejectedFields][0]}` : category;
}
class DiagnosticLimit extends Error { constructor(readonly kind:'body_too_large'|'body_timeout'){super(kind);} }
/** Consume only an already-rejected HTTP 400 body; the provider rejects by status, without reading it. */
export async function badRequestDiagnostic(response: Response): Promise<string> {
  if (response.status!==400) return 'not_applicable';
  const mime=(response.headers.get('content-type')??'').split(';',1)[0].trim().toLowerCase();
  if (!/^(?:application|text)\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/.test(mime)) return 'non_json';
  const servedVersion=response.headers.get('x-shopify-api-version');
  if(servedVersion!==null && servedVersion!==STOREFRONT_API_VERSION) return 'api_version_mismatch';
  const reader=response.body?.getReader();
  if (!reader) return 'empty_body';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const body = await Promise.race([
      (async()=>{
        const chunks:Uint8Array[]=[];let length=0;
        while (true) {
          const chunk=await reader.read(); if(chunk.done)break;
          length+=chunk.value.byteLength;
          if(length>16_384)throw new DiagnosticLimit('body_too_large');
          chunks.push(chunk.value);
        }
        const bytes=new Uint8Array(length);let offset=0;
        for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
        return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      })(),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new DiagnosticLimit('body_timeout')),2_000);}),
    ]);
    let parsed:unknown;
    try {parsed=JSON.parse(body);} catch {return 'invalid_json';}
    return classifyBadRequest(parsed);
  } catch(error) {
    return error instanceof DiagnosticLimit ? error.kind : 'body_unreadable';
  } finally {
    if(timer)clearTimeout(timer);
    // Cancellation is best effort; never await a provider-controlled stream during cleanup.
    void reader.cancel().catch(()=>{});
  }
}
