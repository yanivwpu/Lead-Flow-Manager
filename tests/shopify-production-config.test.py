import pathlib
import re
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGIN = 'https://app.whachatcrm.com'
REQUIRED_SCOPES = ['read_customers', 'read_orders']
OPTIONAL_SCOPES = ['read_products', 'read_inventory']
# Existing app-owned commerce/privacy subscriptions must retain their ownership and URLs.
EXISTING = {
    'customers/create': 'customers-create',
    'customers/update': 'customers-update',
    'orders/create': 'orders-create',
    'orders/fulfilled': 'orders-fulfilled',
    'orders/cancelled': 'orders-cancelled',
    'customers/data_request': 'customers/data_request',
    'customers/redact': 'customers/redact',
    'shop/redact': 'shop/redact',
}
PRIVACY = {'customers/data_request', 'customers/redact', 'shop/redact'}
# Verified against Shopify's versioned 2026-01 WebhookSubscriptionTopic reference.
CATALOG = {
    'app/scopes_update',
    'products/create', 'products/update', 'products/delete',
    'inventory_levels/update', 'inventory_levels/connect', 'inventory_levels/disconnect',
    'inventory_items/update',
    'collections/create', 'collections/update', 'collections/delete',
}


def declared_strings(path, name):
    text = (ROOT / path).read_text()
    match = re.search(r'export const ' + name + r' = \[([\s\S]*?)\] as const', text)
    if not match:
        raise AssertionError(f'{name} declaration missing')
    return re.findall(r'[\'"]([^\'"]+)[\'"]', match[1])


class ProductionConfig(unittest.TestCase):
    def setUp(self):
        self.config = tomllib.loads((ROOT / 'shopify.app.whachatcrm.toml').read_text())

    def test_production_identity_oauth_and_managed_installation_preserved(self):
        self.assertEqual(set(self.config), {'client_id', 'name', 'application_url', 'embedded',
                                            'webhooks', 'access_scopes', 'auth'})
        self.assertEqual(self.config['client_id'], 'e4585d4da1434c9e5649a2269e716076')
        self.assertEqual(self.config['name'], ' WhachatCRM')
        self.assertEqual(self.config['application_url'], ORIGIN)
        self.assertIs(self.config['embedded'], False)
        self.assertEqual(self.config['auth'], {'redirect_urls': [ORIGIN + '/api/shopify/callback']})
        self.assertEqual(self.config['access_scopes'], {
            'scopes': ','.join(REQUIRED_SCOPES),
            'optional_scopes': OPTIONAL_SCOPES,
            'use_legacy_install_flow': False,
        })
        self.assertEqual(declared_strings('server/shopify.ts', 'SHOPIFY_SCOPES'), REQUIRED_SCOPES)
        self.assertEqual(declared_strings('shared/commerceCatalog.ts', 'SHOPIFY_CATALOG_SCOPES'), OPTIONAL_SCOPES)

    def test_exact_versioned_topics_callbacks_and_privacy_ownership(self):
        self.assertEqual(self.config['webhooks']['api_version'], '2026-01')
        self.assertEqual(set(self.config['webhooks']), {'api_version', 'subscriptions'})
        self.assertEqual(set(declared_strings('server/salesCatalog/shopify/webhooks.ts',
                                             'SHOPIFY_CATALOG_TOPICS')), CATALOG)
        found = {}
        for sub in self.config['webhooks']['subscriptions']:
            self.assertIn(set(sub), ({'topics', 'uri'}, {'compliance_topics', 'uri'}))
            key = 'compliance_topics' if 'compliance_topics' in sub else 'topics'
            self.assertEqual(len(sub[key]), 1)
            topic = sub[key][0]
            self.assertNotIn(topic, found)
            self.assertEqual(key == 'compliance_topics', topic in PRIVACY)
            found[topic] = sub['uri']
        expected = {topic: ORIGIN + '/api/shopify/webhooks/' + path
                    for topic, path in EXISTING.items()}
        expected['app/scopes_update'] = ORIGIN + '/api/shopify/catalog-webhooks/app-scopes_update'
        self.assertEqual(found, expected)
        # Existing uninstall remains per-shop. No checkout/payment/marketing topics added.
        self.assertEqual(len(found), 9)
        self.assertTrue((CATALOG - {'app/scopes_update'}).isdisjoint(found))
        self.assertNotIn('app/uninstalled', found)


if __name__ == '__main__':
    unittest.main()
