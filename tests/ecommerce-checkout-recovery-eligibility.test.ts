import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCheckoutRecovery, type CheckoutRecoveryInput } from '../server/ecommerce/checkoutRecoveryEligibility';

const ready: CheckoutRecoveryInput = {
  verifiedEvent: true, activeInstallation: true, tenantMatches: true,
  merchantEnabled: true, checkoutId: 'checkout-1',
  checkoutRecoveryUrl: 'https://example-store.myshopify.com/checkouts/recover/example',
  hasCompletedPurchase: false, checkoutAgeMinutes: 60, minimumDelayMinutes: 30,
  contactIdentityVerified: true, whatsAppOptIn: 'granted', optedOut: false,
  approvedTemplateAvailable: true, alreadyClaimed: false,
};
test('only a fully verified incomplete checkout reaches a durable claim boundary', () => {
  assert.equal(evaluateCheckoutRecovery(ready).status, 'eligible_for_durable_claim');
});
test('fail closed for missing consent, unknown purchase status, and duplicate claims', () => {
  for (const patch of [
    { verifiedEvent: false }, { activeInstallation: false }, { tenantMatches: false },
    { merchantEnabled: false }, { checkoutId: null }, { hasCompletedPurchase: true },
    { hasCompletedPurchase: null }, { checkoutAgeMinutes: 1 }, { optedOut: true },
    { whatsAppOptIn: 'unknown' as const }, { whatsAppOptIn: 'denied' as const },
    { contactIdentityVerified: false }, { approvedTemplateAvailable: false },
    { alreadyClaimed: true }, { minimumDelayMinutes: 0 },
    { checkoutRecoveryUrl: 'http://example-store.myshopify.com/checkouts/a' },
    { checkoutRecoveryUrl: 'https://attacker.example/checkouts/a' },
    { checkoutRecoveryUrl: 'https://example-store.myshopify.com.evil.com/' },
    { checkoutRecoveryUrl: 'https://user:pass@example-store.myshopify.com/checkouts/a' },
  ]) assert.equal(evaluateCheckoutRecovery({...ready,...patch}).status, 'blocked', JSON.stringify(patch));
});
