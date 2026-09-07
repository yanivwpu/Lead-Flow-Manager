import { Component, type ReactNode } from "react";

const DEFAULT_COLOR = "#10b981";

export function WebchatWidgetSafeShell(props: {
  title?: string;
  errorText: string;
  color?: string;
  testId?: string;
}) {
  const color = props.color || DEFAULT_COLOR;
  const title = props.title || "Website chat";
  return (
    <div
      className="flex h-full min-h-screen w-full min-w-0 max-w-full flex-col overflow-hidden bg-white"
      data-testid={props.testId || "webchat-error-shell"}
    >
      <div
        className="flex min-w-0 items-center gap-2 px-4 py-3 flex-shrink-0 shadow-sm"
        style={{ background: color, color: "#ffffff" }}
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold shrink-0">
          W
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-sm leading-tight break-words [overflow-wrap:anywhere]">
            {title}
          </h1>
          <p className="text-xs opacity-80 mt-0.5 break-words [overflow-wrap:anywhere]">
            We're here to help
          </p>
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-3 space-y-2">
        <p className="text-sm text-gray-700 break-words [overflow-wrap:anywhere]" data-testid="text-widget-error" role="alert">
          {props.errorText}
        </p>
      </div>
      <div className="min-w-0 border-t border-gray-100 p-3 bg-white flex-shrink-0">
        <div className="flex min-w-0 gap-2 items-center">
          <input
            type="text"
            disabled
            placeholder="Chat unavailable"
            data-testid="input-chat-message"
            className="min-w-0 flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm disabled:opacity-50"
          />
          <button
            type="button"
            disabled
            data-testid="btn-send-chat"
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white opacity-40"
            style={{ background: color }}
            aria-label="Send"
          />
        </div>
        <p className="text-center text-xs text-gray-300 mt-2">Powered by WhaChat</p>
      </div>
    </div>
  );
}

type BoundaryState = { hasError: boolean };

export class WidgetFrameErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[WidgetFrame] render error", error?.name || "Error");
  }

  render() {
    if (this.state.hasError) {
      return (
        <WebchatWidgetSafeShell errorText="Chat could not be loaded. Please refresh and try again." />
      );
    }
    return this.props.children;
  }
}

export class WebchatMessageErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[WidgetFrame] message render error", error?.name);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex justify-start" data-testid="webchat-message-error">
          <div className="min-w-0 max-w-[75%] break-words bg-white text-gray-600 rounded-2xl rounded-bl-none px-3 py-2 text-xs shadow-sm border border-gray-100">
            This message could not be displayed.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
