import { useState } from "react";
import { Loader2, RotateCcw, ExternalLink } from "lucide-react";

export function WebchatMediaBubble(props: {
  src: string;
  caption?: string | null;
  isOutbound: boolean;
  sendFailed?: boolean;
  widgetColor: string;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [cacheBust, setCacheBust] = useState(0);
  const src = cacheBust ? `${props.src}${props.src.includes("?") ? "&" : "?"}r=${cacheBust}` : props.src;
  const caption = (props.caption || "").trim();

  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden rounded-2xl text-sm shadow-sm ${
        props.isOutbound
          ? "bg-white text-gray-800 rounded-bl-none border border-gray-100"
          : props.sendFailed
            ? "bg-red-50 text-gray-800 rounded-br-none border border-red-200"
            : "text-white rounded-br-none"
      }`}
      style={!props.isOutbound && !props.sendFailed ? { background: props.widgetColor } : {}}
      data-testid="webchat-image-bubble"
    >
      <div className="relative min-w-0 max-w-full overflow-hidden">
        {phase === "loading" && (
          <div className="flex h-32 items-center justify-center" data-testid="webchat-image-loading">
            <Loader2 className="h-5 w-5 animate-spin opacity-70" />
          </div>
        )}
        {phase === "error" ? (
          <div className="px-3 py-2 space-y-2" data-testid="webchat-image-error">
            <p className="text-xs break-words [overflow-wrap:anywhere]">
              Image could not be loaded.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs underline"
                data-testid="webchat-image-retry"
                onClick={() => {
                  setPhase("loading");
                  setCacheBust((n) => n + 1);
                }}
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
              <a
                href={props.src}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs underline"
                data-testid="webchat-image-open"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={caption || "Photo"}
            className={`block h-auto max-h-64 w-full max-w-full object-contain ${phase === "loading" ? "hidden" : ""}`}
            onLoad={() => setPhase("ready")}
            onError={() => setPhase("error")}
            data-testid="webchat-image"
          />
        )}
      </div>
      {caption ? (
        <p className="px-3 py-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{caption}</p>
      ) : null}
    </div>
  );
}
