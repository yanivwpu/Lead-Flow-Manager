"""Validate staging intent; release validation requires an independently verified ID."""
import argparse
import os
from pathlib import Path
import re
import tomllib

ORIGIN = 'https://whachatcrm-staging-app-staging.up.railway.app'
TOPICS = {
    'customers/data_request': '/api/shopify/webhooks/customers/data_request',
    'customers/redact': '/api/shopify/webhooks/customers/redact',
    'shop/redact': '/api/shopify/webhooks/shop/redact',
    'customers/create': '/api/shopify/webhooks/customers-create',
    'orders/create': '/api/shopify/webhooks/orders-create',
}
PRIVACY = {'customers/data_request', 'customers/redact', 'shop/redact'}
ROOT = Path(__file__).resolve().parents[1]
PRODUCTION_IDS = {tomllib.loads((ROOT / name).read_text())['client_id']
                  for name in ('shopify.app.toml', 'shopify.app.whachatcrm.toml')}


def validate(config, verified_client_id=None, allow_unlinked=False):
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    client_id = config.get('client_id')
    require(client_id not in PRODUCTION_IDS, 'Production app identity is forbidden')
    if client_id or not allow_unlinked:
        require(bool(verified_client_id) and bool(re.fullmatch(r'[a-f0-9]{32}', verified_client_id)),
                'Provide the independently verified WhachatCRM Staging client ID')
        require(verified_client_id not in PRODUCTION_IDS and client_id == verified_client_id,
                'Staging client ID must match the verified staging app identity')
    require(client_id == '' or bool(re.fullmatch(r'[a-f0-9]{32}', client_id)), 'Invalid staging client ID')
    require(config.get('name') == 'WhachatCRM Staging', 'Wrong app name')
    require(config.get('embedded') is False, 'Staging must be non-embedded')
    require(config.get('application_url') == ORIGIN, 'Wrong staging application URL')
    require(config.get('auth', {}).get('redirect_urls') == [ORIGIN + '/api/shopify/callback'], 'Wrong OAuth callback')
    require(config.get('access_scopes') == {'scopes': 'read_customers,read_orders', 'optional_scopes': [],
                                          'use_legacy_install_flow': False}, 'Wrong scopes/install flow')
    webhooks = config.get('webhooks', {})
    require(webhooks.get('api_version') == '2026-10', 'Wrong webhook API version')
    require(set(webhooks) == {'api_version', 'subscriptions'}, 'Unexpected webhook configuration')
    found = {}
    for subscription in webhooks.get('subscriptions', []):
        keys = set(subscription)
        require(keys in ({'uri', 'topics'}, {'uri', 'compliance_topics'}), 'Unexpected subscription fields')
        key = 'compliance_topics' if 'compliance_topics' in subscription else 'topics'
        require(len(subscription[key]) == 1, 'One topic per subscription required')
        topic = subscription[key][0]
        require(topic in TOPICS and topic not in found, 'Duplicate or unexpected topic (uninstall stays per-shop)')
        require((key == 'compliance_topics') == (topic in PRIVACY), 'Wrong subscription ownership')
        require(subscription['uri'] == ORIGIN + TOPICS[topic], 'Wrong staging callback URL')
        found[topic] = subscription['uri']
    require(set(found) == set(TOPICS), 'Missing required webhook subscriptions')
    return bool(client_id)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default=str(ROOT / 'shopify.app.staging.toml'))
    parser.add_argument('--client-id', default=os.getenv('SHOPIFY_STAGING_CLIENT_ID'))
    args = parser.parse_args()
    try:
        validate(tomllib.loads(Path(args.config).read_text()), args.client_id)
    except (ValueError, tomllib.TOMLDecodeError) as error:
        parser.exit(1, f'Staging release blocked: {error}\n')
    print('Staging configuration and independently supplied app identity match; release still requires approval.')
