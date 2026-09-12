/**
 * Website Chat Ask Question quick-reply contrast.
 * Run: npx tsx tests/webchat-quick-reply-contrast.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contrastRatio,
  WEBCHAT_AA_CONTRAST_RATIO,
  WEBCHAT_FOREGROUND_ON_DARK,
  WEBCHAT_FOREGROUND_ON_LIGHT,
} from "../shared/webchatWidgetBranding";
import {
  assertQuickReplyContrast,
  QUICK_REPLY_SURFACE,
  quickReplyIdleForeground,
  webchatQuickReplyTheme,
} from "../shared/webchatQuickReplyStyle";
import { builderLocalizedFieldDir, messageTextDir, widgetChromeDir } from "../shared/webchatWidgetLocale";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const BRAND_GREEN = "#10b981";
const LIGHT_ACCENT = "#e0f0ff";
const WHITE = "#ffffff";
const NEAR_WHITE = "#f8fafc";
const DARK_NAVY = "#111827";

{
  const beforeIdleGreenOnWhite = contrastRatio(BRAND_GREEN, WHITE);
  assert.ok(
    beforeIdleGreenOnWhite < WEBCHAT_AA_CONTRAST_RATIO,
    `legacy idle color:accent on white fails AA (${beforeIdleGreenOnWhite.toFixed(2)}:1)`,
  );
  const beforeIdleLightOnWhite = contrastRatio(LIGHT_ACCENT, WHITE);
  assert.ok(beforeIdleLightOnWhite < 1.2, `legacy light accent on white is near-invisible (${beforeIdleLightOnWhite.toFixed(2)}:1)`);
  const beforeDisabled = contrastRatio("#9ca3af", "#f3f4f6");
  assert.ok(beforeDisabled < WEBCHAT_AA_CONTRAST_RATIO, "legacy text-gray-400 on gray-100 fails AA");
}

{
  const green = webchatQuickReplyTheme(BRAND_GREEN);
  assert.equal(green.idle.background, QUICK_REPLY_SURFACE);
  assert.equal(green.idle.color, WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.equal(green.idle.opacity, 1);
  assert.ok(assertQuickReplyContrast(green.idle));
  assert.ok(assertQuickReplyContrast(green.hover));
  assert.ok(assertQuickReplyContrast(green.focus));
  assert.ok(assertQuickReplyContrast(green.selected));
  assert.ok(assertQuickReplyContrast(green.disabled));
  assert.equal(green.hover.background, BRAND_GREEN);
  assert.equal(green.hover.color, WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.deepEqual(green.focus, green.hover);
  assert.deepEqual(green.selected, green.hover);
  assert.notEqual(green.selected.background, green.idle.background);
  assert.equal(green.disabled.opacity, 1);
  assert.notEqual(green.disabled.color, green.disabled.background);
}

{
  const light = webchatQuickReplyTheme(LIGHT_ACCENT);
  assert.equal(light.idle.color, WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.ok(assertQuickReplyContrast(light.idle));
  assert.ok(assertQuickReplyContrast(light.hover));
  assert.equal(light.hover.color, WEBCHAT_FOREGROUND_ON_LIGHT);
  const whiteAccent = webchatQuickReplyTheme(WHITE);
  assert.equal(whiteAccent.idle.color, WEBCHAT_FOREGROUND_ON_LIGHT);
  assert.ok(assertQuickReplyContrast(whiteAccent.idle));
  assert.ok(assertQuickReplyContrast(whiteAccent.hover));
  const near = webchatQuickReplyTheme(NEAR_WHITE);
  assert.ok(assertQuickReplyContrast(near.idle));
  assert.ok(assertQuickReplyContrast(near.hover));
  const navy = webchatQuickReplyTheme(DARK_NAVY);
  assert.equal(navy.idle.color, DARK_NAVY);
  assert.ok(assertQuickReplyContrast(navy.idle));
  assert.equal(navy.hover.color, WEBCHAT_FOREGROUND_ON_DARK);
  assert.ok(assertQuickReplyContrast(navy.hover));
}

{
  const withHeaderWhite = webchatQuickReplyTheme(BRAND_GREEN);
  assert.notEqual(withHeaderWhite.idle.color, WHITE);
  assert.notEqual(withHeaderWhite.idle.color, "#ffffff");
  assert.equal(quickReplyIdleForeground(BRAND_GREEN), WEBCHAT_FOREGROUND_ON_LIGHT);
  const themeJson = JSON.stringify(withHeaderWhite);
  assert.doesNotMatch(themeJson, /headerTextColor/);
  const accents = [BRAND_GREEN, LIGHT_ACCENT, WHITE, NEAR_WHITE, DARK_NAVY, "#fbbf24", "#fef3c7", "#3b82f6", "#ec4899", "#000000"];
  for (const accent of accents) {
    const theme = webchatQuickReplyTheme(accent);
    assert.ok(assertQuickReplyContrast(theme.idle), `idle contrast fails for ${accent}`);
    assert.ok(assertQuickReplyContrast(theme.hover), `hover contrast fails for ${accent}`);
    assert.ok(assertQuickReplyContrast(theme.focus), `focus contrast fails for ${accent}`);
    assert.ok(assertQuickReplyContrast(theme.selected), `selected contrast fails for ${accent}`);
    assert.ok(assertQuickReplyContrast(theme.disabled), `disabled contrast fails for ${accent}`);
    assert.equal(theme.idle.opacity, 1);
    assert.equal(theme.disabled.opacity, 1);
    assert.notEqual(theme.idle.color.toLowerCase(), theme.idle.background.toLowerCase());
  }
}

{
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /WebchatQuickReplyButtons/);
  assert.doesNotMatch(frame, /onMouseEnter/);
  assert.doesNotMatch(frame, /text-gray-400 border-gray-200 cursor-not-allowed/);
  const chipStart = frame.indexOf("<WebchatQuickReplyButtons");
  const chipCall = frame.slice(chipStart, frame.indexOf("/>", chipStart));
  assert.match(chipCall, /accentColor=\{accentColor\}/);
  assert.doesNotMatch(chipCall, /headerTextColor/);
  assert.doesNotMatch(chipCall, /accentTextColor/);
  assert.doesNotMatch(chipCall, /color:\s*accentColor/);
  const preview = read("client/src/components/webchat/WebchatChromePreview.tsx");
  assert.match(preview, /WebchatQuickReplyButtons/);
  assert.match(preview, /wcw-preview-qr/);
  assert.match(preview, /Features & pricing/);
  assert.match(preview, /accentColor=\{p\.accentColor\}/);
  const component = read("client/src/components/webchat/WebchatQuickReplyButtons.tsx");
  assert.match(component, /webchatQuickReplyCssVars/);
  assert.match(component, /WEBCHAT_QUICK_REPLY_CSS/);
  assert.match(component, /messageTextDir\(btn\.label\)/);
  assert.match(component, /min-h-\[44px\]/);
  assert.match(component, /data-selected/);
  assert.match(component, /testIdPrefix = "chat-btn"/);
  const style = read("shared/webchatQuickReplyStyle.ts");
  assert.match(style, /:focus-visible/);
  assert.match(style, /opacity:1/);
}

{
  assert.equal(widgetChromeDir("he"), "rtl");
  assert.equal(widgetChromeDir("es"), "ltr");
  assert.equal(widgetChromeDir("en"), "ltr");
  assert.equal(messageTextDir("פיצ'רים ומחירים"), "rtl");
  assert.equal(messageTextDir("Features & pricing"), "auto");
  assert.equal(messageTextDir("Características y precios"), "auto");
  assert.equal(builderLocalizedFieldDir("he"), "rtl");
  assert.equal(builderLocalizedFieldDir("es"), "ltr");
  assert.equal(builderLocalizedFieldDir("en"), "ltr");
}

console.log("webchat-quick-reply-contrast.test.ts: all assertions passed");
console.log(
  JSON.stringify({
    before: {
      brandGreenOnWhite: Number(contrastRatio(BRAND_GREEN, WHITE).toFixed(2)),
      lightAccentOnWhite: Number(contrastRatio(LIGHT_ACCENT, WHITE).toFixed(2)),
      disabledGray400OnGray100: Number(contrastRatio("#9ca3af", "#f3f4f6").toFixed(2)),
    },
    after: {
      brandGreenIdle: webchatQuickReplyTheme(BRAND_GREEN).idle,
      brandGreenHover: webchatQuickReplyTheme(BRAND_GREEN).hover,
      lightAccentIdle: webchatQuickReplyTheme(LIGHT_ACCENT).idle,
      lightAccentHover: webchatQuickReplyTheme(LIGHT_ACCENT).hover,
      disabled: webchatQuickReplyTheme(BRAND_GREEN).disabled,
    },
  }),
);
