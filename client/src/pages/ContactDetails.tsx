import { useState } from 'react';
import { Link, useRoute, useSearch } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageCircle, Pencil, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/lib/subscription-context';
import { useAuth } from '@/lib/auth-context';
import { withUserQueryScope } from '@/lib/accountQueryScope';
import { pipelineStageOptions, TAG_COLORS } from '@/lib/data';
import { safeContactsReturnHref, contactConversationHref } from '@shared/contactDetailsNavigation';
import type { ContactDetailsData } from '@shared/contactDetails';

async function request<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, { method, credentials: 'include', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(res.status === 404 ? 'Contact not found or access unavailable.' : data?.error || 'Unable to save. Please try again.');
  }
  return res.json();
}
const when = (date: string | null) => date ? new Date(date).toLocaleString() : 'Unavailable';
const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="min-w-0 rounded-lg border bg-white p-4 sm:p-5 [&_h2]:!text-start [&_h2+p]:!text-start"><h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>{children}</section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0 space-y-1 text-sm"><span className="text-slate-500">{label}</span>{children}</label>;
}

type TeamMember = { id: string; memberId: string | null; name: string | null; email: string; status: string };
function ProfileEditor({ profile, team, assignmentEnabled, save, pending, close }: {
  profile: ContactDetailsData['profile']; team: TeamMember[]; assignmentEnabled: boolean;
  save: (patch: Record<string, unknown>) => void; pending: boolean; close: () => void;
}) {
  const [baseline] = useState(profile);
  const [form, setForm] = useState({ name: profile.name, email: profile.email || '', phone: profile.phone || '',
    tag: profile.tag, pipelineStage: profile.pipelineStage, assignedTo: profile.assignedTo || '' });
  const change = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  return <form className="space-y-4" onSubmit={e => {
    e.preventDefault();
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(form)) {
      if (profile.identityReadOnly && ['name', 'email', 'phone'].includes(key)) continue;
      const old = baseline[key as keyof typeof baseline] || '';
      if (value !== old) patch[key] = key === 'assignedTo' ? value || null : value;
    }
    if (Object.keys(patch).length) save({ ...patch, expectedUpdatedAt: baseline.updatedAt }); else close();
  }}>
    <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
      <Field label="Name"><Input value={form.name} required disabled={profile.identityReadOnly} onChange={e => change('name', e.target.value)} /></Field>
      <Field label="Email"><Input type="email" value={form.email} disabled={profile.identityReadOnly} onChange={e => change('email', e.target.value)} /></Field>
      <Field label="Phone"><Input value={form.phone} disabled={profile.identityReadOnly} onChange={e => change('phone', e.target.value)} /></Field>
      <Field label="Tag"><Input value={form.tag} list="contact-tags" onChange={e => change('tag', e.target.value)} /><datalist id="contact-tags">{Object.keys(TAG_COLORS).map(t => <option key={t} value={t} />)}</datalist></Field>
      <Field label="Pipeline stage"><select className={selectClass} value={form.pipelineStage} onChange={e => change('pipelineStage', e.target.value)}>{pipelineStageOptions(form.pipelineStage).map(s => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Assigned to"><select disabled={!assignmentEnabled} className={selectClass} value={form.assignedTo} onChange={e => change('assignedTo', e.target.value)}><option value="">Unassigned</option>{team.filter(m => m.memberId && m.status === 'active').map(m => <option key={m.id} value={m.memberId!}>{m.name || m.email}</option>)}{form.assignedTo && !team.some(m => m.memberId === form.assignedTo) && <option value={form.assignedTo}>Current team member</option>}</select></Field>
    </fieldset>
    {profile.identityReadOnly && <p className="text-xs text-slate-500">Shopify-linked name, email and phone are managed by synchronization. CRM fields can be edited here.</p>}
    <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button><Button type="button" variant="outline" disabled={pending} onClick={close}>Cancel</Button></div>
  </form>;
}

function DetailsContent({ data, url, refresh }: { data: ContactDetailsData; url: string; refresh: () => Promise<void> }) {
  const { user } = useAuth();
  const { profile: p } = data;
  const { data: subscription } = useSubscription();
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUp, setFollowUp] = useState(p.followUp || '');
  const [due, setDue] = useState('');
  const [conversation, setConversation] = useState(data.conversations[0]?.id || '');
  const { data: team = [] } = useQuery<TeamMember[]>({ queryKey: withUserQueryScope(['/api/team'], user?.id), queryFn: () => request('/api/team'), enabled: !!user });
  const edit = useMutation({ mutationFn: (patch: Record<string, unknown>) => request(url, 'PATCH', { expectedUpdatedAt: p.updatedAt, ...patch }), onSuccess: async () => { await refresh(); setEditing(false); setFollowUpOpen(false); } });
  const addNote = useMutation({ mutationFn: () => request(`/api/contacts/${encodeURIComponent(p.id)}/notes`, 'POST', { content: note.trim() }), onSuccess: async () => { setNote(''); await refresh(); } });
  const href = contactConversationHref(p.id, data.conversations.some(c => c.id === conversation) ? conversation : null);
  const assignee = team.find(m => m.memberId === p.assignedTo);
  return <>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h1 className="break-words text-2xl font-semibold text-slate-900">{p.name}</h1><div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{p.pipelineStage}</Badge>{p.tag && <Badge variant="outline">{p.tag}</Badge>}<span className="text-sm text-slate-500">{p.channel}{p.leadScore != null && ` · Lead score ${p.leadScore}/100`}</span></div></div>
      <div className="flex flex-wrap items-center gap-2">
        {data.conversations.length > 1 && <select aria-label="Conversation channel" className={`${selectClass} w-auto max-w-full`} value={conversation} onChange={e => setConversation(e.target.value)}>{data.conversations.map(c => <option value={c.id} key={c.id}>{titleCase(c.channel)}</option>)}</select>}
        {href ? <Button asChild><Link href={href}><MessageCircle className="mr-2 h-4 w-4" />Open Conversation</Link></Button> : <Button disabled>No conversation yet</Button>}
      </div>
    </header>
    {edit.error && <p role="alert" className="text-sm text-red-600">{edit.error.message} <button className="underline" onClick={async () => { await refresh(); setEditing(false); edit.reset(); }}>Refresh contact</button></p>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="min-w-0 space-y-4">
        <Section title="Contact profile">
          {editing ? <ProfileEditor profile={p} team={team} assignmentEnabled={subscription?.limits.assignmentEnabled === true} save={patch => edit.mutate(patch)} pending={edit.isPending} close={() => setEditing(false)} /> : <>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{[
              ['Email', p.email || 'Not provided'], ['Phone', p.phone || 'Not provided'], ['Source', titleCase(p.source || 'Unknown')],
              ['Assigned to', p.assignedTo ? assignee?.name || assignee?.email || 'Team member' : 'Unassigned'], ['Created', when(p.createdAt)], ['Last updated', when(p.updatedAt)],
            ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-900">{value}</dd></div>)}</dl>
            {p.shopifyLinked && <p className="mt-3 text-xs text-slate-500">Profile linked to Shopify synchronization.</p>}
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing(true)}><Pencil className="mr-2 h-3.5 w-3.5" />Edit contact</Button>
          </>}
        </Section>
        <Section title="Follow-up">
          {p.followUp && <p className="break-words text-sm">{p.followUp}</p>}{p.followUpDate && <p className="mt-1 text-xs text-slate-500">Due {when(p.followUpDate)}</p>}
          {followUpOpen ? <form className="mt-3 space-y-3" onSubmit={e => { e.preventDefault(); edit.mutate({ followUp: followUp.trim(), followUpDate: new Date(due).toISOString() }); }}>
            <Field label="Follow-up"><Input required value={followUp} onChange={e => setFollowUp(e.target.value)} /></Field>
            <Field label="Due date"><Input type="datetime-local" required value={due} onChange={e => setDue(e.target.value)} /></Field>
            <div className="flex gap-2"><Button size="sm" disabled={edit.isPending}>Save follow-up</Button><Button size="sm" variant="outline" type="button" onClick={() => setFollowUpOpen(false)}>Cancel</Button></div>
          </form> : <Button className="mt-3" size="sm" variant="outline" onClick={() => setFollowUpOpen(true)}>{p.followUpDate ? 'Update follow-up' : 'Create follow-up'}</Button>}
        </Section>
        <Section title="CRM notes">
          {p.notes && <p className="mb-3 whitespace-pre-wrap break-words text-sm">{p.notes}</p>}
          <ul className="space-y-3">{data.notes.map(n => <li key={n.id} className="border-b pb-3 text-sm"><p className="whitespace-pre-wrap break-words">{n.content}</p><p className="mt-1 text-xs text-slate-500">{n.author || 'Team member'} · {when(n.createdAt)}</p></li>)}</ul>
          {!p.notes && !data.notes.length && <p className="text-sm text-slate-500">No notes yet.</p>}
          <form className="mt-4 space-y-2" onSubmit={e => { e.preventDefault(); addNote.mutate(); }}><Field label="Add a CRM note"><Textarea disabled={addNote.isPending} required maxLength={10000} value={note} onChange={e => setNote(e.target.value)} rows={3} /></Field><Button size="sm" disabled={!note.trim() || addNote.isPending}>{addNote.isPending ? 'Adding…' : 'Add note'}</Button>{addNote.error && <p role="alert" className="text-sm text-red-600">{addNote.error.message}</p>}</form>
        </Section>
      </div>
      <div className="min-w-0 space-y-4">
        {data.shopify && <Section title="Shopify customer & orders">
          <p className="break-words text-sm text-slate-500">{data.shopify.shop || 'Shopify store'} · Synchronized data</p>
          <p className="mt-2 break-words text-sm">{p.name}{p.email && ` · ${p.email}`}</p>
          {data.shopify.ordersCount != null && <p className="mt-1 text-sm">{data.shopify.ordersCount} orders{data.shopify.totalSpent && ` · Total spent ${data.shopify.totalSpent} (store currency)`}</p>}
          {!data.shopify.orders.length && <p className="mt-3 text-sm text-slate-500">No synchronized order details available.</p>}
          <ul className="mt-3 divide-y">{data.shopify.orders.map(o => <li key={o.key} className="py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2 font-medium"><span>Order {o.number || 'number unavailable'}</span><span>{o.total ? `${o.currency || ''} ${o.total}` : 'Total unavailable'}</span></div>
            <p className="mt-1 text-xs text-slate-500">{o.dateSource} {when(o.date)}{o.payment && ` · Payment: ${titleCase(o.payment)}`}{o.fulfillment && ` · Fulfillment: ${titleCase(o.fulfillment)}`}</p>
            <ul className="mt-2 space-y-1">{o.items.map((i, idx) => <li key={idx} className="break-words">{i.title}{i.quantity != null && ` × ${i.quantity}`}</li>)}</ul>
          </li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">Shows orders in the latest 500 persisted activity events. Missing statuses are omitted; sync dates are labeled when order dates are unavailable.</p>
        </Section>}
        <Section title="Activity timeline">
          <ol className="space-y-4">{data.timeline.map(e => <li key={e.id} className="border-l-2 border-slate-200 pl-3"><p className="text-sm font-medium">{titleCase(e.title)}</p>{e.detail && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{e.detail}</p>}<p className="mt-1 text-xs text-slate-400">{when(e.date)}</p></li>)}</ol>
          {!data.timeline.length && <p className="text-sm text-slate-500">No recorded activity.</p>}
        </Section>
      </div>
    </div>
  </>;
}

export function ContactDetails() {
  const [, params] = useRoute('/app/contacts/:contactId');
  const search = useSearch();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const id = params?.contactId;
  const url = `/api/contacts/${encodeURIComponent(id || '')}/details`;
  const query = useQuery<ContactDetailsData>({ queryKey: withUserQueryScope([url], user?.id), queryFn: () => request(url), enabled: !!user && !!id, retry: false });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [url] }),
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/notes-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/inbox'] }),
    ]);
  };
  return <div className="h-full overflow-y-auto bg-slate-50 p-4 sm:p-6" data-testid="contact-details">
    <div className="mx-auto max-w-6xl space-y-5">
      <Link href={safeContactsReturnHref(search)} className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" />Back to Contacts</Link>
      {query.isLoading && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading contact…</p>}
      {query.error ? <div role="alert" className="rounded-lg border bg-white p-5"><p>{query.error.message}</p><Button variant="outline" className="mt-3" onClick={() => query.refetch()}>Try again</Button></div> : query.data && <DetailsContent key={`${user?.id}:${id}`} data={query.data} url={url} refresh={refresh} />}
    </div>
  </div>;
}
