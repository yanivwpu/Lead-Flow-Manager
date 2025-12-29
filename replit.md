# WhatsApp CRM Web Application (SaaS Platform)

## Overview
A multi-tenant WhatsApp-first CRM SaaS platform. The platform owns the Twilio account - clients never need their own Twilio credentials. Built as a Progressive Web App (PWA) with offline support, installable on mobile devices, and push/email notification capabilities.

## Current State
The application is a full multi-tenant SaaS implementation with:
- **SaaS Model**: Platform owns single Twilio account, clients just use the service
- **Phone Registration**: Clients register their WhatsApp Business numbers within the app
- **Usage-based Billing**: Per-message tracking with Twilio cost + 5% markup
- Real PostgreSQL database for data persistence
- Session-based authentication with Passport.js
- Complete CRM functionality for chat management
- Notification system for follow-up reminders (push & email)
- PWA capabilities (installable, offline-first)

## Recent Changes (December 29, 2025)
- **SaaS Architecture**: Platform now owns Twilio account via Replit integration
- **Phone Registration**: Clients can register their WhatsApp Business phone numbers
- **Message Routing**: Incoming messages routed to clients based on registered phone numbers
- **Usage Tracking**: Every message (inbound/outbound) is tracked with cost calculation
- **Billing System**: 5% markup over Twilio costs for all messages
- Added Settings UI for phone registration and billing/usage view
- Admin endpoint for viewing all client usage (/api/admin/usage)

## Recent Changes (December 29, 2025)
- Enhanced signup form with phone number, business name, and terms agreement checkbox
- Created Privacy Policy page (/privacy-policy) with data collection and security information
- Created Terms of Use page (/terms-of-use) with pricing details ($0.00525 per message)
- Removed technical Twilio pricing details from Settings, replaced with link to Terms of Use
- Auto-registers WhatsApp Business number during signup if provided
- Added validation requiring terms agreement before signup

## Previous Changes (December 27, 2025)
- Converted from prototype to full-stack application with PostgreSQL and Drizzle ORM
- Implemented server-side authentication with bcrypt password hashing
- Created database schema for users, chats, messages, and notification preferences
- Built API routes for CRUD operations on chats and user preferences
- Implemented background scheduler (cron job) to check for due follow-ups
- Integrated Web Push API for push notifications
- Added placeholder for email notifications (awaiting service credentials)
- Connected frontend to backend API endpoints
- Added "Remember Me" checkbox to login form for extended 30-day sessions
- Fixed Follow-ups/Tasks page: made all items clickable to navigate to chat details and added "mark as done" functionality to clear follow-ups

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
- `server/notifications.ts`: Push notification and scheduler logic
- `client/src/lib/auth-context.tsx`: Frontend authentication context
- `client/src/pages/Settings.tsx`: Notification preferences UI

## Configuration

### Environment Variables
The application requires the following environment variables:

#### Required (Auto-configured)
- `DATABASE_URL`: PostgreSQL connection string (auto-configured by Replit)
- `SESSION_SECRET`: Session encryption key (defaults to development key if not set)

#### Optional (for full notification features)
- `VAPID_PUBLIC_KEY`: Web Push VAPID public key
- `VAPID_PRIVATE_KEY`: Web Push VAPID private key
- `VAPID_EMAIL`: Contact email for VAPID (e.g., mailto:admin@example.com)
- `RESEND_API_KEY`: API key for Resend email service (not using Replit integration per user preference)
- `APP_URL`: Full URL of the app for email links (defaults to http://localhost:5000)

### Generating VAPID Keys
To enable push notifications, generate VAPID keys:
```bash
npx web-push generate-vapid-keys
```
Then set the keys as secrets in Replit or environment variables.

### Email Integration
Email reminders are currently configured for Resend but will log to console if API key is not provided. To enable email notifications:
1. Sign up for Resend at https://resend.com
2. Get your API key
3. Set `RESEND_API_KEY` as a secret in Replit
4. Verify your sending domain in Resend

**Note**: User dismissed the Replit Resend integration. If email notifications are needed in the future, manually configure the RESEND_API_KEY secret.

## User Preferences
- Email integration was offered but dismissed by user during development
- User prefers manual credential management over Replit integrations

## Data Model
- **Users**: Authentication and notification preferences
- **Chats**: WhatsApp conversations with tags, pipeline stages, notes
- **Follow-ups**: Scheduled reminders with automatic notifications
- **Push Subscriptions**: Web Push API subscription data stored per user
- **Registered Phones**: WhatsApp Business phone numbers registered per client
- **Message Usage**: Per-message cost tracking with Twilio cost + 5% markup

## SaaS Billing Model
- **Base Cost**: Twilio per-message cost ($0.005 default for text messages)
- **Markup**: 5% over Twilio costs
- **Tracking**: Every inbound and outbound message is tracked
- **Visibility**: Clients can view their usage in Settings > Billing & Usage
- **Admin View**: Platform can view all client usage via /api/admin/usage

## Notification Flow
1. Background cron job runs every minute to check for due follow-ups
2. Queries database for chats with `followUpDate <= now()`
3. For each due follow-up:
   - Sends push notification if user has push enabled
   - Sends email notification if user has email enabled
   - Clears the follow-up after sending
4. User can manage notification preferences in Settings page

## Development Commands
- `npm run dev`: Start development server
- `npm run db:push`: Push schema changes to database
- `npm run build`: Build for production
- `npm start`: Run production server

## Next Steps
If you want to enable full email notifications:
1. Request RESEND_API_KEY secret from user
2. Update `server/notifications.ts` to uncomment Resend implementation
3. Configure verified sender domain in Resend dashboard
