import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  buildWebchatChromeLayout,
  chromeCssForPreview,
  type WebchatChromeState,
} from "@shared/webchatWidgetChrome";
import { WebchatPanelHeader } from "@/components/webchat/WebchatPanelHeader";

function CssBox({
  css,
  testId,
  children,
  className,
}: {
  css: string;
  testId: string;
  children?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.style.cssText = css;
  }, [css]);
  return (
    <div ref={ref} data-testid={testId} className={className}>
      {children}
    </div>
  );
}

function IconSvg({ inner, size = 22 }: { inner: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export function WebchatChromePreview({
  settings,
  businessName,
  state,
}: {
  settings: Record<string, unknown>;
  businessName?: string | null;
  state: WebchatChromeState;
}) {
  const chrome = buildWebchatChromeLayout(settings, { businessName });
  const p = chrome.presentation;
  const launcherCss = chromeCssForPreview(chrome.launcherCss);
  const teaserCss = chromeCssForPreview(chrome.teaserCss) + "opacity:1;pointer-events:none;";
  const panelCss = chromeCssForPreview(chrome.panelCss, { panelFill: true });

  return (
    <div
      className="relative w-full h-[240px] sm:h-[320px] md:h-[360px] overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-gray-100 to-gray-200"
      data-testid={`webchat-preview-${state}`}
    >
      <div className="absolute inset-2 sm:inset-3 rounded-md border bg-white shadow-sm" />
      {state === "open" ? (
        <CssBox css={panelCss} testId="wcw-preview-panel" className="flex min-w-0 flex-col overflow-hidden bg-white">
          <WebchatPanelHeader presentation={p} />
          <div className="min-w-0 flex-1 overflow-hidden bg-gray-50 p-3">
            <div className="max-w-[75%] break-words rounded-2xl rounded-bl-none border border-gray-100 bg-white px-3 py-2 text-xs text-gray-800 [overflow-wrap:anywhere]">
              {p.chatGreeting || p.welcomeMessage}
            </div>
          </div>
          <div className="min-w-0 border-t border-gray-100 p-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-400">
                Type a message…
              </div>
              <div
                className="h-8 w-8 shrink-0 rounded-xl"
                style={{ background: p.accentColor }}
                aria-hidden="true"
              />
            </div>
            <p className="mt-1 text-center text-[10px] text-gray-300">Powered by WhaChat</p>
          </div>
        </CssBox>
      ) : null}
      {state === "teaser" ? (
        <CssBox css={teaserCss} testId="wcw-preview-teaser">
          <div
            className="mb-1 text-[11px] font-semibold [overflow-wrap:anywhere]"
            style={{ color: p.color }}
          >
            {p.displayName}
          </div>
          <div className="text-[13px] leading-snug text-gray-900 [overflow-wrap:anywhere] break-words">
            {p.teaserGreeting}
          </div>
        </CssBox>
      ) : null}
      <button
        type="button"
        data-testid="wcw-preview-launcher"
        aria-label={state === "open" ? "Close website chat" : chrome.launcherAriaLabel}
        className="max-w-[min(240px,calc(100%-40px))]"
        ref={(el) => {
          if (el) el.style.cssText = launcherCss;
        }}
        tabIndex={-1}
      >
        {state === "open" || p.launcherStyle === "circle" ? (
          <IconSvg inner={state === "open" ? chrome.closeIconSvg : chrome.iconSvg} />
        ) : (
          <span className="flex min-w-0 max-w-full items-center gap-2">
            {p.logoUrl && p.launcherStyle === "card" ? (
              <img
                src={p.logoUrl}
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <IconSvg inner={chrome.iconSvg} />
            )}
            <span className="min-w-0 truncate text-sm font-semibold">
              {p.launcherStyle === "card" ? p.displayName : p.launcherLabel}
            </span>
          </span>
        )}
      </button>
    </div>
  );
}
