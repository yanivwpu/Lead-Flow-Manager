/**
 * Renders untrusted email HTML inside a sandboxed iframe so embedded CSS
 * (e.g. `a { color: blue !important }`) cannot affect Inbox chrome.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buildIsolatedEmailSrcDoc } from "@shared/emailHtmlIsolation";
import { observeEmailFrameImageFailures } from "./emailFrameImageErrors";
import { EmailBodyLoading } from "./EmailBodyLoading";

const IFRAME_SANDBOX = [
  // Height measurement only — never combine with allow-scripts.
  "allow-same-origin",
  // Links use target=_blank via <base> / hardened anchors.
  "allow-popups",
  "allow-popups-to-escape-sandbox",
].join(" ");

function currentPageOrigin(): string | undefined {
  try {
    return window.location.origin;
  } catch {
    return undefined;
  }
}

export function EmailHtmlFrame({
  html,
  className,
  onImageError,
}: {
  html: string;
  className?: string;
  onImageError?: () => void;
}) {
  const srcDoc = useMemo(
    () => buildIsolatedEmailSrcDoc(html, { imageOrigins: [currentPageOrigin()] }),
    [html],
  );

  // Replacing HTML (e.g. refreshed signed image URLs) must not reuse a ready frame.
  return (
    <MeasuredEmailHtmlFrame
      key={srcDoc}
      srcDoc={srcDoc}
      className={className}
      onImageError={onImageError}
    />
  );
}

function MeasuredEmailHtmlFrame({
  srcDoc,
  className,
  onImageError,
}: {
  srcDoc: string;
  className?: string;
  onImageError?: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;

    let observer: ResizeObserver | undefined;
    let stopWatchingImageErrors: (() => void) | undefined;
    const pendingImages: HTMLImageElement[] = [];
    let cancelled = false;
    let imageErrorReported = false;

    const reportImageErrorOnce = () => {
      if (cancelled || imageErrorReported || !onImageError) return;
      imageErrorReported = true;
      onImageError();
    };

    const fit = () => {
      if (cancelled) return;
      try {
        const doc = frame.contentDocument;
        const el = doc?.documentElement;
        const body = doc?.body;
        // A newly mounted iframe initially has a complete about:blank document.
        if (!el || !body || doc.URL !== "about:srcdoc" || doc.readyState !== "complete") return;
        const next = Math.max(
          // scrollHeight includes the iframe viewport. Do not grow by 8px on
          // every observer callback when the viewport already fits the email.
          el.scrollHeight > frame.clientHeight ? el.scrollHeight : 0,
          body.scrollHeight || 0,
          el.offsetHeight || 0,
          80,
        );
        // Percentage-height email styles can make body/offsetHeight equal the
        // viewport too. Keep that height instead of adding padding repeatedly.
        const padding = next === frame.clientHeight ? 0 : 8;
        setHeight(Math.min(Math.max(next + padding, 80), 12000));
      } catch {
        /* sandbox / cross-origin guard */
      }
    };

    const onLoad = () => {
      if (cancelled || frame.contentDocument?.URL !== "about:srcdoc") return;
      fit();
      try {
        const doc = frame.contentDocument;
        if (!doc?.documentElement || doc.readyState !== "complete") return;
        if (typeof ResizeObserver !== "undefined") {
          observer?.disconnect();
          observer = new ResizeObserver(fit);
          observer.observe(doc.documentElement);
          if (doc.body) observer.observe(doc.body);
        }
        doc.querySelectorAll("img").forEach((img) => {
          if (!img.complete) {
            img.addEventListener("load", fit, { once: true });
            pendingImages.push(img);
          }
        });
        stopWatchingImageErrors?.();
        stopWatchingImageErrors = observeEmailFrameImageFailures(
          doc.querySelectorAll("img"),
          reportImageErrorOnce,
        );
      } catch {
        /* ignore */
      }
    };

    frame.addEventListener("load", onLoad);
    // srcDoc may already be loaded when effect runs.
    if (frame.contentDocument?.readyState === "complete") onLoad();

    return () => {
      cancelled = true;
      frame.removeEventListener("load", onLoad);
      stopWatchingImageErrors?.();
      pendingImages.forEach((img) => img.removeEventListener("load", fit));
      observer?.disconnect();
    };
  }, [srcDoc, onImageError]);

  return (
    <div className="relative w-full max-w-full min-w-0" aria-busy={height === null}>
      {height === null ? <EmailBodyLoading /> : null}
      <iframe
        ref={iframeRef}
        title="Email message"
        srcDoc={srcDoc}
        sandbox={IFRAME_SANDBOX}
        referrerPolicy="no-referrer"
        // Keep framed email visually seamless in the thread.
        className={cn(
          "email-html-frame block w-full max-w-full border-0 bg-white",
          className,
        )}
        // Hidden frames still lay out, so the first visible paint has its measured height.
        style={{
          height: height ?? 0,
          visibility: height === null ? "hidden" : "visible",
          position: height === null ? "absolute" : undefined,
          top: 0,
        }}
        aria-hidden={height === null}
        tabIndex={height === null ? -1 : undefined}
        data-testid="email-html-body"
        data-email-isolation="sandboxed-iframe"
      />
    </div>
  );
}
