# One authorized production privacy-alert transport test

Preparation only. This procedure does not authorize merge, deployment, infrastructure,
production permissions/settings changes, or sending. The staging procedure remains
staging-only. Railway app/runner identities and receiver URLs are supplied independently. The reviewed
Neon production identities below are pinned in source; runner variables cannot redirect them.

## What this verifies

The deployed production receiver must reject anonymous and incorrect Bearer tokens
with 401 and accept the correct token far enough to return `503 delivery_disabled`.
The deployed receiver remains disabled. An isolated loopback-only instance of the
same receiver validates authentication/idempotency and dispatches one fixed synthetic
notification through the existing `sendEmailDetailed` Resend transport. Recipient:
`support@whachatcrm.com`; subject: `PRODUCTION TEST — Shopify Privacy Alert`.
The body explicitly says no customer data, privacy request or action is involved.

This is an authentication and transport smoke test. It does not exercise the live
production outbox worker, a real issue, Admin reporting, customer records or erasure.
It imports no app startup, migrations, cron or deletion adapters. It never sets the
production web service's alert URL or enables its email flag. No production app
release is needed to execute the separately built reviewed runner.

## Existing durable persistence and minimum permissions

The existing `public.shopify_privacy_erasure_tasks` table is the persistence
mechanism. No new table, column, index, migration or database is created. One fixed
synthetic row is inserted **completed from birth** with `status=smoke_consumed`,
`request_kind=privacy_email_smoke`, no required checks and `next_attempt_at=infinity`.
Both existing worker claims and current-issue queries exclude completed rows. No
outbox alert, payload, customer or Shopify request is inserted. One `checks` update
stores the sanitized receipt. The row is not counted as `verified_complete`.

Fixed primary key: `8b0b231e-a197-4bda-982a-397ec42b2b0c`.
Fixed dedupe key: `production-privacy-email-once-v1`.
An acknowledged autocommit insert consumes the authorization before the provider
boundary. Concurrent runners, restarts, rebuilds and variable changes cannot consume
it again. A lost commit acknowledgment stops without sending; the committed row
still blocks replay. A local burn prevents multiple invocations in the winning
process. Resend receives a fixed idempotency key as additional protection.
There is **no retry**, even on definite rejection or uncertain acceptance.

The synthetic row is a permanent replay tombstone. Retain it and its receipt after
runner cleanup. Do not delete, reset or change its IDs to retry. Database restoration,
manual deletion or moving execution to another database can remove the guarantee;
operator recovery/retention policy must preserve this tombstone. An ambiguous send
must be reconciled with Resend, never repeated. Exactly one acceptance cannot be
guaranteed through a provider outage; the guarantee is at most one invocation.

Separate approval is required for the strictly necessary synthetic INSERT and
receipt UPDATE. Use an **existing approved restricted database login** via a secret
reference, not the app's `DATABASE_URL`. Its minimum privileges are:

- CONNECT to the existing Neon `neondb` database; USAGE on `public`.
- Read-only catalog visibility for `pg_settings`, `pg_roles` and the task primary-key metadata.
  No `pg_control_system()` or elevated monitoring role is needed.
- No SET privilege on `neon.project_id`, `neon.branch_id` or `neon.endpoint_id`.
- INSERT on task columns `id,dedupe_key,request_kind,status,completed_at,deadline_at,next_attempt_at,required_checks,checks`.
- SELECT on `id,dedupe_key,request_kind,status,completed_at`; UPDATE on `checks` only.
- No elevated role flags, database/schema CREATE, DELETE, TRUNCATE, UPDATE on status,
  other table privileges, customer reads, or role memberships granting broader access.

The runner rejects an elevated role, CREATE, DELETE, TRUNCATE and status UPDATE.
An operator must independently inspect remaining privileges and role memberships;
these checks are defense in depth, not a substitute for permission review. If this
approved login/reference or permission to inspect database identity is missing,
**stop**. Role creation/grants are production configuration changes requiring
separate approval; the operator-only SQL templates below are not an executed provisioning script. Do not fall
back to app credentials. If persistence cannot be approved, do not send.

## Supported least-privilege role provisioning (operator action only)

