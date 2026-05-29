/** Escape single quotes for OData string literals. */
export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

/** Join OData filter clauses with `and`. */
export function buildODataFilter(clauses: string[]): string {
  return clauses.filter(Boolean).join(" and ");
}

export function encodeODataFilter(filter: string): string {
  return encodeURIComponent(filter);
}

export function buildPropertyCollectionUrl(
  baseUrl: string,
  resource: string,
  params: {
    filter?: string;
    top?: number;
    expand?: string;
    select?: string;
    unselect?: string;
  },
): string {
  const parts: string[] = [`${baseUrl.replace(/\/$/, "")}/${resource}?`];
  const query: string[] = [];
  if (params.filter) query.push(`$filter=${encodeODataFilter(params.filter)}`);
  if (params.top != null) query.push(`$top=${params.top}`);
  if (params.expand) query.push(`$expand=${encodeURIComponent(params.expand)}`);
  if (params.select) query.push(`$select=${encodeURIComponent(params.select)}`);
  if (params.unselect) query.push(`$unselect=${encodeURIComponent(params.unselect)}`);
  return parts[0] + query.join("&");
}

export function oDataNextLink(body: Record<string, unknown>): string | null {
  const next = body["@odata.nextLink"];
  return typeof next === "string" && next.length > 0 ? next : null;
}

export function oDataValueRows(body: Record<string, unknown>): unknown[] {
  const value = body.value;
  return Array.isArray(value) ? value : [];
}
