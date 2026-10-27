# Prepared single-use read-only compatibility activation

This change builds on PR #205 and prepares a separately controlled live-read path. It does **not** deploy, activate, apply a migration, provision a grant, change runtime variables, contact Shopify or change store configuration/credentials. PR #204 stays separate and unmerged. Both probe source gates and every existing cart/checkout execution gate remain false.

## What the preparation adds

- The production adapter no longer uses the repeatable #205 gate as an activation path. A new false source approval gate is independent of cart/checkout. Environment settings alone cannot activate it.
- Existing Test Chat admin/Brain access, Shopping entitlement, the fresh database owner and the existing private Shopping pilot grant must all agree. Independent probe pins must additionally match the existing pilot owner/workspace and exact pilot shop; they cannot nominate another merchant. The current saved session, selection, catalog source, integration and credential are bound to the authorization.
- A separate singleton authorization journal allows at most one bounded read sequence across replicas/restarts. An explicit, expiring server grant binds the exact operator, workspace, shop, integration, session and current configuration. An atomic claim commits before the first provider request. Success, failure, expiry, lost acknowledgement or a changed session never permits another claim. No runtime path provisions or resets a grant. The journal is unrelated to the consumed cart request and shop-wide cart fence.
- A private GET readiness check reuses the existing Test Chat route. It checks configuration, local owner/session/catalog/installation state and grant availability without provider IO or claiming the grant. Its status concerns **local activation readiness only**; live Shopify compatibility stays unverified. A server-only scope-preparation method is deliberately not exposed over HTTP and cannot create a grant.
- Every subsequent provider read rechecks the source approval, owner/session/installation binding, grant expiry and revocation. The fixed read-only adapter retains its merchant endpoint, schema validation, owned product/variant membership, currency conversion and fresh Admin inventory comparison. Existing inventory verification is unchanged. No raw schemas, provider content or credentials are rendered as trusted instructions.
- One attempt consists of at most one Admin identity read, one UCP profile GET, one MCP tool listing, one catalog search and one Admin variant comparison. There are no retries or pagination. A UCP profile error/password barrier stops the sequence. Any uncertain result spends the grant. The browser records the submitted attempt and offers no retry; the durable server claim is authoritative across reloads and clients.

The prepared migration contains no grant row and is not registered with startup patches. It must remain unapplied until separately reviewed. Existing journal rows, inventory state, OAuth, consent, saved Shopping settings and customer workflows are untouched.

## How to interpret the later live result

| Result | Meaning |
| --- | --- |
| Supported | The specific read/schema/mapping check succeeded for this installation and bounded sample. Advertised tools are labeled as advertisement only. |
| Unsupported | The endpoint/tool/capability was not available or advertised; this does not establish permanent merchant ineligibility. |
| Configuration required | A private grant/profile/identity prerequisite is absent, access was denied or the endpoint redirected to a password page. |
| Unavailable | A transport, schema, identity, currency or availability comparison could not be verified. This never permits retrying the spent grant. |

Inventory quantities remain the responsibility of the existing inventory verifier. The probe cannot authorize a cart, checkout, order, payment, purchase recommendation or customer message. Tool discovery does not authorize tool execution; only the fixed catalog search is callable.

## Prerequisites for a separately approved live read

Private readiness must verify the existing production pilot values against the database, the independent probe pins, a valid existing HTTPS UCP agent profile and the reviewed, unclaimed session-bound authorization. Configuration presence from a redacted platform listing is insufficient. Actual development-store status and granted Admin permissions are checked by the first approved read; they cannot be claimed from local configuration alone.

The agent profile must advertise the needed UCP catalog capabilities/Shopify extension and be publicly readable by Shopify. The probe does not host a profile, create credentials or reuse an Admin/Storefront token as MCP authentication. Token-based access or buyer-IP requirements are not worked around by fabricating an IP or forwarding credentials.

A password-protected development store may block UCP/MCP. If the approved read encounters that restriction, report configuration-required and stop. There is no password submission, cookie/redirect bypass or automatic configuration change. The merchant would need to confirm supported access with Shopify; any change of store, protection, grants or credentials is a separate decision and outside this preparation.

Tests use synthetic tenants, disposable databases and injected responses. They cover a competing durable claim, replay after restart/session change, immutable consumed evidence, expiry/revocation, mid-run revocation, private readiness with zero provider IO, identity/configuration failures and preservation of the real cart journal/index. No production probe or grant is exercised by these tests.
