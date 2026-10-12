import copy
import importlib.util
from pathlib import Path
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validator', ROOT / 'scripts/validate-shopify-staging.py')
v = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)
CONFIG = tomllib.loads((ROOT / 'shopify.app.staging.toml').read_text())
FIXTURE_ID = '0123456789abcdef0123456789abcdef'  # Test identity only; never written to the app config.


class StagingConfiguration(unittest.TestCase):
    def test_checked_in_intent_and_identity_blocker(self):
        # Missing verified identity is documented and cannot pass the release gate.
        if CONFIG['client_id'] == '':
            self.assertFalse(v.validate(CONFIG, allow_unlinked=True))
            with self.assertRaises(ValueError):
                v.validate(CONFIG, FIXTURE_ID)
        else:
            self.assertTrue(v.validate(CONFIG, CONFIG['client_id']))

    def test_verified_identity_required_and_production_rejected(self):
        config = copy.deepcopy(CONFIG)
        config['client_id'] = FIXTURE_ID
        self.assertTrue(v.validate(config, FIXTURE_ID))
        for identity in (None, '', 'f' * 32, *v.PRODUCTION_IDS):
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                v.validate(config, identity)
        for identity in v.PRODUCTION_IDS:
            config['client_id'] = identity
            with self.assertRaises(ValueError):
                v.validate(config, identity)

    def test_bad_config_is_rejected(self):
        changes = [
            lambda c: c.update(embedded=True),
            lambda c: c.update(application_url='https://app.whachatcrm.com'),
            lambda c: c['auth'].update(redirect_urls=['https://app.whachatcrm.com/api/shopify/callback']),
            lambda c: c['access_scopes'].update(scopes='read_orders'),
            lambda c: c['access_scopes'].update(use_legacy_install_flow=True),
            lambda c: c['webhooks'].update(api_version='2026-01'),
            lambda c: c['webhooks']['subscriptions'].pop(),
            lambda c: c['webhooks']['subscriptions'].append(copy.deepcopy(c['webhooks']['subscriptions'][0])),
            lambda c: c['webhooks']['subscriptions'][0].update(uri='https://app.whachatcrm.com/api/shopify/webhooks/customers/data_request'),
            lambda c: c['webhooks']['subscriptions'].append({'topics': ['app/uninstalled'], 'uri': v.ORIGIN + '/api/shopify/webhooks/app-uninstalled'}),
        ]
        for change in changes:
            config = copy.deepcopy(CONFIG)
            config['client_id'] = FIXTURE_ID
            change(config)
            with self.subTest(change=change), self.assertRaises(ValueError):
                v.validate(config, FIXTURE_ID)

    def test_callback_routes_and_signature_wiring_exist(self):
        routes = (ROOT / 'server/shopifyRoutes.ts').read_text()
        for callback in v.TOPICS.values():
            self.assertIn("router.post('" + callback.removeprefix('/api/shopify'), routes)
        self.assertIn('verify: verifyWebhookHmac', routes)
        self.assertIn(".createHmac('sha256', SHOPIFY_API_SECRET)", routes)
        self.assertIn('crypto.timingSafeEqual', routes)
        self.assertIn('verifyShopifyCommerceWebhook', routes)
        self.assertIn("router.post('/webhooks/app-uninstalled'", routes)
        for filename in ('shopifyCustomerPrivacyHandler.ts', 'shopifyStoreRedactionHandler.ts'):
            handler = (ROOT / 'server' / filename).read_text()
            self.assertIn('deps.verify', handler)


if __name__ == '__main__':
    unittest.main()
