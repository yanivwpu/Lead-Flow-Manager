/** Admin-only allowlist. Never retain a Response, URL, body, cookie or arbitrary header. */
export type StorefrontHttpSummary = {
  httpStatus: number | null;
  redirectOccurred: boolean | null;
  contentTypeFamily: 'JSON' | 'HTML' | 'other' | null;
  apiVersionHeaderPresent: boolean | null;
};
export function emptyHttpSummary(): StorefrontHttpSummary {
  return {httpStatus:null,redirectOccurred:null,contentTypeFamily:null,apiVersionHeaderPresent:null};
}
export function storefrontHttpSummary(response: Response): StorefrontHttpSummary {
  const mime = (response.headers.get('content-type') ?? '').split(';',1)[0].trim().toLowerCase();
  return {
    httpStatus: Number.isInteger(response.status) && response.status>=100 && response.status<=599 ? response.status : null,
    // A redirect response and a followed redirect are different. redirect:error never follows one.
    redirectOccurred: response.redirected === true,
    contentTypeFamily: /^(?:application|text)\/(?:[a-z0-9!#$&^_.+-]+\+)?json$/.test(mime) ? 'JSON' :
      mime==='text/html' || mime==='application/xhtml+xml' ? 'HTML' : 'other',
    apiVersionHeaderPresent: response.headers.has('x-shopify-api-version'),
  };
}
