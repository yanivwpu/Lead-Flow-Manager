# WhatsApp CRM Web Application (SaaS Platform)

## Overview
A multi-tenant WhatsApp-first CRM SaaS platform. Each customer connects their own Twilio account and WhatsApp Business number. Built as a Progressive Web App (PWA) with offline support, installable on mobile devices, and push/email notification capabilities.

## Current State
The application is a full multi-tenant SaaS implementation with:
- **Customer-Owned Twilio**: Each workspace connects their own Twilio account
- **Secure Credentials**: Twilio Auth Tokens encrypted at rest (AES-256-GCM)
- **Gated Access**: Users must connect Twilio before sending/receiving messages
- **Webhook Routing**: Incoming messages routed by Account SID + phone number
- Real PostgreSQL database for data persistence
- Session-based authentication with Passport.js
- Complete CRM functionality for chat management
- Notification system for follow-up reminders (push & email)
- PWA capabilities (installable, offline-first)

## Recent Changes (April 17, 2026) — Outbound Media Sending (Images, PDF, Audio, Video)

### Overview
Users can now attach and send media files (images, PDFs, audio clips, video) from the Unified Inbox composer. Files are stored permanently in Replit Object Storage and served via a public HTTPS URL that Twilio and Meta can fetch directly.

### Supported file types and limits

| MIME type | Media type | Max size |
|-----------|------------|----------|
| image/jpeg, image/png, image/webp | image | 16 MB |
| application/pdf | document | 16 MB |
| audio/mpeg, audio/m4a, audio/ogg | audio | 16 MB |
| video/mp4 | video | 16 MB |

Extension is derived from the MIME type — never from the original filename — to prevent extension spoofing.

### Where files are stored

**Production (Replit Object Storage):** Files land at `.private/uploads/<timestamp>-<random>.<ext>` inside the GCS bucket identified by `PRIVATE_OBJECT_DIR`. They are served through the existing Express `/objects/*` proxy route — **no auth required** so Twilio and Meta can fetch the URL freely. Files are permanent and survive restarts and redeploys.

**Local dev fallback:** When `PRIVATE_OBJECT_DIR` is not set (bare Node.js without the Replit sidecar), files are written to `{cwd}/uploads/` and served from `/uploads/<filename>`. These URLs only work on the local machine and do not survive a restart. A `console.warn` fires when this path is taken.

**Legacy URLs:** Outbound messages sent before April 17 2026 point to `/uploads/*` (local disk). These are still served by the static `/uploads` Express route. Only new uploads go to `/objects/*`.

### Required environment variables (production)

| Variable | Where to set | Description |
|----------|-------------|-------------|
| `PRIVATE_OBJECT_DIR` | Auto-set by Replit | Path into the GCS sidecar (e.g. `/replit-objstore-<id>/.private`). Identifies the bucket name and prefix. |
| `APP_URL` | Secrets / Env vars | Base URL of the deployed app (e.g. `https://whachatcrm.com`). Used to build the `mediaUrl` returned to callers. Falls back to `REPLIT_DOMAINS` when unset — works in Replit-hosted environments but **must be set explicitly in custom domain deploys** so the URL builder doesn't produce a wrong domain. |

### `/objects/*` route — intentionally public

`server/replit_integrations/object_storage/routes.ts` mounts `GET /objects/:objectPath(*)` with **no authentication middleware**. This is intentional: Twilio and Meta require a publicly reachable HTTPS URL to fetch media before delivering it to the end user. Do not add session auth to this route.

### Send pipeline (upload → provider)

```
POST /api/media/upload           ← authenticated, returns { mediaUrl, mediaType, mediaFilename }
  └─ uploadMediaBuffer()         ← writes to GCS or local disk
       └─ mediaUrl /objects/...  ← publicly reachable

sendMessage() [channelService]
  └─ dispatchMessage()
       └─ WhatsAppAdapter.send()
            └─ sendWhatsAppMedia() [whatsappService]
                 ├─ provider=meta  → sendMetaWhatsAppMedia() [userMeta]
                 │                   POST graph.facebook.com — passes url + filename for documents
                 └─ provider=twilio → sendUserWhatsAppMedia() [userTwilio]
                                      Twilio messages.create({ mediaUrl: [...] })
```

### Logging reference (what to look for when debugging)

