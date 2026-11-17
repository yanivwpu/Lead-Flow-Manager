/** Reviewable additions for the dedicated marketing workspace; never tenant defaults. */
import { matchWidgetPageRule } from './webchatPageRuleMatch';
import { MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID } from './marketingWebsiteChatWidget';
import { validateWidgetPageRules } from './webchatWidgetSettings';

export const MARKETING_CHAT_OWNER_EMAIL = 'marketing@whachatcrm.com';

// Routes audited in client/src/App.tsx. The Shopify preview uses /ecommerce-growth-engine.
export const MARKETING_CHAT_PRODUCT_PAGES = [
  ['/unified-inbox', 'Unified Inbox', true],
  ['/ai-copilot', 'AI Copilot', true],
  ['/realtor-growth-engine', 'Realtor Growth Engine', true],
  ['/ecommerce-growth-engine', 'Shopify Growth Engine', false],
  ['/ai-brain', 'AI Brain', true],
  ['/automations', 'Automations', true],
  ['/chatbot-builder', 'Chatbot Builder', true],
  ['/campaigns', 'Campaigns', true],
  ['/integrations', 'Integrations', true],
  ['/shared-team-inbox', 'Shared Team Inbox', true],
  ['/real-estate-crm', 'Real Estate CRM', true],
  ['/solutions/ecommerce', 'Ecommerce', true],
  ['/solutions/local-service-businesses', 'Local Service Businesses', true],
  ['/solutions/marketing-agencies', 'Marketing Agencies', true],
  ['/solutions/med-spas', 'Med Spas', true],
  ['/shopify-crm', 'Shopify CRM', false],
] as const;

/** Takes an authenticated settings export. No database writes or automation activation. */
export function proposeMarketingChatPageCoverage(input: {
  ownerEmail: string;
  widgetPublicId: string;
  settings: Record<string, unknown>;
}): Record<string, unknown> {
  if (input.ownerEmail.trim().toLowerCase() !== MARKETING_CHAT_OWNER_EMAIL ||
      input.widgetPublicId !== MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID) {
    throw new Error('Dedicated marketing workspace and widget identity required');
  }
  const rules = Array.isArray(input.settings.pageRules) ? [...input.settings.pageRules] : [];
  for (const [path, product, translatedRoute] of MARKETING_CHAT_PRODUCT_PAGES) {
    // Preserve custom exact rules and aliases. A broad contains rule is not coverage.
    const covered = (p: string) => matchWidgetPageRule({ pageRules: rules }, `https://www.whachatcrm.com${p}`)?.matchType === 'pathname';
    const paths = [path, ...(translatedRoute ? [`/es${path}`, `/he${path}`] : [])];
    const missing = paths.filter(p => !covered(p));
    if (!missing.length) continue;
    const en = { greeting: `Have questions about ${product}? Ask me about this product, pricing, or requesting a demo.`, suggestedQuestions: [`Tell me about ${product}`, 'Pricing and free trial', 'Book a demo'] };
    const es = { greeting: `¿Tienes preguntas sobre ${product}? Pregúntame por el producto, los precios o cómo solicitar una demo.`, suggestedQuestions: [`Cuéntame sobre ${product}`, 'Precios y prueba gratuita', 'Reservar una demo'] };
    const he = { greeting: `יש שאלות על ${product}? אפשר לשאול על המוצר, המחירים או בקשת הדגמה.`, suggestedQuestions: [`ספרו לי על ${product}`, 'מחירים ותקופת ניסיון', 'קביעת הדגמה'] };
    rules.push({ urlContains: missing[0], matchType: 'pathname', urlAliases: missing.slice(1), prefilledMessage: '', ...en, localized: { en, es, he } });
  }
  const validation = validateWidgetPageRules(rules);
  if (!validation.ok) throw new Error(`Marketing page-rule proposal is invalid: ${validation.error}`);
  return { ...input.settings, pageRules: rules };
}
