interface BlogPostMeta {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
  readTime: string;
  featured?: boolean;
}

const BLOG_POSTS_META: BlogPostMeta[] = [
  {
    slug: "whatsapp-crm-complete-guide-2025",
    title: "WhatsApp CRM: The Complete Guide for Small Businesses in 2025",
    excerpt: "Learn how to use WhatsApp as a powerful CRM tool to manage customer relationships, automate responses, and grow your business.",
    category: "Guides",
    date: "2025-12-15",
    readTime: "12 min read",
    featured: true,
  },
  {
    slug: "whatsapp-business-api-vs-business-app",
    title: "WhatsApp Business API vs Business App: Which One Do You Need?",
    excerpt: "Confused about the difference between WhatsApp Business App and WhatsApp Business API? This guide breaks down features, pricing, and helps you choose.",
    category: "Comparison",
    date: "2025-12-10",
    readTime: "8 min read",
  },
  {
    slug: "automate-whatsapp-messages-small-business",
    title: "How to Automate WhatsApp Messages for Your Small Business",
    excerpt: "Save hours every day with WhatsApp automation. Learn how to set up auto-replies, away messages, drip campaigns, and workflow triggers.",
    category: "Automation",
    date: "2025-12-05",
    readTime: "10 min read",
  },
  {
    slug: "whatsapp-lead-management-tips",
    title: "10 WhatsApp Lead Management Tips That Actually Work",
    excerpt: "Stop losing leads in your WhatsApp inbox. These proven strategies help you organize conversations, follow up on time, and close more deals.",
    category: "Tips",
    date: "2025-11-28",
    readTime: "7 min read",
  },
  {
    slug: "wati-alternatives-comparison",
    title: "5 Best WATI Alternatives for Small Teams in 2025",
    excerpt: "Looking for WATI alternatives? We compare the top WhatsApp CRM tools for small teams, including pricing, features, and ease of use.",
    category: "Comparison",
    date: "2025-11-20",
    readTime: "9 min read",
  },
  {
    slug: "whatsapp-customer-service-best-practices",
    title: "WhatsApp Customer Service: 8 Best Practices for 2025",
    excerpt: "Deliver exceptional customer support via WhatsApp. Learn response time benchmarks, template strategies, and how to handle difficult conversations.",
    category: "Best Practices",
    date: "2025-11-15",
    readTime: "8 min read",
  },
  {
    slug: "twilio-whatsapp-setup-guide",
    title: "How to Set Up Twilio for WhatsApp Business: Step-by-Step Guide",
    excerpt: "A complete walkthrough for connecting your WhatsApp Business account to Twilio. From sandbox testing to production approval in one guide.",
    category: "Guides",
    date: "2025-11-10",
    readTime: "15 min read",
  },
  {
    slug: "whatsapp-drip-campaigns-examples",
    title: "WhatsApp Drip Campaigns: 5 Examples That Convert",
    excerpt: "Learn how to create automated WhatsApp message sequences that nurture leads and drive sales. Includes ready-to-use templates.",
    category: "Automation",
    date: "2025-11-05",
    readTime: "11 min read",
  },
];

const BASE_URL = "https://whachatcrm.com";