| Log prefix | Source | What it tells you |
|------------|--------|-------------------|
| `[MediaUpload] OK` | `server/routes/media.ts` | File accepted, stored, URL built |
| `[MediaUpload] Storage failure` | `server/routes/media.ts` | GCS write error (includes size, mime, backend) |
| `[WhatsAppAdapter] Sending media` | `server/channelAdapters.ts` | About to call provider (includes URL, type, filename) |
| `[WhatsAppAdapter] Media sent OK` | `server/channelAdapters.ts` | Provider accepted the message (includes provider + messageId) |
| `[WhatsAppAdapter] Media send failed` | `server/channelAdapters.ts` | Provider rejected (includes provider error string) |
| `[WhatsAppService] Routing media` | `server/whatsappService.ts` | Provider routing decision (meta vs twilio) |
| `[WhatsAppService] Media send skipped` | `server/whatsappService.ts` | No WhatsApp provider connected |
| `[MetaWhatsApp] Sending media` | `server/userMeta.ts` | About to POST to Meta Graph API |
| `[MetaWhatsApp] Media sent OK` | `server/userMeta.ts` | Meta returned a messageId |
| `[MetaWhatsApp] Media send failed` | `server/userMeta.ts` | Meta HTTP error (includes status code + Meta error message) |

No credentials (access tokens, auth tokens, account SIDs) appear in any log line.

### Provider live verification checklist

To verify a real send after deploy:
1. Connect Twilio or Meta in Settings
2. Open a conversation with a test contact who has a real WhatsApp number
3. Click the paperclip, attach a JPEG
4. Click Send
5. Check server logs for `[WhatsAppAdapter] Media sent OK` + `[MetaWhatsApp] Media sent OK` (Meta) or Twilio SID in the Twilio path
6. Confirm the image arrives on the physical device

### Follow-up / known limitations

- **No retention/TTL:** Uploaded files accumulate in object storage indefinitely. Add a periodic cleanup job when storage costs become significant.
- **Single attachment per message:** The current UI allows one file at a time. WhatsApp supports up to 1 media item per message anyway; multiple attachments would require looping sends.

### Key files changed

| File | Change |
|------|--------|
| `server/routes/media.ts` | Upload endpoint — multer memoryStorage, GCS write, local-disk fallback, full JSDoc |
| `server/channelAdapters.ts` | WhatsAppAdapter — richer logging on media send success/failure |
| `server/whatsappService.ts` | `sendWhatsAppMedia` — provider routing log + availability warning log |
| `server/userMeta.ts` | `sendMetaWhatsAppMedia` — pre/post/error logs without leaking tokens |
| `client/src/pages/UnifiedInbox.tsx` | Composer — file picker, preview strip, optimistic media messages, failed-message UI |

---

## Recent Changes (April 11, 2026) — Multi-WhatsApp Number Support (Production Fix)

**Background:** The Pro plan allows up to 5 WhatsApp numbers per account. The schema had `channelAccountId` on the `conversations` table for this purpose, but the runtime never wrote or read it — all numbers shared the same conversation threads and replies always went from the primary number.

**Root causes fixed:**
1. `findUserByTwilioCredentials` only queried `users.twilioWhatsappNumber` (primary). Secondary numbers in `registeredPhones` were invisible to the webhook router → messages dropped.
2. The matched destination number was never passed downstream → `channelAccountId` was always `NULL`.
3. `getConversationByContactAndChannel` matched only on `contactId + channel` → same contact messaging two numbers collapsed into one thread.
4. `WhatsAppAdapter.send()` always called `getUserTwilioNumber(userId)` (primary) → replies went from wrong number.

**Fixes implemented (4 files, backward-compatible):**

| Fix | File | Change |
|-----|------|--------|
| 1 — Secondary number routing | `server/userTwilio.ts` | `findUserByTwilioCredentials` now returns `{ user, matchedPhone }` and falls back to `registeredPhones` table lookup with `twilioAccountSid` cross-check |
| 2 — `channelAccountId` through inbound pipeline | `server/routes.ts`, `server/routes/webhooks.ts`, `server/channelService.ts` | `matchedPhone` passed as `channelAccountId` to `processIncomingMessage`; stored on `createConversation` |
| 3 — Conversation isolation per number | `server/storage.ts` | `getConversationByContactAndChannel` accepts optional `channelAccountId`; when provided, matches `(contactId, channel, channelAccountId)` OR `(contactId, channel, NULL)` (backward compat), preferring exact match; auto-backfills `NULL` rows on first contact |
| 4 — Outbound from correct number | `server/channelAdapters.ts`, `server/whatsappService.ts`, `server/userTwilio.ts` | `WhatsAppAdapter` reads `conversation.channelAccountId` and passes it as `fromNumber` override all the way to Twilio `messages.create({ from: whatsapp:${fromNumber} })` |

