import { useEffect, useState } from "react";
import { Link, useParams, Redirect } from "wouter";
import { Helmet } from "react-helmet";
import { Calendar, Clock, ArrowLeft, ArrowRight, Share2, Linkedin, MessageCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOG_POSTS } from "./Blog";

const BLOG_CONTENT: Record<string, string> = {
  "whatsapp-crm-complete-guide-2025": `
WhatsApp has become the world's most popular messaging platform with over 2 billion users. For businesses, this presents an incredible opportunity to connect with customers where they already spend their time.

## What is WhatsApp CRM?

A WhatsApp CRM (Customer Relationship Management) system helps businesses manage customer conversations, track leads, and build relationships through WhatsApp. Unlike traditional CRM systems that focus on email and phone calls, WhatsApp CRM is designed for the messaging-first world.

### Key Features of WhatsApp CRM

**1. Unified Inbox**
All your WhatsApp conversations in one place. No more switching between devices or losing track of messages.

**2. Contact Management**
Store customer information, add notes, and track interaction history for each contact.

**3. Tags and Labels**
Organize conversations by status (New, Hot, Quoted, Paid) to prioritize your outreach.

**4. Follow-up Reminders**
Never forget to follow up with a lead. Set reminders and get notifications when it's time to reach out.

**5. Team Collaboration**
Assign conversations to team members, share notes, and work together efficiently.

## Why Your Business Needs WhatsApp CRM

### 1. Meet Customers Where They Are

With a 98% open rate, WhatsApp messages are almost guaranteed to be seen. Compare that to email's 20% average open rate.

### 2. Faster Response Times

Customers expect quick responses. WhatsApp CRM helps you respond within minutes, not hours or days.

### 3. Build Stronger Relationships

The personal nature of WhatsApp helps you build trust and rapport with customers that's hard to achieve through email.

### 4. Increase Conversions

Businesses using WhatsApp for sales report up to 40% higher conversion rates compared to other channels.

## Getting Started with WhatsApp CRM

### Step 1: Choose the Right Platform

Look for a WhatsApp CRM that offers:
- Easy Twilio or WhatsApp Business API integration
- Mobile-friendly interface
- Affordable pricing for small teams
- Automation features

### Step 2: Connect Your WhatsApp Number

Most WhatsApp CRM tools use Twilio or the official WhatsApp Business API. The setup typically takes 15-30 minutes.

### Step 3: Import Your Contacts

Bring in your existing customer list. Most tools support CSV import.

### Step 4: Set Up Automation

Configure auto-replies for when you're away, and set up follow-up reminders to stay organized.

### Step 5: Train Your Team

Make sure everyone knows how to use the system effectively. Most WhatsApp CRMs are intuitive enough to learn in a day.

## Best Practices for WhatsApp CRM

### Do:
- Respond quickly (within 1 hour during business hours)
- Personalize your messages
- Use templates for common responses
- Set clear expectations about response times
- Respect customer preferences

### Don't:
- Spam customers with promotional messages
- Send messages outside of business hours (unless urgent)
- Share customer information without consent
- Use aggressive sales tactics

## Measuring Success

Track these KPIs to measure your WhatsApp CRM effectiveness:

- **Response time**: Aim for under 1 hour
- **Conversation volume**: Track growth over time
- **Conversion rate**: Messages to sales
- **Customer satisfaction**: Ask for feedback

## Conclusion

WhatsApp CRM is no longer optional for businesses that want to compete in today's messaging-first world. By implementing the right tools and practices, you can provide exceptional customer experiences that drive loyalty and growth.

Ready to get started? WhachatCRM offers a free plan to help you experience the power of WhatsApp CRM firsthand.
  `,
  "whatsapp-business-api-vs-business-app": `
If you're looking to use WhatsApp for business, you've probably encountered two options: the WhatsApp Business App and the WhatsApp Business API. Understanding the difference is crucial for choosing the right solution.

## WhatsApp Business App

The WhatsApp Business App is a free mobile application designed for small businesses.

### Features
- Business profile with description, hours, and location
- Quick replies and greeting messages
- Labels for organizing chats
- Basic catalog for products
- Works on one phone at a time

### Best For
- Solo entrepreneurs
- Very small teams (1-2 people)
- Businesses with low message volume
- Those just getting started with WhatsApp

### Limitations
- Can only be used on one device
- No team collaboration
- Limited automation
- No CRM integration
- Manual everything

## WhatsApp Business API

The WhatsApp Business API is designed for medium to large businesses that need more power and flexibility.

### Features
- Multi-user access
- Full automation capabilities
- CRM integration
- Webhook support
- Message templates for outbound
- High volume messaging
- Analytics and reporting

### Best For
- Growing teams (3+ people)
- Businesses with high message volume
- Those needing automation
- Companies requiring CRM integration

### Requirements
- Must use a Business Solution Provider (BSP) like Twilio
- Requires technical setup
- Monthly costs for messages

## Head-to-Head Comparison

| Feature | Business App | Business API |
|---------|--------------|--------------|
| Cost | Free | Per-message pricing |
| Users | 1 device | Unlimited |
| Automation | Basic | Advanced |
| CRM Integration | No | Yes |
| Team Inbox | No | Yes |
| Message Templates | No | Yes |
| Setup | Instant | 15-30 minutes |

## Which One Should You Choose?

### Choose the Business App if:
- You're a solo operator
- You handle fewer than 50 messages per day
- You don't need team collaboration
- Budget is your primary concern

### Choose the Business API if:
- You have a team of 2+ people
- You handle 50+ messages per day
- You want automation and integrations
- You're serious about scaling

## The Hybrid Approach

Many businesses start with the Business App and migrate to the API as they grow. This is a smart approach because:

1. You can test WhatsApp for business with zero cost
2. You learn what features you actually need
3. You can migrate when you outgrow the app

## Making the Switch

When you're ready to upgrade from the Business App to the API:

1. Choose a BSP (Twilio is popular and reliable)
2. Get your number verified for the API
3. Set up your CRM integration
4. Migrate your customer conversations
5. Train your team on the new system

## Cost Considerations

**Business App**: Free, but your time has value

**Business API via Twilio**:
- No monthly fees
- Pay per conversation (~$0.05-0.15 depending on region)
- First 1,000 conversations free per month

**WhatsApp CRM (like WhachatCRM)**:
- $0-49/month for the platform
- Plus Twilio message costs
- Zero markup on messages

## Conclusion

For most growing businesses, the WhatsApp Business API provides the features and flexibility needed to scale. While the Business App is great for starting out, you'll likely outgrow it quickly if your business is growing.

WhachatCRM makes it easy to use the WhatsApp Business API without the technical complexity. Connect your Twilio account in minutes and start managing conversations like a pro.
  `,
  "automate-whatsapp-messages-small-business": `
Time is your most valuable resource as a small business owner. Automating WhatsApp messages can save you hours every week while improving customer experience.

## Types of WhatsApp Automation

### 1. Auto-Reply Messages

Send an instant response when customers message you. This:
- Acknowledges their message immediately
- Sets expectations for response time
- Shows professionalism

**Example Auto-Reply:**
"Hi! Thanks for reaching out. We typically respond within 2 hours during business hours (9 AM - 6 PM). We'll get back to you soon!"

### 2. Away Messages

Automatically respond when you're outside business hours.

**Example Away Message:**
"Thanks for your message! We're currently closed but will respond first thing tomorrow morning. For urgent matters, please email support@company.com"

### 3. Drip Campaigns

Send a series of messages over time to nurture leads.

**Example Drip Sequence:**
- Day 0: "Thanks for your interest! Here's an overview of our services..."
- Day 1: "Did you have any questions about what we discussed?"
- Day 3: "I wanted to share this case study that might be relevant..."
- Day 7: "Would you like to schedule a quick call this week?"

### 4. Keyword Triggers

Automatically respond based on keywords in customer messages.

**Examples:**
- "pricing" → Send price list
- "hours" → Send business hours
- "location" → Send address and map link

## Setting Up Automation

### Step 1: Identify Repetitive Tasks

Track your WhatsApp conversations for a week. Look for:
- Questions you answer repeatedly
- Messages you send to every new contact
- Follow-up patterns

### Step 2: Create Response Templates

Write templates for your most common responses. Keep them:
- Personal (use the customer's name)
- Concise (under 3 paragraphs)
- Actionable (include next steps)

### Step 3: Configure Automation Rules

In your WhatsApp CRM:
1. Set up auto-reply for new messages
2. Configure business hours and away messages
3. Create keyword triggers for FAQs
4. Build drip sequences for lead nurturing

### Step 4: Test Everything

Send test messages to verify:
- Auto-replies trigger correctly
- Away messages show at the right times
- Keywords are detected accurately
- Drip sequences send on schedule

## Automation Best Practices

### Keep It Human

Don't make customers feel like they're talking to a robot:
- Use conversational language
- Include your name/team name
- Follow up personally after automated messages

### Set Clear Expectations

Always tell customers:
- When they'll get a human response
- What to do for urgent issues
- How to opt out of messages

### Don't Over-Automate

Some things should stay manual:
- Complex questions
- Complaints and issues
- Price negotiations
- Relationship building

### Monitor and Adjust

Review automation performance weekly:
- Are customers responding well?
- Are there new FAQs to automate?
- Do response times need adjustment?

## Automation Examples by Industry

### E-commerce
- Order confirmation
- Shipping updates
- Review requests
- Abandoned cart reminders

### Services
- Appointment reminders
- Quote follow-ups
- Project updates
- Invoice reminders

### Real Estate
- Property inquiry responses
- Viewing confirmations
- Market update broadcasts
- Post-viewing follow-ups

## Time Saved with Automation

Based on typical small business usage:

| Task | Manual Time | With Automation |
|------|-------------|-----------------|
| Initial response | 2-5 min | Instant |
| FAQ answers | 3-5 min each | Instant |
| Follow-up messages | 15 min/day | 0 min |
| After-hours responses | Next day | Instant |

**Total weekly time saved: 5-10 hours**

## Getting Started

1. Sign up for a WhatsApp CRM like WhachatCRM
2. Connect your Twilio account
3. Enable auto-reply with your first message
4. Set up business hours and away message
5. Create 3-5 quick response templates
6. Monitor and improve over time

## Conclusion

WhatsApp automation isn't about replacing human connection—it's about being responsive 24/7 and freeing up time for the conversations that matter most.

Start with simple auto-replies and grow your automation as you learn what works for your business.
  `,
  "whatsapp-lead-management-tips": `
Your WhatsApp inbox is full of potential customers, but without proper management, leads slip through the cracks. Here are 10 proven tips to turn those conversations into sales.

## 1. Respond Within 5 Minutes

Speed wins deals. Studies show that responding within 5 minutes makes you 9x more likely to convert a lead.

**Action Steps:**
- Enable push notifications
- Set up auto-reply for immediate acknowledgment
- Assign team members to monitor during business hours

## 2. Use Tags Religiously

Color-coded tags help you prioritize at a glance:

- 🟢 **New**: Fresh leads, respond first
- 🔴 **Hot**: Ready to buy, high priority
- 🟡 **Quoted**: Sent proposal, follow up
- 🔵 **Waiting**: Ball in their court
- ⚫ **Lost**: Didn't convert (for analysis)
- 🟣 **Paid**: Customers (for retention)

## 3. Set Follow-Up Reminders

The fortune is in the follow-up. Most leads need 5-7 touchpoints before buying.

**Follow-Up Schedule:**
- Day 1: After initial contact
- Day 3: If no response
- Day 7: Value-add follow-up
- Day 14: Final check-in
- Day 30: Re-engagement

## 4. Take Notes on Every Conversation

Future you will thank past you. Note:
- Customer's name and business
- Pain points and needs
- Budget mentioned
- Decision timeline
- Key objections
- Personal details (for rapport)

## 5. Create Response Templates

Don't reinvent the wheel. Create templates for:
- Initial greeting
- Product/service overview
- Pricing information
- Proposal follow-up
- Thank you messages
- Objection handling

## 6. Segment Your Leads

Not all leads are equal. Segment by:

**By Source:**
- Website inquiries
- Referrals
- Social media
- Ads

**By Intent:**
- Just browsing
- Comparing options
- Ready to buy

**By Value:**
- Small deals
- Medium deals
- Enterprise

## 7. Qualify Leads Quickly

Don't waste time on poor-fit leads. Ask qualifying questions early:

- "What's your budget for this project?"
- "When are you looking to get started?"
- "Who else is involved in this decision?"
- "What's the main problem you're trying to solve?"

## 8. Use Pipeline Stages

Track deal progress through stages:

1. **Lead**: New inquiry
2. **Contacted**: Had initial conversation
3. **Proposal**: Sent quote/proposal
4. **Negotiation**: Discussing terms
5. **Closed**: Won or lost

Move leads through stages and focus on advancing deals.

## 9. Set Daily Lead Review

Spend 15 minutes each morning:
- Review yesterday's conversations
- Prioritize today's follow-ups
- Update tags and notes
- Identify stuck deals

## 10. Learn from Lost Deals

When a lead doesn't convert, ask:
- "What made you decide to go another direction?"
- "Is there anything we could have done differently?"

Use this feedback to improve your process.

## Bonus: Team Collaboration

If you have a team:
- Assign leads clearly
- Share notes and context
- Use round-robin for fair distribution
- Hold weekly pipeline reviews

## Implementation Checklist

□ Set up WhatsApp CRM with tags and pipeline
□ Create 5-10 response templates
□ Enable auto-reply for new messages
□ Configure follow-up reminder system
□ Train team on lead management process
□ Schedule daily lead review time
□ Set up weekly pipeline review meeting

## Conclusion

Effective lead management isn't about complex systems—it's about consistent habits and the right tools. Start with these fundamentals and refine your process over time.

WhachatCRM provides all the features you need for professional lead management: tags, notes, pipelines, templates, and follow-up reminders. Try it free today.
  `,
  "wati-alternatives-comparison": `
WATI (WhatsApp Team Inbox) is a popular WhatsApp Business solution, but it's not the only option. Let's compare the top alternatives to help you choose the right tool for your business.

## Quick Comparison Table

| Feature | WATI | WhachatCRM | Respond.io | Trengo |
|---------|------|------------|------------|--------|
| Starting Price | $49/mo | $0/mo | $79/mo | $15/user/mo |
| Message Markup | Yes | No | Yes | Yes |
| Free Plan | No | Yes | No | No |
| Drip Campaigns | Yes | Yes | Yes | Limited |
| Team Inbox | Yes | Yes | Yes | Yes |

## 1. WhachatCRM

**Best For:** Small teams wanting zero message markup

### Pricing
- Free: $0/month (50 conversations, 1 user)
- Starter: $19/month (500 conversations, 3 users)
- Pro: $49/month (2,000 conversations, unlimited users)

### Key Differences from WATI
- **No message markup** - Pay Twilio directly
- **Free plan available** - Try before you buy
- **Simpler interface** - Less learning curve
- **Your Twilio account** - Full control over messaging

### Pros
✅ Most affordable option
✅ Zero hidden message costs
✅ PWA works offline
✅ Quick setup (15 minutes)

### Cons
❌ Requires own Twilio account
❌ Fewer advanced features than WATI

## 2. Respond.io

**Best For:** Multi-channel customer communication

### Pricing
- Team: $79/month
- Business: $249/month
- Enterprise: Custom

### Key Features
- Omnichannel (WhatsApp, Instagram, Messenger, etc.)
- Advanced automation workflows
- AI-powered responses
- Detailed analytics

### Pros
✅ Supports many channels
✅ Powerful automation
✅ Enterprise-grade features

### Cons
❌ Expensive for small teams
❌ Complex setup
❌ Overkill for WhatsApp-only use

## 3. Trengo

**Best For:** Customer service teams

### Pricing
- Grow: $15/user/month
- Scale: $25/user/month
- Enterprise: $35/user/month

### Key Features
- Unified inbox for all channels
- Ticketing system
- Team performance metrics
- Internal collaboration

### Pros
✅ Per-user pricing
✅ Strong team features
✅ Good for support teams

### Cons
❌ WhatsApp is just one of many features
❌ Message costs on top of subscription
❌ Can get expensive with large teams

## 4. Interakt

**Best For:** Indian market businesses

### Pricing
- Starter: ₹999/month (~$12)
- Growth: ₹2,499/month (~$30)
- Advanced: ₹3,499/month (~$42)

### Key Features
- Catalog integration
- Payment collection via WhatsApp
- Broadcast messaging
- Chatbot builder

### Pros
✅ Affordable
✅ Good for e-commerce
✅ Local payment integration (India)

### Cons
❌ Focused on Indian market
❌ Limited international support
❌ Message caps on plans

## 5. Twilio + Custom CRM

**Best For:** Technical teams wanting full control

### Pricing
- Twilio: ~$0.05-0.15 per conversation
- Development: Time or contractor costs

### Key Features
- Complete customization
- No vendor lock-in
- Integrate with anything
- Scale infinitely

### Pros
✅ Most flexible option
✅ No monthly platform fees
✅ Own your data completely

### Cons
❌ Requires development resources
❌ Ongoing maintenance needed
❌ No out-of-the-box features

## Feature Comparison Deep Dive

### Automation

| Tool | Auto-Reply | Drip Campaigns | Chatbots | Workflows |
|------|------------|----------------|----------|-----------|
| WATI | ✅ | ✅ | ✅ | ✅ |
| WhachatCRM | ✅ | ✅ | ✅ | ✅ |
| Respond.io | ✅ | ✅ | ✅ | ✅ |
| Trengo | ✅ | Limited | Limited | ✅ |

### Team Features

| Tool | Shared Inbox | Assignment | Notes | Collision Detection |
|------|--------------|------------|-------|---------------------|
| WATI | ✅ | ✅ | ✅ | ✅ |
| WhachatCRM | ✅ | ✅ | ✅ | ✅ |
| Respond.io | ✅ | ✅ | ✅ | ✅ |
| Trengo | ✅ | ✅ | ✅ | ✅ |

## Making Your Decision

### Choose WATI if:
- You need advanced chatbots
- Budget isn't a primary concern
- You want an established platform

### Choose WhachatCRM if:
- You want the lowest total cost
- You prefer using your own Twilio account
- You're a small team (1-10 people)
- You want to start with a free plan

### Choose Respond.io if:
- You need multi-channel support
- You have complex automation needs
- You have budget for enterprise tools

### Choose Trengo if:
- You're primarily a support team
- You need ticketing features
- You prefer per-user pricing

## Migration Considerations

Switching from WATI to another platform:

1. **Export your contacts** - Most tools have CSV export
2. **Document your automations** - Recreate in new platform
3. **Maintain your number** - Keep using same WhatsApp number
4. **Notify customers** - Response times may vary during transition

## Conclusion

There's no one-size-fits-all solution. Consider your team size, budget, and feature requirements when choosing.

For small teams focused on WhatsApp, WhachatCRM offers the best value with zero message markup and a free plan to get started.
  `,
  "whatsapp-customer-service-best-practices": `
WhatsApp customer service can be a game-changer for your business. Here's how to do it right and delight your customers.

## Setting Expectations

### Response Time Standards

Set clear expectations and meet them:
- **First response**: Under 5 minutes during business hours
- **Resolution time**: Under 4 hours for simple issues
- **Complex issues**: Same day acknowledgment, 24-48 hour resolution

### Communicate Your Availability

Make it clear when customers can expect responses:
- Business hours in your profile
- Away message outside hours
- Holiday announcements

## Building Your Team

### Define Roles

- **First responders**: Handle initial contact, route to specialists
- **Specialists**: Handle complex issues, escalations
- **Supervisors**: Monitor quality, handle escalations

### Assign Conversations Wisely

Use round-robin for general inquiries, skill-based routing for:
- Technical support
- Billing questions
- VIP customers
- Specific languages

## Communication Best Practices

### Be Human

Avoid robotic responses:

❌ "Your query has been received and will be processed."

✅ "Hi Sarah! Thanks for reaching out. I'd be happy to help with your order."

### Use Names

Personalize every interaction:
- Use the customer's name
- Sign off with your name
- Reference previous conversations

### Keep It Concise

WhatsApp is for quick exchanges:
- Short paragraphs
- Bullet points when helpful
- One topic per message
- Break long responses into multiple messages

### Use Rich Media

Enhance your responses with:
- Product images
- How-to videos
- PDF guides
- Voice notes for complex explanations

## Handling Common Situations

### Complaints

1. Acknowledge their frustration
2. Apologize sincerely
3. Take ownership
4. Provide solution or timeline
5. Follow up to confirm resolution

**Example:**
"I'm really sorry to hear about this experience, Sarah. That's not the level of service we aim for. Let me look into this right now and get back to you within the hour with a solution."

### Urgent Issues

1. Acknowledge urgency
2. Escalate immediately
3. Keep customer updated
4. Resolve ASAP
5. Follow up to confirm satisfaction

### Difficult Customers

1. Stay calm and professional
2. Don't take it personally
3. Focus on solutions
4. Set boundaries if needed
5. Escalate when necessary

## Using Templates Effectively

### Good Template Usage

Create templates for:
- Greetings and acknowledgments
- FAQ answers
- Status updates
- Thank you messages

### Template Best Practices

- Personalize every template before sending
- Review and update templates monthly
- A/B test different approaches
- Train team on when to use each

## Quality Assurance

### Monitor Performance

Track these metrics:
- First response time
- Resolution time
- Customer satisfaction
- Message volume per agent
- Conversations per day

### Review Conversations

Regularly review a sample of conversations:
- Accuracy of information
- Tone and professionalism
- Following procedures
- Opportunities for improvement

### Gather Feedback

Ask customers:
- "Was this helpful?"
- "Is there anything else I can help with?"
- Post-resolution satisfaction survey

## Tools and Workflows

### Use Tags and Notes

- Tag conversations by type (order, support, billing)
- Note important details for context
- Track issue categories for improvement

### Set Up Automation

Automate repetitive tasks:
- Auto-acknowledge new messages
- Send FAQs based on keywords
- Reminder for pending issues
- Follow-up after resolution

### Create an Internal Knowledge Base

Quick reference for your team:
- Common issues and solutions
- Escalation procedures
- Product information
- Policies and procedures

## Measuring Success

### Key Metrics

| Metric | Target |
|--------|--------|
| First Response Time | < 5 minutes |
| Resolution Time | < 4 hours |
| Customer Satisfaction | > 90% |
| First Contact Resolution | > 70% |

### Continuous Improvement

- Weekly team meetings to discuss challenges
- Monthly review of metrics
- Quarterly process improvements
- Regular training and updates

## Conclusion

Great WhatsApp customer service combines the right tools, processes, and people. Focus on being responsive, helpful, and human—and your customers will reward you with loyalty and referrals.

WhachatCRM provides the team inbox, templates, and automation you need for professional customer service. Try it free today.
  `,
  "twilio-whatsapp-setup-guide": `
This step-by-step guide will walk you through setting up Twilio for WhatsApp messaging. By the end, you'll have a working WhatsApp Business integration.

## Prerequisites

Before you start, you'll need:
- A Twilio account (sign up at twilio.com)
- A verified phone number
- A business to register with WhatsApp

## Step 1: Create a Twilio Account

1. Go to twilio.com and click "Sign Up"
2. Enter your email and create a password
3. Verify your email address
4. Add your phone number for verification
5. Answer a few questions about your use case

**Tip:** Choose "WhatsApp" when asked what you want to build.

## Step 2: Access the Twilio Console

Once logged in:
1. You'll see your dashboard with Account SID and Auth Token
2. **Copy these credentials** - you'll need them later
3. Note your trial credit amount

## Step 3: Set Up WhatsApp Sandbox (For Testing)

For testing before going live:

1. In the console, navigate to **Messaging** > **Try it out** > **Send a WhatsApp message**
2. You'll see a sandbox number and join code
3. Send the join code to the sandbox number from your phone
4. Now you can send and receive test messages

**Example:**
Send "join example-word" to +1 415 523 8886

## Step 4: Get a WhatsApp-Enabled Number

For production use:

1. Go to **Phone Numbers** > **Buy a Number**
2. Select a number that supports WhatsApp (check the capabilities)
3. Purchase the number

**Note:** WhatsApp numbers require approval. This can take 1-3 business days.

## Step 5: Register for WhatsApp Business API

1. Navigate to **Messaging** > **Senders** > **WhatsApp Senders**
2. Click "Register a WhatsApp Business Profile"
3. Fill in your business information:
   - Business name
   - Category
   - Description
   - Address
   - Logo
4. Submit for approval

**Approval Timeline:** Usually 24-72 hours

## Step 6: Configure Webhooks

Webhooks let you receive incoming messages:

1. Go to **Messaging** > **Settings** > **WhatsApp Sandbox Settings** (or your approved sender)
2. In "When a message comes in", enter your webhook URL
3. Example: https://yourapp.com/api/twilio/webhook
4. Save changes

**Testing Webhooks:**
Use tools like ngrok to test locally before deploying.

## Step 7: Send Your First Message

Using Node.js:

\`\`\`javascript
const twilio = require('twilio');

const client = twilio(
  'YOUR_ACCOUNT_SID',
  'YOUR_AUTH_TOKEN'
);

client.messages.create({
  from: 'whatsapp:+14155238886', // Your Twilio WhatsApp number
  to: 'whatsapp:+1234567890',    // Customer's number
  body: 'Hello from Twilio!'
}).then(message => console.log(message.sid));
\`\`\`

## Step 8: Handle Incoming Messages

Set up a webhook handler:

\`\`\`javascript
app.post('/api/twilio/webhook', (req, res) => {
  const { From, Body } = req.body;
  
  console.log(\`Message from \${From}: \${Body}\`);
  
  // Respond with TwiML
  res.type('text/xml').send(\`
    <Response>
      <Message>Thanks for your message!</Message>
    </Response>
  \`);
});
\`\`\`

## Step 9: Message Templates (Required for 24h+ Messages)

WhatsApp requires pre-approved templates for messages sent more than 24 hours after the last customer message.

1. Go to **Messaging** > **Content Template Builder**
2. Click "Create a Template"
3. Choose a template type
4. Write your template content
5. Submit for approval

**Template Example:**
"Hi {{1}}, your order {{2}} has shipped. Track it here: {{3}}"

## Common Issues and Solutions

### "Number not WhatsApp enabled"
- Ensure you've completed WhatsApp Business API registration
- Check that your number shows WhatsApp capability in the console

### "Message failed to send"
- Verify the recipient has WhatsApp
- Check your account balance
- Ensure you're using the correct number format (+country code)

### "Webhook not receiving messages"
- Verify your webhook URL is publicly accessible
- Check Twilio debugger for errors
- Ensure HTTPS is configured correctly

## Cost Breakdown

**Twilio Pricing (2025):**
- Phone number: ~$1-2/month
- Conversations: ~$0.05-0.15 per conversation
- First 1,000 conversations: Free each month

**Conversation Pricing:**
- User-initiated: Lower cost
- Business-initiated: Higher cost
- 24-hour conversation window

## Security Best Practices

1. **Never expose credentials** - Use environment variables
2. **Validate webhooks** - Check Twilio signature
3. **Use HTTPS** - Encrypt all communication
4. **Rotate tokens** - Regularly update credentials

## Connecting to WhachatCRM

Once Twilio is set up:

1. Log into WhachatCRM
2. Go to Settings > WhatsApp Connection
3. Enter your Account SID
4. Enter your Auth Token
5. Add your WhatsApp phone number
6. Click "Save & Test Connection"

WhachatCRM will automatically configure webhooks to receive your messages.

## Conclusion

Setting up Twilio for WhatsApp takes about 15-30 minutes for the sandbox, and a few days for full production access. The investment is worth it for the power and flexibility you get.

Need help? WhachatCRM support is available to assist with your Twilio setup.
  `,
  "whatsapp-drip-campaigns-examples": `
Drip campaigns are automated message sequences sent over time to nurture leads and customers. Here are proven examples you can adapt for your business.

## What Makes a Good Drip Campaign?

Before diving into examples:

- **Timing matters**: Space messages appropriately
- **Value first**: Each message should provide value
- **Clear CTAs**: Tell recipients what to do next
- **Personal touch**: Use names and personalization
- **Exit points**: Give people a way to opt out

## Example 1: Welcome Series (New Lead)

**Purpose:** Introduce your business to new leads

**Message 1 (Immediately):**
"Hi {{name}}! Thanks for your interest in [Company]. I'm [Your Name], and I'll be your point of contact.

Quick question: What's the main challenge you're hoping we can help with?"

**Message 2 (Day 1):**
"Hi {{name}}, hope you're having a great day!

I wanted to share a quick overview of how we typically help businesses like yours: [Link to video or PDF]

Let me know if you have any questions!"

**Message 3 (Day 3):**
"Hey {{name}}, just checking in!

I noticed you might have some questions about [common topic]. Here's a quick FAQ that covers the basics: [Link]

Would you like to schedule a 15-minute call to discuss your specific needs?"

**Message 4 (Day 7):**
"Hi {{name}}! 

I wanted to share a quick case study from a client similar to you. They achieved [specific result] in just [timeframe]: [Link]

Interested in learning how we could help you achieve similar results?"

## Example 2: Post-Quote Follow-Up

**Purpose:** Follow up after sending a proposal

**Message 1 (1 hour after quote):**
"Hi {{name}}, I just sent over the proposal we discussed. You should see it in your email shortly.

Let me know if you have any questions or if anything needs clarification!"

**Message 2 (Day 2):**
"Hi {{name}}, just wanted to check if you had a chance to review the proposal?

I'm happy to walk through any details or adjust anything to better fit your needs."

**Message 3 (Day 5):**
"Hey {{name}}, I know things get busy!

I wanted to mention that we have a special offer running this month that could save you [percentage/amount]. Let me know if you'd like me to update the proposal.

Any questions I can answer?"

**Message 4 (Day 10):**
"Hi {{name}}, last message from me on this!

If now isn't the right time, no worries at all. When you're ready to move forward, just reply to this message and we'll pick up where we left off.

Wishing you the best with [their project/business]!"

## Example 3: Customer Onboarding

**Purpose:** Help new customers get started

**Message 1 (Immediately after purchase):**
"Welcome to [Product/Service], {{name}}! 🎉

I'm [Name], and I'll be helping you get set up. Here's a quick guide to get you started: [Link]

What's the first thing you'd like to accomplish?"

**Message 2 (Day 1):**
"Hi {{name}}! How's everything going so far?

Here's a pro tip: [Quick win tip that provides immediate value]

Let me know if you run into any questions!"

**Message 3 (Day 3):**
"Hey {{name}}, checking in!

By now you've probably [expected milestone]. If you haven't, here's a quick video that walks you through it: [Link]

Reply if you need any help!"

**Message 4 (Day 7):**
"Hi {{name}}! You're doing great!

I wanted to share this advanced tip that our top users love: [Advanced tip]

Also, we have a community where customers share ideas and get help: [Link]. Would love to see you there!"

**Message 5 (Day 14):**
"Hey {{name}}, it's been two weeks since you joined us!

I'd love to hear how things are going. On a scale of 1-10, how likely would you be to recommend us to a friend?

Your feedback helps us improve!"

## Example 4: Re-Engagement (Inactive Leads)

**Purpose:** Re-engage leads who've gone cold

**Message 1:**
"Hi {{name}}, it's [Your Name] from [Company].

We chatted a while back about [topic]. I wanted to check in and see if you're still looking for a solution?

No pressure—just wanted to stay connected!"

**Message 2 (Day 3):**
"Hey {{name}}, quick update!

Since we last talked, we've [launched new feature / had success with X / updated pricing]. Thought you might find this interesting: [Link]

Worth a fresh look?"

**Message 3 (Day 7):**
"Hi {{name}}, one last check-in from me.

If you're no longer interested, just reply 'no' and I won't bother you again. But if you'd like to reconnect, I'm here to help!

Either way, wishing you success!"

## Example 5: Event/Webinar Registration

**Purpose:** Promote and follow up on events

**Message 1 (Registration confirmation):**
"Awesome, you're registered for [Event Name]! 🎉

Mark your calendar:
📅 Date: [Date]
⏰ Time: [Time]
📍 Link: [Join Link]

Reply 'remind me' and I'll send you a reminder 1 hour before!"

**Message 2 (1 day before):**
"Hi {{name}}, just a reminder that [Event Name] is tomorrow!

Here's what you can expect:
• [Topic 1]
• [Topic 2]  
• [Topic 3]

See you there!"

**Message 3 (1 hour before):**
"Starting soon! Here's your link to join: [Link]

See you in a few minutes! 🎉"

**Message 4 (Day after):**
"Thanks for joining [Event Name], {{name}}!

Here's the recording in case you want to rewatch: [Link]

What was your biggest takeaway? I'd love to hear!"

## Campaign Settings Guide

### Timing Recommendations

| Campaign Type | Total Duration | Message Spacing |
|--------------|----------------|-----------------|
| Welcome Series | 7-14 days | Days 0, 1, 3, 7 |
| Quote Follow-up | 10-14 days | Days 0, 2, 5, 10 |
| Onboarding | 14-30 days | Days 0, 1, 3, 7, 14 |
| Re-engagement | 7-10 days | Days 0, 3, 7 |

### When to Send

- **Best days**: Tuesday, Wednesday, Thursday
- **Best times**: 10am-12pm, 2pm-4pm local time
- **Avoid**: Monday mornings, Friday afternoons, weekends

## Measuring Success

Track these metrics for each campaign:

- **Open/Read rate**: Are messages being seen?
- **Response rate**: Are people replying?
- **Conversion rate**: Are they taking the desired action?
- **Opt-out rate**: Are you losing people?

## Setting Up in WhachatCRM

1. Go to Automation > Drip Sequences
2. Click "New Sequence"
3. Add your messages with delays
4. Activate the sequence
5. Enroll contacts manually or via workflow triggers

## Conclusion

Effective drip campaigns feel personal, provide value, and respect the recipient's time. Start with one campaign, measure results, and optimize based on what you learn.

Copy these templates, customize them for your business, and watch your engagement soar!
  `,
};