export function injectSeoMeta(html: string, url: string): string {
  if (url.startsWith("/blog/")) {
    const slug = url.replace("/blog/", "").replace(/\/$/, "");
    const post = BLOG_POSTS_META.find(p => p.slug === slug);
    
    if (post) {
      const canonicalUrl = `${BASE_URL}/blog/${post.slug}`;
      
      // Remove existing OG and Twitter meta tags to prevent duplicates
      html = html.replace(/<meta property="og:title"[^>]*>/gi, '');
      html = html.replace(/<meta property="og:description"[^>]*>/gi, '');
      html = html.replace(/<meta property="og:type"[^>]*>/gi, '');
      html = html.replace(/<meta property="og:url"[^>]*>/gi, '');
      html = html.replace(/<meta property="og:image"[^>]*>/gi, '');
      html = html.replace(/<meta property="og:image:width"[^>]*>/gi, '');
      html = html.replace(/<meta property="og:image:height"[^>]*>/gi, '');
      html = html.replace(/<meta name="twitter:card"[^>]*>/gi, '');
      html = html.replace(/<meta name="twitter:title"[^>]*>/gi, '');
      html = html.replace(/<meta name="twitter:description"[^>]*>/gi, '');
      html = html.replace(/<meta name="twitter:image"[^>]*>/gi, '');
      html = html.replace(/<meta name="description"[^>]*>/gi, '');
      html = html.replace(/<link rel="canonical"[^>]*>/gi, '');
      
      const metaTags = `
    <title>${post.title} | WhachatCRM Blog</title>
    <meta name="description" content="${post.excerpt}" />
    <meta property="og:title" content="${post.title}" />
    <meta property="og:description" content="${post.excerpt}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${BASE_URL}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${post.title}" />
    <meta name="twitter:description" content="${post.excerpt}" />
    <meta name="twitter:image" content="${BASE_URL}/og-image.png" />
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "${post.title}",
      "description": "${post.excerpt}",
      "datePublished": "${post.date}",
      "url": "${canonicalUrl}",
      "author": { "@type": "Organization", "name": "WhachatCRM" },
      "publisher": { "@type": "Organization", "name": "WhachatCRM", "url": "${BASE_URL}" }
    }
    </script>`;
      
      html = html.replace(/<title>.*?<\/title>/, metaTags);
    }
  } else if (url === "/blog" || url === "/blog/") {
    const canonicalUrl = `${BASE_URL}/blog`;
    
    // Remove existing OG and Twitter meta tags to prevent duplicates
    html = html.replace(/<meta property="og:title"[^>]*>/gi, '');
    html = html.replace(/<meta property="og:description"[^>]*>/gi, '');
    html = html.replace(/<meta property="og:type"[^>]*>/gi, '');
    html = html.replace(/<meta property="og:url"[^>]*>/gi, '');
    html = html.replace(/<meta property="og:image"[^>]*>/gi, '');
    html = html.replace(/<meta property="og:image:width"[^>]*>/gi, '');
    html = html.replace(/<meta property="og:image:height"[^>]*>/gi, '');
    html = html.replace(/<meta name="twitter:card"[^>]*>/gi, '');
    html = html.replace(/<meta name="twitter:title"[^>]*>/gi, '');
    html = html.replace(/<meta name="twitter:description"[^>]*>/gi, '');
    html = html.replace(/<meta name="twitter:image"[^>]*>/gi, '');
    html = html.replace(/<meta name="description"[^>]*>/gi, '');
    html = html.replace(/<link rel="canonical"[^>]*>/gi, '');
    
    const metaTags = `
    <title>WhatsApp CRM Blog | Tips, Guides & Best Practices | WhachatCRM</title>
    <meta name="description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service best practices." />
    <meta property="og:title" content="WhatsApp CRM Blog | Tips, Guides & Best Practices" />
    <meta property="og:description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${BASE_URL}/og-image.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="WhatsApp CRM Blog | Tips, Guides & Best Practices" />
    <meta name="twitter:description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service." />
    <meta name="twitter:image" content="${BASE_URL}/og-image.png" />
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      "name": "WhachatCRM Blog",
      "description": "Expert guides on WhatsApp CRM, automation, lead management, and customer service best practices.",
      "url": "${canonicalUrl}",
      "publisher": { "@type": "Organization", "name": "WhachatCRM", "url": "${BASE_URL}" }
    }
    </script>`;
    
    html = html.replace(/<title>.*?<\/title>/, metaTags);
  }
  
  return html;
}

export function isCrawler(userAgent: string): boolean {
  const crawlerPatterns = [
    /googlebot/i,
    /bingbot/i,
    /slurp/i,
    /duckduckbot/i,
    /baiduspider/i,
    /yandexbot/i,
    /facebot/i,
    /twitterbot/i,
    /linkedinbot/i,
    /whatsapp/i,
    /telegrambot/i,
    /applebot/i,
  ];
  
  return crawlerPatterns.some(pattern => pattern.test(userAgent));
}

