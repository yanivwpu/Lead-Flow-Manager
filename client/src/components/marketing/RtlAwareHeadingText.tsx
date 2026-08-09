import type { CSSProperties, ReactNode } from "react";
import {
  HE_GENERIC_AI_VS_BRAIN,
  splitHebrewAiBidiText,
  type HebrewAiBidiSegment,
} from "@shared/rtlLeadingLtrIsolate";

/**
 * Inline styles — Tailwind RTL plugins rewrite `flex-row` → `row-reverse`,
 * which double-reverses with dir=rtl and puts AI on the wrong side.
 */
const flexRtlStyle: CSSProperties = {
  display: "inline-flex",
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "baseline",
  columnGap: "0.25rem",
};

const flexRtlCompareStyle: CSSProperties = {
  ...flexRtlStyle,
  columnGap: "0.5rem",
};

function renderSegment(seg: HebrewAiBidiSegment, key: number): ReactNode {
  if (seg.kind === "text") return <span key={key}>{seg.text}</span>;
  if (seg.kind === "brand") {
    return (
      <bdi key={key} dir="ltr">
        {seg.text}
      </bdi>
    );
  }
  return (
    <span key={key} dir="rtl" style={flexRtlStyle}>
      <bdi dir="ltr">{seg.ai}</bdi>
      <span> {seg.hebrew}</span>
    </span>
  );
}

/**
 * Render mixed Hebrew + standalone AI with controlled RTL flex groups.
 * Plain string when no standalone AI+Hebrew pattern is present.
 */
export function renderRtlAwareHeadingText(text: string): ReactNode {
  const parts = splitHebrewAiBidiText(text);
  if (parts.length === 1 && parts[0]?.kind === "text") {
    return parts[0].text;
  }
  return parts.map((part, index) => renderSegment(part, index));
}

/** Hebrew comparison H2: brand | לעומת | AI רגיל (RTL flex → brand on the right). */
export function renderHeGenericAiVsBrainHeading(): ReactNode {
  const { brand, vs, genericAi, genericLabel } = HE_GENERIC_AI_VS_BRAIN;
  return (
    <span dir="rtl" style={flexRtlCompareStyle}>
      <bdi dir="ltr">{brand}</bdi>
      <span>{vs}</span>
      <span dir="rtl" style={flexRtlStyle}>
        <bdi dir="ltr">{genericAi}</bdi>
        <span> {genericLabel}</span>
      </span>
    </span>
  );
}
