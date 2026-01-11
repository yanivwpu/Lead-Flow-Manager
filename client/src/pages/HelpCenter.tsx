import { useState, useRef, ReactNode } from "react";
import { Helmet } from "react-helmet";
import { 
  Search, ChevronRight, MessageSquare, Settings, Zap, Plug, 
  Phone, Bell, Users, FileText, Tag, Clock, Mail, Shield,
  CreditCard, HelpCircle, BookOpen, Smartphone, Globe, Heart, X
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  content: string;
  category: string;
  icon: any;
  keywords: string[];
}

const HELP_ARTICLES: Article[] = [
  {
    id: "getting-started",
    title: "Getting Started with WhachatCRM",
    category: "Getting Started",
    icon: BookOpen,
    keywords: ["start", "begin", "new", "setup", "introduction"],
    content: `
# Getting Started with WhachatCRM

Welcome to WhachatCRM! This guide will help you get up and running quickly.

## Step 1: Connect Your Twilio Account

WhachatCRM uses your own Twilio account for WhatsApp messaging. This means:
- **Zero message markup** - You pay Twilio directly at their rates
- **Full control** - Your messages, your account
- **Better deliverability** - Direct connection to WhatsApp

To connect Twilio:
1. Go to **Settings** > **WhatsApp Connection**
2. Enter your Twilio Account SID and Auth Token (find these in your Twilio Console)
3. Add your Twilio WhatsApp phone number
4. Click **Save & Test Connection**

## Step 2: Import or Add Contacts

You can add contacts manually or import them:
- **Manual**: Click the + button in Chats to create a new conversation
- **Import**: Go to Settings and use the import feature (Starter plan and above)

## Step 3: Start Messaging

Once connected, you can:
- Send and receive WhatsApp messages
- Add notes and tags to conversations
- Set follow-up reminders
- Track deals through pipeline stages

## Step 4: Set Up Automation

Save time with automated features:
- **Away Messages**: Auto-reply outside business hours
- **Auto-Responders**: Reply instantly to new messages
- **Drip Sequences**: Send scheduled message series (Pro plan)
- **Workflows**: Automate tagging and assignments (Pro plan)
    `
  },
  {
    id: "connect-twilio",
    title: "How to Connect Twilio for WhatsApp",
    category: "Getting Started",
    icon: Phone,
    keywords: ["twilio", "connect", "whatsapp", "phone", "setup", "credentials", "sid", "token"],
    content: `
# Connecting Twilio for WhatsApp

WhachatCRM requires a Twilio account with WhatsApp enabled. Here's how to set it up:

## Prerequisites

1. A Twilio account (sign up at twilio.com)
2. A WhatsApp-enabled phone number from Twilio
3. WhatsApp Business API approval

## Finding Your Credentials

1. Log in to the [Twilio Console](https://console.twilio.com)
2. On the dashboard, find your **Account SID** and **Auth Token**
3. Copy these values - you'll need them in WhachatCRM

## Getting a WhatsApp Number

1. In Twilio Console, go to **Messaging** > **Senders** > **WhatsApp Senders**
2. Follow Twilio's process to get a WhatsApp-enabled number
3. For testing, you can use Twilio's Sandbox (free trial)

## Connecting to WhachatCRM

1. Go to **Settings** in WhachatCRM
2. Scroll to **WhatsApp Connection**
3. Enter your:
   - Account SID
   - Auth Token
   - WhatsApp Phone Number (format: +1234567890)
4. Click **Save & Test Connection**

## Testing the Connection

After saving:
- The status should show "Connected"
- You can send a test message to verify

## Troubleshooting

**"Invalid credentials"**: Double-check your SID and Token
**"Number not found"**: Ensure the number is WhatsApp-enabled in Twilio
**Messages not sending**: Check your Twilio account balance
    `
  },
  {
    id: "managing-chats",
    title: "Managing Conversations & Chats",
    category: "Chats",
    icon: MessageSquare,
    keywords: ["chat", "conversation", "message", "contact", "manage"],
    content: `
# Managing Conversations

The Chats page is your main workspace for handling customer conversations.

## Chat List

The left panel shows all your conversations:
- **Search**: Find chats by name or phone number
- **Filter by tag**: Click tags to filter (New, Hot, Quoted, etc.)
- **Sort**: Conversations sorted by most recent activity

## Chat Details

Click a chat to see:
- **Messages**: Full conversation history
- **Customer info**: Name, phone, email
- **Notes**: Internal notes visible only to your team
- **Tags**: Color-coded labels for organization
- **Pipeline stage**: Track deal progress

## Sending Messages

In the message input:
- Type your message and press Enter or click Send
- Messages are sent via WhatsApp through your Twilio account
- Delivery status shows when messages are sent/delivered

## Adding Notes

Notes help your team stay informed:
1. Click the **Notes** section in chat details
2. Type your note
3. Notes are saved automatically
4. Notes are internal - customers don't see them

## Using Tags

Tags help organize conversations:
- **New**: Fresh leads
- **Hot**: High-priority prospects
- **Quoted**: Sent a quote/proposal
- **Paid**: Converted customers
- **Waiting**: Awaiting response
- **Lost**: Deals that didn't close

Click a tag in the chat details to apply it.

## Pipeline Stages

Track deal progress:
- Lead → Contacted → Proposal → Negotiation → Closed
- Update stages as deals progress
- View pipeline analytics in your dashboard
    `
  },
  {
    id: "followups",
    title: "Setting Follow-up Reminders",
    category: "Chats",
    icon: Clock,
    keywords: ["followup", "follow-up", "reminder", "schedule", "task", "todo"],
    content: `
# Follow-up Reminders

Never forget to follow up with a lead again. WhachatCRM's reminder system keeps you on track.

## Setting a Follow-up

In any chat:
1. Click the **Follow-up** dropdown in chat details
2. Select a timeframe:
   - Tomorrow
   - In 3 days
   - In 1 week
   - Custom date
3. The follow-up is set automatically

## Viewing Follow-ups

Go to the **Follow-ups** page to see:
- All upcoming reminders
- Overdue follow-ups (highlighted)
- Quick access to jump to the chat

## Completing Follow-ups

When you've followed up:
1. Click the chat from the Follow-ups page
2. Send your message
3. Click "Mark as Done" to clear the reminder
4. Or set a new follow-up date

## Getting Notifications

Don't miss a follow-up:
- **Push notifications**: Get browser alerts (enable in Settings)
- **Email reminders**: Receive email when follow-ups are due

Configure these in **Settings** > **Notifications**.
    `
  },
  {
    id: "auto-reply",
    title: "Auto-Reply & Away Messages",
    category: "Automation",
    icon: Mail,
    keywords: ["auto", "reply", "away", "automatic", "response", "business hours"],
    content: `
# Auto-Reply & Away Messages

Automatically respond to customers even when you're busy or away.

## Away Messages (Business Hours)

Set up automatic responses outside business hours:

1. Go to **Settings** > **Auto-Reply & Business Hours**
2. Enable **Business Hours**
3. Set your working hours (e.g., 9 AM - 5 PM)
4. Select working days (e.g., Monday-Friday)
5. Enable **Away Message**
6. Customize your away message

When customers message outside hours, they'll receive your away message automatically.

## Auto-Reply (Instant Response)

Send immediate replies to all new messages:

1. In Settings, enable **Auto-Reply**
2. Customize your auto-reply message
3. Optionally set a delay (e.g., reply after 30 seconds)

This is great for:
- Acknowledging receipt
- Setting response time expectations
- Providing quick info

## Best Practices

**Away Message Example:**
"Thanks for reaching out! We're currently away but will respond as soon as we're back during business hours (9 AM - 5 PM EST, Mon-Fri)."

**Auto-Reply Example:**
"Hi! Thanks for your message. We typically respond within 2 hours during business hours. In the meantime, check out our FAQ at..."

## Notes

- Each customer receives only one auto-reply per conversation
- Away messages respect your timezone setting
- Both features require an active Twilio connection
    `
  },
  {
    id: "drip-sequences",
    title: "Drip Sequences (Automated Message Series)",
    category: "Automation",
    icon: Zap,
    keywords: ["drip", "sequence", "campaign", "series", "nurture", "automated", "schedule"],
    content: `
# Drip Sequences

Drip sequences let you send a series of automated messages over time. Perfect for nurturing leads, onboarding customers, or follow-up campaigns.

*Available on Pro plan*

## Creating a Drip Sequence

1. Go to **Automation** > **Drip Sequences** tab
2. Click **New Sequence**
3. Name your sequence (e.g., "Welcome Series")
4. Add message steps:
   - **Step 1**: First message (usually immediate)
   - **Step 2**: Second message (e.g., after 1 day)
   - **Step 3**: Third message (e.g., after 3 days)
5. Set delays between messages
6. Save and activate the sequence

## Message Delays

Choose how long to wait between messages:
- Immediately
- 5 minutes, 30 minutes, 1 hour
- 3 hours, 6 hours, 12 hours
- 1 day, 2 days, 3 days, 1 week

## Enrolling Contacts

Add contacts to your sequence:
1. Click **Enroll** on an active sequence
2. Select the contact
3. They'll start receiving messages based on your schedule

## Managing Enrollments

View enrolled contacts and their progress:
- See which step they're on
- View when the next message will send
- Cancel enrollment if needed

## Example: Welcome Series

**Step 1** (Immediate): "Hi! Thanks for your interest. Here's what we can help you with..."

**Step 2** (After 1 day): "Did you have any questions about our services? I'm happy to help!"

**Step 3** (After 3 days): "Just checking in - would you like to schedule a quick call to discuss your needs?"

## Tips

- Keep messages conversational and personal
- Space messages appropriately (don't spam)
- Include a clear call-to-action in each message
- Monitor responses and adjust your sequence
    `
  },
  {
    id: "workflows",
    title: "Workflow Automation",
    category: "Automation",
    icon: Zap,
    keywords: ["workflow", "automation", "trigger", "action", "rule", "automatic"],
    content: `
# Workflow Automation

Workflows automate repetitive tasks based on triggers and actions.

*Available on Pro plan*

## How Workflows Work

A workflow has:
1. **Trigger**: What starts the workflow
2. **Actions**: What happens when triggered

## Available Triggers

- **New Chat Created**: When a new conversation starts
- **Keyword Detected**: When a message contains specific words
- **Tag Changed**: When a chat's tag is updated

## Available Actions

- **Assign to Team Member**: Route to specific person or round-robin
- **Set Tag**: Apply a tag automatically
- **Set Status**: Change conversation status
- **Set Pipeline Stage**: Move deal to a stage
- **Add Note**: Add an internal note
- **Set Follow-up**: Create a reminder

## Creating a Workflow

1. Go to **Automation** > **Workflows** tab
2. Click **New Workflow**
3. Name your workflow
4. Select a trigger
5. Add one or more actions
6. Save and activate

## Example Workflows

**Auto-assign new leads:**
- Trigger: New Chat Created
- Action: Assign to Team Member (Round Robin)

**VIP keyword detection:**
- Trigger: Keyword Detected ("urgent", "priority")
- Action: Set Tag → Hot
- Action: Assign to Sales Manager

**Quote follow-up:**
- Trigger: Tag Changed → Quoted
- Action: Set Follow-up → 3 days

## Managing Workflows

- Toggle workflows on/off with the switch
- Edit workflows anytime
- View execution count to see how often they run
    `
  },
  {
    id: "chatbot-automation",
    title: "Chatbot Automation (Visual Builder)",
    category: "Automation",
    icon: Zap,
    keywords: ["chatbot", "bot", "automation", "flow", "builder", "visual", "drag", "drop", "nodes"],
    content: `
# Chatbot Automation

Build intelligent automated conversations with our visual drag-and-drop chatbot builder.

*Available on Starter and Pro plans*

## Accessing the Chatbot Builder

1. Navigate to **Chatbot** in the sidebar
2. You will see a visual canvas for building your conversation flows
3. The left panel shows available node types
4. The right panel shows the flow canvas

## Node Types

### Message Node
Send a message to the customer. Add text content that will be sent via WhatsApp. Great for greetings, information, and responses.

### Question Node
Ask for customer input. Pose a question and wait for the customer reply. Capture responses for personalization or routing.

### Delay Node
Add a pause between messages. Set delays from seconds to hours. Makes conversations feel more natural. Gives customers time to read messages.

### Action Node
Perform automated actions like assign to team member, set tag based on conversation flow, or set follow-up reminders.

## Building a Flow

1. Drag nodes from the left panel onto the canvas
2. Connect nodes by dragging from a node bottom handle to another node top handle
3. Configure each node by clicking on it and editing its settings
4. Save your flow by clicking the Save button

## Activating Your Chatbot

1. Build and save your flow
2. Toggle the chatbot to Active status
3. New incoming messages will trigger the flow
4. Monitor sessions in the Chatbot Sessions tab

## Best Practices

Start simple and expand over time. Test thoroughly with different customer responses. Use delays to make conversations feel natural. Always offer talk to human options. Monitor performance and iterate based on customer interactions.
    `
  },
  {
    id: "integrations",
    title: "Integrations Overview",
    category: "Integrations",
    icon: Plug,
    keywords: ["integration", "connect", "api", "webhook", "third-party", "external", "shopify", "hubspot", "salesforce", "calendly", "mailchimp", "google sheets"],
    content: `
# Integrations

Connect WhachatCRM with your other business tools.

## Native Integrations

WhachatCRM integrates with popular platforms to streamline your workflow:

### Communication
- **Twilio**: WhatsApp messaging (required for sending messages)

### E-commerce
- **Shopify**: Sync orders, customers, and product info with your store
- **Stripe**: Payment processing and subscription management

### CRM Systems
- **HubSpot**: Sync contacts and deals with HubSpot CRM
- **Salesforce**: Connect to Salesforce for enterprise CRM integration

### Scheduling
- **Calendly**: Let customers book appointments directly from chat

### Marketing
- **Mailchimp**: Sync contacts with your email marketing lists. Configure your API key, server prefix, and audience ID

### Productivity
- **Google Sheets**: Export data and sync contacts with spreadsheets

### Real Estate
- **ShowcaseIDX**: Connect your real estate listings and lead capture

## Setting Up Integrations

1. Navigate to **Integrations** in the sidebar
2. Find the integration you want to connect
3. Click on the integration card
4. Enter your API credentials (API key, tokens, etc.)
5. Click **Save** to activate the integration

## Custom Webhooks

For services not listed above, use webhooks to connect any external service:

1. Go to **Integrations** page
2. Click **Add Webhook**
3. Enter your webhook URL
4. Select events to trigger the webhook (new message, chat created, tag changed, follow-up due)
5. Save and test

## Stripe Integration Details

WhachatCRM uses Stripe for subscriptions:
- Secure payment processing
- Automatic billing
- Subscription management
- Usage tracking

## Setting Up Integrations

1. Navigate to **Integrations** in the sidebar
2. Browse available integrations
3. Click **Connect** on the integration you want
4. Follow the setup prompts
5. Configure settings as needed

## Custom Webhooks

Create custom automations:

**Example: Send to Slack**
- URL: Your Slack webhook URL
- Events: New message received
- Result: Get notified in Slack when customers message

**Example: Update CRM**
- URL: Your CRM's webhook endpoint
- Events: Chat created, Tag changed
- Result: Sync contact data automatically
    `
  },
  {
    id: "templates",
    title: "Message Templates",
    category: "Messaging",
    icon: FileText,
    keywords: ["template", "message", "quick", "reply", "saved", "retarget"],
    content: `
# Message Templates

Save time with pre-written message templates.

## Creating Templates

1. Go to **Templates** in the sidebar
2. Click **Create Template**
3. Enter:
   - Template name (for your reference)
   - Message content
   - Category (optional)
4. Save the template

## Using Templates

In any chat:
1. Click the template icon in the message input
2. Select your template
3. Edit if needed before sending
4. Send the message

## Template Variables

Make templates personal with variables:
- \`{{name}}\` - Customer's name
- \`{{company}}\` - Company name

Example:
"Hi {{name}}, thanks for your interest in our services!"

## Retargeting Campaigns

Send templates to multiple contacts at once:
1. Create a template for your campaign
2. Go to Templates > Retarget
3. Select contacts to message
4. Choose your template
5. Send to all selected contacts

Great for:
- Announcements
- Promotions
- Re-engagement campaigns
- Updates and newsletters

## Best Practices

- Keep templates concise
- Include a clear call-to-action
- Personalize with variables when possible
- Organize with categories
- Review and update regularly
    `
  },
  {
    id: "team-management",
    title: "Team Management & Assignments",
    category: "Team",
    icon: Users,
    keywords: ["team", "member", "invite", "assign", "collaborate", "user"],
    content: `
# Team Management

Collaborate with your team on customer conversations.

## Inviting Team Members

1. Go to **Settings** > **Team**
2. Click **Invite Team Member**
3. Enter their email address
4. Select their role:
   - **Member**: Can view and respond to chats
   - **Admin**: Full access including settings
5. Send the invitation

They'll receive an email to join your workspace.

## Team Limits by Plan

- **Free**: 1 user
- **Starter**: Up to 3 users
- **Pro**: Unlimited team members

## Assigning Chats

Route conversations to team members:

**Manual Assignment:**
1. Open a chat
2. Click the assignee dropdown
3. Select a team member

**Automatic Assignment:**
Use workflows to auto-assign:
- Round-robin: Distribute evenly
- Specific person: Based on keywords or tags

## Team Inbox

See all team activity:
- View who's assigned to each chat
- Filter by assignee
- Track response times

## Removing Team Members

1. Go to Settings > Team
2. Click the menu on a team member
3. Select "Remove from team"
4. Confirm removal

Their access is revoked immediately.
    `
  },
  {
    id: "notifications",
    title: "Notification Settings",
    category: "Settings",
    icon: Bell,
    keywords: ["notification", "alert", "push", "email", "remind", "notify"],
    content: `
# Notifications

Stay informed about important events with push and email notifications.

## Push Notifications

Get browser alerts for:
- New messages
- Follow-up reminders due
- Team assignments

To enable:
1. Go to **Settings** > **Notifications**
2. Toggle on **Push Notifications**
3. Allow notifications when prompted by your browser

## Email Notifications

Receive emails for:
- Follow-up reminders
- Daily summary (optional)

To enable:
1. Go to **Settings** > **Notifications**
2. Toggle on **Email Notifications**
3. Verify your email address

## Notification Preferences

Customize what you're notified about:
- New messages (real-time or batched)
- Follow-ups due
- Unassigned chats (team admins)

## Troubleshooting

**Not receiving push notifications?**
- Check browser notification permissions
- Ensure notifications are enabled in Settings
- Try refreshing the page

**Not receiving emails?**
- Check your spam folder
- Verify your email address is correct
- Ensure email notifications are enabled
    `
  },
  {
    id: "billing",
    title: "Billing & Subscriptions",
    category: "Account",
    icon: CreditCard,
    keywords: ["billing", "subscription", "plan", "upgrade", "payment", "price", "cost"],
    content: `
# Billing & Subscriptions

Manage your WhachatCRM subscription and billing.

## Plans

**Free - $0/month**
- 50 active conversations
- 1 user
- Basic features

**Starter - $19/month**
- 500 active conversations
- 3 users
- Auto-responders, keyword triggers
- Push notifications
- Contact import

**Pro - $49/month**
- 2,000 active conversations
- Unlimited team members
- Drip sequences
- Workflow automation
- Chatbot automation
- Priority support

## Upgrading Your Plan

1. Go to **Settings** or the **Pricing** page
2. Click **Upgrade** on your desired plan
3. Enter payment details
4. Confirm your subscription

Upgrades take effect immediately.

## Downgrading

You can downgrade at any time:
1. Go to Settings > Billing
2. Click "Change Plan"
3. Select a lower tier
4. Confirm

Downgrade takes effect at the end of your billing period.

## Payment Methods

We accept:
- Credit cards (Visa, Mastercard, Amex)
- Debit cards

Payments are processed securely through Stripe.

## Viewing Invoices

1. Go to Settings > Billing
2. Click "Billing History"
3. Download invoices as needed

## Cancellation

To cancel your subscription:
1. Go to Settings > Billing
2. Click "Cancel Subscription"
3. Confirm cancellation

You'll retain access until the end of your billing period.
    `
  },
  {
    id: "privacy-security",
    title: "Privacy & Security",
    category: "Account",
    icon: Shield,
    keywords: ["privacy", "security", "data", "password", "safe", "protect"],
    content: `
# Privacy & Security

Your data security is our priority.

## Data Protection

- All data encrypted in transit (HTTPS)
- Secure database storage
- Regular security audits
- GDPR compliant

## Password Security

Protect your account:
- Use a strong, unique password
- Never share your credentials
- Enable two-factor authentication (coming soon)

## Session Management

- Sessions expire after inactivity
- "Remember Me" extends session to 30 days
- Log out from all devices in Settings

## API Security

- API access requires authentication
- Tokens can be revoked anytime
- Rate limiting prevents abuse

## Twilio Credentials

Your Twilio credentials are:
- Encrypted at rest
- Never exposed in logs
- Only used for messaging

## Data Ownership

You own your data:
- Export anytime
- Delete on request
- We don't sell your data

## Reporting Issues

Found a security issue?
Contact us immediately at security@whachatcrm.com

## Privacy Policy

Read our full privacy policy for details on data handling, retention, and your rights.
    `
  },
  {
    id: "mobile-pwa",
    title: "Mobile App & PWA",
    category: "Getting Started",
    icon: Smartphone,
    keywords: ["mobile", "app", "pwa", "install", "phone", "ios", "android"],
    content: `
# Mobile App

WhachatCRM is a Progressive Web App (PWA) that works great on mobile devices.

## Installing on Your Phone

**iPhone/iPad:**
1. Open WhachatCRM in Safari
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

**Android:**
1. Open WhachatCRM in Chrome
2. Tap the menu (three dots)
3. Tap "Install app" or "Add to Home Screen"
4. Confirm installation

## Mobile Features

The mobile experience includes:
- Full chat functionality
- Push notifications
- Offline access to recent data
- Touch-optimized interface

## Tips for Mobile

- Enable push notifications for real-time alerts
- Use the quick-reply templates for faster responses
- Swipe to navigate between chats
- Pull down to refresh

## Offline Mode

When offline:
- View cached conversations
- Draft messages (sent when online)
- Access notes and contact info

New messages sync automatically when you reconnect.
    `
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting Common Issues",
    category: "Support",
    icon: HelpCircle,
    keywords: ["problem", "issue", "error", "help", "fix", "troubleshoot", "not working"],
    content: `
# Troubleshooting

Solutions to common issues.

## Messages Not Sending

**Check your Twilio connection:**
1. Go to Settings > WhatsApp Connection
2. Verify status shows "Connected"
3. Test the connection

**Check Twilio balance:**
- Log into Twilio Console
- Verify account has sufficient balance

**Check number format:**
- Ensure phone numbers include country code
- Format: +1234567890

## Not Receiving Messages

**Verify webhook configuration:**
1. In Twilio Console, check incoming message webhook
2. URL should point to WhachatCRM

**Check Twilio Console logs:**
- Look for incoming message errors
- Verify messages are reaching Twilio

## Login Issues

**Forgot password:**
1. Click "Forgot Password" on login page
2. Enter your email
3. Check email for reset link

**Account locked:**
- Wait 15 minutes and try again
- Contact support if issue persists

## Push Notifications Not Working

1. Check browser permissions
2. Enable notifications in Settings
3. Try a different browser
4. Clear browser cache

## Page Not Loading

1. Clear browser cache
2. Try incognito mode
3. Check internet connection
4. Try a different browser

## Contact Support

If issues persist:
- Email: support@whachatcrm.com
- Include your account email and issue details
    `
  }
];