export function generateHomepageHtml(): string {
  // Minimal SSR content for SEO - hidden with opacity:0, React will replace
  // This provides content for crawlers while avoiding visual flash
  return `
    <div data-ssr-content="true" style="opacity: 0; position: absolute; pointer-events: none;">
      <h1>One Inbox. Every Channel. Zero Complexity.</h1>
      <p>WhatsApp, SMS, Telegram, Instagram, Facebook, Web Chat — all in one unified inbox. Stop juggling apps. Respond faster, never lose a lead.</p>
      <p>WhachatCRM - Official WhatsApp API, Instagram & SMS - One Unified Inbox</p>
      <p>Manage all your customer conversations from WhatsApp Business API, Instagram, Facebook, SMS and more in one unified inbox. Built for SMBs and solo founders.</p>
      
      <h2>WhatsApp Wasn't Built for Managing Customers — Until Now</h2>
      <p>Important chats get buried. No context about customers. Follow-ups are forgotten. Teams lose visibility.</p>
      <p>WhachatCRM Solution: One conversation per customer. Notes, tags & tasks inside each chat. Clear follow-ups so nothing slips through. Multi-channel integrations with your favorite tools.</p>
      
      <h2>Everything You Need to Manage WhatsApp Like a CRM</h2>
      <h3>Organized Conversations</h3>
      <p>Every WhatsApp chat becomes a customer record — no more searching or guessing.</p>
      <h3>Notes & Tags</h3>
      <p>Add internal notes and tags so your team always knows the full context.</p>
      <h3>Follow-Ups & Tasks</h3>
      <p>Set reminders and tasks to make sure every lead is followed up on time.</p>
      <h3>AI Brain</h3>
      <p>Smart reply suggestions, lead capture & tone control. Your AI-powered business assistant.</p>
      <h3>Visual Chatbot Builder</h3>
      <p>Build automated flows with our drag-and-drop chatbot builder. No coding required.</p>
      <h3>Multi-Channel Integrations</h3>
      <p>Connect with Shopify, HubSpot, Salesforce, Stripe & more to sync leads across all your tools.</p>
      
      <h2>Up and running in minutes</h2>
      <p>No complex setup. No training required.</p>
      <p>1. Connect your number - Link your WhatsApp Business number in just a few clicks.</p>
      <p>2. Organize your chats - Add notes, tags, and set follow-up reminders for each conversation.</p>
      <p>3. Close more deals - Get reminders, follow up on time, and convert more leads into customers.</p>
      
      <a href="/auth">Start Your 14-Day Pro Trial</a>
      <a href="/pricing">Compare Plans</a>
      <p>No credit card required. Free plan available forever.</p>
      <p>Built on the official WhatsApp Business API. Secure & compliant — no scraping. Designed for founders, sales teams & support teams.</p>
      
      <footer>
        <p>© 2025 WhachatCRM. All rights reserved.</p>
        <a href="/privacy-policy">Privacy</a>
        <a href="/terms-of-use">Terms</a>
        <a href="/contact">Contact</a>
        <a href="/blog">Blog</a>
      </footer>
    </div>`;
}

export function injectHomepageSeoMeta(html: string): string {
  const webPageSchema = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Official WhatsApp API, Instagram & SMS - One Unified Inbox",
      "url": "https://whachatcrm.com/",
      "description": "Manage WhatsApp Business API, Instagram, Facebook and SMS conversations in one unified inbox."
    }
    </script>`;
  
  html = html.replace('</head>', webPageSchema + '\n  </head>');
  
  return html;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function generateBlogListHtml(): string {
  const featuredPost = BLOG_POSTS_META.find(p => p.featured);
  const regularPosts = BLOG_POSTS_META.filter(p => !p.featured);
  
  let html = `
    <div id="ssr-blog-content" style="font-family: system-ui, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px;">
      <header style="text-align: center; padding: 40px 0;">
        <h1 style="font-size: 2.5rem; margin-bottom: 16px;">WhatsApp CRM Blog</h1>
        <p style="font-size: 1.1rem; color: #666;">Expert guides, tips, and best practices to help you grow your business with WhatsApp</p>
      </header>
      <main>`;
  
  if (featuredPost) {
    html += `
        <article style="background: #f8fdf9; border: 1px solid #22c55e30; border-radius: 16px; padding: 32px; margin-bottom: 32px;">
          <span style="background: #22c55e; color: white; padding: 4px 12px; border-radius: 999px; font-size: 12px;">Featured</span>
          <span style="margin-left: 8px; color: #666; font-size: 14px;">${featuredPost.category}</span>
          <h2 style="font-size: 1.75rem; margin: 16px 0 8px;">
            <a href="/blog/${featuredPost.slug}" style="color: #111; text-decoration: none;">${featuredPost.title}</a>
          </h2>
          <p style="color: #555; margin-bottom: 16px;">${featuredPost.excerpt}</p>
          <div style="color: #888; font-size: 14px;">
            <span>${formatDate(featuredPost.date)}</span> · <span>${featuredPost.readTime}</span>
          </div>
        </article>`;
  }
  
  html += `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px;">`;
  
  for (const post of regularPosts) {
    html += `
          <article style="background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px;">
            <span style="color: #22c55e; font-size: 14px; font-weight: 500;">${post.category}</span>
            <h3 style="font-size: 1.125rem; margin: 8px 0;">
              <a href="/blog/${post.slug}" style="color: #111; text-decoration: none;">${post.title}</a>
            </h3>
            <p style="color: #666; font-size: 14px; margin-bottom: 16px;">${post.excerpt}</p>
            <div style="color: #888; font-size: 13px;">
              <span>${post.readTime}</span>
            </div>
          </article>`;
  }
  
  html += `
        </div>
      </main>
      <footer style="text-align: center; padding: 40px 0; margin-top: 40px; border-top: 1px solid #e5e7eb;">
        <p style="color: #666;">© 2025 WhachatCRM. All rights reserved.</p>
      </footer>
    </div>`;
  
  return html;
}

