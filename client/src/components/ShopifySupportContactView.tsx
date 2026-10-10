import React, { useId } from "react";
import { shopifySupportContactCopy } from "@/lib/shopifySupportContactCopy";
export function ShopifySupportContactView(props: {
  language: string; expanded: boolean; email: string; suggested: boolean; confirmed: boolean;
  manage: boolean; pending: boolean; failed: boolean;
  onOpen(): void; onClose(): void; onEmail(value: string): void;
  onSave(): void; onSkip(): void; onRemove(): void;
}) {
  const id = useId();
  const copy = shopifySupportContactCopy(props.language);
  return <section className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm" aria-label={copy.title}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">{copy.title}</p>
      {!props.expanded && <button type="button" className="text-brand-green underline" onClick={props.onOpen}>
        {props.confirmed || props.manage ? copy.manage : copy.open}
      </button>}
    </div>
    <p className="mt-1 text-gray-600">{copy.body}</p>
    {props.failed && !props.expanded && <p role="alert" className="text-red-700">{copy.error}</p>}
    {props.expanded ? <form className="mt-3 space-y-2" onSubmit={event => { event.preventDefault(); props.onSave(); }}>
      <label htmlFor={id} className="block font-medium">{copy.label}</label>
      <input id={id} type="email" autoComplete="email" value={props.email} maxLength={254}
        required disabled={props.pending} dir="ltr" className="w-full rounded border px-3 py-2"
        aria-describedby={id + "-help"} onChange={event => props.onEmail(event.target.value)} />
      <p id={id + "-help"} className="text-xs text-gray-600">{props.suggested ? copy.source : copy.missing}</p>
      {props.failed && <p role="alert" className="text-red-700">{copy.error}</p>}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={props.pending} className="rounded bg-brand-green px-3 py-2 text-white">{copy.save}</button>
        <button type="button" disabled={props.pending} onClick={props.onSkip}>{copy.skip}</button>
        {props.manage && props.confirmed && <button type="button" disabled={props.pending} onClick={props.onRemove}>{copy.remove}</button>}
        <button type="button" disabled={props.pending} onClick={props.onClose}>{copy.cancel}</button>
      </div>
    </form> : !props.manage && <button type="button" disabled={props.pending} className="mt-2 text-gray-600 underline" onClick={props.onSkip}>{copy.skip}</button>}
  </section>;
}