export function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);
  
  const post = BLOG_POSTS.find(p => p.slug === slug);
  const content = slug ? BLOG_CONTENT[slug] : null;

  if (!post || !content) {
    return <Redirect to="/blog" />;
  }

  const currentIndex = BLOG_POSTS.findIndex(p => p.slug === slug);
  const prevPost = currentIndex > 0 ? BLOG_POSTS[currentIndex - 1] : null;
  const nextPost = currentIndex < BLOG_POSTS.length - 1 ? BLOG_POSTS[currentIndex + 1] : null;

  const shareUrl = `https://whachatcrm.com/blog/${slug}`;
  const shareText = encodeURIComponent(post.title);

  const renderContent = (markdown: string) => {
    const lines = markdown.trim().split('\n');
    const elements: React.ReactNode[] = [];
    let inList = false;
    let listItems: string[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];

    const flushList = (key: number) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${key}`} className="list-disc list-inside space-y-2 mb-6 text-gray-600 pl-4">
            {listItems.map((item, i) => {
              const content = item.replace(/^[-*]\s*/, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
              return <li key={i} dangerouslySetInnerHTML={{ __html: content }} />;
            })}
          </ul>
        );
        listItems = [];
      }
      inList = false;
    };

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${index}`} className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto mb-6 text-sm">
              <code>{codeContent.join('\n')}</code>
            </pre>
          );
          codeContent = [];
          inCodeBlock = false;
        } else {
          flushList(index);
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        return;
      }
      
      if (trimmedLine === '') {
        flushList(index);
        return;
      }

      if (trimmedLine.startsWith('## ')) {
        flushList(index);
        elements.push(
          <h2 key={index} className="text-2xl font-display font-bold text-gray-900 mt-10 mb-4">
            {trimmedLine.replace('## ', '')}
          </h2>
        );
      } else if (trimmedLine.startsWith('### ')) {
        flushList(index);
        elements.push(
          <h3 key={index} className="text-xl font-display font-semibold text-gray-800 mt-8 mb-3">
            {trimmedLine.replace('### ', '')}
          </h3>
        );
      } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ') || /^\d+\.\s/.test(trimmedLine)) {
        inList = true;
        listItems.push(trimmedLine);
      } else if (trimmedLine.startsWith('|')) {
        flushList(index);
        if (!elements.some(el => el && typeof el === 'object' && 'key' in el && el.key === `table-${index - 1}`)) {
          const tableLines = [trimmedLine];
          let nextIdx = index + 1;
          while (nextIdx < lines.length && lines[nextIdx].trim().startsWith('|')) {
            tableLines.push(lines[nextIdx].trim());
            nextIdx++;
          }
          if (tableLines.length > 2) {
            const headers = tableLines[0].split('|').filter(Boolean).map(h => h.trim());
            const rows = tableLines.slice(2).map(row => 
              row.split('|').filter(Boolean).map(cell => cell.trim())
            );
            elements.push(
              <div key={`table-${index}`} className="overflow-x-auto mb-6">
                <table className="min-w-full border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-4 py-2 text-left text-sm font-semibold text-gray-700 border-b">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-4 py-2 text-sm text-gray-600 border-b">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
        }
      } else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**') && !trimmedLine.includes(':**')) {
        flushList(index);
        elements.push(
          <p key={index} className="font-semibold text-gray-800 mt-6 mb-2">
            {trimmedLine.replace(/\*\*/g, '')}
          </p>
        );
      } else {
        flushList(index);
        const formatted = trimmedLine
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-brand-green hover:underline">$1</a>');
        elements.push(
          <p key={index} className="text-gray-600 mb-4 leading-relaxed" dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      }
    });

    flushList(lines.length);
    return elements;
  };

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>{post.title} | WhachatCRM Blog</title>
        <meta name="description" content={post.excerpt} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={shareUrl} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />
        <link rel="canonical" href={shareUrl} />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BlogPosting",
            "headline": post.title,
            "description": post.excerpt,
            "datePublished": post.date,
            "author": {
              "@type": "Organization",
              "name": "WhachatCRM"
            },
            "publisher": {
              "@type": "Organization",
              "name": "WhachatCRM",
              "url": "https://whachatcrm.com"
            }
          })}
        </script>
      </Helmet>

      <header className="border-b border-gray-100">
        <nav className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-brand-green flex items-center justify-center text-white font-bold">
                C
              </div>
              <span className="font-display font-bold text-xl text-brand-teal">WhachatCRM</span>
            </a>
          </Link>
          <Link href="/blog">
            <a className="text-gray-600 hover:text-gray-900 text-sm font-medium flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </a>
          </Link>
        </nav>
      </header>

      <article className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
            <span className="text-brand-green font-medium">{post.category}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(post.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {post.readTime}
            </span>
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-gray-900 mb-6 leading-tight">
            {post.title}
          </h1>
          
          <p className="text-xl text-gray-600 leading-relaxed">
            {post.excerpt}
          </p>
        </div>

        <div className="p-4 mb-12 bg-gray-50 rounded-xl">
          <p className="text-sm font-semibold text-gray-700 mb-3 text-center">Share this post:</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href={`https://x.com/intent/post?text=${encodeURIComponent(post.title + ' @whachatcrm')}&url=${shareUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
              data-testid="share-x"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              X
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0077B5] text-white rounded-lg hover:bg-[#006699] transition-colors text-sm font-medium"
              data-testid="share-linkedin"
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
            </a>
            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(post.title + ' @whachatcrm ' + shareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white rounded-lg hover:bg-[#1da851] transition-colors text-sm font-medium"
              data-testid="share-whatsapp"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
              data-testid="share-copy"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          {renderContent(content)}
        </div>

        <div className="mt-16 pt-8 border-t border-gray-200">
          <div className="bg-gradient-to-br from-brand-green/5 to-brand-teal/5 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-3">
              Ready to try WhatsApp CRM?
            </h2>
            <p className="text-gray-600 mb-6">
              Start managing your WhatsApp conversations like a pro. Free plan available.
            </p>
            <Link href="/auth">
              <Button size="lg" className="bg-brand-green hover:bg-brand-green/90">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        {(prevPost || nextPost) && (
          <div className="mt-12 pt-8 border-t border-gray-200 grid sm:grid-cols-2 gap-6">
            {prevPost && (
              <Link href={`/blog/${prevPost.slug}`}>
                <a className="group block p-4 rounded-xl border border-gray-200 hover:border-brand-green/50 transition-colors">
                  <span className="text-sm text-gray-500 flex items-center gap-1 mb-2">
                    <ArrowLeft className="h-4 w-4" />
                    Previous
                  </span>
                  <span className="font-medium text-gray-900 group-hover:text-brand-green transition-colors line-clamp-2">
                    {prevPost.title}
                  </span>
                </a>
              </Link>
            )}
            {nextPost && (
              <Link href={`/blog/${nextPost.slug}`}>
                <a className="group block p-4 rounded-xl border border-gray-200 hover:border-brand-green/50 transition-colors sm:text-right">
                  <span className="text-sm text-gray-500 flex items-center gap-1 mb-2 sm:justify-end">
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </span>
                  <span className="font-medium text-gray-900 group-hover:text-brand-green transition-colors line-clamp-2">
                    {nextPost.title}
                  </span>
                </a>
              </Link>
            )}
          </div>
        )}
      </article>

      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">© 2025 WhachatCRM. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy-policy">
              <a className="text-sm text-gray-500 hover:text-gray-900">Privacy</a>
            </Link>
            <Link href="/terms-of-use">
              <a className="text-sm text-gray-500 hover:text-gray-900">Terms</a>
            </Link>
            <Link href="/blog">
              <a className="text-sm text-gray-500 hover:text-gray-900">Blog</a>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
