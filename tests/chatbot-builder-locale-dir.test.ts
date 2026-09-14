/**
 * Chatbot Builder + Website Widget localized editor field direction.
 * Run: npx tsx tests/chatbot-builder-locale-dir.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  builderLocalizedFieldAlign,
  builderLocalizedFieldDir,
  builderLocalizedInputProps,
  widgetChromeDir,
} from "../shared/webchatWidgetLocale";
import { parseChatbotNodeLocalized, resolveChatbotNodeCopy } from "../shared/chatbotNodeI18n";
import { sanitizeWidgetCopyI18nMap } from "../shared/webchatWidgetCopyI18n";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const MIXED = "הכירו את WhachatCRM 👋 — Features & pricing";

{
  assert.equal(builderLocalizedFieldDir("he"), "rtl");
  assert.equal(builderLocalizedFieldDir("he-IL"), "rtl");
  assert.equal(builderLocalizedFieldAlign("he"), "right");
  assert.equal(builderLocalizedFieldDir("es"), "ltr");
  assert.equal(builderLocalizedFieldDir("en"), "ltr");
  assert.equal(builderLocalizedFieldAlign("es"), "left");
  assert.equal(builderLocalizedInputProps("he").dir, "rtl");
  assert.equal(builderLocalizedInputProps("he").style.textAlign, "right");
  assert.equal(builderLocalizedInputProps("es").dir, "ltr");
  assert.equal(builderLocalizedInputProps("es").style.textAlign, "left");
  assert.equal(builderLocalizedInputProps("en").dir, "ltr");
  // Visitor widget chrome still treats Arabic as RTL; builder Hebrew-only.
  assert.equal(widgetChromeDir("ar"), "rtl");
  assert.equal(builderLocalizedFieldDir("ar"), "ltr");
}

{
  const builder = read("client/src/pages/ChatbotBuilder.tsx");
  assert.match(builder, /builderLocalizedInputProps/);
  assert.match(builder, /NodeLocaleVariantsEditor/);
  assert.match(builder, /\{\.\.\.fieldProps\}/);
  assert.match(builder, /input-question-\$\{loc\}-\$\{nodeId\}/);
  assert.match(builder, /input-option-\$\{loc\}-\$\{nodeId\}-\$\{oi\}/);
  const defaultQuestion = builder.slice(
    builder.indexOf("data-testid={`input-question-${selectedStep.id}`}"),
    builder.indexOf("data-testid={`input-question-${selectedStep.id}`}") + 80,
  );
  assert.doesNotMatch(defaultQuestion, /builderLocalizedInputProps\("he"\)/);
  const defaultOption = builder.includes("data-testid={`input-option-${selectedStep.id}-${oi}`}");
  assert.equal(defaultOption, true);
  assert.doesNotMatch(builder, /messageTextDir\(/);
}

{
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /builderLocalizedInputProps\(loc\)/);
  assert.match(website, /builderLocalizedInputProps\("he"\)/);
  assert.match(website, /builderLocalizedInputProps\("es"\)/);
  assert.match(website, /input-i18n-heading-\$\{loc\}/);
  assert.match(website, /input-rule-greeting-he-/);
}

{
  const parsed = parseChatbotNodeLocalized({
    he: {
      content: MIXED,
      options: [{ label: "פיצ'רים ומחירים — WhachatCRM" }],
    },
    es: { content: "¿En qué podemos ayudarte?" },
  });
  assert.equal(parsed.he?.content, MIXED);
  assert.equal(parsed.he?.options?.[0]?.label, "פיצ'רים ומחירים — WhachatCRM");
  assert.equal(parsed.es?.content, "¿En qué podemos ayudarte?");
  const resolved = resolveChatbotNodeCopy(
    {
      content: "What would you like help with today?",
      options: [{ label: "Features & pricing" }],
      localized: {
        he: { content: MIXED, options: [{ label: "פיצ'רים ומחירים — WhachatCRM" }] },
      },
    },
    "he",
  );
  assert.equal(resolved.content, MIXED);
  assert.equal(resolved.options[0].label, "פיצ'רים ומחירים — WhachatCRM");
  const again = parseChatbotNodeLocalized({ he: parsed.he, es: parsed.es });
  assert.deepEqual(again, parsed);
}

{
  const chrome = sanitizeWidgetCopyI18nMap({
    he: { welcomeMessage: MIXED, panelHeading: "WhachatCRM" },
    es: { welcomeMessage: "Hola" },
  });
  assert.equal(chrome.he?.welcomeMessage, MIXED);
  assert.equal(chrome.he?.panelHeading, "WhachatCRM");
  assert.equal(chrome.es?.welcomeMessage, "Hola");
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  const linked = read("client/src/components/webchat/WebchatLinkedText.tsx");
  assert.match(frame, /WebchatLinkedText/);
  assert.match(frame, /dir="auto"/);
  assert.match(linked, /dir=\{messageTextDir/);
  assert.doesNotMatch(frame, /builderLocalizedInputProps/);
}

console.log("chatbot-builder-locale-dir.test.ts: all assertions passed");
