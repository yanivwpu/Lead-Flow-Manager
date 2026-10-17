// Fixed categories only. Never expose messages, stacks, headers, URLs or response bodies.
export const storefrontDetails = [
  'transport_timeout','transport_aborted','transport_dns','transport_tls',
  'transport_connect','transport_socket','transport_redirect','transport_unknown',
  'http_html_response','http_redirect','http_client_error','http_server_error','http_unexpected_status',
  'response_body_timeout','response_body_read_failed','missing_data',
  'inventory_proof_invalid','variant_not_visible','variant_identity_mismatch',
  'variant_unavailable','unsupported_variant','quantity_rule_invalid','quantity_rule_rejected',
] as const;
export type StorefrontDetail = typeof storefrontDetails[number];
/** Bounded cause/AggregateError traversal: retain categories, never error text. */
export function transportDetail(error: unknown): StorefrontDetail {
  const pending: unknown[] = [error], seen = new Set<unknown>(), found = new Set<StorefrontDetail>();
  for (let n=0; pending.length && n<12; n++) {
    const value = pending.shift();
    if (!value || typeof value!=='object' || seen.has(value)) continue;
    seen.add(value);
    const e = value as {name?:unknown;code?:unknown;cause?:unknown;errors?:unknown};
    const code = typeof e.code==='string' ? e.code : '';
    if (e.name==='TimeoutError' || ['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(code)) found.add('transport_timeout');
    if (e.name==='AbortError' || code==='ABORT_ERR') found.add('transport_aborted');
    if (['ENOTFOUND','EAI_AGAIN','EAI_FAIL'].includes(code)) found.add('transport_dns');
    if (['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code) || code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')) found.add('transport_tls');
    if (['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','EADDRNOTAVAIL'].includes(code)) found.add('transport_connect');
    if (['ECONNRESET','EPIPE','UND_ERR_SOCKET'].includes(code)) found.add('transport_socket');
    // Undici redirect:error has no stable error code; match only its exact sentinel.
    if (value instanceof Error && value.message==='unexpected redirect') found.add('transport_redirect');
    pending.push(e.cause);
    if (Array.isArray(e.errors)) pending.push(...e.errors.slice(0,8));
  }
  // Mixed aggregate failures are not evidence of one unique cause.
  return found.size===1 ? [...found][0] : 'transport_unknown';
}
