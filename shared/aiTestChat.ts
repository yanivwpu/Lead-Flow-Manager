import type { ShoppingState } from "./shoppingAssistant";
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
