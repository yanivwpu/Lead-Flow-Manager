import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WebchatFormCard } from "@/components/webchat/WebchatFormCard";
import {
  WEBCHAT_FORM_FIELD_TYPES,
  WEBCHAT_FORM_MAX_FIELDS,
  WEBCHAT_FORM_MAX_OPTIONS,
  chatbotFormDefinitionIsPublishable,
  emptyWebchatFormDraft,
  sanitizeWebchatFormDefinition,
  uniqueWebchatFormFieldId,
  webchatFormFieldDraftError,
  type WebchatFormDefinition,
  type WebchatFormField,
  type WebchatFormFieldType,
} from "@shared/webchatStructuredForm";

const TYPE_LABELS: Record<WebchatFormFieldType, string> = {
  name: "Name",
  email: "Email",
  phone: "Phone",
  select: "Select",
  radio: "Radio",
  checkbox: "Checkbox",
  date: "Date",
  consent: "Consent",
};

const NEEDS_OPTIONS = new Set<WebchatFormFieldType>(["select", "radio", "checkbox"]);

export type ChatbotFormDraft = {
  id: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: Array<Record<string, unknown>>;
};

function asDraft(raw: ChatbotFormDraft | undefined | null): ChatbotFormDraft {
  const fallback = emptyWebchatFormDraft();
  if (!raw || typeof raw !== "object") {
    return { ...fallback, fields: [] };
  }
  return {
    id: String(raw.id || fallback.id),
    title: String(raw.title || ""),
    description: String(raw.description || ""),
    submitLabel: String(raw.submitLabel || fallback.submitLabel),
    fields: Array.isArray(raw.fields) ? raw.fields.map((f) => (f && typeof f === "object" ? { ...f } : f)) : [],
  };
}

function fieldType(raw: Record<string, unknown>): WebchatFormFieldType {
  return WEBCHAT_FORM_FIELD_TYPES.includes(raw.type as WebchatFormFieldType)
    ? (raw.type as WebchatFormFieldType)
    : "name";
}

function moveItem<T>(items: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir;
  if (next < 0 || next >= items.length) return items;
  const copy = [...items];
  const [row] = copy.splice(index, 1);
  copy.splice(next, 0, row!);
  return copy;
}

function defaultField(type: WebchatFormFieldType, existingIds: string[]): Record<string, unknown> {
  const field: Record<string, unknown> = {
    id: uniqueWebchatFormFieldId(type, existingIds),
    type,
    label: TYPE_LABELS[type],
    required: type === "consent",
  };
  if (NEEDS_OPTIONS.has(type)) field.options = ["Option 1"];
  if (type === "consent") {
    field.consentText = "I agree to be contacted about my inquiry. Message and data rates may apply.";
    field.required = true;
  }
  return field;
}

function applyType(field: Record<string, unknown>, type: WebchatFormFieldType, otherIds: string[]): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...field,
    type,
    required: type === "consent" ? true : field.required === true,
  };
  const currentId = String(field.id || "");
  const typeWasId = WEBCHAT_FORM_FIELD_TYPES.includes(currentId as WebchatFormFieldType) || /^(name|email|phone|select|radio|checkbox|date|consent)_\d+$/.test(currentId);
  if (!currentId || typeWasId) {
    next.id = uniqueWebchatFormFieldId(type, otherIds);
  }
  if (NEEDS_OPTIONS.has(type)) {
    next.options = Array.isArray(field.options) && field.options.length > 0 ? field.options : ["Option 1"];
  } else {
    delete next.options;
  }
  if (type === "consent") {
    next.consentText = String(field.consentText || "I agree to be contacted about my inquiry. Message and data rates may apply.");
    next.required = true;
    delete next.placeholder;
  } else {
    delete next.consentText;
  }
  if (!String(field.label || "").trim() || String(field.label) === TYPE_LABELS[fieldType(field)]) {
    next.label = TYPE_LABELS[type];
  }
  return next;
}

