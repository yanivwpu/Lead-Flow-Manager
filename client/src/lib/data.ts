import { Zap, CheckCircle2, Clock, AlertCircle, DollarSign, XCircle, Search, MessageSquare, ListTodo, MoreVertical, Send, Phone, Video, Paperclip, Mic, Smile } from "lucide-react";

export type Tag = 'New' | 'Hot' | 'Quoted' | 'Paid' | 'Waiting' | 'Lost';
export type FollowUp = 'Tomorrow' | '3 days' | '1 week' | null;

export interface Message {
  id: string;
  text: string;
  sender: 'me' | 'them';
  time: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
}

export interface Chat {
  id: string;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  tag: Tag;
  followUp: FollowUp;
  messages: Message[];
  notes: string;
  pipelineStage: 'Lead' | 'Contacted' | 'Proposal' | 'Negotiation' | 'Closed';
}

export const MOCK_CHATS: Chat[] = [
  {
    id: '1',
    name: 'Sarah Wilson',
    avatar: 'https://i.pravatar.cc/150?u=sarahw',
    lastMessage: 'That sounds great! Can you send the pricing?',
    time: '10:42 AM',
    unread: 2,
    tag: 'Hot',
    followUp: 'Tomorrow',
    notes: 'Interested in the premium plan. Needs approval from manager.',
    pipelineStage: 'Proposal',
    messages: [
      { id: '1', text: 'Hi Sarah, thanks for reaching out!', sender: 'me', time: '10:30 AM' },
      { id: '2', text: 'I saw you were interested in our enterprise tier.', sender: 'me', time: '10:30 AM' },
      { id: '3', text: 'Yes, exactly. We have a team of 15.', sender: 'them', time: '10:35 AM' },
      { id: '4', text: 'That sounds great! Can you send the pricing?', sender: 'them', time: '10:42 AM' },
    ]
  },
  {
    id: '2',
    name: 'TechCorp Solutions',
    avatar: 'https://i.pravatar.cc/150?u=techcorp',
    lastMessage: 'Payment has been processed.',
    time: 'Yesterday',
    unread: 0,
    tag: 'Paid',
    followUp: null,
    notes: 'Onboarding scheduled for next Tuesday.',
    pipelineStage: 'Closed',
    messages: [
      { id: '1', text: 'Invoice #2024-001 sent.', sender: 'me', time: 'Yesterday' },
      { id: '2', text: 'Payment has been processed.', sender: 'them', time: 'Yesterday' },
    ]
  },
  {
    id: '3',
    name: 'David Chen',
    avatar: 'https://i.pravatar.cc/150?u=davidc',
    lastMessage: 'Let me think about it.',
    time: 'Mon',
    unread: 0,
    tag: 'Waiting',
    followUp: '3 days',
    notes: 'Price objection. Offered 10% discount if closed by EOM.',
    pipelineStage: 'Negotiation',
    messages: [
      { id: '1', text: 'The price is a bit higher than we expected.', sender: 'them', time: 'Mon' },
      { id: '2', text: 'I understand. What if we could include the onboarding for free?', sender: 'me', time: 'Mon' },
      { id: '3', text: 'Let me think about it.', sender: 'them', time: 'Mon' },
    ]
  },
  {
    id: '4',
    name: 'Emma Davis',
    avatar: 'https://i.pravatar.cc/150?u=emmad',
    lastMessage: 'Is this available in Spanish?',
    time: 'Mon',
    unread: 1,
    tag: 'New',
    followUp: null,
    notes: '',
    pipelineStage: 'Lead',
    messages: [
      { id: '1', text: 'Hi! I found your website.', sender: 'them', time: 'Mon' },
      { id: '2', text: 'Is this available in Spanish?', sender: 'them', time: 'Mon' },
    ]
  },
  {
    id: '5',
    name: 'Robert Fox',
    avatar: 'https://i.pravatar.cc/150?u=robertf',
    lastMessage: 'Not interested right now.',
    time: 'Last Week',
    unread: 0,
    tag: 'Lost',
    followUp: '1 week',
    notes: 'Revisit in Q3.',
    pipelineStage: 'Lead',
    messages: [
      { id: '1', text: 'Just checking in on this.', sender: 'me', time: 'Last Week' },
      { id: '2', text: 'Not interested right now.', sender: 'them', time: 'Last Week' },
    ]
  }
];

export const TAG_COLORS: Record<string, string> = {
  'New': 'bg-blue-100 text-blue-700 border-blue-200',
  'Hot': 'bg-red-100 text-red-700 border-red-200',
  'Hot Lead': 'bg-red-100 text-red-700 border-red-200',
  'Warm': 'bg-purple-100 text-purple-700 border-purple-200',
  'Warm Lead': 'bg-purple-100 text-purple-700 border-purple-200',
  'Cold': 'bg-sky-100 text-sky-700 border-sky-200',
  'Cold Lead': 'bg-sky-100 text-sky-700 border-sky-200',
  'Quoted': 'bg-amber-100 text-amber-700 border-amber-200',
  'Paid': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Waiting': 'bg-slate-100 text-slate-700 border-slate-200',
  'Lost': 'bg-gray-100 text-gray-700 border-gray-200',
  'Investor': 'bg-cyan-100 text-cyan-700 border-cyan-200',
  'Customer': 'bg-green-100 text-green-700 border-green-200',
  'VIP': 'bg-amber-100 text-amber-700 border-amber-200',
  'Buyer': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Seller': 'bg-pink-100 text-pink-700 border-pink-200',
  'Lead': 'bg-blue-100 text-blue-700 border-blue-200',
};

export const PIPELINE_STAGES = ['Lead', 'Contacted', 'Proposal', 'Negotiation', 'Closed'];

/** RGE-style names not in PIPELINE_STAGES; client-only hint for “stage exists” in Copilot suggestions (real-estate). */
export const RGE_OPTIONAL_PIPELINE_STAGES = [
  'Qualified (Hot)',
  'Appointment Requested',
  'Appointment Booked',
  'Appointment Set',
] as const;
