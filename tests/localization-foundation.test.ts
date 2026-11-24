import assert from "node:assert/strict";
import test from "node:test";
import { createLanguageSaveQueue } from "../client/src/lib/languageSaveQueue";
import {
  formattingLocale,
  formatRegionalDate,
  formatRegionalNumber,
  datePickerLocale,
} from "../client/src/lib/regionalFormatting";

test("rapid choices serialize and a return to the original locale is saved last", async () => {
  const started: string[] = [];
  let done!: (value: boolean) => void;
  const queue = createLanguageSaveQueue(async (lang) => {
    started.push(lang);
    if (lang === "he") return new Promise<boolean>((resolve) => { done = resolve; });
    return true;
  });
  queue.confirm("en");
  const first = queue.enqueue("he", "fixture-account");
  const second = queue.enqueue("es", "fixture-account");
  const third = queue.enqueue("en", "fixture-account");
  await Promise.resolve();
  assert.deepEqual(started, ["he"]);
  done(true);
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(started, ["he", "es", "en"]);
});

test("failed saves retry and queued writes cannot reach the next account", async () => {
  const started: string[] = [];
  let done!: (value: boolean) => void;
  const queue = createLanguageSaveQueue(async (lang) => {
    started.push(lang);
    if (started.length === 1) return new Promise<boolean>((resolve) => { done = resolve; });
    return true;
  });
  const first = queue.enqueue("he", "fixture-account");
  const oldAccount = queue.enqueue("es", "fixture-account");
  await Promise.resolve();
  queue.reset();
  const newAccount = queue.enqueue("he", "new-account");
  done(false);
  assert.equal(await first, false);
  assert.equal(await oldAccount, true);
  assert.equal(await newAccount, true);
  assert.deepEqual(started, ["he", "he"]);
});

test("formatting uses explicit regional locales and preserves timezone and currency", () => {
  assert.equal(formattingLocale("es"), "es-419");
  assert.equal(formattingLocale("he"), "he-IL");
  assert.equal(datePickerLocale("he").code, "he");
  const time = new Date("2026-04-01T02:00:00Z");
  const options = { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" } as const;
  for (const lang of ["en", "he", "es"]) {
    const regional = formattingLocale(lang);
    assert.equal(formatRegionalDate(time, lang, options), new Intl.DateTimeFormat(regional, options).format(time));
    assert.match(formatRegionalNumber(199.99, lang, { currency: "USD", style: "currency", currencyDisplay: "code" }), /USD/);
    assert.match(formatRegionalNumber(0.2, lang, { style: "percent" }), /20/);
  }
});

test("a failed bundle keeps the active language and emits a recoverable failure", async () => {
  const { default: i18n, changeLanguage } = await import("../client/src/lib/i18n");
  const oldWindow = globalThis.window;
  const events: Event[] = [];
  const fakeWindow = { dispatchEvent: (event: Event) => { events.push(event); return true; } };
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
  try {
    assert.equal(await changeLanguage("missing-fixture" as "he"), false);
    assert.equal(i18n.language, "en");
    assert.deepEqual(events.map((event) => event.type), ["whachatcrm:locale-load-failed"]);
  } finally {
    Object.defineProperty(globalThis, "window", { value: oldWindow, configurable: true });
  }
});
