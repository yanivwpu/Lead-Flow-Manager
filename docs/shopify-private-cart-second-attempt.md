# Disabled private cart adapter: review notes

Both execution source gates remain false. This change does not apply migrations, issue authorizations, alter credentials, enable execution or contact Shopify. Further custom cart development is paused pending a compatibility audit of Shopify's standard commerce tools.

## Security properties

- Trusted server configuration identifies the pilot workspace and owner email. A fresh database owner must match both. Private Shopping additionally requires the independently configured checkout workspace to match. Browser input, model output and administrator status cannot grant access.
- The pre-existing consumed request and its unique dispatch fence remain unchanged. A separate immutable singleton authorization can be claimed at most once. A new session, preparation, expiry or uncertain result never resets that claim.
- Existing saved-session selection, exact scope digest, installation/credential binding, development-store attestation, fresh price/inventory checks and explicit confirmation remain required.
- Claims commit before provider mutation. Ambiguous outcomes fail closed without automatic retries. No checkout navigation, orders, payments or customer messaging are introduced.
- Bounded cart-ID/URL evidence is encrypted before rejecting parseable mutation responses with invalid HTTP/API-version metadata. That evidence is untrusted and cannot authorize navigation. Successful receipt validation and status verification are separate milestones.
- Diagnostics contain fixed-vocabulary stages, bounded event history and validated provider correlation IDs. They exclude raw provider bodies/errors, tokens, customer data and checkout URLs. Encrypted receipt evidence remains in private storage.
- Read-only inspection prefers the winning claim within the current authenticated session binding. If another preparation consumed the shared authorization, inspection reports that consumption without disclosing a checkout URL.
- Privacy cleanup erases encrypted evidence and revokes authorization without resetting either consumed claim.

## Validation and scope

Tests use synthetic owner/workspace/session identities, disposable databases and injected provider responses. Coverage includes authorization, concurrent claims, uncertain acknowledgements, metadata rejection, encrypted receipt binding, inspection with multiple preparations, revocation and no retry after ambiguous outcomes.

Deployment identities, incident records, approval references, authorization provisioning and operational activation instructions are maintained privately and are intentionally excluded from this document. Source publication does not authorize deployment, activation or a cart attempt.
