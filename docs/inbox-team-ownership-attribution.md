# Unified Inbox: assignment, attribution and shared channel access

Base: main `2a8f3c52dfb88ff75a90e894bf599cafa96e684a`, following merged #303 and #305.

## Audit before changes

Already working and retained:

- Invitations, verified acceptance and active linked memberships from #305.
- Owner workspace authorization with a distinct authenticated actor from #303.
- Contact-scoped assignment persisted in `contacts.assigned_to`; owner/admin reassignment, member claim/release, active-assignee validation and SQL checks against concurrent changes.
- Shared free-form sends already dispatch with the workspace owner's channel credentials and the authenticated teammate's ID. The generic message table already has `sent_by_user_id`, `generated_by`, `sent_at`, and users already have `avatar_url`.
- Existing Inbox polling, contact-update sockets, channel health checks, WhatsApp windows, automation guards, native email provider path and full navigation on workspace selection.

Gaps found:

1. Mine filtered the recent 100-contact result in the browser. Older assigned contacts could be omitted. Empty Mine could show a personal-account “no channels” message.
2. Inbox channel health/WhatsApp availability/onboarding status and template picker still used the teammate's own account. The owner workspace's connected channels/library were not consistently reflected.
3. Assignment mutations wrote an old unscoped list cache key and did not publish ownership changes through the existing contact-update event. Assignment was available in the details panel; the header only displayed a tiny name.
4. Outbound sender IDs existed but were not rendered. Team responses did not include current linked profile photos/names. Email used its own message component, so chat-only changes would have missed it.
5. Native email substituted the owner as sender when no human actor was supplied, losing AI origin. Failed WhatsApp rows, manual template messages and some automated send producers lacked consistent provenance metadata.
6. `resave: true` let an older parallel response overwrite a newer session workspace selection. A concurrent acceptance test exposed this; a deterministic held-read test now covers it.

## Changes

- `GET /api/inbox?mine=true` derives the assignee exclusively from the authenticated actor, and applies both workspace and assignment predicates before recent/search limits. A supplied assignee or workspace query parameter grants nothing. All/Unread keep their existing per-row unread semantics; Mine also verifies the actor client-side.
- Recent/Mine caches are distinct and actor-scoped. Assignment optimism/rollback updates the actual recent key; successful mutations invalidate list/detail queries. Authorized assignment changes publish the existing `contact_updated` notification. Other agents also retain the existing polling fallback.
- A single assignment component replaces the details-panel picker and the header label. It uses the existing PATCH endpoint and mirrors server choices: owner/admin can reassign active linked teammates, members can claim unassigned work or release their own. The server remains authoritative. Profile photos fall back to initials; unassigned rows use a dashed neutral avatar. The header, rows and details panel share the same identity rules.
- Linked team profiles expose only names/avatars in the active workspace. Message enrichment looks up recorded sender IDs in one bounded query, requiring owner or retained same-workspace membership evidence. A foreign ID in inconsistent stored metadata cannot disclose a foreign user's profile. Removed/deleted/unresolvable authors remain neutral.
- Chat and native email show a compact sender avatar/name/time. Known `ai_brain` messages show AI; known workflow/chatbot/campaign/auto-reply/approved-asset origins show Automation. Unknown historical or externally echoed messages show Sent, without guessing from the current assignee, workspace owner or current login. Customer-facing content is unchanged.
- Generic sends, failed WhatsApp attempts, template persistence and native email preserve actual human actors. Email carries AI/generation metadata and no longer invents an owner actor for automated mail. Known automated producers set origin metadata only; their copy, guards, triggers and dispatch behavior are unchanged. External WhatsApp app echoes deliberately remain unattributed when the provider does not identify an authenticated CRM teammate.
- Read-only Inbox channel-status/availability routes and an alias of the existing deep-health handler use the authorized workspace. Responses contain status/readiness, not channel config or tokens. Account configuration routes remain account-scoped. Personal setup prompts are suppressed inside another workspace's Inbox.
- Inbox template list/send aliases reuse the existing handlers, guards and provider dispatch. Shared quick sends require an authorized CRM contact, use workspace templates/entitlements/credentials, ignore campaign/recipient override claims and cannot give ordinary members template-default management powers. Existing owner library/campaign routes remain available. Advanced template restrictions already present in the quick picker are retained.
- Read-only requests no longer resave the entire session; supported PostgreSQL/Memory stores retain expiry through `touch`. A delayed read cannot replace a newer workspace selection.
- English, Spanish and Hebrew labels cover the new controls and empty states. The mobile header gives the customer identity and actions separate rows; laptop controls stay compact. Existing unrelated Inbox content/layout is preserved.

