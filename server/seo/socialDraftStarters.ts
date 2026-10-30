/** Owner-review editorial starters; these are curated drafts, NOT AI-generated or published posts.
 * Each topic is grounded in an existing public WhachatCRM page.
 * The separate AI generation/scheduling workstream must not claim this seed is autopilot.
 */
export type SocialChannel = "linkedin" | "facebook" | "instagram";
export type SeoSocialStarter = {
  key: string;
  day: number;
  channel: SocialChannel;
  topic: string;
  keyword: string;
  destinationUrl: string;
  body: string;
};
const base = "https://www.whachatcrm.com";
export const SEO_SOCIAL_STARTERS: readonly SeoSocialStarter[] = [
  {
    key: "qualification-linkedin", day: 0, channel: "linkedin", topic: "How AI qualifies real estate leads 24/7",
    keyword: "AI real estate lead qualification", destinationUrl: base + "/realtor-growth-engine",
    body: "A real estate lead can arrive while you're showing a property, driving, or off the clock. The real challenge isn't just responding quickly. It's learning what the person actually needs.\n\nOur Realtor Growth Engine is built to ask about location, budget, timeline and buying or renting intent, so an agent has context before the next conversation.\n\nWhat qualification question do you always ask first?\n\nSee the workflow: " + base + "/realtor-growth-engine"
  },
  {
    key: "shopify-linkedin", day: 1, channel: "linkedin", topic: "5 ways Shopify merchants can recover missed opportunities",
    keyword: "Shopify WhatsApp CRM", destinationUrl: base + "/solutions/ecommerce",
    body: "A shopper asking about a product isn't just a support ticket. It's a sales conversation.\n\nFive useful habits for Shopify teams: 1) reply with the right order context; 2) keep WhatsApp and other messages in one inbox; 3) assign the conversation; 4) use approved follow-up templates where permitted; 5) measure which conversations become orders.\n\nWe're building the E-Commerce Growth Engine around these practical workflows, with permission and message approval as part of the design.\n\nExplore the solution: " + base + "/solutions/ecommerce"
  },
  {
    key: "inbox-linkedin", day: 2, channel: "linkedin", topic: "Why growing teams need a unified inbox",
    keyword: "shared WhatsApp team inbox", destinationUrl: base + "/unified-inbox",
    body: "When sales, support and follow-up all happen in separate messaging apps, customer context slips between people.\n\nA shared inbox isn't just one screen for more channels. It's a way to keep ownership, conversation history and next steps visible to the team.\n\nThat's one of the core ideas behind WhachatCRM: messaging first, CRM context beside the conversation.\n\nWhere does your team lose the most context today?\n\n" + base + "/unified-inbox"
  },
  {
    key: "mls-linkedin", day: 3, channel: "linkedin", topic: "From buyer qualification to MLS matching",
    keyword: "real estate CRM MLS integration", destinationUrl: base + "/realtor-growth-engine",
    body: "A buyer saying 'I need a 3-bedroom under my budget' is the beginning of a workflow, not the end of a chat.\n\nIn our Realtor Growth Engine, qualification details can guide MLS inventory matching where the connected listing feed supports it. The aim is to help agents move from fragmented messages to relevant property conversations.\n\nWhat takes more time in your process: understanding the buyer or finding the right listings?\n\n" + base + "/realtor-growth-engine"
  },
  {
    key: "referrals-linkedin", day: 4, channel: "linkedin", topic: "A real estate lead might need more than a listing",
    keyword: "AI real estate referral routing", destinationUrl: base + "/realtor-growth-engine",
    body: "Sometimes the next best step for a buyer isn't a showing. It's mortgage prequalification, financing guidance or help coordinating a move.\n\nThat's why we designed referral routing into the Realtor Growth Engine: identify needs during qualification and direct the conversation toward the agent's chosen professional network.\n\nGood follow-up should connect people to the right next step.\n\n" + base + "/realtor-growth-engine"
  },
  {
    key: "team-linkedin", day: 5, channel: "linkedin", topic: "The difference between an inbox and a sales workflow",
    keyword: "WhatsApp CRM automations", destinationUrl: base + "/automations",
    body: "A message came in. Someone answered. What happens next?\n\nThat gap is where a lot of customer conversations get lost. An inbox stores the reply; a workflow can assign an owner, apply a tag, create a task and remind the team to follow up.\n\nWhachatCRM combines the conversation and the next action in one workspace.\n\nWhat's the handoff your team still handles manually?\n\n" + base + "/automations"
  },
  {
    key: "pricing-linkedin", day: 6, channel: "linkedin", topic: "WhatsApp CRM should be clear about fees",
    keyword: "WhatsApp CRM pricing", destinationUrl: base + "/pricing",
    body: "When teams compare WhatsApp platforms, the monthly subscription is only one part of the cost. Provider message charges and the way those fees are passed through matter too.\n\nOur direct WhachatCRM pricing policy is 0% markup on Meta messaging fees. Customers still pay the underlying applicable Meta charges.\n\nAsk every vendor to separate platform fees from messaging fees in the quote.\n\n" + base + "/pricing"
  },
  {
    key: "qualification-facebook", day: 0, channel: "facebook", topic: "How AI qualifies real estate leads 24/7",
    keyword: "real estate lead follow up", destinationUrl: base + "/realtor-growth-engine",
    body: "New property inquiry? Before the next showing, find out the prospect's budget, preferred area, timeline and whether they're buying or renting. Our Realtor Growth Engine helps agents gather that context through conversation. Learn more: " + base + "/realtor-growth-engine"
  },
  {
    key: "shopify-facebook", day: 1, channel: "facebook", topic: "5 ways Shopify merchants can recover missed opportunities",
    keyword: "Shopify customer messaging", destinationUrl: base + "/solutions/ecommerce",
    body: "Five opportunities Shopify teams can focus on: faster answers, visible order context, shared ownership, permission-based follow-ups and clear next steps. See how WhachatCRM brings messaging and commerce context together: " + base + "/solutions/ecommerce"
  },
  {
    key: "inbox-facebook", day: 2, channel: "facebook", topic: "Why growing teams need a unified inbox",
    keyword: "unified messaging inbox", destinationUrl: base + "/unified-inbox",
    body: "Too many channels, not enough context? Keep team conversations and CRM information together so messages don't get lost in handoffs. Explore WhachatCRM's Unified Inbox: " + base + "/unified-inbox"
  },
  {
    key: "qualification-instagram", day: 0, channel: "instagram", topic: "How AI qualifies real estate leads 24/7",
    keyword: "AI lead qualification", destinationUrl: base + "/realtor-growth-engine",
    body: "Location. Budget. Timeline. Buy or rent. 🏡\n\nFour questions that turn a real estate inquiry into a more useful conversation.\n\nExplore Realtor Growth Engine at the link in our profile.\n\n#RealEstateCRM #LeadQualification"
  },
  {
    key: "shopify-instagram", day: 1, channel: "instagram", topic: "5 ways Shopify merchants can recover missed opportunities",
    keyword: "Shopify WhatsApp messaging", destinationUrl: base + "/solutions/ecommerce",
    body: "A product question is a chance to help a shopper decide. 🛍️\n\nKeep the order context, the conversation and the next step connected.\n\nMore about our e-commerce solution at the link in our profile.\n\n#Shopify #CustomerMessaging"
  },
  {
    key: "inbox-instagram", day: 2, channel: "instagram", topic: "Why growing teams need a unified inbox",
    keyword: "shared team inbox", destinationUrl: base + "/unified-inbox",
    body: "One customer. Three channels. Two teammates.\n\nWithout shared context, it's easy to miss the next step.\n\nUnified Inbox brings customer conversations together. Learn more at the link in our profile.\n\n#UnifiedInbox #CustomerExperience"
  }
] as const;

export function validateSeoSocialStarter(item: SeoSocialStarter): boolean {
  return /^[a-z0-9-]+$/.test(item.key) && item.day >= 0 && item.day <= 6
    && ["linkedin", "facebook", "instagram"].includes(item.channel)
    && item.body.trim().length >= 60 && item.body.length <= 1800
    && /^https:\/\/www\.whachatcrm\.com\/[a-z0-9/-]+$/.test(item.destinationUrl);
}
