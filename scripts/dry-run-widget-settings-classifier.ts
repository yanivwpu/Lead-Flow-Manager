/**
 * READ-ONLY production dry run of the widget_settings classifier.
 * Selects widget_settings only. Never prints emails, user ids, widget ids, or tokens.
 *
 * Run: npx tsx scripts/dry-run-widget-settings-classifier.ts
 */
import "dotenv/config";
import pg from "pg";
import {
  classifyWidgetSettings,
  leftoverLegacyExamplePageRules,
  LEGACY_DEFAULT_PAGE_RULES,
  LEGACY_WIDGET_COLOR,
  LEGACY_WIDGET_WELCOME,
} from "../shared/webchatWidgetSettings";

function hostLabel(raw: string): string {
  try {
    const u = new URL(raw.replace(/^postgres:/, "postgresql:"));
    return `${u.hostname}/${(u.pathname || "").replace(/^\//, "")}`;
  } catch {
    return "(unparsed DATABASE_URL)";
  }
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

function shapeKey(settings: unknown): string {
  return JSON.stringify(sortKeys(settings ?? null));
}

function ruleFieldStats(settings: unknown) {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  const rules = Array.isArray(s.pageRules) ? s.pageRules : [];
  const questions = new Map<string, number>();
  const ctaLabels = new Map<string, number>();
  const ctaUrlsNonEmpty = new Map<string, number>();
  let withFlow = 0;
  let withQuestions = 0;
  let withCtaLabel = 0;
  let withCtaUrl = 0;
  for (const raw of rules) {
    const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const qs = Array.isArray(r.suggestedQuestions)
      ? r.suggestedQuestions.map((q) => String(q).trim()).filter(Boolean)
      : [];
    if (qs.length) {
      withQuestions += 1;
      const joined = qs.join(" | ");
      questions.set(joined, (questions.get(joined) || 0) + 1);
    }
    const label = typeof r.ctaLabel === "string" ? r.ctaLabel.trim() : "";
    if (label) {
      withCtaLabel += 1;
      ctaLabels.set(label, (ctaLabels.get(label) || 0) + 1);
    }
    const url = typeof r.ctaUrl === "string" ? r.ctaUrl.trim() : "";
    if (url) {
      withCtaUrl += 1;
      ctaUrlsNonEmpty.set("<nonempty>", (ctaUrlsNonEmpty.get("<nonempty>") || 0) + 1);
    }
    if (typeof r.chatbotFlowId === "string" && r.chatbotFlowId.trim()) withFlow += 1;
  }
  return {
    ruleCount: rules.length,
    withQuestions,
    withCtaLabel,
    withCtaUrl,
    withFlow,
    questionVariants: [...questions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    ctaLabelVariants: [...ctaLabels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    nonemptyCtaUrlRules: withCtaUrl,
  };
}

function topLevelSummary(settings: unknown) {
  const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
  return {
    keys: Object.keys(s).sort(),
    enabled: s.enabled,
    color: s.color,
    welcomeMessage: s.welcomeMessage,
    position: s.position,
    showOnMobile: s.showOnMobile,
    showOnDesktop: s.showOnDesktop,
    triggerType: s.triggerType,
    triggerDelaySeconds: s.triggerDelaySeconds,
    triggerScrollPercent: s.triggerScrollPercent,
    allowAnyOrigin: s.allowAnyOrigin,
    allowedOriginsIsArray: Array.isArray(s.allowedOrigins),
    allowedOriginsLength: Array.isArray(s.allowedOrigins) ? s.allowedOrigins.length : null,
    pageRulesLength: Array.isArray(s.pageRules) ? s.pageRules.length : null,
  };
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL missing");
    process.exit(1);
  }
  console.log("[dry-run] host", hostLabel(url));
  console.log("[dry-run] mode READ ONLY — no updates");

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const col = await client.query(
      `SELECT column_default
       FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'widget_settings'`,
    );
    console.log("[dry-run] column_default", col.rows[0]?.column_default || null);

    const res = await client.query("SELECT widget_settings FROM users");
    await client.query("ROLLBACK");

    const rows = res.rows.map((r) => r.widget_settings);
    const counts = {
      exactLegacyDefault: 0,
      alreadyNeutral: 0,
      customized: 0,
      leftoverLegacyExampleRules: 0,
      wouldUpdate: 0,
      total: rows.length,
      nullOrMissing: 0,
    };
    const clusters = new Map<string, { n: number; sample: unknown; cls: string }>();
    const ruleStatsAgg = {
      rowsWithThreeLegacyPaths: 0,
      rowsWithSuggestedQuestions: 0,
      rowsWithCtaLabel: 0,
      rowsWithCtaUrl: 0,
      rowsWithFlow: 0,
    };
    const questionVariants = new Map<string, number>();
    const ctaLabelVariants = new Map<string, number>();

    for (const settings of rows) {
      if (settings == null) counts.nullOrMissing += 1;
      const cls = classifyWidgetSettings(settings);
      if (cls === "exact_legacy_default") {
        counts.exactLegacyDefault += 1;
        counts.wouldUpdate += 1;
      } else if (cls === "already_neutral") counts.alreadyNeutral += 1;
      else counts.customized += 1;
      if (leftoverLegacyExamplePageRules(settings)) counts.leftoverLegacyExampleRules += 1;

      const key = shapeKey(settings);
      const prev = clusters.get(key);
      if (prev) prev.n += 1;
      else clusters.set(key, { n: 1, sample: settings, cls });

      const rs = ruleFieldStats(settings);
      const s = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : {};
      const rules = Array.isArray(s.pageRules) ? s.pageRules : [];
      const paths = rules
        .map((r) =>
          r && typeof r === "object" ? String((r as Record<string, unknown>).urlContains || "").trim() : "",
        )
        .join(",");
      if (paths === "/pricing,/contact,/services") ruleStatsAgg.rowsWithThreeLegacyPaths += 1;
      if (rs.withQuestions) ruleStatsAgg.rowsWithSuggestedQuestions += 1;
      if (rs.withCtaLabel) ruleStatsAgg.rowsWithCtaLabel += 1;
      if (rs.withCtaUrl) ruleStatsAgg.rowsWithCtaUrl += 1;
      if (rs.withFlow) ruleStatsAgg.rowsWithFlow += 1;
      for (const [k, v] of rs.questionVariants) questionVariants.set(k, (questionVariants.get(k) || 0) + v);
      for (const [k, v] of rs.ctaLabelVariants) ctaLabelVariants.set(k, (ctaLabelVariants.get(k) || 0) + v);
    }

    const top = [...clusters.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    console.log(JSON.stringify({
      aggregates: counts,
      ruleStatsAgg,
      topQuestionVariants: [...questionVariants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      topCtaLabelVariants: [...ctaLabelVariants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      clusterCount: clusters.size,
      topClusters: top.map(([, v]) => {
        const summary = topLevelSummary(v.sample);
        const rs = ruleFieldStats(v.sample);
        const isPlatformish =
          v.cls === "exact_legacy_default" ||
          v.cls === "already_neutral" ||
          (Array.isArray((v.sample as { pageRules?: unknown })?.pageRules) &&
            ((v.sample as { pageRules: unknown[] }).pageRules.length === 3));
        return {
          n: v.n,
          currentClassifier: v.cls,
          summary,
          ruleStats: rs,
          canonical: isPlatformish ? sortKeys(v.sample) : undefined,
          note: isPlatformish ? undefined : "canonical omitted (not a platform-default-shaped cluster)",
        };
      }),
      codeFingerprint: {
        welcome: LEGACY_WIDGET_WELCOME,
        color: LEGACY_WIDGET_COLOR,
        pageRules: LEGACY_DEFAULT_PAGE_RULES,
      },
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[dry-run] failed", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
