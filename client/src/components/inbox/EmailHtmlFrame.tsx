/**
 * Renders untrusted email HTML inside a sandboxed iframe so embedded CSS
 * (e.g. `a { color: blue !important }`) cannot affect Inbox chrome.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buildIsolatedEmailSrcDoc } from "@shared/emailHtmlIsolation";

const IFRAME_SANDBOX = [
  // Height measurement only — never combine with allow-scripts.
  "allow-same-origin",
  // Links use target=_blank via <base> / hardened anchors.
  "allow-popups",
  "allow-popups-to-escape-sandbox",
].join(" ");

export function EmailHtmlFrame({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const srcDoc = useMemo(() => buildIsolatedEmailSrcDoc(html), [html]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;

    let observer: ResizeObserver | undefined;
    let cancelled = false;

    const fit = () => {
      if (cancelled) return;
      try {
        const doc = frame.contentDocument;
        const el = doc?.documentElement;
        const body = doc?.body;
        if (!el) return;
        const next = Math.max(
          el.scrollHeight || 0,
          body?.scrollHeight || 0,
          el.offsetHeight || 0,
          80,
        );
        setHeight(Math.min(Math.max(next + 8, 80), 12000));
      } catch {
        /* sandbox / cross-origin guard */
      }
    };

    const onLoad = () => {
      fit();
      try {
        const doc = frame.contentDocument;
        if (!doc?.documentElement || typeof ResizeObserver === "undefined") return;
        observer?.disconnect();
        observer = new ResizeObserver(fit);
        observer.observe(doc.documentElement);
        if (doc.body) observer.observe(doc.body);
        doc.querySelectorAll("img").forEach((img) => {
          if (!img.complete) img.addEventListener("load", fit, { once: true });
        });
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
      observer?.disconnect();
    };
  }, [srcDoc]);

  return (
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
      style={{ height }}
      data-testid="email-html-body"
      data-email-isolation="sandboxed-iframe"
    />
  );
}
