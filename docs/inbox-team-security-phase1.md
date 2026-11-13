# Unified Inbox team security — Phase 1

Based on main `2a7d75adf3ea0092fd9cc45c93a859ae19c49d37`. This change secures the existing session, membership, contact-edit and presence paths. It adds no collaboration UI, typing features, message collision protection, attribution UI or new AI handoff policy.

## Identity and workspace access

- The signed-in Passport user stays the actor. `req.user` is never replaced by the workspace owner. Internal channel credentials/data use a separately authorized `workspaceUserId`; human sends and notes retain the actual actor.
- A foreign workspace requires an existing `team_members` row with the exact `ownerId`, linked `memberId`, `status=active` and role `admin` or `member`. Email matches, pending/inactive rows, unlinked invitations, arbitrary role strings and deleted accounts confer no access.
- A fresh teammate with exactly one active workspace and no owned Inbox contacts, legacy chats, team, connected channel or active integration defaults to that shared workspace. The choice is saved in the server session. Established owners and ambiguous/multiple memberships retain the personal workspace by default.
- `GET /api/inbox/workspaces` returns only authorized workspace IDs. `POST /api/inbox/workspace` accepts a workspace selector, verifies the authenticated actor's current grant and saves the selection in the server session. It rejects cross-origin browser selection. The selector is never an authority claim; it cannot grant access. Its response requires a full reload so existing caches and sockets are replaced. No workspace-switcher UI is added in this phase.
- Selected membership is revalidated on each protected request. Revocation returns 403 rather than silently opening another workspace. The selection endpoint can still return the account to its personal workspace after revocation.
- Inbox list/search/activity, contact read/search/details/timeline, notes, ordinary contact edits/sends, conversation read/status/read-mark/AI-control, media and native email content reads share this context. Existing integration connection/settings, billing, team administration and other unconverted feature APIs retain account-owner scoping.
- Existing owner access remains valid, including owners who are also members of another team. No channel integration credentials are exposed to teammates.

## WebSockets

- Upgrade authentication reuses the same Express session middleware/store, signed cookie and Passport deserializer as HTTP. `setupPresenceServer` is installed after `setupAuth`.
- Browser Origin must match the configured application origin in production (same request host also works in development). Missing, null or foreign origins fail closed. Presence frames are limited to 4 KiB.
- Existing `auth` frames remain compatible, but do not authenticate anyone. Names come from the session user; mismatching user/workspace claims close the connection.
- The connection's validated session workspace is its notification subscription. Current conversation IDs and legacy chat IDs must belong to it before joining; typing/leave actions cannot address an unjoined room. Presence fan-out is scoped by workspace as well as room.
- Every socket action and notification delivery reloads the session and rechecks account/membership. Removing the Passport identity cannot leave the old user attached to the socket. Owner membership updates/removal close affected local sockets; periodic/session checks and send-time validation cover other processes.
- Only existing Inbox event types fan out to selected workspace teammates. Unrelated account notifications remain private to their account holder.
- Existing presence protocol is retained. This is not a delivery guarantee or a cross-process presence engine. Redis fan-out, typing expiry/UI and duplicate replies remain outside this phase.

## Contact PATCH and assignment

The browser PATCH route uses a strict allowlist of CRM-editable fields. It rejects attempts to change owner/user ID, record ID, immutable provider IDs, source/provenance or server-recorded actor/timestamp fields. Internal integration writes continue through existing storage APIs.

- Owners/admins may assign only the owner or a linked active teammate, or unassign.
- Members may claim unassigned work for themselves, retain their own assignment, or release their own work. They cannot assign others or take another teammate's assignment.
- The contact SQL UPDATE always includes workspace scope and rechecks the actor, active assignee and assignment permission. A revocation or competing assignment after request authorization cannot bypass these predicates.
- Existing optimistic identity-edit checks and Shopify synchronization restrictions remain. Follow-up cleanup runs only after a successful authorized update.
- Notes use the actual actor and require matching workspace, current contact and note ID. Authors can edit/delete their own notes; owners/admins can manage notes in their workspace. Revoked authors cannot retain access through creator identity.
- Read paths exclude inconsistent foreign conversation/message child rows; this does not reparent or repair historical data.

## Invitation flow verified before modification

Inspection covered the team routes, Settings invitation UI, auth signup/login/verification and all server references to `team_members`, `memberId` and `joinedAt`. The existing invite endpoint creates a pending row; there is no discovered acceptance handler that links it to an authenticated user's ID. Settings displays an invitation-success toast, but the endpoint does not currently complete delivery/acceptance.

This PR does **not** invent an acceptance flow or auto-accept by email/login. It preserves pending creation, ignores client-supplied owner/member/status claims and validates the existing role/status values. Tests prove a pending invitation to an existing account does not grant access, and active-but-unlinked rows do not grant access either.

**Remaining onboarding limitation:** new invitations require a separately reviewed delivery/acceptance implementation before ordinary new invitees can become linked active teammates. This Phase 1 access works for existing, correctly linked active memberships. No production membership rows are changed by this PR.

## Validation

`tests/inbox-team-security.test.ts` runs actual registered Express routes, production signed-session middleware and Passport serialization/deserialization, actual WebSocket connections, and real storage queries against isolated PGlite (PostgreSQL compiled to WASM). Only test login/bootstrap and the explicit send-dispatch assertion are fixture-specific; the send assertion stubs the provider boundary. No production database or messaging provider is contacted.

Coverage includes owners/admins/members/outsiders; pending/inactive/unlinked invitations; explicit selection and forged workspace claims; malformed contact ownership edits; assignment permissions and SQL revocation/competing-claim checks; note authorship/contact binding; foreign child rows; native email reads; anonymous/forged-cookie/cross-origin upgrades; forged identities/names, unauthorized room/typing actions; private notification scoping; removed session identity; membership revocation and logout.

Run:

```sh
node --import tsx --test tests/inbox-team-security.test.ts
```

The dedicated CI workflow also runs existing auth/rate-limit, contact privacy/identity, automation-pause, Inbox, Web Chat and native email regression files, compares TypeScript diagnostics against the exact PR base and runs the production build. Local validation: **92 tests passed**, including the session-backed security suite. Repository-wide TypeScript is not globally clean: the verified base has 97 diagnostics; this change adds none.

Security dependency checks identified relevant inherited transport advisories. The PR updates `ws` from 8.19.0 to 8.23.0 (memory disclosure / fragmented-frame exhaustion) and the locked transitive `proxy-addr` from 2.0.7 to 2.0.8 (critical IP-spoofing advisory). These are the only dependency resolutions changed. A like-for-like `npm audit --package-lock-only --omit=dev` comparison reports 33 affected packages on the base versus 31 on this branch: critical 1 → 0, high 12 → 11. Remaining 11 high, 13 moderate and 7 low findings belong to unchanged dependencies and are not represented as resolved by this PR. Full dependency remediation remains separate work.

Tests use an isolated PostgreSQL engine and actual request/session behavior, but do not claim multi-server deployment or live provider/browser acceptance. No migration, backfill, production settings, merge or deployment is included. Phase 2 remains duplicate-send prevention, teammate attribution and safe AI handoff.
