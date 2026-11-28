import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultPipelineLayout, orderedPipelineStages, pipelineLayoutPatchSchema, pipelineLayoutSchema, pipelineStageDisplayLabel, preparePipelineLayoutSave, customPipelineColumn, type PipelineStageLayout } from '../shared/pipelineLayout';
import {
  applyKPIFilter, buildFollowUpItems, getTaskStatus, hasActionableInquiry,
  hasScheduledFollowUp, hasTask, isActiveDeal, isSalesOpportunity, prioritizeTasks, qualifiesEmailPipelineSalesEvidence,
  validTaskDate, filterPipelineItems, type PipelineFilters, type FollowUpInboxItem,
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
    'Does WhachatCRM work with GHL agencies?', 'Do you integrate with Shopify?',
    "I'd like information about your services", 'My account is locked.',
  ];
  for (const channel of ['email', 'whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram', 'tiktok', 'gohighlevel']) {
    for (const text of inquiries) {
      const candidate = row(text, { channel, unreadCount: 0, conversation: { ...row(text).conversation!, channel } });
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
      const [item] = buildFollowUpItems([row('', { contact: { ...contact, source, pipelineStage, sourceDetails: ['email', 'email_inbox'].includes(source) ? { pipelineManuallyAdded: true } : undefined } })]);
      assert.equal(isActiveDeal(item), true, `${source}/${pipelineStage}`);
    }
    for (const tag of ['Hot Lead', 'Warm Lead', 'Hot', 'Warm']) {
      assert.equal(isSalesOpportunity({ ...contact, source, tag }), !['email', 'email_inbox'].includes(source));
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
    ...row().contact, source: 'email', sourceDetails: { emailPipelineSalesEvidence: true }, tag: 'Hot Lead', followUp: 'Call customer', followUpDate: '2026-11-10T15:00:00Z',
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
  const [dealWithoutWork] = buildFollowUpItems([row('Thanks', { contact: { ...row().contact, pipelineStage: 'Proposal', source: 'email', sourceDetails: { pipelineManuallyAdded: true } } })]);
  assert.deepEqual(prioritizeTasks([dealWithoutWork], now), [], 'a deal alone is not recommended as a task');
  const recent = task('recent', 'What is the price?', null);
  const stale = task('older', 'What is the price?', null);
  stale.time = '2026-10-01T12:00:00Z';
  assert.deepEqual(prioritizeTasks([stale, recent], now).map(t => t.id), ['recent', 'older']);
});

test('pipeline search, channel, tags and assignment filter without modifying opportunities', () => {
  const make = (id: string, channel: string, assignedTo: string | null | undefined, tag: string) => {
    const fixture = row('Can you send a quote?');
    return { ...fixture, contact: { ...fixture.contact, id, name: id, sourceDetails: { pipelineManuallyAdded: true }, pipelineStage: 'Proposal', assignedTo, tag }, channel, conversation: { ...fixture.conversation!, channel } };
  };
  const items = buildFollowUpItems([make('Alice', 'whatsapp', 'me', 'Warm'), make('Bob', 'email', null, 'New'), make('Carol', 'instagram', 'teammate', 'Hot'), make('Unknown', 'email', undefined, 'New')]);
  const all: PipelineFilters = { search: '', channel: '', tag: '', assignment: 'all' };
  const before = JSON.stringify(items);
  const ids = (filters: Partial<PipelineFilters>) => filterPipelineItems(items, { ...all, ...filters }, 'me').map(item => item.id);
  assert.deepEqual(ids({ search: ' ALICE ', channel: 'whatsapp', tag: 'Warm', assignment: 'mine' }), ['Alice']);
  assert.deepEqual(ids({ assignment: 'unassigned' }), ['Bob']);
  assert.deepEqual(ids({ assignment: 'others' }), ['Carol']);
  assert.deepEqual(ids({ channel: 'email' }), ['Bob', 'Unknown']);
  assert.deepEqual(ids({ search: 'quote' }), ['Alice', 'Bob', 'Carol', 'Unknown']);
  assert.deepEqual(ids({ search: 'Thanks' }), []);
  assert.deepEqual(ids({ search: 'not present' }), []);
  assert.equal(JSON.stringify(items), before);
});