function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/^## (.*$)/gim, '<h2 style="font-size:1.5rem;margin:24px 0 12px;font-weight:600;">$1</h2>')
    .replace(/^### (.*$)/gim, '<h3 style="font-size:1.25rem;margin:20px 0 10px;font-weight:500;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\- (.*$)/gim, '<li style="margin-left:20px;">$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li style="margin-left:20px;">$1</li>')
    .replace(/\n\n/g, '</p><p style="margin:16px 0;">')
    .replace(/\n/g, '<br/>')
    .replace(/\| (.*) \|/g, (match) => `<div style="overflow-x:auto;font-size:14px;">${match}</div>`);
}

const BLOG_CONTENT_SSR: Record<string, string> = {
  "whatsapp-crm-complete-guide-2025": `WhatsApp has become the world's most popular messaging platform with over 2 billion users. For businesses, this presents an incredible opportunity to connect with customers where they already spend their time.

## What is WhatsApp CRM?

A WhatsApp CRM (Customer Relationship Management) system helps businesses manage customer conversations, track leads, and build relationships through WhatsApp. Unlike traditional CRM systems that focus on email and phone calls, WhatsApp CRM is designed for the messaging-first world.

### Key Features of WhatsApp CRM

**1. Unified Inbox** - All your WhatsApp conversations in one place.
**2. Contact Management** - Store customer information and track interaction history.
**3. Tags and Labels** - Organize conversations by status.
**4. Follow-up Reminders** - Never forget to follow up with a lead.
**5. Team Collaboration** - Assign conversations to team members.

## Why Your Business Needs WhatsApp CRM

With a 98% open rate, WhatsApp messages are almost guaranteed to be seen. Customers expect quick responses, and WhatsApp CRM helps you respond within minutes. Businesses using WhatsApp for sales report up to 40% higher conversion rates.

## Getting Started

1. Choose a WhatsApp CRM that offers easy Twilio or WhatsApp Business API integration
2. Connect your WhatsApp number (setup takes 15-30 minutes)
3. Import your contacts
4. Set up automation and train your team`,

  "whatsapp-business-api-vs-business-app": `If you're looking to use WhatsApp for business, you've probably encountered two options: the WhatsApp Business App and the WhatsApp Business API.

## WhatsApp Business App

The free mobile application designed for small businesses. Best for solo entrepreneurs and very small teams with low message volume.

**Features:** Business profile, quick replies, labels, basic catalog.
**Limitations:** One device only, no team collaboration, no CRM integration.

## WhatsApp Business API

Designed for medium to large businesses that need more power and flexibility.

**Features:** Multi-user access, full automation, CRM integration, webhooks, message templates.
**Best For:** Growing teams (3+ people), businesses with high message volume.

## Which One Should You Choose?

Choose the Business App if you're a solo operator handling fewer than 50 messages per day. Choose the API if you have a team and want automation and integrations.`,

  "automate-whatsapp-messages-small-business": `Time is your most valuable resource as a small business owner. Automating WhatsApp messages can save you hours every week while improving customer experience.

## Types of WhatsApp Automation

**1. Auto-Reply Messages** - Send instant responses when customers message you.
**2. Away Messages** - Automatically respond outside business hours.
**3. Drip Campaigns** - Send a series of messages over time to nurture leads.
**4. Keyword Triggers** - Respond based on keywords in customer messages.

## Automation Best Practices

- Keep it human - use conversational language
- Set clear expectations about response times
- Don't over-automate complex questions and complaints
- Monitor and adjust weekly

**Total weekly time saved with automation: 5-10 hours**`,

  "whatsapp-lead-management-tips": `Your WhatsApp inbox is full of potential customers, but without proper management, leads slip through the cracks.

## 10 Proven Tips

1. **Respond Within 5 Minutes** - Speed wins deals
2. **Use Tags Religiously** - New, Hot, Quoted, Waiting, Lost, Paid
3. **Set Follow-Up Reminders** - Most leads need 5-7 touchpoints
4. **Take Notes on Every Conversation** - Future you will thank past you
5. **Create Response Templates** - Don't reinvent the wheel
6. **Segment Your Leads** - Not all leads are equal
7. **Qualify Leads Quickly** - Ask qualifying questions early
8. **Use Pipeline Stages** - Lead, Contacted, Proposal, Negotiation, Closed
9. **Set Daily Lead Review** - 15 minutes each morning
10. **Learn from Lost Deals** - Ask for feedback

Start with these fundamentals and refine your process over time.`,

  "wati-alternatives-comparison": `WATI is a popular WhatsApp Business solution, but it's not the only option.

## Top Alternatives

**WhachatCRM** - Best for small teams wanting zero message markup. Free plan available, starting at $0/month. No hidden message costs.

**Respond.io** - Best for multi-channel communication. Starting at $79/month. Supports WhatsApp, Instagram, Messenger, and more.

**Trengo** - Best for customer service teams. Starting at $15/user/month. Unified inbox with ticketing system.

**Interakt** - Best for Indian market businesses.

## Key Differences

WhachatCRM offers zero message markup (you pay Twilio directly), a free plan, and simple interface. WATI charges message markup on top of subscription fees.`,

  "whatsapp-customer-service-best-practices": `Delivering exceptional customer support via WhatsApp requires the right approach.

## 8 Best Practices

1. **Set Response Time Expectations** - Aim for under 1 hour during business hours
2. **Use Templates Wisely** - Save time while keeping it personal
3. **Handle Difficult Conversations with Care** - Stay calm and professional
4. **Escalate When Needed** - Know when to involve managers
5. **Follow Up After Resolution** - Ensure customer satisfaction
6. **Collect Feedback** - Ask for ratings and reviews
7. **Document Everything** - Keep notes for future reference
8. **Train Your Team Regularly** - Keep skills sharp

Great customer service on WhatsApp builds loyalty and generates referrals.`,

  "twilio-whatsapp-setup-guide": `A complete walkthrough for connecting your WhatsApp Business account to Twilio.

## Setup Steps

1. **Create a Twilio Account** - Sign up at twilio.com
2. **Get WhatsApp Sandbox** - Start testing in the sandbox
3. **Apply for Production** - Get your number approved
4. **Configure Webhooks** - Set up message receiving
5. **Connect to Your CRM** - Integrate with WhachatCRM

## Common Issues and Solutions

- Verification failed: Ensure your business is registered properly
- Messages not sending: Check your Twilio balance
- Webhooks not working: Verify URL is accessible

The entire setup typically takes 15-30 minutes.`,

  "whatsapp-drip-campaigns-examples": `Learn how to create automated WhatsApp message sequences that nurture leads and drive sales.

## Example Drip Sequences

**Lead Nurturing:**
- Day 0: Thanks for your interest! Here's an overview...
- Day 1: Did you have any questions?
- Day 3: Here's a case study that might help...
- Day 7: Would you like to schedule a call?

**Customer Onboarding:**
- Day 0: Welcome! Here's how to get started...
- Day 1: Quick tip for using feature X
- Day 3: Check out these advanced features
- Day 7: How's everything going? Need help?

**Re-engagement:**
- Day 0: We miss you! Here's what's new...
- Day 3: Special offer just for you
- Day 7: Last chance for this deal

Start simple and expand based on results.`
};