Neon's [role documentation](https://neon.com/docs/manage/roles#manage-roles-with-sql)
distinguishes SQL-created roles from Console/CLI/API-created roles. The latter
receive `neon_superuser` membership; ordinary SQL-created roles do not. Do not use
`neon_create_postgres_role`, the Console **Add role** control, or CLI role creation
for this runner. Do not try to repair an API-created role by revoking the protected
membership, and do not change the runner's rejection checks.

The reported API-created `privacy_smoke_once` was removed. A read-only catalog
observation on 2026-10-14 independently confirmed it is absent. The connector's
existing SQL session authenticates as `neondb_owner`, has `CREATEROLE`, and owns
`neondb` and the task table. Thus the project has the SQL authority needed to create
an ordinary role and grant these columns; inability to revoke `neon_superuser` is
not evidence that SQL role creation is unavailable. No CREATE/GRANT/password statement
was executed during this investigation. The connector's owner credential must never
be attached to the runner or used to run the test. Under the current instruction
not to use the owner role, provisioning must be handled by an explicitly authorized
operator/DBA session with role-creation and object-grant authority, not by this agent.
If a suitable non-owner provisioning account is unavailable, stop and have the DBA
resolve administrative access separately; do not substitute owner credentials.

1. Obtain separate approval for ordinary SQL role creation, the exact column grants,
   secure credential installation, and later removal of this disposable login.
   These are production permission/credential changes, not authorization to send.
2. Use a trusted private SQL client on the pinned direct Neon production endpoint,
   `neondb`. Reverify server project/branch/endpoint identity first. The operator
   must have `CREATEROLE` and grant authority for the database, schema and specified
   task columns. Check the target name is absent; never reuse or alter an unknown
   existing role. Do not grant role memberships, ownership, `ALL`, table-wide
   SELECT/INSERT/UPDATE, predefined read/write/monitor roles, or identity-parameter
   SET/ALTER SYSTEM privileges.
3. Create a disabled ordinary SQL role and grant only the required columns in one
   transaction. This SQL contains no password and creates no table or function:

```sql
BEGIN;
CREATE ROLE privacy_smoke_once NOLOGIN NOINHERIT
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  CONNECTION LIMIT 1;
GRANT CONNECT ON DATABASE neondb TO privacy_smoke_once;
GRANT USAGE ON SCHEMA public TO privacy_smoke_once;
GRANT SELECT (id,dedupe_key,request_kind,status,completed_at),
      INSERT (id,dedupe_key,request_kind,status,completed_at,deadline_at,
              next_attempt_at,required_checks,checks),
      UPDATE (checks)
  ON TABLE public.shopify_privacy_erasure_tasks TO privacy_smoke_once;
COMMIT;
```

4. Inspect the permission query below before enabling login: the only expected
   pre-login blocker is `unsafe_role_attributes` because `rolcanlogin=false`.
   `NOINHERIT` alone is insufficient: no membership, including transitive membership,
   is permitted. Effective privileges include PUBLIC and inherited/default grants.
   Role-local REVOKE cannot subtract privileges granted to PUBLIC. If PUBLIC,
   default ACLs, an event trigger or any other policy produces extra access, stop.
   Do not alter PUBLIC/default grants or other application permissions under this
   procedure; a DBA must review that separately. Review access in any other database
   on this branch too; the query audits application objects only in the current DB.
5. Generate the password in the operator's secure secret manager (at least 128 bits
   of entropy). Use a vetted private SQL client with secret injection, SQL-literal
   escaping, and credential redaction/history controls to execute the following
   **template**, supplying a real approved UTC expiry after the execution window.
   Never execute the placeholder literally. Do not put the password into connector
   tool arguments, command-line arguments, shell history, PRs, files, query history
   or unredacted logs. Neon documents plaintext input for SQL password provisioning;
   do not assume a precomputed hash or a management-API reset is an equivalent safe
   path. If the client/logging path cannot protect it, stop for operator remediation.

```sql
ALTER ROLE privacy_smoke_once LOGIN
  PASSWORD '<securely-injected-random-secret>'
  VALID UNTIL '<approved-UTC-expiry>';
```

