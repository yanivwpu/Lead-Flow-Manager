import { FileText, Download, ExternalLink } from "lucide-react";
import { contrastTextForBackground } from "@shared/webchatWidgetBranding";
import { WebchatLinkedText } from "@/components/webchat/WebchatLinkedText";

export function WebchatDocumentBubble(props: {
  src: string;
  filename?: string | null;
  caption?: string | null;
  isOutbound: boolean;
  sendFailed?: boolean;
  widgetColor: string;
  accentForeground?: string;
}) {
  const caption = (props.caption || "").trim();
  const filename = (props.filename || "document.pdf").trim() || "document.pdf";
  const downloadHref = `${props.src}${props.src.includes("?") ? "&" : "?"}download=1`;
  const filledStyle =
    !props.isOutbound && !props.sendFailed
      ? {
          background: props.widgetColor,
          color: props.accentForeground || contrastTextForBackground(props.widgetColor),
        }
      : undefined;

  return (
    <div
      className={`min-w-0 max-w-full overflow-hidden rounded-2xl text-sm shadow-sm ${
        props.isOutbound
          ? "bg-white text-gray-800 rounded-bl-none border border-gray-100"
          : props.sendFailed
            ? "bg-red-50 text-gray-800 rounded-br-none border border-red-200"
            : "rounded-br-none"
      }`}
      style={filledStyle}
      data-testid="webchat-document-bubble"
    >
      <div className="flex min-w-0 items-start gap-3 px-3 py-2.5">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
          <FileText className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" data-testid="webchat-document-filename">
            {filename}
          </p>
          <p className="text-xs opacity-70">PDF</p>
          <div className="mt-1.5 flex flex-wrap gap-3">
            <a
              href={props.src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium underline"
              data-testid="webchat-document-open"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
            <a
              href={downloadHref}
              download={filename}
              className="inline-flex items-center gap-1 text-xs font-medium underline"
              data-testid="webchat-document-download"
            >
              <Download className="h-3 w-3" />
              Download
            </a>
          </div>
        </div>
      </div>
      {caption ? (
        <p className="border-t border-black/5 px-3 py-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          <WebchatLinkedText text={caption} />
        </p>
      ) : null}
    </div>
  );
}
