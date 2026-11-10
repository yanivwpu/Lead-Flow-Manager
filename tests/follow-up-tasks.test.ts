import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyKPIFilter, buildFollowUpItems, getTaskStatus, hasActionableInquiry,
  hasScheduledFollowUp, hasTask, isActiveDeal, isSalesOpportunity, prioritizeTasks,
  validTaskDate, type FollowUpInboxItem,
} from '../shared/followUpTasks';

const now = new Date('2026-11-10T12:00:00Z');
function row(text = 'Thanks!', fields: Partial<FollowUpInboxItem> = {}): FollowUpInboxItem {
  return {
    contact: { id: 'customer', name: 'Customer', email: 'person@example.com', tag: 'New', pipelineStage: 'Lead', source: 'email_inbox' },
    conversation: { id: 'thread', channel: 'email', status: 'open', lastMessageDirection: 'inbound', lastMessagePreview: text },
    channel: 'email', lastMessage: text, lastMessageAt: now.toISOString(), unreadCount: 1,
    ...fields,
  };
}

test('ordinary emails, unread conversations, promotions and Railway/system notifications are not work', () => {
  const cases = [
    row('Hello'), row('How are you?'), row('The document is attached.'),
    row('Your support ticket was closed.'), row('Our pricing has changed.'),
    row('Interested in upgrading? Save 20% off. Shop now!'),
    row('Weekly newsletter: What is new this week?'),
    row('Your Railway deployment failed. Please check the build logs.'),
    row('Your usage limit has been reached.'),
    row('Please confirm availability?', { contact: { ...row().contact, email: 'notifications@railway.app' } }),
    row('Reset your password to continue.'),
    row('Your order confirmation #123'),
  ];
  for (const candidate of cases) {
    candidate.unreadCount = 999;
    assert.equal(hasActionableInquiry(candidate), false, candidate.lastMessage);
    const [item] = buildFollowUpItems([candidate]);
    assert.equal(isActiveDeal(item), false);
    assert.equal(hasScheduledFollowUp(item), false);
    assert.deepEqual(prioritizeTasks([item], now), []);
  }
});

