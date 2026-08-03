/**
 * Step 4: the questions the assistant asks a customer.
 *
 * The last part of AI Brain that still asked a merchant to start from an empty form. It now
 * proposes a set from the business knowledge published in the steps above, and the merchant
 * reviews it the same way they review everything else: edit, turn off, remove, add.
 *
 * A question is only about the conversation. Nothing here changes what the assistant knows —
 * that is settled by the time a customer is being asked anything.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  newSuggestionsFor,
  suggestQualifyingQuestions,
  type SuggestedQuestion,
} from "@shared/qualifyingQuestionSuggestions";
import type { KnowledgeReviewPayload } from "@shared/knowledgeReview";
import { Hint, Step } from "./WorkflowStep";

export type CustomerQuestion = {
  key: string;
  label: string;
  question: string;
  required: boolean;
  /** Absent means on. Only an explicit false stops the assistant asking it. */
  enabled?: boolean;
};

const FACTS_KEY = ["/api/ai/knowledge/facts"];

function isOn(q: CustomerQuestion): boolean {
  return q.enabled !== false;
}

function keyFor(label: string, question: string): string {
  const stem = (label || question)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 32);
  return `${stem || "question"}_${Date.now()}`;
}

// ---------------------------------------------------------------------------

function QuestionCard({
  question,
  onChange,
  onDuplicate,
  onDelete,
  index,
}: {
  question: CustomerQuestion;
  onChange: (next: CustomerQuestion) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  index: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);
  const on = isOn(question);

  function beginEdit() {
    setDraft(question);
    setEditing(true);
  }

  function commit() {
    const label = draft.label.trim();
    const text = draft.question.trim();
    if (!text) return;
    onChange({ ...question, label: label || question.label, question: text, required: draft.required });
    setEditing(false);
  }

  if (editing) {
    return (
      <li className="space-y-2 rounded-lg border border-violet-200/80 bg-violet-50/30 px-3 py-2.5">
        <Input
          className="h-8 text-sm"
          value={draft.question}
          onChange={(e) => setDraft((d) => ({ ...d, question: e.target.value }))}
          placeholder="What should AI ask?"
          aria-label="Question"
          data-testid={`input-question-text-${index}`}
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-7 w-full text-xs sm:w-44"
            value={draft.label}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            placeholder="Short name"
            aria-label="Short name"
            data-testid={`input-question-label-${index}`}
          />
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, required: !d.required }))}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
              draft.required
                ? "bg-violet-100 text-violet-900 hover:bg-violet-200"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
            data-testid={`button-toggle-required-${index}`}
          >
            {draft.required ? "Required" : "Optional"}
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              className="h-7 bg-violet-600 px-2.5 text-xs text-white hover:bg-violet-500"
              disabled={!draft.question.trim()}
              onClick={commit}
              data-testid={`button-save-question-${index}`}
            >
              Done
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-600"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-slate-200/70 bg-white px-3 py-2.5 transition-colors",
        !on && "border-dashed bg-slate-50/60",
      )}
      data-testid={`question-card-${index}`}
    >
      <button
        type="button"
        onClick={() => onChange({ ...question, enabled: !on })}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          on
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-slate-300 bg-white text-transparent hover:border-slate-400",
        )}
        aria-pressed={on}
        aria-label={on ? "Turn this question off" : "Turn this question on"}
        data-testid={`button-toggle-question-${index}`}
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      </button>

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            "break-words text-sm text-slate-800",
            !on && "text-slate-400",
          )}
        >
          {question.question}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
          {question.label && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
              {question.label}
            </span>
          )}
          <span
            className={cn(
              "rounded-full px-2 py-0.5",
              question.required ? "bg-violet-100 text-violet-900" : "bg-slate-100 text-slate-500",
            )}
          >
            {question.required ? "Required" : "Optional"}
          </span>
          {!on && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-600">Off</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-slate-500 hover:text-violet-800"
          onClick={beginEdit}
          aria-label="Edit this question"
          data-testid={`button-edit-question-${index}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden h-7 px-1.5 text-slate-500 hover:text-violet-800 sm:inline-flex"
          onClick={onDuplicate}
          aria-label="Duplicate this question"
          data-testid={`button-duplicate-question-${index}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-1.5 text-slate-500 hover:text-red-700"
          onClick={onDelete}
          aria-label="Delete this question"
          data-testid={`button-delete-question-${index}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

export function CustomerQuestions({
  questions,
  onChange,
  industry,
}: {
  questions: CustomerQuestion[];
  onChange: (next: CustomerQuestion[]) => void;
  industry?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  // Already loaded by the review step above; this reads the same cache.
  const factsQuery = useQuery<KnowledgeReviewPayload>({ queryKey: FACTS_KEY });

  const signals = useMemo(() => {
    const facts = factsQuery.data?.sections.flatMap((s) => s.facts) ?? [];
    return {
      industry,
      planNames: facts
        .filter((f) => f.factType === "pricing_plan")
        .map((f) => f.display?.title ?? "")
        .filter(Boolean),
      offerings: facts
        .filter((f) => f.factType === "product" || f.factType === "service")
        .map((f) => f.summary),
      hasBooking: facts.some((f) => f.factType === "booking_link"),
      hasLocations: facts.some((f) => f.factType === "location" || f.factType === "service_area"),
    };
  }, [factsQuery.data, industry]);

  const suggestions = useMemo(() => suggestQualifyingQuestions(signals), [signals]);
  const missing = useMemo(
    () => newSuggestionsFor(questions, suggestions),
    [questions, suggestions],
  );

  function applySuggestions(next: SuggestedQuestion[]) {
    if (next.length === 0) return;
    // Appended, never merged over: an edited question is the merchant's, not ours.
    onChange([...questions, ...next.map((s) => ({ ...s, enabled: true }))]);
    toast({
      title: `${next.length === 1 ? "1 question" : `${next.length} questions`} added`,
      description: "Edit or remove anything that does not fit.",
    });
  }

  const activeCount = questions.filter(isOn).length;
  const state = questions.length === 0 ? "ready" : activeCount > 0 ? "done" : "todo";

  return (
    <Step
      index={4}
      title="What AI should ask customers"
      description="AI generated these questions from your business. Edit, remove or add your own."
      state={state}
      status={
        questions.length === 0
          ? "None yet"
          : `${activeCount} of ${questions.length} in use`
      }
      isLast
    >
      {questions.length === 0 ? (
        <div className="space-y-3">
          <Hint>No qualification questions yet.</Hint>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              className="h-9 bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500"
              onClick={() => applySuggestions(suggestions)}
              data-testid="button-generate-questions"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Generate questions
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-9 px-2 text-sm text-slate-600 hover:text-slate-900"
              onClick={() => setAdding(true)}
              data-testid="button-add-question-manually"
            >
              Add manually
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {questions.map((q, idx) => (
            <QuestionCard
              key={q.key || idx}
              index={idx}
              question={q}
              onChange={(next) => onChange(questions.map((x, i) => (i === idx ? next : x)))}
              onDuplicate={() =>
                onChange([
                  ...questions.slice(0, idx + 1),
                  { ...q, key: keyFor(q.label, q.question) },
                  ...questions.slice(idx + 1),
                ])
              }
              onDelete={() => onChange(questions.filter((_, i) => i !== idx))}
            />
          ))}
        </ul>
      )}

      {adding && (
        <NewQuestionRow
          onCancel={() => setAdding(false)}
          onAdd={(q) => {
            onChange([...questions, q]);
            setAdding(false);
          }}
        />
      )}

      {questions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {!adding && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-violet-200/80 text-xs text-violet-900 hover:bg-violet-50"
              onClick={() => setAdding(true)}
              data-testid="button-add-question"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add question
            </Button>
          )}
          {missing.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs text-violet-900 hover:bg-violet-50"
              onClick={() => setConfirmRegenerate(true)}
              data-testid="button-regenerate-questions"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Regenerate suggested questions
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add suggestions from your latest knowledge?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Your questions stay exactly as they are. These would be added to the end of the
                  list:
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {missing.map((s) => (
                    <li key={s.key}>{s.question}</li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => applySuggestions(missing)}
              data-testid="button-confirm-regenerate"
            >
              Add {missing.length === 1 ? "question" : `${missing.length} questions`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Step>
  );
}

function NewQuestionRow({
  onAdd,
  onCancel,
}: {
  onAdd: (q: CustomerQuestion) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const [question, setQuestion] = useState("");
  const [required, setRequired] = useState(true);

  function submit() {
    const text = question.trim();
    if (!text) return;
    onAdd({
      key: keyFor(label.trim(), text),
      label: label.trim() || text.slice(0, 24),
      question: text,
      required,
      enabled: true,
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-violet-200/80 bg-violet-50/30 px-3 py-2.5">
      <Input
        className="h-8 text-sm"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder="What should AI ask?"
        aria-label="New question"
        data-testid="input-new-question"
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-7 w-full text-xs sm:w-44"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Short name"
          aria-label="Short name for the new question"
          data-testid="input-new-question-label"
        />
        <button
          type="button"
          onClick={() => setRequired((v) => !v)}
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            required
              ? "bg-violet-100 text-violet-900 hover:bg-violet-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
          data-testid="button-new-question-required"
        >
          {required ? "Required" : "Optional"}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            className="h-7 bg-violet-600 px-2.5 text-xs text-white hover:bg-violet-500"
            disabled={!question.trim()}
            onClick={submit}
            data-testid="button-confirm-add-question"
          >
            Add
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-slate-600"
            onClick={onCancel}
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default CustomerQuestions;
