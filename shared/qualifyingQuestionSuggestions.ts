/**
 * Questions proposed from what the workspace already knows about itself.
 *
 * The merchant no longer picks an industry template — the workflow proposes a starting set
 * from the same published knowledge the assistant answers with, and the merchant edits it.
 * This is deterministic on purpose: it runs the moment a page is analyzed, costs nothing,
 * and gives the same answer twice. When a model generates these instead, it produces this
 * same shape and everything downstream stays put.
 *
 * Nothing here reads or writes storage. Callers pass what they already loaded.
 */

export type SuggestedQuestion = {
  key: string;
  label: string;
  question: string;
  required: boolean;
};

/** What the workspace looks like, as far as its own knowledge shows. */
export type BusinessShape =
  | "directory"
  | "dining"
  | "lodging"
  | "contractor"
  | "real_estate"
  | "healthcare"
  | "travel"
  | "ecommerce"
  | "education"
  | "finance"
  | "automotive"
  | "generic";

export type QuestionSignals = {
  /** The industry chosen in the profile, when one was. */
  industry?: string | null;
  /** Names of published pricing plans, in the order they were published. */
  planNames?: string[];
  /** Short offering labels — products and services. */
  offerings?: string[];
  hasBooking?: boolean;
  hasLocations?: boolean;
};

const MAX_SUGGESTIONS = 6;

/** Words that give a business away regardless of the industry it selected. */
const SHAPE_KEYWORDS: Array<{ shape: BusinessShape; words: readonly string[] }> = [
  {
    shape: "directory",
    words: [
      "listing",
      "advertis",
      "sponsor",
      "spotlight",
      "directory",
      "placement",
      "membership",
      "featured business",
    ],
  },
  {
    shape: "dining",
    words: ["restaurant", "dining", "menu", "reservation", "table", "catering", "brunch"],
  },
  { shape: "lodging", words: ["hotel", "room", "suite", "stay", "night", "resort", "rental"] },
];

const INDUSTRY_SHAPES: Record<string, BusinessShape> = {
  real_estate: "real_estate",
  travel: "travel",
  contractor: "contractor",
  ecommerce: "ecommerce",
  healthcare: "healthcare",
  education: "education",
  finance: "finance",
  hospitality: "lodging",
  automotive: "automotive",
};

/**
 * What the business does, from its own words first.
 *
 * Plan and offering names beat the industry dropdown: a magazine that sells listings picks
 * "Other" and would otherwise get generic questions, while its pricing page says plainly
 * that it is a directory.
 */
export function detectBusinessShape(signals: QuestionSignals): BusinessShape {
  const haystack = [...(signals.planNames ?? []), ...(signals.offerings ?? [])]
    .join(" ")
    .toLowerCase();
  if (haystack) {
    for (const { shape, words } of SHAPE_KEYWORDS) {
      if (words.some((w) => haystack.includes(w))) return shape;
    }
  }
  const byIndustry = signals.industry ? INDUSTRY_SHAPES[signals.industry] : undefined;
  return byIndustry ?? "generic";
}