## Preservation and scope

**No migration, backfill or dependency change.** Existing contacts, conversations, assignments, notes, messages, AI settings and channel credentials are not copied or reparented. Historical rows are not rewritten. Assignment remains contact-scoped, so its existing email sibling-thread behavior is retained.

No typing indicators, agent-presence feature, send-collision prevention, merge or deployment is included. Contact notifications reuse the established transport; cross-process delivery still uses the established polling fallback. The recent list remains bounded (default 100 contacts, maximum 500; search uses its existing cap); Mine now filters before those caps. Full pagination is not introduced.

## Validation

- **158 tests passed:** 32 focused signed-session HTTP/WebSocket/PGlite security, attribution/filter/permission, content-limiter and invitation continuation tests; 126 existing auth, contacts, Inbox, native email, Web Chat, automation, chatbot, campaign, booking and onboarding regressions.
- Separate owner/member cookies: Owner assigns Support → Support's Mine → open shared conversation; owner Mine excludes it; reassignment changes both agents' results and the existing socket event reaches both. Older assigned records survive a recent-page limit, search is assignment-scoped, and arbitrary assignee query parameters do not change actor identity.
- Shared status sees the owner's connections and excludes another tenant's tokens/connections. Personal/workspace switching replaces status and assignment data. Recorded profiles are tenant-bound, pending/inactive/unlinked grants remain non-authoritative, revocation still blocks content and SQL assignment rules remain tested.
- Actual message persistence runs for WhatsApp, SMS, Instagram, Messenger (`facebook`), Telegram, Web Chat and native email. Only provider dispatch is stubbed. The registered human send route ignores forged actor/origin fields. Workspace credentials and teammate IDs are preserved. AI email persists `ai_brain` with no invented human sender. Template library access and foreign contact/template rejection are exercised through registered routes.
- A deliberately held read response finishes after workspace selection and cannot revert it. Concurrent invitation acceptance also preserves the selected workspace.
- Headless Chromium runs the real React app with fixture HTTP responses for English, Spanish and Hebrew: owner assignment, a separate Support session/Mine, profile photo rendering, human/AI/unknown identities, and empty Mine even when channel status is false. Checks cover 1366×768 laptop and 390×844 mobile layouts, no horizontal overflow and no uncaught page errors. Screenshots were inspected, including Hebrew RTL and the mobile header. Existing development-console nested-anchor warnings and unavailable external assets were observed outside these changes.
- Production build passes. Exact-base TypeScript comparison: **97 inherited diagnostics, zero additions**; repository-wide typecheck is not globally clean.
- Production lockfile audit: **27 high, 17 moderate, 21 low, zero critical** inherited findings. Lockfile/dependencies are unchanged. Hosted CI/CodeQL results belong to the PR checks; local tests are not a substitute for those results.

## Manual release verification

Production accounts, data and channel providers were not contacted for delivery tests. Verify with real Owner and Support accounts in a review environment: assignment/reassignment across two independent browsers (and separate app instances if used), each permitted channel with approved recipients, WhatsApp template delivery/window rules and native-email thread behavior. Confirm actual stored profile photos and timezone display with the deployed session store. Browser tests used fixture responses; provider-boundary tests prove authorization/persistence, not external delivery.

An historical message without reliable sender/origin evidence remains neutral. Deleting a membership/account may remove the evidence needed to display its profile; this change deliberately avoids retroactive attribution or copying personal identity data into message content.