test('sales inquiries and support requests need a reply regardless of read state or channel', () => {
  const inquiries = [
    'I am interested in buying a home.', 'Could you send a quote?',
    'What is your pricing?', 'How much does it cost?', 'I would like a quote', "I'd like a quote", 'I’d like to book a tour',
    'Is this still available?', 'Can you reschedule my appointment?',
    'Where is my order #123?', 'I need help with my account',
    'My package never arrived.', 'The item arrived damaged.',
    'Can you help with my Railway deployment?', 'Can you help with my deployment failed error?',
    'Can you send your privacy policy?',
  ];
  for (const channel of ['email', 'whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'tiktok', 'gohighlevel']) {
    for (const text of inquiries) {
      const candidate = row(text, { channel, unreadCount: 0 });
      assert.equal(hasActionableInquiry(candidate), true, `${channel}: ${text}`);
      assert.equal(isActiveDeal(buildFollowUpItems([candidate])[0]), false, 'an inquiry alone never creates a deal');
    }
  }
});

test('outbound, resolved and closed conversations never need a reply even with unread messages', () => {
  for (const conversation of [
    { lastMessageDirection: 'outbound' }, { status: 'resolved' }, { status: 'closed' }, { lastMessageDirection: null },
  ]) {
    const inquiry = row('Can you send a quote?');
    inquiry.conversation = { ...inquiry.conversation, ...conversation };
    assert.equal(hasActionableInquiry(inquiry), false);
  }
});

test('persisted website-form inquiries survive notification senders without promoting contacts', () => {
  const form = row('New website inquiry', {
    contact: { ...row().contact, email: 'noreply@forms.example.com', source: 'email' },
    formIdentity: { isWebsiteForm: true },
  });
  assert.equal(hasActionableInquiry(form), true);
  const before = JSON.stringify(form);
  const [item] = buildFollowUpItems([form]);
  assert.equal(item.needsReply, true);
  assert.equal(item.isOpportunity, false);
  assert.equal(JSON.stringify(form), before);
  const acknowledgement = { ...form, lastMessage: 'Thanks!', conversation: { ...form.conversation, lastMessagePreview: 'Thanks!' } };
  assert.equal(hasActionableInquiry(acknowledgement), false, 'a later acknowledgement is not a fresh form inquiry');
});

test('only qualified contacts or meaningful sales pipeline stages count as opportunities', () => {
  const contact = row().contact;
  for (const source of ['manual', 'email', 'email_inbox', 'whatsapp', 'shopify', 'webchat']) {
    for (const pipelineStage of ['Lead', 'New Lead', 'Contacted', 'Responded', 'Imported', 'AI Reviewed', 'Unqualified', 'Appointment Set']) {
      assert.equal(isSalesOpportunity({ ...contact, source, pipelineStage }), false, `${source}/${pipelineStage}`);
    }
    for (const pipelineStage of ['Opportunity', 'Proposal', 'Negotiation', 'Qualified (Hot)', 'Qualified (Warm)', 'Under Contract']) {
      const [item] = buildFollowUpItems([row('', { contact: { ...contact, source, pipelineStage } })]);
      assert.equal(isActiveDeal(item), true, `${source}/${pipelineStage}`);
    }
    for (const tag of ['Hot Lead', 'Warm Lead', 'Hot', 'Warm']) {
      assert.equal(isSalesOpportunity({ ...contact, source, tag }), true);
    }
  }
  for (const pipelineStage of ['Closed', 'Closed Won', 'Closed Lost', 'Lost', 'Unqualified']) {
    const [item] = buildFollowUpItems([row('', { contact: { ...contact, pipelineStage, tag: 'Hot Lead' } })]);
    assert.equal(isActiveDeal(item), false, pipelineStage);
  }
  assert.equal(isSalesOpportunity({ ...contact, pipelineStage: 'Negotiation', tag: 'Do Not Contact' }), false);
});

test('manual and Realtor Growth Engine tasks remain tasks, independently of deal and email lifecycle', () => {
  for (const source of ['manual', 'email_inbox', 'email', 'whatsapp', 'shopify']) {
    const [item] = buildFollowUpItems([row('Thanks', { contact: {
      ...row().contact, source, followUp: 'Call customer', followUpDate: '2026-11-09T09:00:00Z',
    } })]);
    assert.equal(hasTask(item), true);
    assert.equal(hasScheduledFollowUp(item), true);
    assert.equal(getTaskStatus(item.followUpDate, now), 'overdue');
    assert.equal(applyKPIFilter([item], 'overdue', now).length, 1);
    assert.equal(prioritizeTasks([item], now).length, 1);
    assert.equal(isActiveDeal(item), false, 'a support task or reminder is not a sales opportunity');
  }
  const [realtor] = buildFollowUpItems([row('Thanks', { contact: {
    ...row().contact, source: 'whatsapp', tag: 'Warm', pipelineStage: 'Nurture / Follow-Up',
    followUp: 'Realtor Growth Engine follow-up', followUpDate: '2026-11-11T12:00:00Z',
  } })]);
  assert.equal(hasScheduledFollowUp(realtor), true);
  assert.equal(isActiveDeal(realtor), true, 'durable RGE qualification is retained');
});

test('only real tasks with valid dates are scheduled; invalid and undated tasks remain safe', () => {
  for (const followUpDate of [null, '', 'bad-date', '0', '2026-02-30T12:00:00Z', '2026-13-01']) {
    const [item] = buildFollowUpItems([row('', { contact: { ...row().contact, followUp: 'Call customer', followUpDate } })]);
    assert.equal(hasTask(item), true);
    assert.equal(hasScheduledFollowUp(item), false);
    assert.equal(getTaskStatus(item.followUpDate, now), null);
    assert.equal(applyKPIFilter([item], 'today', now).length, 0);
  }
  const [dateOnly] = buildFollowUpItems([row('', { contact: { ...row().contact, followUp: ' ', followUpDate: now } })]);
  assert.equal(hasScheduledFollowUp(dateOnly), false);
  assert.equal(prioritizeTasks([dateOnly], now).length, 0);
  assert.equal(validTaskDate(new Date('invalid')), null);
});

test('thread expansion does not duplicate reminders or deals, or hide actionable sibling inquiries', () => {
  const inquiry = row('Can you send a quote?', { contact: {
    ...row().contact, tag: 'Hot Lead', followUp: 'Call customer', followUpDate: '2026-11-10T15:00:00Z',
  } });
  const notice = row('Your deployment failed', {
    contact: inquiry.contact, conversation: { ...row().conversation, id: 'notice' }, lastMessageAt: '2026-11-10T13:00:00Z',
  });
  for (const rows of [[notice, inquiry], [inquiry, notice]]) {
    const before = JSON.stringify(rows);
    const items = buildFollowUpItems(rows);
    assert.equal(items.length, 1);
    assert.equal(items[0].conversationId, 'thread');
    assert.equal(applyKPIFilter(items, 'needs-reply', now).length, 1);
    assert.equal(applyKPIFilter(items, 'active-deals', now).length, 1);
    assert.equal(applyKPIFilter(items, 'today', now).length, 1);
    assert.equal(items.filter(hasScheduledFollowUp).length, 1);
    assert.equal(JSON.stringify(rows), before, 'classification never edits stored input');
  }
});

test('ranking favors overdue work, urgency and engagement; unread volume has no effect', () => {
  const task = (id: string, text: string, followUpDate: string | null, unreadCount = 0) =>
    buildFollowUpItems([row(text, { unreadCount, contact: { ...row().contact, id, followUp: 'Call customer', followUpDate } })])[0];
  const overdue = task('overdue', 'Thanks!', '2026-11-09T12:00:00Z');
  const urgent = task('urgent', 'Please help with my order ASAP', null);
  const routine = task('routine', 'Thanks!', '2026-11-12T12:00:00Z', 999);
  assert.deepEqual(prioritizeTasks([routine, urgent, overdue], now).map(t => t.id), ['overdue', 'urgent', 'routine']);
  const before = prioritizeTasks([routine, urgent, overdue], now).map(t => t.id);
  routine.unread = 0; urgent.unread = 9999;
  assert.deepEqual(prioritizeTasks([routine, urgent, overdue], now).map(t => t.id), before);
  const [dealWithoutWork] = buildFollowUpItems([row('Thanks', { contact: { ...row().contact, pipelineStage: 'Proposal' } })]);
  assert.deepEqual(prioritizeTasks([dealWithoutWork], now), [], 'a deal alone is not recommended as a task');
  const recent = task('recent', 'What is the price?', null);
  const stale = task('older', 'What is the price?', null);
  stale.time = '2026-10-01T12:00:00Z';
  assert.deepEqual(prioritizeTasks([stale, recent], now).map(t => t.id), ['recent', 'older']);
});
