import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  PROSPECT_AI_EMPTY_STATE_CLASS,
  PROSPECT_AI_PAGE_CONTAINER_CLASS,
  PROSPECT_AI_TAB_BODY_CLASS,
} from "@shared/prospectAiLayout";

type LayoutProps = {
  children: ReactNode;
  className?: string;
  /** Optional test id for the shared page container. */
  "data-testid"?: string;
};

/**
 * Shared max-width / padding shell for every Prospect AI workspace tab.
 */
export function ProspectAiPageLayout({
  children,
  className,
  "data-testid": testId = "prospect-ai-page-layout",
}: LayoutProps) {
  return (
    <div
      className={cn(PROSPECT_AI_PAGE_CONTAINER_CLASS, className)}
      data-testid={testId}
      data-prospect-ai-layout="page"
    >
      {children}
    </div>
  );
}

type TabBodyProps = {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/** Full-width tab body so empty states / cards cannot shrink page alignment. */
export function ProspectAiTabBody({
  children,
  className,
  "data-testid": testId,
}: TabBodyProps) {
  return (
    <div
      className={cn(PROSPECT_AI_TAB_BODY_CLASS, className)}
      data-testid={testId}
      data-prospect-ai-layout="tab-body"
    >
      {children}
    </div>
  );
}

type EmptyProps = {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
};

/** Full-width empty state; center message content inside, not the page. */
export function ProspectAiEmptyState({
  children,
  className,
  "data-testid": testId,
}: EmptyProps) {
  return (
    <div
      className={cn(PROSPECT_AI_EMPTY_STATE_CLASS, className)}
      data-testid={testId}
      data-prospect-ai-layout="empty-state"
    >
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}
