import type { ShoppingState } from "./shoppingAssistant";

export type PrivateCheckoutPreflight = {
  ready: false; cartCreated: false; cartCreationEnabled: false;
  credentialKind?: "tokenless" | "public" | "private"; error: string;
} | {
  ready: true; cartCreated: false; cartCreationEnabled: false;
  credentialKind: "tokenless" | "public" | "private";
  selection: {shop:string;productId:string;variantId:string;quantity:number;price:string;currency:string;options:Array<{name:string;value:string}>};
  selectionSha256: string; sessionBinding: string;
  authorizationId?: string;
  quantityRule: {minimum:number;maximum:number|null;increment:number};
  inventory: {tracked:boolean;quantity:number|null;verifiedAt:string};
  operatorCartAccessConfigured: boolean; nextAction: "separate_cart_approval_required";
};
export type TestChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
};
export type TestShoppingActivity = Pick<
  ShoppingState,
  | "version"
  | "step"
  | "intent"
  | "choices"
  | "selected"
  | "quantity"
  | "updatedAt"
>;
export function testShoppingActivity(
  state: Partial<ShoppingState>,
): Partial<TestShoppingActivity> {
  const { version, step, intent, choices, selected, quantity, updatedAt } =
    state;
  return { version, step, intent, choices, selected, quantity, updatedAt };
}
export type TestChatView = {
  id: string;
  testMode: true;
  channel: "webchat";
  expiresAt: string;
  transcript: TestChatMessage[];
  state: Partial<TestShoppingActivity>;
};

/** Independent of PrivateCheckoutPreflight: never accepted as cart preparation or execution proof. */
export type SecondCartReview = {
 status:"ready_for_owner_review"|"blocked";
 reviewOnly:true;cartCreated:false;cartCreationEnabled:false;executionEnabled:false;canApprove:false;originalAttemptPreserved:true;
 checks:Array<{id:"originalAttempt"|"receiptStorage"|"authorizationSchema"|"secondAuthorization"|"storefront"|"executionApproval";status:"passed"|"required"|"blocked"}>;
 selection?:{productId:string;variantId:string;quantity:number;price:string;currency:string;options:Array<{name:string;value:string}>};
 inventory?:{tracked:boolean;quantity:number|null;verifiedAt:string};
 quantityRule?:{minimum:number;maximum:number|null;increment:number};
};