**One-time backfill run (April 11, 2026):** 6 existing WhatsApp conversations updated with `channelAccountId = users.twilio_whatsapp_number`. 6 Meta-only conversations left as `NULL` (correct — Meta uses `metaPhoneNumberId`, not a phone string).

**Key files changed:** `server/userTwilio.ts`, `server/routes.ts`, `server/routes/webhooks.ts`, `server/channelService.ts`, `server/storage.ts`, `server/channelAdapters.ts`, `server/whatsappService.ts`

---

## ⚠️ PROTECTED PRODUCTION FEATURE — Multi-Number WhatsApp Isolation

**Any future changes to the following files MUST preserve all behaviors listed below. Run the regression checklist before merging.**

### Protected files
- `server/userTwilio.ts` — `findUserByTwilioCredentials`, `sendUserWhatsAppMessage`, `sendUserWhatsAppMedia`
- `server/routes.ts` — Twilio inbound webhook handler (lines ~1548–1685)
- `server/routes/webhooks.ts` — Secondary Twilio inbound endpoint
- `server/channelService.ts` — `processIncomingMessage`
- `server/storage.ts` — `getConversationByContactAndChannel`
- `server/channelAdapters.ts` — `WhatsAppAdapter.send()`
- `server/whatsappService.ts` — `sendWhatsAppMessage`, `sendWhatsAppMedia`

### Required behaviors (must never regress)

1. **Secondary number routing** — `findUserByTwilioCredentials(accountSid, toPhone)` must check `registeredPhones` as a fallback when `toPhone` is not in `users.twilioWhatsappNumber`. Must verify `accountSid` matches the registered phone owner. Must return `{ user, matchedPhone }` (not just `user`).

2. **`channelAccountId` persistence** — Every inbound WhatsApp/SMS message must have the destination business number (`matchedPhone`) passed as `channelAccountId` into `processIncomingMessage` and stored on the `conversations` row at creation time.

3. **Conversation isolation** — `getConversationByContactAndChannel(contactId, channel, channelAccountId)` must return different conversation rows for different `channelAccountId` values. The same contact messaging two different numbers must produce two separate conversation IDs, not one merged thread.

4. **Backward-compatible NULL handling** — When `channelAccountId` is not provided (non-WhatsApp channels, or older callers), the lookup must fall back to the original `contactId + channel` match. Existing conversations with `channelAccountId = NULL` must be backfilled on first match and not duplicated.

5. **Outbound number selection** — `WhatsAppAdapter.send()` must read `conversation.channelAccountId` and pass it as `fromNumber` to `sendWhatsAppMessage / sendWhatsAppMedia`. When set, Twilio must receive `from: whatsapp:${channelAccountId}`, not `from: whatsapp:${users.twilioWhatsappNumber}`. Meta provider must remain unaffected (ignore `fromNumber`).

### Automated regression test file

`tests/multi-number-whatsapp.test.ts` — run with:

```bash
npx tsx tests/multi-number-whatsapp.test.ts
```

**Expected output:** `Total: 8 | Passed: 8 | Failed: 0`

The suite creates isolated test users and contacts, runs all assertions, and cleans up after itself. It is safe to run against the production database in read/write mode (teardown is guaranteed by a `finally` block).

Exit code 1 = at least one failure. CI should gate on this command before merging any changes to the 7 protected files listed above.

### SQL regression checklist (run after any change to protected files)

