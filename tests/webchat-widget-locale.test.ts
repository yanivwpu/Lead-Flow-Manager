/**
 * Widget chrome locale, RTL, and static chatbot variants.
 * Run: npx tsx tests/webchat-widget-locale.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  localizeDefaultChromeText,
  localizeWebchatPresentationStrings,
  messageTextDir,
  resolveWidgetStaticLocale,
  sanitizeWidgetLocaleParam,
  widgetChromeCopyForLocale,
  widgetChromeDir,
} from "../shared/webchatWidgetLocale";
import { resolveChatbotNodeCopy } from "../shared/chatbotNodeI18n";
import { detectConversationLanguage, languageInstructionForConversation, mergeConversationLanguage } from "../shared/conversationLanguage";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

{
  assert.equal(resolveWidgetStaticLocale({ explicit: "he" }), "he");
  assert.equal(resolveWidgetStaticLocale({ htmlLang: "he" }), "he");
  assert.equal(resolveWidgetStaticLocale({ pathname: "/he/" }), "he");
  assert.equal(resolveWidgetStaticLocale({ pathname: "https://www.whachatcrm.com/es/pricing" }), "es");
  assert.equal(resolveWidgetStaticLocale({ browserLanguage: "es-MX" }), "es");
  assert.equal(resolveWidgetStaticLocale({}), "en");
  assert.equal(sanitizeWidgetLocaleParam("he-IL"), "he");
  assert.equal(sanitizeWidgetLocaleParam("../../../etc"), "");
}

{
  const he = widgetChromeCopyForLocale("he");
  assert.match(he.launcherLabel, /נדבר|בואו/);
  assert.match(he.welcomeMessage, /היי/);
  const es = widgetChromeCopyForLocale("es");
  assert.match(es.welcomeMessage, /Hola/);
  assert.equal(widgetChromeDir("he"), "rtl");
  assert.equal(widgetChromeDir("es"), "ltr");
  assert.equal(localizeDefaultChromeText("Hi! How can we help you today?", "he", "welcomeMessage"), he.welcomeMessage);
  assert.equal(localizeDefaultChromeText("Talk to sales", "he", "launcherLabel"), "Talk to sales");
  const localized = localizeWebchatPresentationStrings(
    { welcomeMessage: "Hi! How can we help you today?", launcherLabel: "Let's Chat", panelSubtitle: "We're here to help", teaserGreeting: "Hi! How can we help you today?", chatGreeting: "Hi! How can we help you today?" },
    "he",
  );
  assert.equal(localized.welcomeMessage, he.welcomeMessage);
}

{
  const heMsg = resolveChatbotNodeCopy({
    content: "What would you like help with today?",
    options: [{ label: "Features & pricing" }],
    localized: {
      he: { content: "איך אפשר לעזור לך היום?", options: [{ label: "פיצ'רים ומחירים" }] },
    },
  }, "he");
  assert.equal(heMsg.usedLocale, "he");
  assert.match(heMsg.content, /איך אפשר/);
  assert.equal(heMsg.options[0].label, "פיצ'רים ומחירים");
  const unsupported = resolveChatbotNodeCopy({
    content: "What would you like help with today?",
    options: [{ label: "Features & pricing" }],
    localized: { he: { content: "איך אפשר לעזור לך היום?" } },
  }, "zh");
  assert.equal(unsupported.usedLocale, "default");
  assert.equal(unsupported.content, "What would you like help with today?");
}

{
  assert.equal(detectConversationLanguage("مرحبا، أريد معرفة الأسعار").code, "ar");
  assert.equal(detectConversationLanguage("你好，我想了解价格").code, "zh");
  assert.equal(messageTextDir("مرحبا"), "rtl");
  assert.equal(messageTextDir("你好"), "ltr");
  assert.match(languageInstructionForConversation("ar"), /Arabic|العربية/);
  assert.match(languageInstructionForConversation("zh"), /中文|Chinese/);
  assert.equal(mergeConversationLanguage("en", "你好"), "zh");
  assert.equal(mergeConversationLanguage("he", "ok"), "he");
}

{
  const script = read("server/webchatPublicScript.ts");
  assert.match(script, /resolveParentLocale/);
  assert.match(script, /locale=/);
  assert.match(script, /setAttribute\('dir', DIR\)/);
  const settings = read("server/routes/webhooks.ts");
  assert.match(settings, /resolveWidgetStaticLocale/);
  assert.match(settings, /chromeCopy/);
  assert.doesNotMatch(settings.slice(settings.indexOf('app.get("/api/webchat/:userId/settings"'), settings.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"')), /email|password|token/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /dir=\{widgetChromeDir/);
  assert.match(frame, /dir="auto"/);
  assert.match(frame, /locale: widgetLocale/);
}

console.log("webchat-widget-locale.test.ts: all assertions passed");