6. Store the credential/connection URL directly in the approved secure runner-only
   reference, with the pinned direct hostname, `/neondb`, and verified TLS. Set
   `PRIVACY_SMOKE_DATABASE_ROLE=privacy_smoke_once`. Reconnect **as that role**;
   do not validate using SET ROLE or the owner login. Run the read-only audit below
   and the runner's read-only Neon identity/role/PK preflight without consuming the
   guard or invoking the smoke entrypoint. Require no blockers and all minimum
   privileges, matching current/session users, visible non-settable identity GUCs,
   and the existing primary key. If any permission is missing, stop; never broaden
   the grants to work around a failure.
7. After the separately approved test and runner/reference removal, the authorized
   DBA removes the disposable login. Revoke only its explicit column/database/schema
   grants and drop that login through SQL; do not use DROP OWNED or CASCADE, and do
   not delete the fixed task tombstone. Its receipt belongs to the existing table,
   not to this login. Confirm role absence through a read-only catalog query.

### Read-only permission audit

Run on the pinned `neondb` branch. This inspects only catalogs/effective ACLs, never
merchant rows, passwords or `pg_authid`. After login is enabled require
`role_exists=true`, `blockers=[]`, and `basic_grants_present=true`. The basic flag
is a quick check; the blockers include every required SELECT/INSERT/UPDATE column
and forbidden grant options. Also run the existing runner's identity/role/PK checks. This audit
also flags callable non-system routines that could indirectly access merchant data;
review any such access before approving the runner. Ordinary system catalog access
and PUBLIC CONNECT/TEMP defaults are not a grant to touch merchant data: the runner
never uses temp objects, and DBA review of other databases remains required.

