# Read-only audit for Gmail drafts imported as sent

Use one authorized workspace and one connected Gmail mailbox per audit. Start with the broker thread reported in the incident. Obtain the exact subject and recipient from the private incident report and keep mailbox identities and provider IDs in the restricted audit record.

## Find CRM candidates

Use a read-only database role, bind the parameters, and limit the time window to the incident. Each result is a candidate for provider verification.

```sql
BEGIN READ ONLY;

SELECT m.id AS crm_message_id,
       c.id AS crm_conversation_id,
       m.external_message_id AS gmail_message_id,
       c.external_thread_id AS gmail_thread_id,
       d.provider_thread_id AS detail_thread_id,
       d.rfc_message_id,
       m.sent_by_user_id,
       m.sent_at,
       m.created_at
FROM messages m
JOIN conversations c
  ON c.id = m.conversation_id AND c.user_id = m.user_id
JOIN email_mailboxes b
  ON b.id = c.channel_account_id AND b.workspace_user_id = c.user_id
JOIN email_message_details d ON d.message_id = m.id
WHERE m.user_id = :workspace_id
  AND b.id = :mailbox_id
  AND b.provider = 'gmail'
  AND c.channel = 'email'
  AND m.direction = 'outbound'
  AND m.status = 'sent'
  AND m.created_at >= :start_at
  AND m.created_at < :end_at
  AND d.subject = :exact_subject
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(d.to_addresses) AS recipient
    WHERE lower(recipient->>'email') = lower(:exact_recipient)
  )
ORDER BY m.created_at, m.id;

ROLLBACK;
```

## Verify with Gmail

1. Verify the mailbox identity using Gmail `users.getProfile`. Use that same mailbox with read-only authorization for the remaining calls.
2. Fetch each exact Gmail message ID with `users.messages.get` using metadata format. Record retrieval time, Gmail message ID, thread ID, and labels. Use `users.drafts.list` with pagination to confirm any current draft by its underlying message ID and `users.threads.get` to inspect the other messages and labels in the thread. Check Sent separately by thread or RFC Message-ID when available and compare individual Gmail message IDs.
3. An exact message ID with `DRAFT` and without `SENT`, matched to a current draft, is a confirmed false-SENT candidate. Preserve every genuine `SENT` message, including a later sent copy with a different Gmail message ID. A missing ID can be an autosave revision, a deleted message, or a replaced draft. Leave missing IDs, conflicting evidence, and unavailable provider reads unresolved unless retained provider evidence establishes the exact message's state.
4. For a confirmed candidate, inventory the thread's other messages and any activity, preview, or CRM references tied to the row. Record the exact candidate and dependencies for manual review. Recheck provider state and the workspace and mailbox binding before a separately approved correction. Preserve the Gmail draft, genuine email, contact history, and shared thread. This audit performs zero writes.

## Review recurring GitHub notifications

The inbox renders an email row per conversation. Gmail thread lookup uses workspace, mailbox, and Gmail thread ID, so one GitHub sender can appear across several rows. Within the same mailbox, distinct Gmail thread IDs represent separate threads. Distinct Gmail message IDs within one thread represent separate messages. Investigate repeated CRM conversation rows for the same mailbox and Gmail thread ID, or repeated CRM message rows for the same mailbox and Gmail message ID. Sender text and subject alone cannot establish duplicates or link a notification to the broker thread.
