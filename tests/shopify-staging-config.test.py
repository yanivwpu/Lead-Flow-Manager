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
EXPECTED_ID = '2e424c769c25776a9086c36490ed14fc'  # Owner and Shopify Support confirmed.
RETIRED_ID = '71a0de963ce2fb0c2e970c904eabbc56'


class StagingConfiguration(unittest.TestCase):
    def test_checked_in_identity(self):
        self.assertEqual(CONFIG['client_id'], EXPECTED_ID)
        self.assertTrue(v.validate(CONFIG, EXPECTED_ID))
        self.assertEqual(len(CONFIG['webhooks']['subscriptions']), 6)
        self.assertIn('customers/update', v.TOPICS)

    def test_verified_identity_required_and_wrong_apps_rejected(self):
        for identity in (None, '', 'f' * 32, RETIRED_ID, *v.PRODUCTION_IDS):
            with self.subTest(identity=identity), self.assertRaises(ValueError):
                v.validate(CONFIG, identity)
        # A matching independently supplied ID must not bless a different app.
        for identity in ('', 'f' * 32, RETIRED_ID, *v.PRODUCTION_IDS):
            config = copy.deepcopy(CONFIG)
            config['client_id'] = identity
            for verified in (identity, EXPECTED_ID):
                with self.subTest(identity=identity, verified=verified), self.assertRaises(ValueError):
                    v.validate(config, verified)

    def test_every_callback_and_subscription_type_is_guarded(self):
        for index, subscription in enumerate(CONFIG['webhooks']['subscriptions']):
            config = copy.deepcopy(CONFIG)
            config['webhooks']['subscriptions'][index]['uri'] = subscription['uri'].replace(v.ORIGIN, 'https://app.whachatcrm.com')
            with self.subTest(index=index), self.assertRaises(ValueError):
                v.validate(config, EXPECTED_ID)
            config = copy.deepcopy(CONFIG)
            entry = config['webhooks']['subscriptions'][index]
            key = 'compliance_topics' if 'compliance_topics' in entry else 'topics'
            entry['topics' if key == 'compliance_topics' else 'compliance_topics'] = entry.pop(key)
            with self.subTest(index=index, ownership=True), self.assertRaises(ValueError):
                v.validate(config, EXPECTED_ID)

    def test_bad_config_is_rejected(self):
        changes = [
            lambda c: c.update(embedded=True),
            lambda c: c.update(client_secret='production-secret-must-not-be-in-config'),
            lambda c: c['auth'].update(client_secret='production-secret-must-not-be-in-config'),
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
            config['client_id'] = EXPECTED_ID
            change(config)
            with self.subTest(change=change), self.assertRaises(ValueError):
                v.validate(config, EXPECTED_ID)

    def test_callback_routes_and_signature_wiring_exist(self):
        routes = (ROOT / 'server/shopifyRoutes.ts').read_text()
        for callback in v.TOPICS.values():
            self.assertIn("router.post('" + callback.removeprefix('/api/shopify'), routes)
        self.assertIn('verify: verifyWebhookHmac', routes)
        self.assertIn(".createHmac('sha256', SHOPIFY_API_SECRET)", routes)
        self.assertIn('crypto.timingSafeEqual', routes)
        self.assertIn('createShopifyOrderWebhookHandler', routes)
        self.assertIn("router.post('/webhooks/app-uninstalled'", routes)
        for filename in ('shopifyCustomerPrivacyHandler.ts', 'shopifyStoreRedactionHandler.ts', 'shopifyOrderWebhookHandler.ts'):
            handler = (ROOT / 'server' / filename).read_text()
            self.assertIn('deps.verify', handler)


if __name__ == '__main__':
    unittest.main()