```sql
WITH RECURSIVE
r AS (
  SELECT oid, rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
         rolreplication, rolbypassrls, rolinherit, rolconnlimit
  FROM pg_catalog.pg_roles WHERE rolname = 'privacy_smoke_once'
), memberships(roleid) AS (
  SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN r ON m.member = r.oid
  UNION
  SELECT m.roleid FROM pg_catalog.pg_auth_members m JOIN memberships a ON m.member = a.roleid
), columns AS (
  SELECT c.oid, n.nspname, c.relname, a.attnum, a.attname,
         n.nspname = 'public' AND c.relname = 'shopify_privacy_erasure_tasks' AS allowed_table
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
  WHERE c.relkind IN ('r','p','v','m','f') AND a.attnum > 0 AND NOT a.attisdropped
    AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
), violations(issue, object_name) AS (
  SELECT 'role_missing', 'privacy_smoke_once' WHERE NOT EXISTS (SELECT 1 FROM r)
  UNION ALL
  SELECT 'unsafe_role_attributes', rolname FROM r
    WHERE NOT rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit OR rolconnlimit <> 1
  UNION ALL
  SELECT 'missing_database_connect', 'neondb' FROM r WHERE NOT has_database_privilege(r.oid,'neondb','CONNECT')
  UNION ALL
  SELECT 'missing_schema_usage', 'public' FROM r WHERE NOT has_schema_privilege(r.oid,'public','USAGE')
  UNION ALL
  SELECT 'missing_required_column_grant', required.column_name || ':' || required.privilege
    FROM r CROSS JOIN (VALUES
      ('id','SELECT'),('dedupe_key','SELECT'),('request_kind','SELECT'),('status','SELECT'),('completed_at','SELECT'),
      ('id','INSERT'),('dedupe_key','INSERT'),('request_kind','INSERT'),('status','INSERT'),('completed_at','INSERT'),
      ('deadline_at','INSERT'),('next_attempt_at','INSERT'),('required_checks','INSERT'),('checks','INSERT'),('checks','UPDATE')
    ) AS required(column_name,privilege)
    WHERE NOT has_column_privilege(r.oid,'public.shopify_privacy_erasure_tasks',required.column_name,required.privilege)
  UNION ALL
  SELECT 'role_membership', p.rolname FROM memberships m JOIN pg_catalog.pg_roles p ON p.oid=m.roleid
  UNION ALL
  SELECT 'database_create', d.datname FROM r CROSS JOIN pg_catalog.pg_database d
    WHERE has_database_privilege(r.oid,d.oid,'CREATE')
  UNION ALL
  SELECT 'schema_create', n.nspname FROM r CROSS JOIN pg_catalog.pg_namespace n
    WHERE n.nspname !~ '^pg_' AND has_schema_privilege(r.oid,n.oid,'CREATE')
  UNION ALL
  SELECT 'unexpected_column_access', c.nspname || '.' || c.relname || '.' || c.attname
    FROM r CROSS JOIN columns c
    WHERE (has_column_privilege(r.oid,c.oid,c.attnum,'SELECT') AND
              NOT (c.allowed_table AND c.attname IN ('id','dedupe_key','request_kind','status','completed_at')))
       OR (has_column_privilege(r.oid,c.oid,c.attnum,'INSERT') AND
              NOT (c.allowed_table AND c.attname IN ('id','dedupe_key','request_kind','status','completed_at','deadline_at','next_attempt_at','required_checks','checks')))
       OR (has_column_privilege(r.oid,c.oid,c.attnum,'UPDATE') AND NOT (c.allowed_table AND c.attname='checks'))
       OR has_column_privilege(r.oid,c.oid,c.attnum,'REFERENCES')
       OR has_column_privilege(r.oid,c.oid,c.attnum,'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')
  UNION ALL
  SELECT 'unexpected_table_access', n.nspname || '.' || c.relname
    FROM r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND has_table_privilege(r.oid,c.oid,'DELETE,TRUNCATE,TRIGGER')
  UNION ALL
  SELECT 'sequence_access', n.nspname || '.' || c.relname
    FROM r CROSS JOIN pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='S' AND n.nspname !~ '^pg_' AND has_sequence_privilege(r.oid,c.oid,'SELECT,UPDATE,USAGE')
  UNION ALL
  SELECT 'user_routine_execute', n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM r CROSS JOIN pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND p.prorettype NOT IN ('trigger'::regtype,'event_trigger'::regtype)
      AND has_function_privilege(r.oid,p.oid,'EXECUTE')
  UNION ALL
  SELECT 'identity_parameter_write', s.name FROM r CROSS JOIN pg_catalog.pg_settings s
    WHERE s.name IN ('neon.project_id','neon.branch_id','neon.endpoint_id')
      AND has_parameter_privilege(r.oid,s.name,'SET,ALTER SYSTEM')
  UNION ALL
  SELECT 'object_ownership', n.nspname || '.' || c.relname
    FROM r JOIN pg_catalog.pg_class c ON c.relowner=r.oid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  UNION ALL
  SELECT 'database_ownership', d.datname FROM r JOIN pg_catalog.pg_database d ON d.datdba=r.oid
  UNION ALL
  SELECT 'schema_ownership', n.nspname FROM r JOIN pg_catalog.pg_namespace n ON n.nspowner=r.oid
)
SELECT EXISTS(SELECT 1 FROM r) AS role_exists,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('issue',issue,'object',object_name) ORDER BY issue,object_name)
                 FROM violations),'[]'::jsonb) AS blockers,
       (SELECT has_database_privilege(oid,'neondb','CONNECT') AND has_schema_privilege(oid,'public','USAGE')
         AND has_column_privilege(oid,'public.shopify_privacy_erasure_tasks','id','SELECT')
         AND has_column_privilege(oid,'public.shopify_privacy_erasure_tasks','checks','UPDATE') FROM r) AS basic_grants_present;
```

## Runner-only configuration (after separate approval)

### Independently verified Neon production identity

On 2026-10-14, authenticated Neon control-plane reads confirmed:

- Project: `fancy-truth-71283112`.
- Production branch: `br-lucky-salad-anatrtle` (named `production`).
- Database: `neondb` (owner `neondb_owner`, which the runner must never use).
- Read-write endpoint: `ep-polished-boat-an973ovy`.
- Direct hostname: `ep-polished-boat-an973ovy.c-6.us-east-1.aws.neon.tech`.

A separately routed, read-only query of server catalog metadata on those explicit
project/branch/endpoint/database IDs returned the same `neon.project_id`,
`neon.branch_id` and `neon.endpoint_id`. Project/branch settings were `postmaster`;
the deployed endpoint setting was `superuser`. No merchant tables, rows or credentials
were read. These non-secret identities are pinned in reviewed source. This metadata
check used the connector's existing access; it does **not** establish that a suitable
least-privilege runner login exists or has approved permissions.