export function generateBlogPostHtml(slug: string): string | null {
  const post = BLOG_POSTS_META.find(p => p.slug === slug);
  if (!post) return null;
  
  const content = BLOG_CONTENT_SSR[slug];
  const contentHtml = content ? markdownToHtml(content) : `<p style="font-size: 1.1rem; color: #555;">${post.excerpt}</p>`;
  
  return `
    <div id="ssr-blog-content" style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <nav style="margin-bottom: 24px;">
        <a href="/blog" style="color: #22c55e; text-decoration: none;">← Back to Blog</a>
      </nav>
      <article>
        <header style="margin-bottom: 32px;">
          <span style="color: #22c55e; font-size: 14px; font-weight: 500;">${post.category}</span>
          <h1 style="font-size: 2rem; margin: 12px 0 16px;">${post.title}</h1>
          <div style="color: #666; font-size: 14px;">
            <span>${formatDate(post.date)}</span> · <span>${post.readTime}</span>
          </div>
        </header>
        <div style="color: #333; line-height: 1.7;">
          <p style="margin: 16px 0;">${contentHtml}</p>
        </div>
      </article>
      <footer style="text-align: center; padding: 40px 0; margin-top: 40px; border-top: 1px solid #e5e7eb;">
        <p style="color: #666;">© 2025 WhachatCRM. All rights reserved.</p>
      </footer>
    </div>`;
}
