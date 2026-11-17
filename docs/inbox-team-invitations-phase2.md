# Unified Inbox Phase 2: invitations and shared access

Base: production merge of PR #303, `fa0a6b9814427cfff5ac63c11421b474953bdc80`.

## Existing flow and gaps

The existing `team_members` table, `/api/team` CRUD, Settings form, subscription seat limits, Passport authentication, signup/email verification and owner/admin/member roles are retained. PR #303 already authorizes linked active members against the owner's Inbox data, preserves actual send/note actors, validates assignments and closes/revalidates sockets when access is revoked.

Before this PR, inviting only inserted an unlinked pending row and showed a success toast. No invitation email, token, acceptance handler or account linkage existed. Existing multiple-workspace selection was API-only. The signup verification screens always continued to the personal Inbox, losing an invitation return path.

## Completed flow

1. The owner uses the existing Settings form and `POST /api/team`. Input email is trimmed, validated and normalized; only existing `member`/`admin` roles are accepted. Client-supplied owner/member/status fields do not grant anything.
2. Creation locks the existing owner row before checking memberships and seats. This serializes concurrent invitations for an owner without rewriting legacy rows or creating another membership system. Self-invites, duplicate normalized emails and exhausted plans are rejected.
3. The existing transactional email transport sends a review link. The response distinguishes accepted mail delivery from failure; failed delivery leaves a pending row with a Resend control. Legacy pending rows can also be resent.
4. The link's fragment contains `<membership id>.<HMAC-SHA256 signature>`. The domain-separated signature binds the exact row, owner/workspace, email, role and issue timestamp. It expires after seven days. `SESSION_SECRET` is required; rotating it invalidates outstanding invitations. Tokens are never returned by the API or placed in API URL paths/query strings. Invitation mail logs suppress payloads and raw provider errors.
5. The invitation page supports existing login and new signup through the existing auth system. A narrowly validated invitation return path survives email verification in the original signup tab. A verification tab with the same session storage can also continue. If verification happens in another browser/device, reopen the original invitation after signing in.
6. Preview and acceptance require a live verified account with the exact normalized invited email. The page displays the authorized workspace name and role before an explicit acceptance click. Anonymous users, wrong identities, deleted accounts, expired/revoked/used links and conflicting memberships fail closed.
7. Acceptance locks the owner, invitation and actor rows, revalidates the signature and identity, then atomically changes only the pending row's `memberId`, `status` and `joinedAt`. Concurrent attempts yield one success. Neither a supplied workspace ID nor role can alter the grant. The server selects that row's owner workspace in the session; a full navigation replaces caches and sockets.
8. A small Inbox workspace selector reuses PR #303's authorization/selection APIs. It lets established owners/multiple-workspace accounts return to the shared Inbox after another login and recover to their personal context after revocation. Workspace metadata is limited to authorized choices. Metadata/selection use the existing actor-based content limiter.
9. Existing owner removal/deactivation and role updates remain authoritative. The pending row cannot be activated through owner PATCH before acceptance; a linked or revoked row cannot be reset to pending to reuse a link. Resend rotates the issue timestamp and invalidates the previous email. Shared Settings team management controls are shown only to the owner.

The invitation endpoints enforce same-origin browser mutations and a shared 30-attempt/hour budget per authenticated actor (IP for anonymous requests). The existing Express limiter is process-local; database locks and token state enforce correctness across processes. Repeated preview/accept/resend/create attempts count toward that budget.

## Migration and preservation

**No migration, backfill, new invitation table or unique index is required.** Existing random membership IDs and `invitedAt`, `joinedAt`, `memberId`, `status`, `ownerId`, `email` and `role` provide the required state. Creation and acceptance serialize through the existing owner row. Conflicting historical rows are rejected rather than silently merged; the owner can remove unwanted rows and reinvite.

No contacts, conversations, messages, notes, assignments, channel credentials, AI settings, automation settings or integration configurations are copied/reparented. Workspaces remain the existing owner `users.id` context. Signup still creates a login through existing auth; acceptance does not provision a second business workspace. Established linked active memberships continue to work.

## Validation

- **107 passing tests**: 22 focused session-backed HTTP/WebSocket/PGlite security, limiter and continuation/locale tests, plus 85 existing auth, verification, ownership, assignment, contact, Inbox, Web Chat and native-email regressions.
- Account A owns the fixture workspace. Account B is invited before registration, initially unverified, then verified and accepted through the real invitation route using its separate signed Passport session. B reads A's actual Inbox/notes, authors and removes its own note, and is denied foreign tenant data/assignments/team administration. The same account can later accept an admin invitation. Existing-account and linked-member compatibility are also covered.
- A stub at the messaging-provider boundary verifies all seven existing channels (`whatsapp`, `sms`, `instagram`, `facebook`/Messenger, `telegram`, `webchat`, `email`) receive A's workspace ID and B's actual actor ID. This verifies authorization/dispatch context, not live delivery.
- Includes wrong-email/unverified/anonymous/cross-origin rejection, forged/transplanted/expired/reused tokens, concurrent acceptance, duplicate email/seat races, conflicting legacy memberships, delivery failure/resend rotation, role restrictions, removal/deactivation and real 429/Retry-After with separate actor budgets. Existing contacts/messages/notes/assignments are compared before/after invitation operations.
- Headless Chromium checks at 390×844 and 1440×900 cover English, Spanish and Hebrew RTL review/acceptance, no horizontal overflow, explicit click and full navigation. Additional signed-out→login→invitation continuation check. Browser HTTP boundaries are fixtures; production React screens are exercised. Screenshots were visually inspected.
- Production build passes. Exact-base TypeScript comparison retains **97 inherited diagnostics, zero additions**. Global typecheck is not clean on main.
- Lockfile-only production dependency audit reports **26 high, 17 moderate, 25 low, zero critical** findings. Dependencies/lockfile are unchanged, so these are inherited rather than introduced or remediated by this PR.
- Dedicated Inbox security CI now includes invitation/continuation changes and existing verification regressions. See PR checks for hosted CodeQL results.

Reproduce core checks with the synthetic CI environment in `.github/workflows/inbox-team-security.yml`:

```sh
node --import tsx --test tests/inbox-team-security.test.ts tests/inbox-content-rate-limit.test.ts tests/team-invitation-return.test.ts
TYPECHECK_BASE_SHA=fa0a6b9814427cfff5ac63c11421b474953bdc80 node scripts/check-types-against-base.mjs
npm run build
npm audit --package-lock-only --omit=dev
```

## Manual verification before release

No production users, database or messaging provider was modified. Verify actual invitation delivery/spam placement and new-account signup/Turnstile/email-verification across mail clients using two real accounts in a review environment with its existing `APP_URL`, `SESSION_SECRET` and mail credentials. Confirm shared messages, notes, permitted assignments and owner removal across two independent browsers; exercise each connected provider with approved test recipients. Fixture sends do not prove live WhatsApp/SMS/Instagram/Messenger/Telegram/Web Chat/Email delivery or multi-server socket propagation.

Integration/billing/AI configuration and unconverted auxiliary feature APIs retain their existing account-owner scope from #303. This PR does not change that policy or expose owner integration secrets. Workspace switching applies to the shared Inbox context; it does not make every account settings screen a shared workspace settings screen.

No typing indicators, agent presence features, duplicate-reply prevention, merge or deployment is included.