The runtime requires a direct connection and forces TLS certificate/hostname
validation (`rejectUnauthorized: true` with the pinned SNI hostname). Only optional
`sslmode=verify-full` is accepted in the URL; it is removed before constructing the
Pool so pg URL options cannot override the explicit verified TLS configuration.
Pooled hosts, other databases, role substitutions, SSL downgrades and URL options
are rejected. Hostname is a transport constraint, never proof of tenant identity.

On the **same pinned database session** used for the guard and receipt writes, the
runner validates `current_database()=neondb`, schema `public`, and current/session
user both equal the independently approved restricted login. It requires registered
`pg_settings` entries to match the pinned Neon project/branch/endpoint IDs. Project
and branch must be postmaster-only; endpoint must be postmaster/superuser-only; the
login must have no SET privilege for any of them. Merely setting custom GUC placeholders
cannot satisfy this check. Missing, empty, mutable, inaccessible or mismatched
metadata is a hard stop; no hostname-only or `pg_control_system()` fallback exists.
The pinned connection does not reconnect before consuming authorization.

Neon's [server implementation](https://github.com/neondatabase/neon/blob/main/pgxn/neon/libpagestore.c)
defines these registered identity settings. Their visibility/context is checked on
the deployed server rather than assumed from the latest source. Reverify the
control-plane manifest and restricted-role access before execution. A changed
endpoint requires a reviewed source update; never automatically repin from the
connection under test. Independently verify Railway app/runner identities and the
receiver domain separately. Sender/key authorization remains unverified.

Prepare one domainless service named `production-privacy-email-once`, pinned to the
reviewed commit and `/railway/privacy-production-smoke.json`, repository root `/`.
One replica, restart policy Never, no cron, public/private domain, healthcheck,
pre-deploy command, volume, app start command or automatic GitHub deploys. The
Dockerfile starts only this script; the receiver binds to `127.0.0.1`. The two-minute
watchdog bounds execution. Keep authorization absent while reviewing setup.

All variables below are service-scoped. Never set shared or web app variables.
Secret values must be existing secure Railway references; never copy their plaintext
into commands, logs, PRs or source. Do not attach the app's full environment.

