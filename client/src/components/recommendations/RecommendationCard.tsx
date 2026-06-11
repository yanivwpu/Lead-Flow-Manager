import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RecommendationReasonChips } from "@/components/recommendations/RecommendationReasonChips";
import { recommendationScoreBadgeClass } from "@/components/recommendations/recommendationScoreBadge";

export type RecommendationCardLayout = "sidebar" | "modal";

export interface RecommendationCardImage {
  src?: string | null;
  alt?: string;
  fallback?: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}

export interface RecommendationCardAction {
  id: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  testId?: string;
}

export interface RecommendationCardProps {
  layout?: RecommendationCardLayout;
  image: RecommendationCardImage;
  title: string;
  subtitle?: string | null;
  primaryValue: string;
  attributes?: string | null;
  score?: number | null;
  matchReasons?: string[];
  formatMatchReason?: (reason: string) => string;
  maxVisibleReasons?: number;
  actions?: RecommendationCardAction[];
  testId?: string;
}

export function RecommendationCard({
  layout = "modal",
  image,
  title,
  subtitle,
  primaryValue,
  attributes,
  score,
  matchReasons = [],
  formatMatchReason,
  maxVisibleReasons,
  actions = [],
  testId,
}: RecommendationCardProps) {
  const isSidebar = layout === "sidebar";
  const visibleReasonLimit = maxVisibleReasons ?? (isSidebar ? 3 : 4);

  const scoreBadge =
    score != null ? (
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] px-1.5 py-0 h-5 font-semibold tabular-nums shrink-0 flex-shrink-0 self-start",
          recommendationScoreBadgeClass(score),
        )}
      >
        {score}
      </Badge>
    ) : null;

  const primaryValueRow = (
    <p
      className={cn(
        "text-sm font-bold text-gray-900 tabular-nums",
        isSidebar
          ? "leading-snug mt-0.5 [overflow-wrap:anywhere]"
          : "leading-tight mt-1",
      )}
    >
      {primaryValue}
      {attributes ? (
        <span className="text-[11px] font-medium text-gray-600">
          {" · "}
          {attributes}
        </span>
      ) : null}
    </p>
  );

  const actionBar =
    actions.length > 0 ? (
      <div
        className={cn(
          "flex items-center justify-end gap-0.5 border-t border-gray-100 bg-gray-50/40 px-2",
          isSidebar ? "py-0.5" : "py-1",
        )}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white",
              action.active
                ? "text-rose-500 hover:text-rose-600"
                : "text-gray-500 hover:text-gray-800",
            )}
            disabled={action.disabled}
            onClick={action.onClick}
            aria-label={action.label}
            aria-pressed={action.active}
            data-testid={action.testId}
          >
            {action.icon}
          </button>
        ))}
      </div>
    ) : null;

  const modalThumbnail = (
    <button
      type="button"
      className="h-[72px] w-[96px] min-[1200px]:h-[100px] min-[1200px]:w-[140px] shrink-0 flex-shrink-0 overflow-hidden rounded-md bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      onClick={image.onClick}
      aria-label={image.ariaLabel ?? "View recommendation"}
    >
      {image.src ? (
        <img
          src={image.src}
          alt={image.alt ?? ""}
          className="h-full w-full flex-shrink-0 object-cover object-center"
          loading="lazy"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {image.fallback}
        </span>
      )}
    </button>
  );

  return (
    <div
      className="rounded-lg border border-gray-200/90 bg-white overflow-hidden transition-colors hover:border-gray-300 hover:shadow-sm"
      data-testid={testId}
      data-recommendation-card-layout={layout}
      data-match-card-variant={layout}
    >
      {isSidebar ? (
        <>
          <button
            type="button"
            className="relative block w-full h-[128px] overflow-hidden bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
            onClick={image.onClick}
            aria-label={image.ariaLabel ?? "View recommendation"}
          >
            {image.src ? (
              <img
                src={image.src}
                alt={image.alt ?? ""}
                className="h-full w-full object-cover object-center"
                loading="lazy"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                {image.fallback}
              </span>
            )}
          </button>

          <div className="px-2.5 pt-1.5 pb-0.5 min-w-0">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <p
                className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2 min-w-0 flex-1"
                title={title}
              >
                {title}
              </p>
              {scoreBadge}
            </div>

            {primaryValueRow}

            <RecommendationReasonChips
              reasons={matchReasons}
              maxVisible={visibleReasonLimit}
              formatReason={formatMatchReason}
            />
          </div>

          {actionBar}
        </>
      ) : (
        <>
          <div className="flex gap-2.5 p-2 min-[1200px]:gap-3 min-[1200px]:p-2.5">
            {modalThumbnail}
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 min-w-0">
                <p
                  className="text-[11px] font-semibold text-gray-900 leading-snug line-clamp-2 min-w-0 flex-1 min-[1200px]:text-xs"
                  title={title}
                >
                  {title}
                </p>
                {scoreBadge}
              </div>

              {primaryValueRow}

              {subtitle ? (
                <p className="text-[10px] text-gray-500 truncate mt-0.5" title={subtitle}>
                  {subtitle}
                </p>
              ) : null}

              <RecommendationReasonChips
                reasons={matchReasons}
                maxVisible={visibleReasonLimit}
                formatReason={formatMatchReason}
              />
            </div>
          </div>

          {actionBar}
        </>
      )}
    </div>
  );
}
