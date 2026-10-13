/** URL-only list state: deep links and browser history retain filters without a separate persistent cache. */
export function readContactsListState(search: string) {
  const p = new URLSearchParams(search);
  const sort = p.get('sort');
  const tab = p.get('tab');
  return {
    search: p.get('q') || '', filterTag: p.get('tag') || '',
    filterChannel: p.get('channel') || '', filterStage: p.get('stage') || '',
    listTab: tab === 'all' || tab === 'website_visitors' ? tab : 'identified',
    sortField: sort === 'name' || sort === 'pipelineStage' || sort === 'tag' ? sort : 'createdAt',
    sortDir: p.get('dir') === 'asc' ? 'asc' : 'desc',
  } as const;
}
export function contactsListHref(search: string) {
  const p = new URLSearchParams(search);
  return `/app/contacts${p.size ? `?${p}` : ''}`;
}
export function contactDetailsHref(id: string, search: string) {
  return `/app/contacts/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(contactsListHref(search))}`;
}
export function safeContactsReturnHref(search: string) {
  const path = new URLSearchParams(search).get('returnTo') || '';
  return path === '/app/contacts' || path.startsWith('/app/contacts?') ? path : '/app/contacts';
}
export function contactConversationHref(id: string, conversationId: string | null) {
  return conversationId ? `/app/inbox/${encodeURIComponent(id)}?conversation=${encodeURIComponent(conversationId)}` : null;
}
