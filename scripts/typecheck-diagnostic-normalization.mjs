/** Object-property order in diagnostic type displays is not a TypeScript regression. */
export function normalizeDiagnosticTypeProperties(message) {
  return message.replace(/\{([^{}]*)\}/g, (whole, body) => {
    const properties = body.split(";").map(value => value.trim()).filter(Boolean);
    if (!properties.length || !properties.every(value => /^(?:readonly\s+)?[A-Za-z_$][\w$]*\??\s*:/.test(value))) return whole;
    return "{ " + properties.sort().join("; ") + "; }";
  });
}
