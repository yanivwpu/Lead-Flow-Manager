export type DemoChannel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok';

export interface DemoChat {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  whatsappPhone?: string | null;
  channel: DemoChannel;
  lastMessage: string;
  time: string;
  unread: number;
  tag: string;
  followUp: string | null;
  followUpDate: string | null;
  notes: string;
  pipelineStage: string;
  messages: { id: string; text: string; sender: string; time: string; mediaUrl?: string; mediaType?: string }[];
  createdAt: string;
}

export const DEMO_CHATS: DemoChat[] = [
  {
    id: "demo-1",
    userId: "demo",
    name: "Sarah Johnson",
    avatar: "https://i.pravatar.cc/150?u=sarah",
    channel: "whatsapp",
    lastMessage: "Yes, I'd love to see the premium package details!",
    time: "10:32 AM",
    unread: 2,
    tag: "Hot Lead",
    followUp: "Tomorrow",
    followUpDate: new Date(Date.now() + 86400000).toISOString(),
    notes: "Interested in premium tier. Budget around $5k. Decision by end of week.",
    pipelineStage: "Proposal",
    messages: [
      { id: "m1", text: "Hi! I saw your ad on Instagram about the marketing package", sender: "them", time: "10:15 AM" },
      { id: "m2", text: "Hello Sarah! Thanks for reaching out. Which package caught your eye?", sender: "me", time: "10:18 AM" },
      { id: "m3", text: "The one for small businesses. Do you have something more comprehensive?", sender: "them", time: "10:25 AM" },
      { id: "m4", text: "Absolutely! We have a premium package that includes social media management, SEO, and monthly analytics. Would you like the details?", sender: "me", time: "10:28 AM" },
      { id: "m5", text: "Yes, I'd love to see the premium package details!", sender: "them", time: "10:32 AM" },
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "demo-2",
    userId: "demo",
    name: "Mike Chen",
    avatar: "https://i.pravatar.cc/150?u=mike",
    channel: "instagram",
    lastMessage: "Let me discuss with my partner and get back to you",
    time: "Yesterday",
    unread: 0,
    tag: "Warm Lead",
    followUp: "3 days",
    followUpDate: new Date(Date.now() + 86400000 * 3).toISOString(),
    notes: "Sent quote for website redesign - $3,200. Partner needs to approve.",
    pipelineStage: "Negotiation",
    messages: [
      { id: "m1", text: "Hi, we spoke last week about redesigning our company website", sender: "them", time: "2:30 PM" },
      { id: "m2", text: "Hi Mike! Yes, I remember. I've prepared a quote based on our discussion.", sender: "me", time: "2:35 PM" },
      { id: "m3", text: "Great, can you send it over?", sender: "them", time: "2:40 PM" },
      { id: "m4", text: "Just sent it to your email! The total is $3,200 including the mobile-responsive design and CMS integration.", sender: "me", time: "2:45 PM" },
      { id: "m5", text: "Let me discuss with my partner and get back to you", sender: "them", time: "3:00 PM" },
    ],
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "demo-3",
    userId: "demo",
    name: "Emma Wilson",
    avatar: "https://i.pravatar.cc/150?u=emma",
    channel: "facebook",
    lastMessage: "Perfect! The payment has been sent",
    time: "2 days ago",
    unread: 0,
    tag: "Paid",
    followUp: null,
    followUpDate: null,
    notes: "Logo design project completed. Invoice paid. Happy customer - ask for referral next month.",
    pipelineStage: "Closed",
    messages: [
      { id: "m1", text: "I love the final logo design! It's exactly what I envisioned", sender: "them", time: "11:00 AM" },
      { id: "m2", text: "So glad you love it, Emma! I'll send over the final files and invoice now.", sender: "me", time: "11:05 AM" },
      { id: "m3", text: "Received! Just processing the payment now", sender: "them", time: "11:30 AM" },
      { id: "m4", text: "Perfect! The payment has been sent", sender: "them", time: "11:45 AM" },
    ],
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
  },
  {
    id: "demo-4",
    userId: "demo",
    name: "David Martinez",
    avatar: "https://i.pravatar.cc/150?u=david",
    channel: "telegram",
    lastMessage: "Can you tell me more about your services?",
    time: "Just now",
    unread: 1,
    tag: "New",
    followUp: null,
    followUpDate: null,
    notes: "",
    pipelineStage: "Lead",
    messages: [
      { id: "m1", text: "Hi! Found your business through Google. Can you tell me more about your services?", sender: "them", time: "Just now" },
    ],
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-5",
    userId: "demo",
    name: "Lisa Thompson",
    avatar: "https://i.pravatar.cc/150?u=lisa",
    channel: "sms",
    lastMessage: "I'll need to think about it. The price is a bit high for us right now.",
    time: "3 days ago",
    unread: 0,
    tag: "Hot Lead",
    followUp: "1 week",
    followUpDate: new Date(Date.now() + 86400000 * 7).toISOString(),
    notes: "Price objection. Consider offering 10% discount if they commit this month.",
    pipelineStage: "Contacted",
    messages: [
      { id: "m1", text: "Thanks for the detailed proposal", sender: "them", time: "9:00 AM" },
      { id: "m2", text: "You're welcome! Do you have any questions about the scope?", sender: "me", time: "9:15 AM" },
      { id: "m3", text: "I'll need to think about it. The price is a bit high for us right now.", sender: "them", time: "9:30 AM" },
    ],
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: "demo-6",
    userId: "demo",
    name: "James Brown",
    avatar: "https://i.pravatar.cc/150?u=james",
    channel: "webchat",
    lastMessage: "We've decided to go with another vendor. Thanks anyway!",
    time: "1 week ago",
    unread: 0,
    tag: "Lost",
    followUp: null,
    followUpDate: null,
    notes: "Lost to competitor. Follow up in 6 months to check if they're happy with their choice.",
    pipelineStage: "Lead",
    messages: [
      { id: "m1", text: "Hi, just wanted to let you know about our decision", sender: "them", time: "4:00 PM" },
      { id: "m2", text: "Of course, I appreciate you getting back to me. What did you decide?", sender: "me", time: "4:05 PM" },
      { id: "m3", text: "We've decided to go with another vendor. Thanks anyway!", sender: "them", time: "4:10 PM" },
      { id: "m4", text: "No problem at all! If anything changes in the future, feel free to reach out. Best of luck!", sender: "me", time: "4:15 PM" },
    ],
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
  },
];
