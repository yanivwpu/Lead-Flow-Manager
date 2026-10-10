/** Property/union-member display order is not a TypeScript regression; types and members remain significant. */
export function normalizeDiagnosticTypeProperties(message) {
  const unions = message.replace(/"(?:[^"\\]|\\.)*"(?:\s*\|\s*"(?:[^"\\]|\\.)*")+/g,
    value => value.match(/"(?:[^"\\]|\\.)*"/g).sort().join(" | "));
  return unions.replace(/\{([^{}]*)\}/g, (whole, body) => {
    const properties = body.split(";").map(value => value.trim()).filter(Boolean);
    if (!properties.length || !properties.every(value => /^(?:readonly\s+)?[A-Za-z_$][\w$]*\??\s*:/.test(value))) return whole;
    return "{ " + properties.sort().join("; ") + "; }";
  });
}