| Variable | Required value |
| --- | --- |
| `PRIVACY_SMOKE_PROJECT_ID`, `PRIVACY_SMOKE_ENVIRONMENT_ID` | Independently verified production UUIDs |
| `PRIVACY_SMOKE_RUNNER_ID` | Literal independently verified new runner UUID; never self-reference the runtime ID |
| `PRIVACY_SMOKE_APP_ID` | Verified existing Railway app UUID, distinct from runner |
| `PRIVACY_SMOKE_APPROVED_APP_ORIGIN` | Independently verified HTTPS production origin, e.g. `https://app.whachatcrm.com` |
| `PRIVACY_SMOKE_RECEIVER_URL` | That origin plus `/api/internal/shopify/privacy-alerts` |
| `PRIVACY_SMOKE_NEON_PROJECT_ID` | `fancy-truth-71283112`; must equal the independently verified source pin |
| `PRIVACY_SMOKE_NEON_BRANCH_ID` | `br-lucky-salad-anatrtle`; must equal the source pin |
| `PRIVACY_SMOKE_NEON_ENDPOINT_ID` | `ep-polished-boat-an973ovy`; must equal the source pin |
| `PRIVACY_SMOKE_DATABASE_NAME` | `neondb`; must equal the source pin |
| `PRIVACY_SMOKE_DATABASE_ROLE` | Independently approved existing least-privilege Neon login; never `neondb_owner` |
| `PRIVACY_SMOKE_DATABASE_URL` | Existing approved restricted Neon login reference, direct pinned host and `/neondb`, optionally `?sslmode=verify-full`; not `${{App.DATABASE_URL}}` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SHOPIFY_PRIVACY_ALERT_TOKEN` | References to existing production sending key, sender and rotated token |
| `PRIVACY_SMOKE_RESEND_VERIFY_KEY` | Existing Resend account credential permitted to GET the verified sender domain, runner-only reference |
| `PRIVACY_SMOKE_RESEND_DOMAIN_ID` | Independently verified Resend UUID for `crm.whachatcrm.com` |
| `PRIVACY_SMOKE_SENDER_APPROVAL` | `VERIFIED SENDING KEY AUTHORIZED FOR noreply@crm.whachatcrm.com`, only after operator checks key scope/domain authorization in Resend |
| `SHOPIFY_PRIVACY_ALERT_EMAIL_ENABLED` | `false` |
| `SHOPIFY_PRIVACY_S3_DELETE_ENABLED` | `0` |
| `PRIVACY_SMOKE_AUTHORIZE` | Initially absent; after execution approval: `SEND ONE PRODUCTION PRIVACY TEST EMAIL TO support@whachatcrm.com` |
| `PRIVACY_SMOKE_EXPIRES_AT` | Initially absent; approved explicit UTC ISO timestamp within the next hour, allowing build time |

Railway supplies runtime identities; do not override them. Sender is strictly
`WhachatCRM <noreply@crm.whachatcrm.com>` or the bare address. Before sending, a
read-only Resend domain lookup must report the matching ID/name, `verified` status
and sending capability `enabled`. The domain lookup does not prove which domain a
sending-only key is authorized for: the operator's independent key-scope review
is mandatory. If the inspection credential or scope evidence is absent, stop.
Do not generate a new key as a fallback. The eventual send remains the definitive
provider check of the sending key's permission.

Do not configure `DATABASE_URL`, Admin/session secrets, Shopify API/request secrets,
evidence credentials or S3 deletion credentials. No Admin login or real records
are needed. Do not configure ongoing alert delivery on the production app.

## Exact execution and cleanup plan

1. Review/approve this PR and CI results. Independently verify the non-secret target
   manifest, sender/key authorization and restricted role. Approve merge separately
   if desired; runner deployment can pin the reviewed commit without app deployment.
2. Obtain separate approval to create/configure/deploy this disposable runner,
   reference only the listed secrets, insert the fixed completed synthetic guard,
   update its receipt, and retain that guard permanently. If any minimum setup is
   missing, stop and report it before executing.
3. Prepare the domainless service with authorization absent. Review its actual
   Railway source SHA, identities, restart policy, replica count, lack of domains,
   cron and automatic deploys, and secret-reference names without printing values.
4. Obtain approval for the concrete reviewed setup and one bounded send window.
   Set only runner authorization/expiry. Deploy it **once**. Start command:
   `node dist/privacy-production-smoke.cjs --send-one-production-test`.
5. The runtime validates configuration, restricted role and database identity,
   probes production authentication/disabled delivery, verifies the Resend domain,
   checks its private receiver, consumes the guard, then invokes Resend once.
   It verifies private replay adds no provider call and probes production remains
   disabled. Any failure is terminal. Never retry an attempted or ambiguous send.
6. Capture sanitized `resendAccepted`, genuine UUID `providerMessageId`,
   `providerCalls: 1`, receipt result and production-disabled checks. A 2xx Resend
   response with a valid message ID establishes provider acceptance, not inbox
   receipt. Reconcile lost acknowledgments in the existing Resend account.
7. Remove runner authorization and all secret references, then delete the temporary
   service, including on failure. Verify deletion in Railway. Retain only the fixed
   synthetic database tombstone/receipt and sanitized execution evidence. No database
   deletion is part of cleanup. Keep production automatic privacy emails disabled.

## Validation

`node --import tsx --test tests/shopify-privacy-production-smoke.test.ts` tests identity,
authorization/expiry, verified TLS, wrong/missing/spoofable Neon identity metadata,
database/login mismatches, dangerous configuration, disabled authenticated receiver,
live domain-verification failures, restricted role, PostgreSQL uniqueness races,
lost commit acknowledgment, restarts and provider rejection/timeout. CI uses the
explicit disposable localhost `whachat_shopify_test` database; local fallback uses
embedded PostgreSQL (PGlite). All external HTTP/provider calls are mocked.
The existing privacy receiver/transport suites continue to cover genuine-ID parsing
and authenticated HTTP behavior. CI also compiles the standalone runner bundle.
No test accesses Railway, Resend or production data.
