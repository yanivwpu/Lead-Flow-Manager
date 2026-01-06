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

## Recent Changes (January 6, 2026)
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
