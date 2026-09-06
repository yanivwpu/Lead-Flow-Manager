import { useMemo, useState } from "react";
import type { WebchatFormDefinition } from "@shared/webchatStructuredForm";

export function WebchatFormCard(props: {
  form: WebchatFormDefinition;
  widgetColor: string;
  disabled?: boolean;
  submitted?: boolean;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = useMemo(() => props.form.fields, [props.form.fields]);

  if (props.submitted) {
    return (
      <div className="min-w-0 max-w-full rounded-2xl border border-gray-100 bg-white px-3 py-2 text-sm" data-testid="webchat-form-submitted">
        Thanks — we received your details.
      </div>
    );
  }

  return (
    <form
      className="min-w-0 max-w-full space-y-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 text-sm shadow-sm"
      data-testid="webchat-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (props.disabled || busy) return;
        setBusy(true);
        setError(null);
        try {
          await props.onSubmit(values);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not submit the form.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-medium break-words [overflow-wrap:anywhere]">{props.form.title}</p>
      {props.form.description ? (
        <p className="text-xs text-gray-500 break-words [overflow-wrap:anywhere]">{props.form.description}</p>
      ) : null}
      {fields.map((field) => (
        <label key={field.id} className="block min-w-0 space-y-1">
          <span className="text-xs text-gray-600 break-words [overflow-wrap:anywhere]">
            {field.label}
            {field.required ? " *" : ""}
          </span>
          {field.type === "select" ? (
            <select
              className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              value={String(values[field.id] || "")}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
              required={field.required}
            >
              <option value="">Select</option>
              {(field.options || []).map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : field.type === "radio" ? (
            <div className="space-y-1">
              {(field.options || []).map((opt) => (
                <label key={opt} className="flex min-w-0 items-center gap-2 text-xs">
                  <input
                    type="radio"
                    name={field.id}
                    value={opt}
                    checked={values[field.id] === opt}
                    onChange={() => setValues((prev) => ({ ...prev, [field.id]: opt }))}
                    required={field.required}
                  />
                  <span className="min-w-0 break-words [overflow-wrap:anywhere]">{opt}</span>
                </label>
              ))}
            </div>
          ) : field.type === "checkbox" ? (
            <div className="space-y-1">
              {(field.options || []).map((opt) => {
                const selected = Array.isArray(values[field.id]) ? (values[field.id] as string[]) : [];
                return (
                  <label key={opt} className="flex min-w-0 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selected.includes(opt)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, opt]
                          : selected.filter((x) => x !== opt);
                        setValues((prev) => ({ ...prev, [field.id]: next }));
                      }}
                    />
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{opt}</span>
                  </label>
                );
              })}
            </div>
          ) : field.type === "consent" ? (
            <label className="flex min-w-0 items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={values[field.id] === true}
                onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.checked }))}
                required={field.required}
                data-testid="webchat-form-consent"
              />
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{field.consentText}</span>
            </label>
          ) : (
            <input
              className="w-full min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              type={field.type === "email" ? "email" : field.type === "date" ? "date" : field.type === "phone" ? "tel" : "text"}
              placeholder={field.placeholder || ""}
              value={String(values[field.id] || "")}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
              required={field.required}
            />
          )}
        </label>
      ))}
      {error ? (
        <p className="text-xs text-red-600 break-words [overflow-wrap:anywhere]" data-testid="webchat-form-error">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={props.disabled || busy}
        className="w-full rounded-xl py-2 text-sm font-medium text-white disabled:opacity-40"
        style={{ background: props.widgetColor }}
        data-testid="webchat-form-submit"
      >
        {busy ? "Sending…" : props.form.submitLabel}
      </button>
    </form>
  );
}