```sql
-- 1. Confirm secondary number lookup works
SELECT u.id, u.email, rp.phone_number, 'registered_phones' AS source
FROM registered_phones rp
JOIN users u ON u.id = rp.user_id AND u.twilio_account_sid = '<test_sid>'
WHERE rp.phone_number = '<secondary_phone>';

-- 2. Confirm conversation isolation: same contact, two numbers → two rows
SELECT contact_id, channel, channel_account_id, COUNT(*) AS thread_count
FROM conversations
WHERE contact_id = '<contact_id>' AND channel = 'whatsapp'
GROUP BY contact_id, channel, channel_account_id;
-- Expected: 2 rows with distinct channel_account_id values, each count = 1

-- 3. Confirm no NULL channelAccountId on new WhatsApp conversations
SELECT COUNT(*) AS new_nulls
FROM conversations
WHERE channel = 'whatsapp' AND channel_account_id IS NULL
  AND created_at > NOW() - INTERVAL '1 hour';
-- Expected: 0

-- 4. Confirm reply routing (conversation has channelAccountId set)
SELECT id, channel_account_id FROM conversations
WHERE channel = 'whatsapp' AND channel_account_id IS NOT NULL
LIMIT 5;
-- Expected: all rows show a phone number, not NULL
```

---

## Recent Changes (March 24, 2026) — Inbox Direct-Path & Redis Circuit Breaker

**Root cause:** Upstash Redis hit its 500K free-tier request limit. The BullMQ worker was crash-looping, hammering Redis with reconnect attempts and dropping all inbound messages.

**Fixes applied (surgical, no major refactor):**
1. **Direct DB path for all inbound webhooks** — All inbound message channels (Twilio SMS/WhatsApp, Meta WhatsApp, Instagram, Facebook, Telegram, Webchat) now call `channelService.processIncomingMessage()` directly in the webhook handler. No Redis/BullMQ dependency for core inbox delivery.
2. **Duplicate detection** — `processIncomingMessage` in `channelService.ts` checks `storage.getMessageByExternalId(externalMessageId)` at the top and skips duplicates silently.
3. **Worker circuit breaker** — `server/worker.ts` now closes itself after 8 consecutive Redis errors, stopping the Redis request flood. The worker stays intact for future background jobs but won't burn quota when Redis is down.
4. **Aggressive reconnect backoff** — `server/queue.ts` uses exponential backoff (1s → 5 min) for Redis reconnects, capped at 30 attempts before giving up.
5. **Frontend polling** — Inbox list polls every 5s; conversation messages poll every 4s (added `refetchInterval` to React Query calls in `UnifiedInbox.tsx`).
6. **Queue remains intact** — BullMQ, Bull Board, and all queue infrastructure stay in place for future optional background jobs. Only the inbox delivery path is decoupled.

**Key files changed:** `server/channelService.ts`, `server/routes.ts`, `server/routes/webhooks.ts`, `server/worker.ts`, `server/queue.ts`, `client/src/pages/UnifiedInbox.tsx`

