import { CHECKOUT_FAILURE_DETAILS, type CheckoutFailureDetail } from './contract';

/** Inspect only bounded native error markers; never return message, cause, hostname or stack. */
export function storefrontTransportDetail(error: unknown, signal: AbortSignal, body = false): CheckoutFailureDetail {
  const markers: Array<{code?:unknown;name?:unknown;message?:unknown}> = [];
  const visit = (value: unknown, depth: number) => {
    if (!value || typeof value !== 'object' || depth>3 || markers.length>=12) return;
    const e=value as {code?:unknown;name?:unknown;message?:unknown;cause?:unknown;errors?:unknown};
    markers.push(e);
    visit(e.cause,depth+1);
    if(Array.isArray(e.errors))for(const child of e.errors.slice(0,4))visit(child,depth+1);
  };
  visit(error,0);
  const has=(codes:string[])=>markers.some(e=>typeof e.code==='string'&&codes.includes(e.code));
  const timedOut=signal.aborted || markers.some(e=>e.name==='TimeoutError') || has(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
  if(body)return timedOut?'body_timeout':'body_transport_failed';
  if(signal.aborted || markers.some(e=>e.name==='TimeoutError'))return 'request_timeout';
  if(has(['ENOTFOUND','EAI_AGAIN','EAI_FAIL']))return 'dns_failure';
  if(markers.some(e=>typeof e.code==='string'&&(e.code.startsWith('ERR_TLS_')||e.code.startsWith('ERR_SSL_'))) ||
    has(['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE','SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY']))return 'tls_failure';
  if(has(['UND_ERR_CONNECT_TIMEOUT','ETIMEDOUT']))return 'connect_timeout';
  if(has(['UND_ERR_HEADERS_TIMEOUT']))return 'headers_timeout';
  // Node/Undici redirect:error uses this exact fixed marker; other runtimes fall back safely.
  if(markers.some(e=>e.message==='unexpected redirect'))return 'redirect_refused';
  if(has(['ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','EPIPE','UND_ERR_SOCKET']))return 'connection_failure';
  return 'transport_unknown_before_headers';
}
export function storefrontHttpDetail(status: number): CheckoutFailureDetail {
  if(status>=300&&status<400)return 'http_redirect';
  const detail=`http_${status}` as CheckoutFailureDetail;
  return CHECKOUT_FAILURE_DETAILS.includes(detail)?detail:'http_other';
}
