# Shopify pilot: protected read-only Actions preview

This is a separate **preview-only** prerequisite to PR #301. It reuses the reviewed `previewIdentity.ts` entry point and extracts #301's read-only inspection/proposal functions into `identityPreview.ts`. It does not include `reconcile`, its apply transaction, the runtime phone-sync fix, deletion changes, or any runtime route/startup integration. No application or dependency manifests change. PR #301's writer remains unmerged and unexecuted; a later rebase should reuse this extracted reader rather than maintain two copies.

## Make code available on main without activating reconciliation

GitHub must have the dispatch workflow on the default branch before it can be used normally. The existing environment permits only `main`, so do not dispatch a feature branch, relax that policy, or check out PR code from a secret-bearing job. Review and separately approve this preview-only PR for `main` first. It adds no reconciliation apply capability.

**A main merge is not automatically a no-deploy operation.** Read-only inspection of the production Lead-Flow-Manager Railway service found a `main` repository source and no configured build watch-path exclusion. An operator-only diff can therefore still trigger an automatic Railway deployment. Before any merge, the owner must establish a separately approved no-deploy merge procedure (for example, an authorized temporary auto-deploy pause) and verify that this merge will not release the service. No Railway configuration change, merge, deployment or workflow dispatch is authorized or performed by this PR. Do not rely on an undocumented commit-message skip token. If the no-deploy condition cannot be established, leave this PR unmerged.

## Configure the existing environment securely

Repository Settings → Environments → **shopify-pilot-operator**:

1. Keep branch restriction **main only** and administrator protection bypass disabled. Require an authorized reviewer before secret-bearing jobs start; enable prevention of self-review where available. Confirm main's normal code-review protection applies. These are setup prerequisites, not workflow assumptions to bypass. No secrets have been configured by this work.
2. Add these four **environment secrets**, never repository variables, dispatch inputs, issue comments or committed files:

| Environment secret | Secure source |
| --- | --- |
| `PILOT_IDENTITY_READ_ONLY_DATABASE_URL` | Existing approved Neon production read-only role connection from the organization's credential store / Neon Connect for that exact role, project `fancy-truth-71283112`, branch `production` (`br-lucky-salad-anatrtle`), correct database. Never choose the owner/application role or copy Railway's read-write `DATABASE_URL`. Verify the role with the database administrator. If a dedicated approved read-only role is not available, stop for separate DBA provisioning approval; this PR creates no role, grant or credential. |
| `SHOPIFY_API_SECRET` | The **existing current production Shopify app privacy-check key** from its authorized secret manager/custodian. It must match the key that generated production privacy tombstones. Do not generate, rotate, unseal or substitute a key. Railway OAuth only lists names; a sealed value cannot be retrieved through it. If the original secure source is unavailable, stop. |
| `PILOT_IDENTITY_CANONICAL_CONTACT_ID` | The exact previously reviewed Shopify-linked contact A, obtained privately from the authorized CRM/operator record. |
| `PILOT_IDENTITY_SOURCE_CONTACT_ID` | The exact previously reviewed same-number WhatsApp contact B, obtained privately from the authorized CRM/operator record. |

Use the GitHub environment secret editor or an already authorized secure secret-manager integration. Do not paste values in chat, use shell tracing, echo them, put them in shell command arguments/history, or capture screenshots of them. Configuring these environment secrets does not change production Railway variables.

### Read-only role requirements

For the proposed temporary `shopify_pilot_preview_ro` role, see the [DBA-review SQL, verification and revocation plan](operator/shopify-preview-role.md). It leaves the existing preflight role untouched. Provisioning and credential issuance require separate approval; none has been executed in production.

The script verifies TLS to a Neon host and rejects a writable role **before** inspecting the pair. The session must use the connection's own role, with no superuser, role/database creation, replication, RLS bypass, database/schema/object ownership or schema creation rights. Neither it nor any reachable role (including non-inherited switchable membership) may have table/column writes or sequence mutation/use privileges. It must have schema usage and SELECT on all public tables/views needed for a complete reference inventory; missing reads fail rather than silently hiding references through `information_schema`. Enabled public-table row-level security also blocks the run because a filtered scan cannot establish complete reference coverage; do not disable RLS or grant bypass privileges to make the preview pass. Existing catalog-read access is used to check this. No privileges are granted by the script. Both this check and the pair inspection use explicit read-only transactions, with bounded statement/connect/job timeouts.

The requirement is a genuinely dedicated read-only role, not a read-write URL with a read-only session option. The workflow has **no** fallback to `DATABASE_URL`, Neon owner credentials, Railway credentials, the application HMAC consent key, or provider access tokens. A wrong privacy key cannot be validated cryptographically from its name: the custodian must supply the current authoritative key from its existing secure source.

The connection URL is never forwarded to the `pg` connection-string parser. Only validated hostname, port, decoded user/password/database and fixed certificate-verifying TLS options are passed as individual fields. The only supported query option is a single `sslmode=require` or `sslmode=verify-full` hint; both use mandatory certificate and hostname verification. Any other option (including `ssl`, `host`, `hostaddr`, certificate paths, `options`, mixed-case/encoded override keys or duplicate hints) fails closed rather than overriding or being silently discarded. Obtain a compatible binding from the authorized custodian if its URL contains unsupported options; do not weaken another required security policy merely to make the preview pass.

## Later authorized preview run — not part of this PR preparation

After separately approved no-deploy merge and environment setup, an authorized operator may choose Actions → **Shopify pilot read-only identity preview** → Run workflow → **main**. Review the actual dispatched main SHA before approving the environment gate. There are no contact/SQL/ref inputs. The job explicitly requires manual dispatch on `refs/heads/main`, checks out that dispatched commit with checkout credentials disabled, and has only `contents: read`; no write token, OIDC, deployment, remote shell or provider credentials are supplied. Secret bindings exist only on the final Node step, after dependency installation with lifecycle scripts disabled.

The only preview result is JSON containing:

- `digest`: SHA-256 approval digest, or null when the preview cannot complete.
- `blockers`: fixed codes, with reference-specific private details removed. Restrictions/pause, missing bindings, write capability, incomplete schema/read access, ambiguous identity and privacy failures prevent a successful run.
- `references`: schema table/column names and counts only. No per-row hashes, contact patches, IDs, phone, customer identifiers, provider IDs or raw database records.

There are no artifacts, step summaries, cached results or downstream workflow outputs. Missing/invalid bindings or a failed privilege/privacy/identity check produce a fixed allowlisted blocker code (or `preview_unavailable` for an unclassified failure) with a nonzero exit; inspect the binding/access issue privately rather than logging the underlying database error. A completed inspection with blockers prints sanitized blockers and also fails. The aggregate `preview_unavailable` deliberately does not disclose sensitive provider diagnostics. Retain only the sanitized result in the private approval record. Even a clean digest is **not** permission to reconcile, merge/deploy #301, grant consent or send messages; later state drift requires another preview.

## Offline validation

The separate PR-validation workflow has no protected environment and no production secrets. It runs offline fixtures for read-only role rejection (table/column grants, role switching, ownership and incomplete reads), output redaction, absent bindings, absence of an apply import/function, and workflow policy. Local validation also uses actionlint 1.7.7 and Zizmor 1.32.0 in auditor/offline mode. This is validation of the workflow and read-only guards, not a production preview or a repetition of accepted Shopify/Meta/automation acceptance tests.