## Recent Changes (March 20, 2026) — IndexNow
- **IndexNow implemented** (`server/indexNow.ts`):
  - Key: `9726ec610d574c62b33130ba828766eb`
  - Key file served at `https://whachatcrm.com/9726ec610d574c62b33130ba828766eb.txt` (static in `client/public/`)
  - Service exports: `submitUrls(urls)` (debounced 5s), `submitNow(urls)` (immediate), `submitAllPublicPages()`
  - 26 public pages covered: homepage, pricing, blog posts, marketing/SEO pages, alternatives
  - Excluded: /admin, /dashboard, /login, /auth, /settings, /api/*
  - Auto-submits all pages 10 seconds after production startup
  - Admin endpoint: `POST /api/admin/indexnow/submit` (requires admin session) — body: `{ urls?: string[] }`, defaults to all public pages
  - Live confirmed HTTP 202 from `https://api.indexnow.org/indexnow`

## Recent Changes (March 20, 2026)
- **Fixed inbound Meta/WhatsApp webhook — two bugs resolved**:
  1. **Signature verification broken**: The POST handler used `JSON.stringify(req.body)` to reconstruct the raw payload for HMAC verification. After Express had already parsed the body, re-serialization produced different bytes than what Meta signed, causing every webhook to fail with 403 "Invalid signature". Fixed by capturing the raw body buffer via `express.json({ verify })` on the `/api/webhook/meta` route in `server/index.ts` (same pattern used for Shopify), then using `(req as any).rawBody?.toString()` in the handler.
  2. **Worker never started**: `server/worker.ts` (BullMQ consumer) was never imported or started. Jobs were enqueued to Redis but nobody consumed them. Fixed by adding `import "./worker"` to `server/index.ts`.
  - Added comprehensive `[Meta Webhook]` and `[Inbox Worker]` logging covering: webhook received, signature check result, parsed sender/type/messageId, user routing, job queue confirmation, contact match/create, conversation match/create, and message save confirmation.
  - Key files: `server/index.ts`, `server/routes.ts`, `server/channelService.ts`

## Recent Changes (March 5, 2026)
- **LeadConnector White-Label Compliance (GHL Marketplace Review Fix)**:
  - Removed all "GoHighLevel" / "GHL" references from user-facing UI, error messages, and server responses
  - Post-install redirect page now says "Connected to LeadConnector" with white-label safe content
  - OIDC sign-in page updated: "Sign in to continue to LeadConnector"
  - Added LeadConnector integration card at top of Integrations page with:
    - Connection status indicator (Connected / Not Connected)
    - "Install LeadConnector App" primary CTA button (opens whitelabeled install link)
    - "Check Connection" / "Verify Connection" buttons to confirm install
    - Helper text for unconnected state
  - Added `/api/ext/connection-status` endpoint to check LeadConnector connection state
  - Install URL configurable via `VITE_LEADCONNECTOR_INSTALL_URL` env var (frontend) or defaults to marketplace URL
  - Internal integration type remains `gohighlevel` in database for backward compatibility
  - Key files modified:
    - `server/ghlRoutes.ts`: All user-facing strings updated, added connection-status endpoint
    - `server/oidc.ts`: Updated sign-in page text
    - `server/routes.ts`, `server/index.ts`: Updated comments
    - `client/src/pages/Integrations.tsx`: Added LeadConnector card with status UI

## Previous Changes (March 3, 2026)
- **Lead Scoring v2 — Tiered Signals + Decay + Daily Hot List**:
  - Upgraded from 3-tier (Hot/Warm/Unqualified) to 5-tier scoring: Hot (80+), Warm (50-79), New (20-49), Low Intent (1-19), Unqualified (0)
  - 14+ intent signals across 4 categories: High-Intent (+30-40), Medium-Intent (+15-25), Low-Intent (+5-10), Negative (-50 to -100)
  - Per-message positive point cap at +60 to prevent score inflation
  - STOP_DNC and SPAM_PATTERN signals force immediate Unqualified override
  - Time-based score decay: 15% reduction after 14 days inactivity, 30% after 30 days
  - Hot leads (80+) automatically create "Call / Follow up today" task
  - Daily Hot List email: Top 5 hot leads with one-click WhatsApp links, sent at 9 AM EST to users with active Growth Engine
  - Key files:
    - `server/leadScoring.ts`: Scoring engine with signals, decay, classification
    - `server/cron.ts`: Added `runDailyHotListEmails` cron job (13:00 UTC / 9 AM EST)
    - `server/email.ts`: Added `sendDailyHotListEmail` function with formatted HTML template
    - `server/seedRealtorTemplate.ts`: Updated ai_rules asset with full signal table + decay rules + 5-tier classification
    - `client/src/pages/RealtorGrowthEngine.tsx`: Updated W2 dashboard description with new scoring details

## Previous Changes (March 1, 2026)
- **Realtor Growth Engine (Premium Template)**:
  - Premium locked vertical template for real estate industry
  - Purchase -> Unlock -> Onboarding Form (required) -> Submission stored + emailed
  - Auto-provisions template package: CRM Pipeline (9 stages), Tags (13), Lead Fields (12), Message Templates (9), Automation Workflows (W1-W8), AI lead scoring rules
  - Multi-step onboarding form with business eligibility gate + WhatsApp setup anti-wrong-number logic
  - Email to support@whachatcrm.com on onboarding submission (Resend)
  - Status page showing submission status + install state
  - Route guards: locked -> purchased -> submitted states
  - Install approach: Option A — all assets (pipeline, tags, fields, message templates, AI rules) installed as user-owned rows in `user_template_data` table + workflows in `workflows` table. Idempotency via UNIQUE(userId, templateId, assetType, assetKey).
  - Dev-only reset endpoint: `DELETE /api/templates/realtor-growth-engine/reset` (blocked in production)
  - Migration file: `migrations/0001_realtor_growth_engine.sql` (all 6 tables)
  - Key files:
    - `shared/schema.ts`: 6 tables (templates, template_entitlements, realtor_onboarding_submissions, template_installs, template_assets, user_template_data)
    - `server/templateRoutes.ts`: 6 API endpoints (GET info, POST purchase, POST onboarding/submit, POST install, GET status, DELETE reset)
    - `server/seedRealtorTemplate.ts`: Idempotent seed of template assets on startup
    - `server/email.ts`: `sendRealtorOnboardingEmail` function
    - `server/storage.ts`: 14 storage methods for template operations (including reset)
    - `client/src/pages/RealtorGrowthEngine.tsx`: All-in-one page (detail, checkout, onboarding, status)
  - Frontend routes: `/app/templates/realtor-growth-engine`, `/app/templates/realtor-growth-engine/onboarding`, `/app/templates/realtor-growth-engine/status`
  - API routes: `GET/POST/DELETE /api/templates/realtor-growth-engine/*`

## Previous Changes (February 11, 2026)
- **BullMQ + Redis Guaranteed Message Delivery**:
  - Upgraded unified inbox from best-effort dual-write to guaranteed delivery using BullMQ + Redis (Upstash)
  - Queue: `unified-inbox` with exponential backoff (5s start, 5 attempts), deduplication by externalMessageId
  - Worker: Separate process (`server/worker.ts`) with configurable concurrency (default: 5), idempotency checks
  - All webhook handlers (Twilio, Meta WhatsApp, Instagram, Facebook, Telegram, WebChat) now enqueue jobs instead of direct writes
  - If Redis/queue is unavailable, webhooks return 500 so providers retry (never silently lose messages)
  - Failed jobs remain in Redis for manual reprocessing
  - Bull Board monitoring at `/admin/queues`
  - Admin endpoints: `GET /api/admin/queue/stats`, `GET /api/admin/queue/failed`, `POST /api/admin/queue/reprocess-failed`
  - Key files: `server/queue.ts`, `server/worker.ts`, `server/index.ts`, `server/routes.ts`
  - Env vars: `REDIS_URL` (required), `WORKER_CONCURRENCY` (optional, default: 5)
  - Worker start: `npx tsx server/worker.ts` (dev) or `node dist/worker.cjs` (prod)
  - Build: `script/build.ts` now also builds `dist/worker.cjs`

## Previous Changes (February 4, 2026)
- **RTL/Hebrew Support Improvements**:
  - Pricing page notices (Message Costs, Active Conversation, Reach Limit) now have RTL layout with icons on right side
  - Added Hebrew translations for pricing notices in `client/src/locales/he.json`
  - HelpCenter article list items now have RTL support with flex-row-reverse
  - FAQ section updated with RTL-aware styling (in progress - needs translation keys completed)
  - Key files: `client/src/pages/Pricing.tsx`, `client/src/pages/HelpCenter.tsx`, `client/src/locales/he.json`

## Previous Changes (January 6, 2026)
- **Onboarding Tour**: 7-step guided walkthrough for new users
  - Shows automatically when user hasn't completed onboarding
  - Covers key features: Inbox, Search, Follow-ups, Templates, Workflows, Integrations, Settings
  - Marks onboarding complete via API endpoint
- **Auto-Reply & Business Hours Settings**: New settings section
  - Auto-reply toggle with customizable instant response message
  - Business hours with day-of-week selection and time range
  - Away message for outside business hours
  - Settings persisted per user in database
- **CSV Import/Export**: Bulk data management
  - Export: Download all contacts as CSV from Chats menu (3-dot icon)
  - Import: Upload CSV file in Settings to bulk-add contacts
  - CSV columns: Name, Phone, Tag, Notes
  - Automatic data validation and skip for invalid rows
- **Native Integration Webhooks**: Full bi-directional integration sync
  - Shopify: Webhook receiver for orders/create, customers/create, checkouts/create
  - Calendly: Webhook receiver for invitee.created, invitee.canceled - auto-creates leads
  - Stripe: Webhook receiver for checkout.session.completed, payment_intent.succeeded/failed
  - HubSpot: Webhook receiver for contact.creation with CRM sync
  - Google Sheets: Export leads functionality with sync button
  - Webhook URL display: Shows webhook URL with setup instructions for each integration
  - All integrations create/update chats automatically when events received
- **Calendly Integration**: Added as new native integration option
  - Supports new bookings, cancellations, and reschedules
  - Auto-creates leads when meetings are booked
- **Template Messaging (Pro Feature)**: WhatsApp template messaging for re-engaging contacts
  - Template library: Sync templates from Twilio Content API
  - Retargeting view: Shows chats outside 24-hour window with "days since last message"
  - Variable substitution: Dynamic {contact_name}, {product}, {date} etc.
  - Template types: text, media, carousel (up to 10 cards)
  - Full API: /api/templates, /api/templates/sync, /api/templates/retargetable-chats, /api/templates/send
  - Database: message_templates and template_sends tables for tracking

## Previous Changes (January 5, 2026)
- **14-Day Pro Trial**: New users automatically receive 14-day Pro trial
  - Trial banner shows days remaining with upgrade prompts
  - Automatic downgrade to Free after trial expires
- **Integrations System (Paid Feature)**: Complete webhook and native integration framework
  - Webhook management: Create, edit, delete webhooks with HMAC signing
  - Events: new_chat, message_received, message_sent, tag_changed, pipeline_changed, followup_due, chat_assigned
  - Plan limits: Free (0 webhooks), Starter (3 webhooks), Pro (10 webhooks)
  - Native integrations now available: Shopify, Google Sheets, HubSpot, Salesforce, Stripe, Showcase IDX
  - Each integration has custom connection forms with sync options
  - Sensitive credentials encrypted at rest (AES-256-GCM)
- **Workflow Automation (Pro Feature)**: Complete rule-based workflow system
  - Triggers: new_chat, incoming_message (keyword detection), tag_changed
  - Actions: auto-assign (round-robin or specific user), auto-tag, set_status, set_pipeline, add_note, set_followup
  - Workflow execution logging and history tracking
- **Custom Date Picker for Follow-ups**: Calendar-based date selection for reminders
- **Conversation History Search**: Full-text search across all messages and notes
  - Searches message content, notes, and contact names
  - Highlights matched text in results
  - Quick filter buttons for common searches
- **Workflow UI**: Full workflow management page with rule builder

## Previous Changes (January 3, 2026)
- **CRITICAL ARCHITECTURE CHANGE**: Switched from platform-owned to customer-owned Twilio accounts
- **Connect Twilio Wizard**: Users enter Account SID, Auth Token, WhatsApp number
- **Credential Encryption**: Auth tokens encrypted with AES-256-GCM before storage
- **Hard Gating**: Chats page blocked until Twilio is connected
- **Settings UI**: New WhatsApp Connection section with status and disconnect option
- **Webhook Routing**: Incoming messages identified by Twilio Account SID + phone number
- **Throttling**: Max 100 messages per 24-hour conversation window to prevent abuse

## Previous Changes (December 30, 2025)
- **Subscription System**: Three tiers - Free (100/mo), Starter ($19/mo, 500), Pro ($49/mo, 2000)
- **Stripe Integration**: Payment processing with automatic webhook sync (stripe-replit-sync)
- **Limit Enforcement**: Conversations, users, and WhatsApp numbers enforced per plan
- **Pricing Page**: Public /pricing page with plan comparison and Stripe checkout
- **Settings Upgrade**: Subscription info, usage stats, and billing portal link

## Features
- **Chat Management**: View and organize WhatsApp conversations
- **Notes & Tags**: Add notes and categorize chats (New, Hot, Quoted, Paid, Waiting, Lost)
- **Pipeline Stages**: Track deal progress (Lead, Contacted, Proposal, Negotiation, Closed)
- **Follow-up Reminders**: Schedule reminders (Tomorrow, 3 days, 1 week)
- **Search**: Find chats by name or content
- **Push Notifications**: Browser push notifications for due follow-ups
- **Email Reminders**: Email notifications as fallback (requires configuration)
- **PWA**: Installable on mobile with Add to Home Screen
- **Authentication**: Secure email/password authentication with session persistence
- **14-Day Pro Trial**: New users get full Pro access for 14 days
- **Integrations**: Webhook endpoints for Zapier/Make.com + 6 native integrations (Shopify, HubSpot, Salesforce, etc.)
- **Template Messaging**: Pro feature for re-engaging contacts outside 24-hour window with approved templates

## Twilio Integration Architecture

### Customer-Owned Model
Each customer must:
1. Sign up for WhachatCRM (email/password)
2. Land in dashboard in "Disconnected" state
3. Connect their own Twilio account via Settings
4. Configure Twilio webhooks to receive messages

### Connection Flow
1. User goes to Settings > WhatsApp Connection
2. Enters Twilio Account SID, Auth Token, WhatsApp number
3. System validates credentials against Twilio API
4. Credentials encrypted and stored per user
5. User receives webhook URL to configure in Twilio console

### Webhook Configuration
Users must add this webhook URL in Twilio Console:
- **Incoming Messages**: `https://[your-app]/api/webhook/twilio/incoming`
- **Status Updates**: `https://[your-app]/api/webhook/twilio/status`

### Security
- Auth tokens encrypted with AES-256-GCM at rest
- Auth tokens never logged
- Customer data isolated by user ID
- Credentials validated before storage

## Project Architecture
### Frontend (React + TypeScript)
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack Query for server state
- **UI Components**: Radix UI + Tailwind CSS
- **Design**: WhatsApp-inspired aesthetic with green (#22c55e) primary color
- **Fonts**: Inter + Plus Jakarta Sans

### Backend (Express + TypeScript)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Passport.js with local strategy
- **Session Store**: In-memory store (memorystore)
- **Password Hashing**: bcryptjs
- **Notifications**: Web Push API + cron scheduler

### Key Files
- `shared/schema.ts`: Database schema definitions
- `server/storage.ts`: Storage interface with CRUD operations
- `server/routes.ts`: API route handlers
- `server/auth.ts`: Authentication middleware and routes
- `server/userTwilio.ts`: Per-user Twilio service with encryption
- `server/notifications.ts`: Push notification and scheduler logic
- `client/src/components/ConnectTwilioWizard.tsx`: Twilio connection UI
- `client/src/pages/Settings.tsx`: WhatsApp connection status UI
- `client/src/pages/Chats.tsx`: Gated chat interface

## Configuration

### Environment Variables
The application requires the following environment variables:

#### Required (Auto-configured)
- `DATABASE_URL`: PostgreSQL connection string (auto-configured by Replit)
- `SESSION_SECRET`: Session encryption key (also used for Twilio credential encryption)

#### Stripe (Manual Setup)
- `STRIPE_PUBLISHABLE_KEY`: Stripe publishable key (pk_test_... or pk_live_...)
- `STRIPE_SECRET_KEY`: Stripe secret key (sk_test_... or sk_live_...)

#### Optional
- `TWILIO_ENCRYPTION_KEY`: Custom encryption key for Twilio credentials (defaults to SESSION_SECRET)
- `VAPID_PUBLIC_KEY`: Web Push VAPID public key
- `VAPID_PRIVATE_KEY`: Web Push VAPID private key
- `VAPID_EMAIL`: Contact email for VAPID
- `RESEND_API_KEY`: API key for Resend email service
- `APP_URL`: Full URL of the app for webhooks and emails

## Data Model
- **Users**: Authentication, notification preferences, Twilio credentials (encrypted)
- **Chats**: WhatsApp conversations with tags, pipeline stages, notes
- **Follow-ups**: Scheduled reminders with automatic notifications
- **Push Subscriptions**: Web Push API subscription data stored per user
- **Conversation Windows**: 24-hour tracking for billing purposes
- **Message Usage**: Per-message cost tracking

## Cost Control & Limit Enforcement

### Sending Blocks
- **Twilio not connected**: All messaging blocked until connected
- **Free plan follow-ups**: Cannot create follow-ups (upgrade prompt shown)
- **At limit**: All plans blocked from new conversations when at limit
- **Throttled**: Max 100 messages per 24-hour conversation window

### Usage Tracking (24-Hour Windows)
- **Conversation = 24-hour window**: One conversation per contact per 24 hours
- **Window tracking**: `conversationWindows` table tracks window start/end per contact
- **Message count**: Each window tracks message count for throttling
- **Both directions**: Inbound and outbound messages tracked

### Subscription Plans
| Plan | Price | Conversations/mo | Users | WhatsApp Numbers | Follow-ups |
|------|-------|------------------|-------|------------------|------------|
| Free | $0 | 100 | 1 | 1 | No |
| Starter | $19 | 500 | 3 | 1 | Yes |
| Pro | $49 | 2,000 | 10 | 3 | Yes |

## API Endpoints

### Twilio Connection
- `GET /api/twilio/status` - Get connection status
- `POST /api/twilio/connect` - Connect Twilio account
- `POST /api/twilio/disconnect` - Disconnect Twilio account
- `POST /api/twilio/validate` - Validate credentials without saving

### Webhooks
- `POST /api/webhook/twilio/incoming` - Receive incoming WhatsApp messages
- `POST /api/webhook/twilio/status` - Receive message status updates

## Development Commands
- `npm run dev`: Start development server
- `npm run db:push`: Push schema changes to database
- `npm run build`: Build for production
- `npm start`: Run production server
