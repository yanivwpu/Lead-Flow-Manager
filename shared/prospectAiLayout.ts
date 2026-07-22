/**
 * Shared Prospect AI layout tokens (display/CSS only).
 * Keep every tab on the same page container so switching tabs does not shift content.
 */

/** Outer page shell used by the activated Prospect AI workspace. */
export const PROSPECT_AI_PAGE_CONTAINER_CLASS =
  "mx-auto box-border flex w-full min-w-0 max-w-6xl flex-col gap-3 px-4 py-4 sm:gap-3.5 sm:px-6 sm:py-5";

/** Each tab panel — full width of the shared page container. */
export const PROSPECT_AI_TAB_PANEL_CLASS = "mt-0 w-full min-w-0 focus-visible:outline-none";

/** Tab body root — prevents intrinsic-width children from shrinking the page. */
export const PROSPECT_AI_TAB_BODY_CLASS = "w-full min-w-0 space-y-4";

/** Empty-state outer shell: always full content width. */
export const PROSPECT_AI_EMPTY_STATE_CLASS =
  "w-full rounded-xl border border-dashed border-gray-200 bg-gradient-to-b from-gray-50/60 to-white px-5 py-8 text-center";

/** AI Review table — fixed layout so Progress width does not depend on row content. */
export const PROSPECT_AI_REVIEW_TABLE_CLASS =
  "prospect-ai-review-table w-full min-w-[44rem] table-fixed";

/** Progress column — reserved width for the four-stage compact timeline. */
export const PROSPECT_AI_PROGRESS_COL_CLASS =
  "prospect-ai-progress-col w-[20rem] min-w-[20rem] max-w-[20rem]";

/** Compact progress timeline: never wrap Campaign under Website. */
export const PROSPECT_AI_PROGRESS_TIMELINE_CLASS =
  "prospect-ai-progress-timeline flex max-w-full flex-nowrap items-center gap-x-1.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Column width tokens used by AI Review (checkbox / business / summary / signals / progress). */
export const PROSPECT_AI_REVIEW_COLGROUP = {
  checkbox: "prospect-ai-col-checkbox",
  business: "prospect-ai-col-business",
  summary: "prospect-ai-col-summary",
  signals: "prospect-ai-col-signals",
  progress: "prospect-ai-col-progress",
} as const;