const BASE_QUESTIONS: Record<BusinessShape, SuggestedQuestion[]> = {
  directory: [
    { key: "business_name", label: "Business name", question: "What is your business name?", required: true },
    { key: "category", label: "Category", question: "What category best describes your business?", required: true },
    { key: "location", label: "Location", question: "Where is your business located?", required: true },
    { key: "website", label: "Website", question: "Do you have a website we should link to?", required: false },
  ],
  dining: [
    { key: "party_size", label: "Party size", question: "How many guests will be joining?", required: true },
    { key: "date", label: "Date", question: "What date and time are you looking for?", required: true },
    { key: "seating", label: "Seating", question: "Would you prefer indoor or outdoor seating?", required: false },
    { key: "occasion", label: "Occasion", question: "Is this for a special occasion we should know about?", required: false },
  ],
  lodging: [
    { key: "dates", label: "Dates", question: "What dates are you looking to book?", required: true },
    { key: "guests", label: "Guests", question: "How many guests will be staying?", required: true },
    { key: "room_type", label: "Room type", question: "Do you have a preference for room type or amenities?", required: false },
  ],
  contractor: [
    { key: "service", label: "Service", question: "What service do you need?", required: true },
    { key: "location", label: "Location", question: "Where is the project located?", required: true },
    { key: "timeline", label: "Timeline", question: "When would you like the work to start?", required: true },
    { key: "budget", label: "Budget", question: "Do you have a budget in mind for this project?", required: false },
  ],
  real_estate: [
    { key: "intent", label: "Intent", question: "Are you looking to buy, rent, or invest?", required: true },
    { key: "budget", label: "Budget", question: "Do you have a target price range in mind?", required: true },
    { key: "timeline", label: "Timeline", question: "What is your ideal timeline for making a move?", required: true },
    { key: "location", label: "Area", question: "Do you have a preferred area or neighbourhood in mind?", required: false },
  ],
  healthcare: [
    { key: "service", label: "Care needed", question: "What type of care or treatment are you looking for?", required: true },
    { key: "urgency", label: "Urgency", question: "Is this urgent, or are you scheduling a routine appointment?", required: true },
    { key: "insurance", label: "Insurance", question: "Do you have health insurance, and if so which provider?", required: false },
  ],
  travel: [
    { key: "destination", label: "Destination", question: "Where are you looking to travel?", required: true },
    { key: "dates", label: "Dates", question: "When are you planning to travel, and for how long?", required: true },
    { key: "group_size", label: "Group size", question: "How many people will be travelling?", required: true },
    { key: "budget", label: "Budget", question: "Do you have a rough budget per person in mind?", required: false },
  ],
  ecommerce: [
    { key: "product", label: "Product", question: "Which product or category are you interested in?", required: true },
    { key: "quantity", label: "Quantity", question: "How many units are you looking to order?", required: false },
    { key: "shipping", label: "Shipping", question: "Where should this be shipped, and how soon do you need it?", required: false },
  ],
  education: [
    { key: "course", label: "Course", question: "Which course or program are you interested in?", required: true },
    { key: "level", label: "Level", question: "What is your current level — beginner, intermediate, or advanced?", required: true },
    { key: "schedule", label: "Schedule", question: "Are you looking for full-time, part-time, or self-paced?", required: false },
  ],
  finance: [
    { key: "service", label: "Service", question: "What are you looking for — insurance, investments, or lending?", required: true },
    { key: "amount", label: "Amount", question: "What amount or coverage level are you considering?", required: true },
    { key: "timeline", label: "Timeline", question: "When do you need this in place?", required: false },
  ],
  automotive: [
    { key: "intent", label: "Intent", question: "Are you looking to buy, lease, or service a vehicle?", required: true },
    { key: "vehicle", label: "Vehicle", question: "What type of vehicle are you interested in?", required: true },
    { key: "timeline", label: "Timeline", question: "When are you looking to make a decision?", required: false },
  ],
  generic: [
    { key: "need", label: "Need", question: "What are you looking for help with?", required: true },
    { key: "timeline", label: "Timeline", question: "When do you need this by?", required: true },
    { key: "contact", label: "Best contact", question: "What is the best way to reach you?", required: false },
  ],
};

/** Reads as a sentence for one, two, or many plans. */
function listPlans(names: string[]): string {
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/**
 * A starting set for this workspace.
 *
 * Published plans, a booking link and saved locations each earn their own question, because
 * those are the details a reply cannot get right without asking. The result is capped so a
 * merchant reviews a short list rather than a form.
 */
export function suggestQualifyingQuestions(signals: QuestionSignals): SuggestedQuestion[] {
  const shape = detectBusinessShape(signals);
  const out: SuggestedQuestion[] = [...BASE_QUESTIONS[shape]];
  const has = (key: string) => out.some((q) => q.key === key);

  const planNames = (signals.planNames ?? []).map((n) => n.trim()).filter(Boolean).slice(0, 3);
  if (planNames.length > 0 && !has("plan")) {
    out.push({
      key: "plan",
      label: "Package",
      question:
        shape === "directory"
          ? `Which visibility package interests you — ${listPlans(planNames)}?`
          : `Which option are you interested in — ${listPlans(planNames)}?`,
      required: true,
    });
  }

  if (signals.hasBooking && !has("date") && !has("dates") && !has("timeline")) {
    out.push({
      key: "preferred_time",
      label: "Preferred time",
      question: "When would you like to book?",
      required: true,
    });
  }

  if (signals.hasLocations && !has("location")) {
    out.push({
      key: "preferred_location",
      label: "Location",
      question: "Which of our locations works best for you?",
      required: false,
    });
  }

  return out.slice(0, MAX_SUGGESTIONS);
}

/**
 * Suggestions this workspace has not seen. Matching is by key and by the question text, so
 * a merchant who rewrote a suggested question is never offered it back.
 */
export function newSuggestionsFor(
  existing: Array<{ key?: string; question?: string }>,
  suggestions: SuggestedQuestion[],
): SuggestedQuestion[] {
  const keys = new Set<string>();
  const texts = new Set<string>();
  for (const q of existing) {
    // Added questions carry a `<key>_<timestamp>` id, so compare on the stem.
    if (q.key) keys.add(String(q.key).replace(/_\d{10,}$/, ""));
    if (q.question) texts.add(q.question.trim().toLowerCase());
  }
  return suggestions.filter(
    (s) => !keys.has(s.key) && !texts.has(s.question.trim().toLowerCase()),
  );
}
