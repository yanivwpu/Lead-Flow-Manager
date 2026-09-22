export type SafeDatabaseErrorDiagnostic = {
  code: string;
  category: "CONNECTION" | "INTEGRITY_CONSTRAINT" | "SCHEMA" | "RESOURCE" | "OPERATOR_INTERVENTION" | "UNKNOWN";
  step: string;
};

/** Returns only bounded, non-sensitive fields suitable for production logs. */
export function safeDatabaseErrorDiagnostic(error: unknown, step: string): SafeDatabaseErrorDiagnostic {
  let candidate: unknown = error;
  let code: string | undefined;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth += 1) {
    const record = candidate as { code?: unknown; cause?: unknown };
    if (typeof record.code === "string" && /^[0-9A-Z]{5}$/.test(record.code)) {
      code = record.code;
      break;
    }
    candidate = record.cause;
  }
  const category = code?.startsWith("08") ? "CONNECTION"
    : code?.startsWith("23") ? "INTEGRITY_CONSTRAINT"
    : code?.startsWith("42") ? "SCHEMA"
    : code?.startsWith("53") ? "RESOURCE"
    : code?.startsWith("57") ? "OPERATOR_INTERVENTION"
    : "UNKNOWN";
  return { code: code ?? "UNAVAILABLE", category, step: step.slice(0, 80) };
}
