# Prospect AI prospect-to-CRM lifecycle audit

## Creation path found

1. Discovery itself writes `prospect_ai_discovery_results` only.
2. **Send to Review** previously called `storage.createContact` in
   `sendDiscoverResultsToReview`, applied `Discovered-ProspectAI`, linked the
   discovery result through `contact_id`, and seeded `prospect_intelligence`.
3. Review, enrichment, approval, queue selection and sending are contact keyed:
   `prospect_intelligence.contact_id` is its primary key and
   `prospect_outreach_queue_items.contact_id` is a required foreign key. This is
   the point at which the existing architecture requires an underlying identity.
4. Discovery/review did not directly create a conversation. Empty Inbox rows
   were synthesized by `buildInboxItemsForContact` for every contact with no
   conversations. Actual outbound send paths create an email/WhatsApp
   conversation when needed.
5. Unified Inbox fetched every workspace contact and expanded it, including
   contacts with no conversation. Cold email queue records had a later special
   case to hide sent outbound threads, but it did not hide the earlier empty row.

## Implemented boundary

The contact-keyed review architecture is retained without a schema rewrite, but
new Prospect AI identities are marked `contactLifecycle=prospect_only`. They are
not normal CRM contacts: Contacts queries and Inbox expansion exclude them.
Review, enrichment, qualification and queueing do not create a conversation.
Outbound-only conversations also remain excluded because their owner remains a
prospect-only identity. On the first inbound match, that same row is promoted to
`saved` before the real conversation is displayed. Reusing the row preserves the
discovery link, campaign attribution, enrichment metadata, and identity dedupe;
the existing external-message dedupe also makes repeated webhook delivery safe.

An already-existing normal CRM contact matched during discovery stays normal; it
is not demoted. An inbox-only identity matched during discovery remains hidden.

## Production count and safe migration

Run the read-only command below against production. It reports tagged total,
zero-message mistakes, outbound-only rows and rows with inbound replies. No
production database URL was available in this workspace, so the production count
cannot be truthfully stated from this checkout.

```bash
DATABASE_URL=... npx tsx scripts/audit-prospect-ai-contact-shells.ts
```

After reviewing the output, migrate in a transaction by setting
`source_details.contactLifecycle` to `prospect_only` **only** for tagged rows
with zero inbound messages. Do not delete contacts, conversations, messages,
discovery links, intelligence, outcomes, or queue records. First snapshot the
candidate IDs/count, update in bounded workspace batches, verify Contacts/Inbox
counts, and retain a rollback table containing each ID and old `source_details`.
Rows with an inbound message must instead be marked `saved`. This is reversible
and retains all attribution and deduplication keys.

## Inbound channel promotion trace

Email enters through `emailChannel/persistInbound` and resolves its participant
through `resolveEmailContact`; only its inbound direction invokes the shared
Prospect AI promotion predicate. WhatsApp and SMS/Twilio, Facebook Messenger,
Instagram DM (webhook and polling), Telegram, and Web Chat (text, media and form)
all delegate persistence to `channelService.processIncomingMessage`. That method
performs identity lookup first, promotes a matched `prospect_only` row in place,
and only then finds or creates the conversation and inbound message. Thus all
seven paths preserve the contact ID and cannot create a second identity when a
matching channel identity already exists.

External-message deduplication runs before promotion/conversation creation in the
generic path. Re-delivery returns the previously stored contact, conversation and
message. Email likewise matches the existing exact workspace email before any
new identity is considered. Outbound paths call neither inbound promotion site;
the shared predicate explicitly rejects `direction=outbound`, and Inbox filtering
continues to reject the owning `prospect_only` identity even if sending created an
underlying conversation.