const CATEGORIES = [
  { name: "Getting Started", icon: BookOpen },
  { name: "Chats", icon: MessageSquare },
  { name: "Automation", icon: Zap },
  { name: "Integrations", icon: Plug },
  { name: "Messaging", icon: FileText },
  { name: "Team", icon: Users },
  { name: "Settings", icon: Settings },
  { name: "Account", icon: CreditCard },
  { name: "Support", icon: HelpCircle },
];

function FeedbackSection({ articleId, articleTitle }: { articleId: string; articleTitle: string }) {
  const [feedback, setFeedback] = useState<'yes' | 'no' | null>(null);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleYes = () => {
    setFeedback('yes');
    setShowFeedbackForm(false);
  };

  const handleNo = () => {
    setFeedback('no');
    setShowFeedbackForm(true);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return;
    
    setSending(true);
    try {
      await fetch('/api/help-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId,
          articleTitle,
          feedback: feedbackText
        })
      });
    } catch (error) {
      console.error('Error sending feedback:', error);
    }
    setSending(false);
    setSubmitted(true);
    setShowFeedbackForm(false);
  };

  if (feedback === 'yes') {
    return (
      <div className="mt-8 pt-6 border-t border-gray-200 pb-16">
        <div className="flex items-center gap-3 text-pink-500">
          <Heart className="h-8 w-8 fill-current animate-pulse" />
          <span className="text-lg font-medium">Thank you! We're glad it helped.</span>
        </div>
      </div>
    );
  }

  if (feedback === 'no' && submitted) {
    return (
      <div className="mt-8 pt-6 border-t border-gray-200 pb-16">
        <div className="flex items-center gap-3 text-gray-600">
          <Heart className="h-6 w-6 text-brand-green" />
          <span className="text-base font-medium">Thank you for your feedback! We'll work on improving.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6 border-t border-gray-200 pb-16">
      {!feedback && (
        <>
          <p className="text-sm text-gray-500 mb-2">Was this helpful?</p>
          <div className="flex gap-2">
            <button 
              onClick={handleYes}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-green-100 hover:text-green-700 rounded-lg transition-colors"
            >
              Yes, thanks!
            </button>
            <button 
              onClick={handleNo}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Not really
            </button>
          </div>
        </>
      )}

      {showFeedbackForm && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">Oh.. How can we improve?</p>
            <button 
              onClick={() => { setFeedback(null); setShowFeedbackForm(false); }}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Tell us what was missing or unclear..."
            className="mb-3 resize-none"
            rows={3}
          />
          <button
            onClick={handleSubmitFeedback}
            disabled={sending || !feedbackText.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-green hover:bg-green-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      )}
    </div>
  );
}

