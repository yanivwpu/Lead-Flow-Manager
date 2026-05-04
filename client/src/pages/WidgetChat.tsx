import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Loader2 } from "lucide-react";
import { WebchatWidget } from "@/pages/WidgetFrame";

/**
 * Full-page hosted chat at `/chat/:widgetId`.
 * Uses the same WebchatWidget as the iframe embed; passes the page URL so the API can
 * resolve `pageRules` (when the hosted URL contains the rule fragment) and default greeting/prefill.
 * Does not load `/widget.js` — the floating script is for third-party sites only.
 */
export function WidgetChat() {
  const [match, params] = useRoute("/chat/:widgetId");
  const widgetId = params?.widgetId;
  const [pageHref, setPageHref] = useState<string | null>(null);

  useEffect(() => {
    setPageHref(window.location.href);
  }, []);

  if (!match || !widgetId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-sm text-gray-500">Chat widget not found</p>
        </div>
      </div>
    );
  }

  if (pageHref === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" aria-label="Loading chat" />
      </div>
    );
  }

  return <WebchatWidget widgetId={widgetId} resolvePageHref={pageHref} />;
}
