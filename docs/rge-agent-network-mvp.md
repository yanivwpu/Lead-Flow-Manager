# RGE Agent Network MVP

## Scope
Opt-in professional directory within RGE, geographic search, direct referral proposals to members or manually entered outside agents, incoming and sent requests, accept/decline responses. No AI matching, financial reward tracking, commission collection or distribution, contracts, or transaction management.

## Enrollment and consent
Require explicit unchecked consent before enrollment or directory visibility. Store server-generated accepted timestamp and terms version. Display localized terms before accepting. Only show explicitly supplied professional profile and service areas to eligible participating members. Support leaving the directory; retain necessary proposal history privately. Re-consent when terms materially change.

English participation terms (draft for legal review):
- Your professional profile and service areas will be visible to participating network members.
- Referral proposals are non-binding expressions of interest.
- Referral agreements, negotiations and commissions are handled independently between agents and their respective brokers, subject to applicable laws.
- WhachatCRM facilitates communication only and does not negotiate, collect or distribute referral commissions.
- You may leave the network at any time.
Checkbox: I have read and agree to the participation terms.

## Proposals and responses
Optional proposed referral percentage, concise description; discourage sharing client personal information before appropriate authorization. External agent name/email entered manually. Use secure expiring recipient-bound response mechanism for external requests; GET must never accept or decline (email scanners), explicit confirmation via POST. Do not enroll recipients automatically. Validate authorization, entitlement, target membership for internal sends, rate limits, and state transitions server-side. Only intended recipient may accept/decline a pending request; reject replay or conflicting changes. Do not expose directory emails by default. Notify recipient of proposal and sender of response, using existing notification/email infrastructure where appropriate. Persist status and response timestamp; sender sees pending/accepted/declined in Sent, with unread response indicator. Distinguish delivery errors from pending responses. Acceptance is not a binding commission agreement.

## UX and localization
Compact directory/incoming/sent tabs, small action buttons, mobile-friendly rows, empty/loading/error states, and status labels with icons (not color alone). Show unread incoming and response counts where appropriate. English, Hebrew RTL, Spanish LTR from day one, including consent, validation, statuses, email templates, notifications, and external response pages. Preserve authored names and messages. Use existing app language, account-scoped cache, and logical spacing. No placeholder demo agents in production.

## Release gates
Review legal consent copy before release. Add migrations, API and UI tests for consent, opt-out, cross-tenant authorization, external token expiration/replay, status transitions, notifications, locale parity and mobile RTL. Verify actual email delivery in controlled test. Keep marketing Coming Soon until functional release. No production writes or rollout until verified.
