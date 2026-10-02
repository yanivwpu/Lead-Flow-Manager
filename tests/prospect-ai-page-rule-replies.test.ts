import assert from "node:assert/strict";
import test from "node:test";
import { trustedProspectAiPageRuleReply, isProspectAiMarketingPage } from "../shared/prospectAiPageRuleReplies";
import { resolveTrustedPageRuleInboundAction, bindPageRuleActionToInbound, resolveCurrentTurnPageAction } from "../shared/webchatPageRuleAction";
import { evaluateFullAutoSend } from "../server/aiAutoSendGate";

const labels = {
  en: ["Help me find prospects", "How does outreach work?", "Book a live demo"],
  es: ["Ayúdame a encontrar clientes potenciales", "¿Cómo funcionan las campañas de contacto?", "Reservar una demo en vivo"],
  he: ["עזרו לי למצוא לקוחות פוטנציאליים", "איך מתבצעת הפנייה לעסקים?", "קביעת הדגמה חיה"],
};
const settings = { pageRules: [{ urlContains: "/prospect-ai", matchType: "pathname", urlAliases: ["/es/prospect-ai", "/he/prospect-ai"], greeting: "Plan your search", suggestedQuestions: labels.en, localized: {
  es: { greeting: "Planifica tu búsqueda", suggestedQuestions: labels.es },
  he: { greeting: "תכנון החיפוש", suggestedQuestions: labels.he },
} }] };

test("localized Prospect AI buttons validate and Auto-send useful replies with qualification gaps", () => {
  for (const locale of ["en", "es", "he"] as const) {
    const parentUrl = `https://www.whachatcrm.com/${locale === "en" ? "" : locale + "/"}prospect-ai`;
    for (const actionIndex of [0, 1, 2]) {
      const inbound = labels[locale][actionIndex];
      const validated = resolveTrustedPageRuleInboundAction({ originAuthorized: true, settings, parentUrl, locale, message: inbound, actionIndex });
      assert.ok(validated, `${locale}:${actionIndex}`);
      const action = resolveCurrentTurnPageAction({ pageContext: { pageAction: bindPageRuleActionToInbound(validated, "in-current") }, inboundMessageId: "in-current" });
      if (actionIndex === 2) {
        assert.equal(action.kind, "book_demo");
        assert.equal(trustedProspectAiPageRuleReply(action, locale), null);
        continue;
      }
      const reply = trustedProspectAiPageRuleReply(action, locale);
      assert.ok(reply);
      if (actionIndex === 0) {
        assert.doesNotMatch(reply, /team|budget|equipo|תקציב/);
        assert.match(reply, /city|ciudad|עיר/);
      } else {
        assert.match(reply, /Unified Inbox/);
        assert.match(reply, /auth\?redirect=%2Fapp%2Fprospect-ai/);
        assert.doesNotMatch(reply, /guarantee|guaranteed|automatically sends/i);
      }
      const gate = evaluateFullAutoSend({ businessMode: "auto", channel: "webchat", conversationHistory: [{ role: "user", content: inbound }], suggestion: reply,
        confidence: 0.7, confidenceProvided: true, knowledgeGrounded: true, currentTurnPageAction: action,
        businessKnowledge: { qualifyingQuestions: [{ key: "budget", question: "Budget?", required: true }, { key: "timeline", question: "Timeline?", required: true }] },
      });
      assert.equal(gate.allowed, true, `${locale}:${actionIndex}:${gate.reason}`);
      assert.equal(gate.reason, "ok_validated_page_action");
      const stale = resolveCurrentTurnPageAction({ pageContext: { pageAction: bindPageRuleActionToInbound(validated, "in-old") }, inboundMessageId: "in-current" });
      assert.equal(trustedProspectAiPageRuleReply(stale, locale), null);
    }
  }
});

test("reply handling is confined to current validated actions on the marketing product page", () => {
  const action = { trusted: true, provenanceCurrentInbound: true, explicitUserChoice: true, label: labels.en[0], parentUrl: "https://www.whachatcrm.com/prospect-ai" };
  for (const parentUrl of ["https://other.example/prospect-ai", "https://www.whachatcrm.com/pricing", "https://www.whachatcrm.com/prospect-ai/extra", "http://www.whachatcrm.com/prospect-ai", "invalid"]) {
    assert.equal(isProspectAiMarketingPage(parentUrl), false);
    assert.equal(trustedProspectAiPageRuleReply({ ...action, parentUrl }, "en"), null);
  }
  assert.equal(trustedProspectAiPageRuleReply({ ...action, label: "Invent something" }, "en"), null);
  assert.equal(trustedProspectAiPageRuleReply({ ...action, trusted: false }, "en"), null);
});