test('pipeline layouts only rename and reorder stable stages and preserve observed industry stages', () => {
  const layout = defaultPipelineLayout();
  layout[2].label = 'Estimate sent';
  const moved = [layout[2], layout[0], layout[1], layout[3], layout[4]];
  assert.equal(pipelineLayoutSchema.safeParse(moved).success, true);
  assert.deepEqual(orderedPipelineStages(moved, ['Proposal', 'Qualified (Warm)', 'Under Contract']), ['Proposal', 'Lead', 'Contacted', 'Negotiation', 'Closed', 'Qualified (Warm)', 'Under Contract']);
  assert.equal(pipelineStageDisplayLabel(moved, 'Proposal'), 'Estimate sent');
  assert.equal(pipelineStageDisplayLabel(moved, 'Qualified (Warm)'), 'Qualified (Warm)');
  assert.equal(pipelineLayoutSchema.safeParse(moved.slice(1)).success, false);
  assert.equal(pipelineLayoutSchema.safeParse([...moved.slice(0, 4), moved[0]]).success, false);
  assert.equal(pipelineLayoutSchema.safeParse(moved.map(stage => ({ ...stage, label: 'Same' }))).success, false);
  assert.equal(pipelineLayoutSchema.safeParse(moved.map(stage => ({ ...stage, label: ' ' }))).success, false);
  assert.equal(pipelineLayoutSchema.safeParse(moved.map(stage => stage.id === 'Proposal' ? { ...stage, id: 'Estimate sent' } : stage)).success, false);
  assert.equal(pipelineLayoutPatchSchema.safeParse({ workspaceId: 'owner', revision: 0, stages: moved, userId: 'foreign' }).success, false);
  const [item] = buildFollowUpItems([row('Thanks!', { contact: { ...row().contact, pipelineStage: 'Proposal', source: 'email', sourceDetails: { pipelineManuallyAdded: true } } })]);
  assert.equal(isActiveDeal(item), true);
  assert.equal(item.pipelineStage, 'Proposal');
});

test('custom columns require stable mapped stages, cannot be remapped, and cannot revive a deleted column ID', () => {
  const base = defaultPipelineLayout();
  const draftId = 'custom:11111111-1111-4111-8111-111111111111';
  const savedId = 'custom:22222222-2222-4222-8222-222222222222';
  const recreatedId = 'custom:33333333-3333-4333-8333-333333333333';
  const custom: PipelineStageLayout = { id: draftId, label: 'Design and measurements', canonicalStage: 'Proposal' };
  assert.equal(pipelineLayoutSchema.safeParse([...base, custom]).success, true);
  assert.equal(pipelineLayoutSchema.safeParse([...base, { ...custom, canonicalStage: undefined }]).success, false);
  assert.equal(pipelineLayoutSchema.safeParse([...base, { ...custom, canonicalStage: 'Arbitrary' }]).success, false);
  assert.equal(pipelineLayoutSchema.safeParse(base.map(stage => ({ ...stage, canonicalStage: 'Proposal' }))).success, false);
  const saved = preparePipelineLayoutSave([...base, custom], base, () => savedId)!;
  assert.equal(saved[5].id, savedId);
  assert.equal(customPipelineColumn(saved, 'Proposal', savedId), savedId);
  assert.equal(customPipelineColumn(saved, 'Negotiation', savedId), undefined);
  assert.equal(customPipelineColumn(base, 'Proposal', savedId), undefined);
  assert.equal(preparePipelineLayoutSave(saved.map(stage => stage.id === savedId ? { ...stage, canonicalStage: 'Closed' } : stage), saved, () => recreatedId), null);
  const renamed = preparePipelineLayoutSave(saved.map(stage => stage.id === savedId ? { ...stage, label: 'Measurements' } : stage), saved, () => recreatedId)!;
  assert.equal(renamed[5].id, savedId);
  assert.equal(preparePipelineLayoutSave(saved, base, () => recreatedId)![5].id, recreatedId);
  const [deal] = buildFollowUpItems([row('Thanks!', { contact: { ...row().contact, pipelineStage: 'Proposal', pipelineCustomStageId: savedId, source: 'email', sourceDetails: { pipelineManuallyAdded: true } } })]);
  assert.equal(deal.pipelineStage, 'Proposal');
  assert.equal(deal.pipelineCustomStageId, savedId);
  assert.equal(isActiveDeal(deal), true);
});

test('email marketing and informational copy stay out of follow-ups and the pipeline even with legacy tags', () => {
  const examples = [
    "It&#39;s time! Looking for discounted properties? Join the Workshop TODAY",
    "Save on blenders, accessories, and containers. View in your browser",
    "SUBMITTED A message from support. Thank you for contacting support",
    "Confirm your vehicle to see auto insurance quotes specific to your ride.",
    "Hint: it gets real winters. The top five risers are all in the Midwest",
    "Hello, Just checking if you&#39;re interested in improving your website",
    "Explore capital options that can support your investment plans.",
    "Think about that. Most investors spend their time looking for deals.",
    "Hi, Here&#39;s this week&#39;s roundup of news and resources.",
    "Trimming ECO-FRIENDLY EXCITEMENT: THE BIG ELECTRIC DAY BOAT",
    "The same trusted team, now backed by more insight, support, and opportunity",
    "Thousands of consumers are surprised by our outstanding service. January PIN: 1234",
    "Don&#39;t start by looking for a cheap option. Start with three numbers",
    "Are you interested in a demo? We provide marketing services.",
    "I would like to offer you our services.",
    "Can you share your availability for a demo of our product?",
    "Thanks!\nOn Tuesday Alex wrote:\nCan you send a quote?",
  ];
  for (const text of examples) {
    const candidate = row(text, { contact: { ...row().contact, tag: 'Warm', pipelineStage: 'Proposal' } });
    const [item] = buildFollowUpItems([candidate]);
    assert.equal(item.needsReply, false, text);
    assert.equal(item.isOpportunity, false, text);
    assert.deepEqual(prioritizeTasks([item]), [], text);
  }
  const subjectOnly = row('Here is our weekly update.');
  subjectOnly.conversation!.subject = 'Can you send a quote?';
  subjectOnly.lastMessage = 'Can you send a quote?';
  assert.equal(hasActionableInquiry(subjectOnly), false);
  for (const text of ["Hi, could you send me a quote for kitchen remodeling?", "I would like to book a consultation.", "Quisiera una cotización para mi cocina.", "אני מעוניין לקבל הצעת מחיר לשיפוץ מטבח"]) {
    assert.equal(hasActionableInquiry(row(text)), true, text);
  }
  for (const stage of ['Lead', 'Contacted', 'Proposal']) {
    const manuallyAdded = row('Thanks!', { contact: { ...row().contact, pipelineStage: stage, sourceDetails: { pipelineManuallyAdded: true } } });
    assert.equal(buildFollowUpItems([manuallyAdded])[0].isOpportunity, true);
    assert.equal(buildFollowUpItems([manuallyAdded])[0].needsReply, false);
  }
});

