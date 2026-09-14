import { messageTextDir } from "@shared/webchatWidgetLocale";
import { splitTextWithHttpUrls } from "@shared/webchatMessageLinks";

const LINK_CLASS =
  "inline max-w-full break-all [overflow-wrap:anywhere] [unicode-bidi:isolate] underline underline-offset-2 decoration-current text-inherit rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current";

/**
 * Renders Website Chat message text with clickable http(s) URLs.
 * Non-URL content stays escaped React text. HTML in visitor copy is not interpreted.
 */
export function WebchatLinkedText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const value = text ?? "";
  const parts = splitTextWithHttpUrls(value);

  return (
    <span className={className} dir={messageTextDir(value)}>
      {parts.map((part, index) =>
        part.type === "url" ? (
          <a
            key={`url-${index}`}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            dir="ltr"
            className={LINK_CLASS}
          >
            {part.display}
          </a>
        ) : (
          part.value
        ),
      )}
    </span>
  );
}