export function ChatbotFormFieldsEditor(props: {
  stepId: string;
  prompt: string;
  onPromptChange: (value: string) => void;
  form: ChatbotFormDraft | undefined;
  onFormChange: (form: ChatbotFormDraft) => void;
}) {
  const form = asDraft(props.form);
  const fields = form.fields;
  const publishable = chatbotFormDefinitionIsPublishable(form);
  const preview = sanitizeWebchatFormDefinition(form);

  const patchForm = (next: Partial<ChatbotFormDraft>) => {
    props.onFormChange({ ...form, ...next });
  };

  const patchField = (index: number, next: Record<string, unknown>) => {
    const copy = [...fields];
    copy[index] = next;
    patchForm({ fields: copy });
  };

  return (
    <div className="space-y-3 min-w-0" data-testid={`webchat-form-editor-${props.stepId}`}>
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1.5">
        <p className="font-bold text-slate-700 mb-1">Channel support</p>
        <p>✅ Website Chat only — visitors see this exact form</p>
        <p>✖ Other channels receive the prompt as text, never HTML or scripts</p>
      </div>

      <div>
        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Prompt</Label>
        <Textarea
          value={props.prompt}
          onChange={(e) => props.onPromptChange(e.target.value)}
          placeholder="Please share your details"
          className="min-h-[60px] text-sm resize-none border-gray-200"
          data-testid={`input-form-prompt-${props.stepId}`}
        />
      </div>

      <div>
        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Form title</Label>
        <Input
          value={form.title}
          onChange={(e) => patchForm({ title: e.target.value })}
          className="text-sm h-8 border-gray-200"
          data-testid={`input-form-title-${props.stepId}`}
        />
      </div>

      <div>
        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
          Description <span className="normal-case font-normal text-gray-300">(optional)</span>
        </Label>
        <Textarea
          value={form.description || ""}
          onChange={(e) => patchForm({ description: e.target.value })}
          className="min-h-[48px] text-sm resize-none border-gray-200"
          data-testid={`input-form-description-${props.stepId}`}
        />
      </div>

      <div>
        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Submit label</Label>
        <Input
          value={form.submitLabel || ""}
          onChange={(e) => patchForm({ submitLabel: e.target.value })}
          className="text-sm h-8 border-gray-200"
          data-testid={`input-form-submit-label-${props.stepId}`}
        />
      </div>

      <div className="space-y-2" data-testid="webchat-form-fields">
        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Form fields</Label>
        {fields.length === 0 && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2" data-testid="text-form-fields-empty">
            Add at least one field. Incomplete forms stay Draft and are not sent to visitors.
          </p>
        )}
        <div className="space-y-2">
          {fields.map((raw, index) => {
            const field = raw && typeof raw === "object" ? raw : {};
            const type = fieldType(field);
            const id = String(field.id || "");
            const otherIds = fields
              .map((f, i) => (i === index ? "" : String((f as { id?: unknown })?.id || "")))
              .filter(Boolean);
            const error = webchatFormFieldDraftError(field, otherIds);
            const options = Array.isArray(field.options) ? field.options.map((o) => String(o ?? "")) : [];
            return (
              <div
                key={`${id || "new"}-${index}`}
                className="p-3 rounded-xl border border-gray-200 bg-gray-50 space-y-2 min-w-0"
                data-testid={`form-field-${props.stepId}-${index}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Field {index + 1}
                  </span>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-700 disabled:opacity-20"
                      data-testid={`btn-form-field-up-${props.stepId}-${index}`}
                      onClick={() => patchForm({ fields: moveItem(fields, index, -1) })}
                      aria-label="Move field up"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={index === fields.length - 1}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-700 disabled:opacity-20"
                      data-testid={`btn-form-field-down-${props.stepId}-${index}`}
                      onClick={() => patchForm({ fields: moveItem(fields, index, 1) })}
                      aria-label="Move field down"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded-lg text-gray-300 hover:text-red-500"
                      data-testid={`btn-form-field-remove-${props.stepId}-${index}`}
                      onClick={() => patchForm({ fields: fields.filter((_, i) => i !== index) })}
                      aria-label="Remove field"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                  <div className="min-w-0">
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Type</Label>
                    <Select
                      value={type}
                      onValueChange={(val) =>
                        patchField(index, applyType(field, val as WebchatFormFieldType, otherIds))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs border-gray-200" data-testid={`select-form-field-type-${props.stepId}-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEBCHAT_FORM_FIELD_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-0">
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">ID</Label>
                    <Input
                      value={id}
                      onChange={(e) => {
                        const nextId = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 40);
                        patchField(index, { ...field, id: nextId });
                      }}
                      className="text-sm h-8 border-gray-200"
                      data-testid={`input-form-field-id-${props.stepId}-${index}`}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Label</Label>
                  <Input
                    value={String(field.label || "")}
                    onChange={(e) => patchField(index, { ...field, label: e.target.value })}
                    className="text-sm h-8 border-gray-200"
                    data-testid={`input-form-field-label-${props.stepId}-${index}`}
                  />
                </div>

                {type === "consent" ? (
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Consent text</Label>
                    <Textarea
                      value={String(field.consentText || "")}
                      onChange={(e) => patchField(index, { ...field, consentText: e.target.value, required: true })}
                      className="min-h-[72px] text-sm resize-none border-gray-200"
                      data-testid={`input-form-field-consent-${props.stepId}-${index}`}
                    />
                  </div>
                ) : (
                  <div>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">
                      Placeholder <span className="normal-case font-normal text-gray-300">(optional)</span>
                    </Label>
                    <Input
                      value={String(field.placeholder || "")}
                      onChange={(e) => patchField(index, { ...field, placeholder: e.target.value })}
                      className="text-sm h-8 border-gray-200"
                      data-testid={`input-form-field-placeholder-${props.stepId}-${index}`}
                    />
                  </div>
                )}

                {NEEDS_OPTIONS.has(type) && (
                  <div className="space-y-1.5" data-testid={`form-field-options-${props.stepId}-${index}`}>
                    <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Options</Label>
                    {options.map((opt, oi) => (
                      <div key={oi} className="flex min-w-0 items-center gap-1">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...options];
                            next[oi] = e.target.value;
                            patchField(index, { ...field, options: next });
                          }}
                          className="text-sm h-8 border-gray-200 min-w-0 flex-1"
                          data-testid={`input-form-option-${props.stepId}-${index}-${oi}`}
                        />
                        <button
                          type="button"
                          disabled={oi === 0}
                          className="p-1 text-gray-400 disabled:opacity-20"
                          data-testid={`btn-form-option-up-${props.stepId}-${index}-${oi}`}
                          onClick={() => patchField(index, { ...field, options: moveItem(options, oi, -1) })}
                          aria-label="Move option up"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={oi === options.length - 1}
                          className="p-1 text-gray-400 disabled:opacity-20"
                          data-testid={`btn-form-option-down-${props.stepId}-${index}-${oi}`}
                          onClick={() => patchField(index, { ...field, options: moveItem(options, oi, 1) })}
                          aria-label="Move option down"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          className="p-1 text-gray-300 hover:text-red-500"
                          data-testid={`btn-form-option-remove-${props.stepId}-${index}-${oi}`}
                          onClick={() =>
                            patchField(index, { ...field, options: options.filter((_, i) => i !== oi) })
                          }
                          aria-label="Remove option"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {options.length < WEBCHAT_FORM_MAX_OPTIONS && (
                      <button
                        type="button"
                        className="w-full py-1.5 rounded-lg border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-brand-green hover:text-brand-green"
                        data-testid={`btn-add-form-option-${props.stepId}-${index}`}
                        onClick={() =>
                          patchField(index, {
                            ...field,
                            options: [...options, `Option ${options.length + 1}`],
                          })
                        }
                      >
                        <span className="inline-flex items-center gap-1 justify-center">
                          <Plus className="h-3 w-3" />
                          Add option
                        </span>
                      </button>
                    )}
                  </div>
                )}

                <label className="flex items-center justify-between gap-2 text-xs text-gray-600">
                  <span>{type === "consent" ? "Required (always on)" : "Required"}</span>
                  <Switch
                    checked={type === "consent" ? true : field.required === true}
                    disabled={type === "consent"}
                    onCheckedChange={(checked) =>
                      patchField(index, { ...field, required: type === "consent" ? true : checked })
                    }
                    data-testid={`toggle-form-field-required-${props.stepId}-${index}`}
                  />
                </label>

                {error && (
                  <p className="text-[11px] text-red-600" data-testid={`text-form-field-error-${props.stepId}-${index}`} role="alert">
                    {error}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {fields.length < WEBCHAT_FORM_MAX_FIELDS && (
          <button
            type="button"
            className="w-full py-2.5 rounded-xl border border-dashed border-gray-200 text-[11px] font-semibold text-gray-400 hover:border-brand-green hover:text-brand-green transition-colors flex items-center justify-center gap-1"
            data-testid={`btn-add-form-field-${props.stepId}`}
            onClick={() => {
              const ids = fields.map((f) => String((f as { id?: unknown })?.id || ""));
              patchForm({ fields: [...fields, defaultField("name", ids)] });
            }}
          >
            <Plus className="h-3 w-3" />
            Add field
          </button>
        )}
      </div>

      <div className="space-y-2" data-testid={`webchat-form-preview-${props.stepId}`}>
        <Label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Visitor preview</Label>
        {preview ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-2 min-w-0 overflow-x-hidden">
            <WebchatFormCard
              form={preview as WebchatFormDefinition}
              widgetColor="#10b981"
              disabled
              onSubmit={async () => undefined}
            />
          </div>
        ) : (
          <p className="text-[11px] text-gray-500" data-testid="text-form-preview-unavailable">
            Preview appears after the form has a title and at least one valid field.
          </p>
        )}
        {!publishable && (
          <p className="text-[11px] text-amber-700" data-testid="text-form-publish-blocked">
            This form cannot be published until every field is valid.
          </p>
        )}
      </div>
    </div>
  );
}

export function defaultWebchatFormField(
  type: WebchatFormFieldType,
  existing: WebchatFormField[],
): Record<string, unknown> {
  return defaultField(
    type,
    existing.map((f) => f.id),
  );
}