export function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollToTop = () => {
    const scrollable = contentRef.current?.querySelector('.overflow-auto');
    scrollable?.scrollTo(0, 0);
    contentRef.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  };

  const filteredArticles = HELP_ARTICLES.filter(article => {
    const matchesSearch = searchQuery === "" || 
      article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      article.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase())) ||
      article.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = !selectedCategory || article.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const renderMarkdown = (content: string) => {
    const lines = content.trim().split('\n');
    const elements: ReactNode[] = [];
    let inList = false;
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-4 text-gray-600">
            {listItems.map((item, i) => (
              <li key={i}>{item.replace(/^[-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1')}</li>
            ))}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      
      if (trimmedLine === '') {
        flushList();
        return;
      }

      if (trimmedLine.startsWith('# ')) {
        flushList();
        elements.push(
          <h1 key={index} className="text-2xl font-bold text-gray-900 mb-4">
            {trimmedLine.replace('# ', '')}
          </h1>
        );
      } else if (trimmedLine.startsWith('## ')) {
        flushList();
        elements.push(
          <h2 key={index} className="text-xl font-semibold text-gray-900 mt-6 mb-3">
            {trimmedLine.replace('## ', '')}
          </h2>
        );
      } else if (trimmedLine.startsWith('### ')) {
        flushList();
        elements.push(
          <h3 key={index} className="text-lg font-semibold text-gray-800 mt-4 mb-2">
            {trimmedLine.replace('### ', '')}
          </h3>
        );
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
        inList = true;
        listItems.push(trimmedLine);
      } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        flushList();
        elements.push(
          <p key={index} className="font-semibold text-gray-800 mt-4 mb-1">
            {trimmedLine.replace(/\*\*/g, '')}
          </p>
        );
      } else {
        flushList();
        const formatted = trimmedLine
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>');
        elements.push(
          <p key={index} className="text-gray-600 mb-3" dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      }
    });

    flushList();
    return elements;
  };

  return (
    <div className="flex flex-col h-full">
      <Helmet>
        <title>Help Center | WhachatCRM</title>
      </Helmet>

      <div className="p-4 sm:p-6 border-b border-gray-200 bg-gray-50">
        <h1 className="text-xl sm:text-2xl font-display font-bold text-gray-900">Help Center</h1>
        <p className="text-sm text-gray-500 mt-1">Find answers and learn how to use WhachatCRM</p>
      </div>

      <div className="flex-1 flex overflow-hidden" ref={contentRef}>
        {!selectedArticle ? (
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for help articles..."
                  className="pl-10 h-12 text-base"
                  data-testid="input-search-help"
                />
              </div>

              {!searchQuery && !selectedCategory && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.name}
                      onClick={() => { setSelectedCategory(cat.name); scrollToTop(); }}
                      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:border-brand-green hover:bg-green-50/50 transition-colors text-center"
                      data-testid={`button-category-${cat.name.toLowerCase().replace(/\s/g, '-')}`}
                    >
                      <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <cat.icon className="h-5 w-5 text-gray-600" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{cat.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedCategory && (
                <div className="mb-4 flex items-center gap-2">
                  <button
                    onClick={() => { setSelectedCategory(null); scrollToTop(); }}
                    className="text-sm text-brand-green hover:underline"
                  >
                    All Categories
                  </button>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                  <span className="text-sm font-medium text-gray-700">{selectedCategory}</span>
                </div>
              )}

              <div className="space-y-2">
                {filteredArticles.map((article) => (
                  <button
                    key={article.id}
                    onClick={() => { setSelectedArticle(article); scrollToTop(); }}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-brand-green hover:bg-green-50/30 transition-colors text-left"
                    data-testid={`button-article-${article.id}`}
                  >
                    <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <article.icon className="h-5 w-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900">{article.title}</h3>
                      <p className="text-sm text-gray-500">{article.category}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
                  </button>
                ))}

                {filteredArticles.length === 0 && (
                  <div className="text-center py-12">
                    <HelpCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No articles found</h3>
                    <p className="text-gray-500">Try a different search term or browse categories</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="max-w-3xl mx-auto">
              <button
                onClick={() => { setSelectedArticle(null); scrollToTop(); }}
                className="flex items-center gap-1 text-sm text-brand-green hover:underline mb-6"
                data-testid="button-back-to-articles"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
                Back to Help Center
              </button>

              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <span>{selectedArticle.category}</span>
              </div>

              <article className="prose prose-gray max-w-none">
                {renderMarkdown(selectedArticle.content)}
              </article>

              <FeedbackSection articleId={selectedArticle.id} articleTitle={selectedArticle.title} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
