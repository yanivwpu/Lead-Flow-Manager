/**
 * Meta Graph / Facebook Login API version.
 * Set META_GRAPH_API_VERSION (e.g. v23.0) in Railway; must match the version enabled in the Meta app.
 * @see https://developers.facebook.com/docs/graph-api/changelog
 */
export function getMetaGraphVersionSegment(): string {
  const raw = (process.env.META_GRAPH_API_VERSION || "v21.0").trim();
  return raw.startsWith("v") ? raw : `v${raw}`;
}

export function getMetaGraphApiBase(): string {
  return `https://graph.facebook.com/${getMetaGraphVersionSegment()}`;
}

/** Facebook Login / Embedded Signup OAuth dialog (www.facebook.com, not graph). */
export function getMetaFacebookOAuthDialogBase(): string {
  return `https://www.facebook.com/${getMetaGraphVersionSegment()}/dialog/oauth`;
}