test('dismissed recommendation is message-specific and preserves reminders and other threads', () => {
  const first = row('Can you send a quote?');
  const dismissed = { ...first, conversation: { ...first.conversation!, dismissedReplyMessageAt: now.toISOString() } };
  assert.equal(hasActionableInquiry(dismissed), false);
  assert.equal(buildFollowUpItems([dismissed])[0].needsReply, false);
  assert.deepEqual(prioritizeTasks(buildFollowUpItems([dismissed]), now), []);
  const next = { ...dismissed, lastMessageAt: new Date(now.getTime() + 1000).toISOString() };
  assert.equal(hasActionableInquiry(next), true);
  const sibling = { ...first, conversation: { ...first.conversation!, id: 'sibling' } };
  const [representative] = buildFollowUpItems([dismissed, sibling]);
  assert.equal(representative.conversationId, 'sibling');
  assert.equal(representative.needsReply, true);
  assert.equal(representative.replyMessageAt, now.toISOString());
  const reminder = { ...dismissed, contact: { ...dismissed.contact, followUp: 'Call customer', followUpDate: now.toISOString() } };
  assert.equal(hasScheduledFollowUp(buildFollowUpItems([reminder])[0]), true);
});

test('legacy email notification with Warm Lead and Appointment Requested is not a deal', () => {
  for (const source of ['email', 'email_inbox']) {
    const contact = { ...row().contact, source, pipelineStage: 'Appointment Requested', tag: 'Warm Lead' };
    const notice = row('You have used $2.51 of usage so far', { contact });
    assert.equal(isSalesOpportunity(contact), false);
    assert.equal(buildFollowUpItems([notice])[0].isOpportunity, false);
    assert.equal(hasActionableInquiry(notice), false);
    assert.equal(isSalesOpportunity({ ...contact, sourceDetails: { contactLifecycle: 'saved' } }), false);
    assert.equal(isSalesOpportunity({ ...contact, sourceDetails: { pipelineManuallyAdded: true } }), true);
    assert.equal(isSalesOpportunity({ ...contact, sourceDetails: { emailPipelineSalesEvidence: true } }), true);
  }
});
test('only direct inbound sales requests establish durable email pipeline evidence', () => {
  const check = (body: string, headers?: Record<string,string>) => qualifiesEmailPipelineSalesEvidence({ senderEmail: 'customer@example.com', subject: 'Question', body, headers });
  assert.equal(check('Could you send a quote for kitchen remodeling?'), true);
  assert.equal(check('I would like to book a consultation.'), true);
  assert.equal(check('You have used $2.51 of usage so far'), false);
  assert.equal(check('Can you help with my account?'), false);
  assert.equal(check('Thanks!\nOn Tuesday Alex wrote:\nCould you send a quote?'), false);
  assert.equal(check('Can you reschedule my appointment?'), false);
  assert.equal(check('Can you share your availability for a demo of our product?'), false);
  assert.equal(check('Could you send a quote?', { 'Auto-Submitted': 'auto-generated' }), false);
  assert.equal(check('Could you send a quote?', { 'List-ID': 'newsletter' }), false);
});
test('removal wins over every admission reason and preserves independent work', () => {
  const contact = { ...row().contact, source: 'email', tag: 'Hot Lead', pipelineStage: 'Proposal', followUp: 'Call customer', followUpDate: now.toISOString(), sourceDetails: { pipelineManuallyRemoved: true, pipelineManuallyAdded: true, emailPipelineSalesEvidence: true } };
  const item = buildFollowUpItems([row('Could you send a quote?', { contact })])[0];
  assert.equal(item.isOpportunity, false);
  assert.equal(item.needsReply, true);
  assert.equal(hasScheduledFollowUp(item), true);
  assert.equal(isSalesOpportunity({ ...contact, source: 'whatsapp' }), false);
  assert.equal(isSalesOpportunity({ ...contact, sourceDetails: { pipelineManuallyAdded: true } }), true);
});
