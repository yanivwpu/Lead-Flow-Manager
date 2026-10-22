import { Parser } from "htmlparser2";
import type { NormalizedEmailMessage } from "@shared/emailChannel";

/** Read text without executing HTML or flattening quoted history into a new request. */
export function authoredHtmlToText(html: string): string {
  const text: string[] = [];
  const ignored: boolean[] = [];
  let historyStarted = false;
  const blocks = /^(?:p|div|br|li|tr|section|article|h[1-6]|hr)$/;
  const parser = new Parser({
    onopentag(name, attrs) {
      const classes = (attrs.class || "").toLowerCase().split(/\s+/);
      if (/^(?:divrplyfwdmsg|replyforwardheader|stopspelling)$/i.test(attrs.id || "") || classes.includes("outlookmessageheader")) historyStarted = true;
      const quoted = name === "blockquote" || /^(?:script|style|head|title)$/.test(name) ||
        classes.some(c => ["gmail_quote", "gmail_quote_container", "yahoo_quoted", "moz-cite-prefix", "protonmail_quote", "gmail_signature"].includes(c));
      ignored.push(historyStarted || quoted || ignored.at(-1) === true);
      if (!ignored.at(-1) && blocks.test(name)) text.push("\n");
    },
    ontext(value) { if (!historyStarted && !ignored.at(-1)) text.push(value); },
    onclosetag(name) { const skipped = ignored.pop(); if (!historyStarted && !skipped && blocks.test(name)) text.push("\n"); },
  }, { decodeEntities: true });
  parser.write(html); parser.end();
  return text.join("").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
}

export function inboundOptOutText(message: Pick<NormalizedEmailMessage,"textBody"|"textBodySource"|"htmlBody"|"snippet">): string {
  if (message.textBodySource === "plain") return message.textBody || "";
  // Empty authored HTML must stay empty: the snippet can contain only quoted text.
  if (message.htmlBody) return authoredHtmlToText(message.htmlBody);
  return message.textBody || message.snippet || "";
}
