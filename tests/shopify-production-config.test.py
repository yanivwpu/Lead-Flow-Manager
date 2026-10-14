import pathlib
import tomllib
import unittest

class ProductionConfig(unittest.TestCase):
    def test_required_topics_and_production_endpoints(self):
        config = tomllib.loads(pathlib.Path('shopify.app.whachatcrm.toml').read_text())
        origin = 'https://app.whachatcrm.com'
        self.assertEqual(config['application_url'], origin)
        self.assertEqual(config['auth']['redirect_urls'], [origin + '/api/shopify/callback'])
        self.assertEqual(set(config['access_scopes']['scopes'].split(',')), {'read_customers', 'read_orders'})
        expected = {'customers/create': 'customers-create', 'customers/update': 'customers-update', 'orders/create': 'orders-create', 'customers/data_request': 'customers/data_request', 'customers/redact': 'customers/redact', 'shop/redact': 'shop/redact'}
        found = {}
        for subscription in config['webhooks']['subscriptions']:
            for topic in subscription.get('topics', subscription.get('compliance_topics', [])):
                self.assertNotIn(topic, found)
                found[topic] = subscription['uri']
        self.assertEqual(found, {topic: origin + '/api/shopify/webhooks/' + path for topic, path in expected.items()})

if __name__ == '__main__':
    unittest.main()
