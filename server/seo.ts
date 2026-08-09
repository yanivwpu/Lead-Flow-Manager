import {
  BLOG_POSTS,
  resolveBlogImageAlt,
  resolveBlogFeaturedImageUrl,
  resolveBlogOgImage,
  type BlogPostMeta,
} from "@shared/blogPosts";
import { getAllMarketingNavLinks, MARKETING_NAV_DROPDOWNS } from "@shared/marketingNav";
import { ALL_SOLUTION_PAGES } from "@shared/solutionPages";
import { ALL_PRODUCT_PAGES } from "@shared/productPages";

const BASE_URL = (process.env.MARKETING_URL || "https://www.whachatcrm.com").replace(/\/+$/, "");

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function jsonLd(value: string): string {
  return JSON.stringify(value);
}

/** @deprecated Import from `@shared/blogPosts` */
export type { BlogPostMeta as BlogPostMeta };
export { BLOG_POSTS as BLOG_POSTS_META };

export function injectSeoMeta(html: string, url: string): string {
  if (url.startsWith("/blog/")) {
    const slug = url.replace("/blog/", "").replace(/\/$/, "");
    const post = BLOG_POSTS.find(p => p.slug === slug);
    
    if (post) {
      const canonicalUrl = `${BASE_URL}/blog/${post.slug}`;
      const documentTitle = post.seoTitle ?? `${post.title} | WhachatCRM Blog`;
      const ogImage = resolveBlogOgImage(post, BASE_URL);
      const imageAlt = escapeHtmlAttr(resolveBlogImageAlt(post));
      const safeTitle = escapeHtmlAttr(post.title);
      const safeExcerpt = escapeHtmlAttr(post.excerpt);
      const safeDocumentTitle = escapeHtmlAttr(documentTitle);
      
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
    <title>${safeDocumentTitle}</title>
    <meta name="description" content="${safeExcerpt}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeExcerpt}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:alt" content="${imageAlt}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeExcerpt}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="${imageAlt}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "${safeTitle}",
      "description": "${safeExcerpt}",
      "datePublished": "${post.date}",
      "image": ["${ogImage}"],
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
    <title>WhatsApp CRM Blog & Guides | WhachatCRM</title>
    <meta name="description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service best practices." />
    <meta property="og:title" content="WhatsApp CRM Blog & Guides | WhachatCRM" />
    <meta property="og:description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta property="og:image" content="${BASE_URL}/og/og-whachatcrm.png?v=5" />
    <meta property="og:image:alt" content="WhachatCRM – AI Sales & Automation Platform" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="WhatsApp CRM Blog & Guides | WhachatCRM" />
    <meta name="twitter:description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service." />
    <meta name="twitter:image" content="${BASE_URL}/og/og-whachatcrm.png?v=5" />
    <meta name="twitter:image:alt" content="WhachatCRM – AI Sales & Automation Platform" />
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

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogImage?: string;
}

export const PAGE_META: Record<string, PageMeta> = {
  "/pricing": {
    title: "Pricing – Free Forever | WhachatCRM",
    description: "Simple, transparent pricing for WhatsApp CRM. Free plan forever, Starter at $19/mo, Pro at $49/mo. No hidden fees, no message markup. Start free today.",
    canonical: `${BASE_URL}/pricing`
  },
  "/whatsapp-crm": {
    title: "WhatsApp CRM Software — Shared Inbox, AI & Automation | WhachatCRM",
    description:
      "Complete WhatsApp CRM guide: Business App vs API, embedded signup, shared inbox, AI Copilot, team collaboration, automations, Shopify and real estate workflows. Free plan available.",
    canonical: `${BASE_URL}/whatsapp-crm`
  },
  "/crm-with-mls-integration": {
    title: "CRM with MLS Integration | AI Property Matching | WhachatCRM",
    description:
      "Connect Bridge Interactive MLS data to WhachatCRM. Sync inventory, qualify buyers with AI, match listings automatically, and route leads from WhatsApp and your agent page.",
    canonical: `${BASE_URL}/crm-with-mls-integration`
  },
  "/real-estate-crm": {
    title: "Real Estate CRM for Agents & Teams | WhachatCRM",
    description:
      "Real estate CRM with WhatsApp, Unified Inbox, AI qualification, MLS matching, and follow-up automation. Capture buyer and seller leads and move conversations toward booked showings.",
    canonical: `${BASE_URL}/real-estate-crm`
  },
  "/solutions/ecommerce": {
    title: "E-commerce CRM & Customer Messaging | WhachatCRM",
    description:
      "E-commerce CRM and customer messaging for WhatsApp, Instagram, Facebook, SMS, and Email. Unify shopper conversations, automate follow-up, and connect Shopify where supported.",
    canonical: `${BASE_URL}/solutions/ecommerce`
  },
  "/solutions/local-service-businesses": {
    title: "CRM for Local Service Businesses | WhachatCRM",
    description:
      "CRM and messaging for local service businesses. Find and qualify leads with Prospect AI, capture service requests, assign work, share booking links, and automate follow-up.",
    canonical: `${BASE_URL}/solutions/local-service-businesses`
  },
  "/solutions/marketing-agencies": {
    title: "WhatsApp & Messaging Platform for Marketing Agencies | WhachatCRM",
    description:
      "Agency messaging platform for WhatsApp, multi-channel inbox, chatbots, automation, AI Copilot, and client engagement. Optional GoHighLevel connection and Partner Program.",
    canonical: `${BASE_URL}/solutions/marketing-agencies`
  },
  "/solutions/med-spas": {
    title: "CRM for Med Spas & Wellness Businesses | WhachatCRM",
    description:
      "CRM and messaging for med spas and wellness businesses. Capture treatment inquiries from WhatsApp and Instagram, qualify consultations, assign your team, and automate follow-up.",
    canonical: `${BASE_URL}/solutions/med-spas`
  },
  "/unified-inbox": {
    title: "Unified Inbox for Multi-Channel Messaging | WhachatCRM",
    description:
      "WhachatCRM Unified Inbox brings WhatsApp, Instagram, Facebook, SMS, Telegram, web chat, and email into one intelligent workspace with assignments, tags, stages, AI Copilot, and follow-up.",
    canonical: `${BASE_URL}/unified-inbox`
  },
  "/ai-brain": {
    title: "AI Brain for Business Knowledge & CRM Intelligence | WhachatCRM",
    description:
      "WhachatCRM AI Brain is the business-knowledge intelligence layer for your CRM. Teach your profile, analyze knowledge sources, review conflicts, publish approved intelligence, and power Copilot, Prospect AI, and campaigns.",
    canonical: `${BASE_URL}/ai-brain`
  },
  "/ai-copilot": {
    title: "AI Copilot for CRM Conversations | WhachatCRM",
    description:
      "WhachatCRM AI Copilot helps teams know what to say and what to do next inside customer conversations — with lead scoring, suggested replies, and next-action recommendations powered by conversation and business context.",
    canonical: `${BASE_URL}/ai-copilot`
  },
  "/automations": {
    title: "CRM Workflows & Automations | WhachatCRM",
    description:
      "Automate follow-up in WhachatCRM with workflows and ready-to-use templates. Trigger on new chats, keywords, tags, stages, or no reply — then assign, update contacts, and continue conversations.",
    canonical: `${BASE_URL}/automations`
  },
  "/chatbot-builder": {
    title: "Visual Chatbot Builder for Customer Journeys | WhachatCRM",
    description:
      "Build no-code chatbot journeys in WhachatCRM. Create message and question flows, capture inputs, branch conversations, tag contacts, assign teammates, and hand work into Unified Inbox across supported channels.",
    canonical: `${BASE_URL}/chatbot-builder`
  },
  "/campaigns": {
    title: "CRM Campaigns & Personalized Outreach | WhachatCRM",
    description:
      "Create personalized CRM campaigns in WhachatCRM. Select audiences, choose supported messaging channels, personalize with AI Brain where enabled, enroll contacts, track progress, and continue follow-up.",
    canonical: `${BASE_URL}/campaigns`
  },
  "/integrations": {
    title: "CRM Integrations Directory | WhachatCRM",
    description:
      "Connect WhachatCRM to messaging channels and business tools you already use — WhatsApp, Instagram, Facebook, SMS, email, Shopify, GoHighLevel, Calendly, Stripe, and more.",
    canonical: `${BASE_URL}/integrations`
  },
  "/shopify-crm": {
    title: "Shopify CRM with WhatsApp & AI Automation | WhachatCRM",
    description:
      "Shopify CRM connecting orders, abandoned carts, and customer support to WhatsApp, Messenger, and Instagram. Preset ecommerce automations, AI Copilot, and unified inbox.",
    canonical: `${BASE_URL}/shopify-crm`
  },
  "/whatsapp-business-api": {
    title: "WhatsApp Business API Setup & CRM | WhachatCRM",
    description:
      "Connect the official Meta WhatsApp Business API with embedded signup. Verification, shared inbox, chatbot automations, AI Copilot, analytics, and team collaboration — no BSP markup.",
    canonical: `${BASE_URL}/whatsapp-business-api`
  },
  "/ai-lead-scoring": {
    title: "AI Lead Scoring & Qualification | WhachatCRM",
    description:
      "AI lead scoring for WhatsApp and omnichannel sales. Qualify buyers and sellers, prioritize hot leads, automate follow-ups, and route conversations with WhachatCRM AI Copilot.",
    canonical: `${BASE_URL}/ai-lead-scoring`
  },
  "/shared-team-inbox": {
    title: "Shared Team Inbox & Collaboration | WhachatCRM",
    description:
      "Collaborate on customer conversations in WhachatCRM with shared inbox access, assignments, ownership visibility, and multi-user plans — so teams reply together without losing context.",
    canonical: `${BASE_URL}/shared-team-inbox`
  },
  "/automation-templates": {
    title: "Automation Templates for WhatsApp & CRM | WhachatCRM",
    description:
      "Built-in automation templates for abandoned cart recovery, appointment reminders, buyer and seller follow-up, Shopify, customer support, real estate, and re-engagement campaigns.",
    canonical: `${BASE_URL}/automation-templates`
  },
  "/respond-io-alternative": {
    title: "Best Respond.io Alternative | WhachatCRM",
    description: "Switch from Respond.io to WhachatCRM: Starts at $19/mo, free plan, unlimited users, simple setup. Better for small teams managing WhatsApp leads.",
    canonical: `${BASE_URL}/respond-io-alternative`
  },
  "/wati-alternative": {
    title: "Best WATI Alternative for SMBs | WhachatCRM",
    description: "Switch from WATI to WhachatCRM: $19/mo vs $30+, free plan, zero message markup, unlimited users, simple setup. Better for small teams.",
    canonical: `${BASE_URL}/wati-alternative`
  },
  "/pabbly-alternative": {
    title: "Best Pabbly Alternative | WhachatCRM",
    description: "Switch from Pabbly Chatflow to WhachatCRM: $19/mo, no credit limits, free plan available. Visual chatbot builder & unified inbox for small teams.",
    canonical: `${BASE_URL}/pabbly-alternative`
  },
  "/interakt-alternative": {
    title: "Interakt Alternative: Omnichannel WhatsApp CRM Comparison | WhachatCRM",
    description:
      "Compare Interakt vs WhachatCRM for WhatsApp CRM. Balanced overview of strengths, limitations, omnichannel inbox, AI, pricing transparency, and who each platform fits best.",
    canonical: `${BASE_URL}/interakt-alternative`
  },
  "/waba360-alternative": {
    title: "Best 360dialog Alternative | WhachatCRM",
    description: "Switch from 360dialog to WhachatCRM: $19/mo, built-in CRM features, visual chatbot builder, team inbox. No separate inbox tool needed.",
    canonical: `${BASE_URL}/waba360-alternative`
  },
  "/crm-for-whatsapp-business": {
    title: "CRM for WhatsApp Business: Complete Guide (2026) | WhachatCRM",
    description:
      "Learn what a CRM for WhatsApp Business is, how it differs from the WhatsApp Business app, and how to choose omnichannel inbox, automation, and AI tools for your team.",
    canonical: `${BASE_URL}/crm-for-whatsapp-business`
  },
  "/zoko-alternative": {
    title: "Best Zoko Alternative for Shopify | WhachatCRM",
    description: "Switch from Zoko to WhachatCRM: $19/mo vs $35+, zero per-message fees, unlimited flows, and affordable AI. Best for Shopify sellers.",
    canonical: `${BASE_URL}/zoko-alternative`
  },
  "/manychat-alternative": {
    title: "Best Manychat Alternative | WhachatCRM",
    description: "Looking for a Manychat alternative? WhachatCRM offers a unified inbox for 7+ channels, no message markups, and advanced AI automation for SMBs.",
    canonical: `${BASE_URL}/manychat-alternative`
  },
  "/best-whatsapp-crm-2026": {
    title: "Best WhatsApp CRM in 2026 | Omnichannel CRM Comparison",
    description:
      "Compare the best WhatsApp CRM platforms in 2026 and learn why businesses are moving toward omnichannel inboxes with AI, automation, Shopify support, and team collaboration.",
    canonical: `${BASE_URL}/best-whatsapp-crm-2026`
  },
  "/contact": {
    title: "Contact WhachatCRM | Get Support & Sales Help",
    description: "Contact WhachatCRM for sales questions, support, or partnership inquiries. We're here to help you get the most out of your WhatsApp CRM.",
    canonical: `${BASE_URL}/contact`
  },
  "/partner-program": {
    title: "WhachatCRM Partner Program | Earn Recurring Revenue with AI Messaging CRM",
    description:
      "Partner with WhachatCRM and earn recurring commissions helping ecommerce, service businesses, support teams, and real estate professionals connect WhatsApp, AI Copilot, and automation workflows.",
    canonical: `${BASE_URL}/partner-program`,
  },
  "/go-high-level-agencies": {
    title: "GoHighLevel Agency Solutions | Add WhatsApp & AI Messaging | WhachatCRM",
    description:
      "Add AI messaging, WhatsApp Business API, and omnichannel inboxes to your GoHighLevel agency services. Extend GHL for clients—no CRM migration required.",
    canonical: `${BASE_URL}/go-high-level-agencies`,
  },
  "/privacy-policy": {
    title: "Privacy Policy | WhachatCRM",
    description: "WhachatCRM privacy policy. Learn how we collect, use, and protect your data when using our WhatsApp CRM platform.",
    canonical: `${BASE_URL}/privacy-policy`
  },
  "/terms-of-use": {
    title: "Terms of Use | WhachatCRM",
    description: "WhachatCRM terms of use. Read our service terms, user responsibilities, and platform guidelines.",
    canonical: `${BASE_URL}/terms-of-use`
  },
  "/data-deletion": {
    title: "Data Deletion | WhachatCRM",
    description: "Request deletion of your WhachatCRM account and learn how Shopify-related data requests are supported.",
    canonical: `${BASE_URL}/data-deletion`
  },
  "/user-guide": {
    title: "Help Center & User Guide | WhachatCRM",
    description:
      "Complete WhachatCRM Help Center: onboarding, WhatsApp embedded signup, unified inbox, AI Copilot, Growth Engine, MLS, Shopify, agent pages, and 40+ FAQs.",
    canonical: `${BASE_URL}/user-guide`
  },
  "/unsubscribe": {
    title: "Email preferences | WhachatCRM",
    description: "How to unsubscribe from marketing emails from WhachatCRM.",
    canonical: `${BASE_URL}/unsubscribe`
  },
  "/realtor-growth-engine": {
    title: "Realtor Growth Engine – Turn Real Estate Leads Into Showings | WhachatCRM",
    description: "AI-powered WhatsApp automation that qualifies leads and schedules showings automatically. Fully done-for-you setup for real estate agents.",
    canonical: `${BASE_URL}/realtor-growth-engine`,
    ogImage: `${BASE_URL}/og/og-realtor-growth-engine.png`
  },
  "/prospect-ai": {
    title: "Prospect AI — AI Sales Team for Lead Generation & Outreach | WhachatCRM",
    description:
      "Prospect AI is your AI sales team: discover local businesses, qualify opportunities, launch personalized email outreach, and manage every reply in one CRM. Start free.",
    canonical: `${BASE_URL}/prospect-ai`,
    ogImage: `${BASE_URL}/og/og-prospect-ai.png`,
  },
  "/help": {
    title: "Help Center | WhachatCRM",
    description:
      "Find answers and learn how to use WhachatCRM — WhatsApp setup, unified inbox, templates, campaigns, AI Copilot, integrations, and billing.",
    canonical: `${BASE_URL}/help`,
  },
};

export function injectPageMeta(html: string, url: string): string {
  const pageMeta = PAGE_META[url];
  if (!pageMeta) {
    return html;
  }

  const safeTitle = escapeHtmlAttr(pageMeta.title);
  const safeDescription = escapeHtmlAttr(pageMeta.description);
  const ogImage = pageMeta.ogImage || `${BASE_URL}/og/og-whachatcrm.png?v=5`;

  // Remove existing meta tags to prevent duplicates
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
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDescription}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${pageMeta.canonical}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:secure_url" content="${ogImage}" />
    <meta property="og:image:alt" content="${safeTitle}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDescription}" />
    <meta name="twitter:image" content="${ogImage}" />
    <meta name="twitter:image:alt" content="${safeTitle}" />
    <link rel="canonical" href="${pageMeta.canonical}" />
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": ${jsonLd(pageMeta.title)},
      "description": ${jsonLd(pageMeta.description)},
      "url": ${jsonLd(pageMeta.canonical)},
      "isPartOf": { "@id": "${BASE_URL}/#website" }
    }
    </script>`;

  html = html.replace(/<title>.*?<\/title>/, metaTags);
  return html;
}

export function getMarketingRoutes(): string[] {
  return Object.keys(PAGE_META);
}

/** Visually hidden crawlable body used when React mounts with createRoot (replaces #root). */
function wrapCrawlableSsr(innerHtml: string): string {
  return `
      <div data-ssr-content="true" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;">
        ${innerHtml}
      </div>`;
}

type MarketingSsrPage = {
  h1: string;
  lead: string;
  bullets: string[];
  linksHtml: string;
};

const MARKETING_SSR_PAGES: Record<string, MarketingSsrPage> = {
  "/realtor-growth-engine": {
    h1: "Realtor Growth Engine",
    lead:
      "From new lead to booked showing — automatically. An AI-assisted real estate workspace inside WhachatCRM for agents and teams. Qualify buyers from conversation, capture preferences, match connected live inventory where supported, create personalized property presentations, run channel-aware follow-up, and move conversations toward a showing.",
    bullets: [
      "AI-assisted lead qualification and buyer preference capture",
      "Realtor workflows from inquiry to follow-up and booking",
      "MLS / live inventory property matching where connected",
      "Personalized property flyers and presentations",
      "Unified Inbox with AI Copilot for messaging channels",
      "Requires an appropriate WhachatCRM plan and AI Brain where applicable",
    ],
    linksHtml:
      '<a href="/pricing">View WhachatCRM plans</a> · <a href="/auth">Start free</a> · <a href="/real-estate-crm">Real estate CRM overview</a>',
  },
  "/waba360-alternative": {
    h1: "360dialog Alternative for WhatsApp CRM and Automation",
    lead:
      "360dialog is primarily WhatsApp Business API / BSP infrastructure for teams that want direct API access. WhachatCRM is a ready-to-use CRM and customer engagement platform built around WhatsApp and other channels — Meta Embedded Signup, Unified Inbox, automation, and team collaboration without building the product layer yourself.",
    bullets: [
      "Meta Embedded Signup and WhatsApp Cloud API onboarding",
      "Unified Inbox for WhatsApp and supported messaging channels",
      "Automation, chatbot, and team collaboration workflows",
      "CRM context, notes, and follow-up in one workspace",
      "Built for operators who want a ready product, not raw API pipes alone",
    ],
    linksHtml:
      '<a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/whatsapp-business-api">WhatsApp Business API guide</a> · <a href="/pricing">Pricing</a>',
  },
  "/wati-alternative": {
    h1: "WATI Alternative: WhatsApp Ops Maturity vs Omnichannel CRM Simplicity",
    lead:
      "WATI is a proven WhatsApp operations platform with strong shared-inbox and broadcast workflows. This page compares that WhatsApp-ops depth with WhachatCRM’s omnichannel CRM approach — Meta Embedded Signup, WhatsApp beside Email and Meta social channels, and a self-serve team inbox for SMBs.",
    bullets: [
      "Unified Inbox across WhatsApp and supported messaging channels",
      "Meta Embedded Signup for WhatsApp Cloud API onboarding",
      "Chatbot, templates, and automation on eligible plans",
      "Team collaboration with notes, tags, and follow-ups",
      "Built for SMBs that want omnichannel CRM simplicity, not WhatsApp-only ops",
    ],
    linksHtml:
      '<a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/whatsapp-crm">WhatsApp CRM guide</a> · <a href="/pricing">Pricing</a>',
  },
  "/manychat-alternative": {
    h1: "ManyChat Alternative: Social Automation Power vs WhatsApp-First CRM Inbox",
    lead:
      "ManyChat is widely used for social messaging automation and growth flows. This buying guide compares that automation focus with WhachatCRM as a WhatsApp-first CRM inbox for teams that need shared conversations, CRM context, and follow-up across customer channels.",
    bullets: [
      "WhatsApp Business API onboarding with Meta Embedded Signup",
      "Shared Unified Inbox for team replies and ownership",
      "CRM notes, tags, and pipeline context beside each chat",
      "Automation and chatbot tools for follow-up workflows",
      "Designed for operators who need inbox + CRM, not only social bots",
    ],
    linksHtml:
      '<a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/unified-inbox">Unified Inbox</a> · <a href="/pricing">Pricing</a>',
  },
  "/respond-io-alternative": {
    h1: "Respond.io Alternative: Omnichannel Scale vs SMB-Friendly Team Inbox",
    lead:
      "Respond.io is often evaluated for broader omnichannel conversation platforms. This page compares that enterprise-leaning scale with WhachatCRM’s SMB-friendly team inbox — WhatsApp, supported social channels, CRM context, and clear self-serve packaging.",
    bullets: [
      "Shared team inbox for WhatsApp and supported channels",
      "CRM context, assignments, and follow-ups in one workspace",
      "Automation and chatbot options for growing teams",
      "Meta Embedded Signup for official WhatsApp Cloud API setup",
      "Built for SMBs that want practical omnichannel CRM without enterprise complexity",
    ],
    linksHtml:
      '<a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/shared-team-inbox">Shared team inbox</a> · <a href="/pricing">Pricing</a>',
  },
  "/interakt-alternative": {
    h1: "Interakt Alternative: WhatsApp Commerce Hub vs Broader Engagement CRM",
    lead:
      "Interakt is commonly considered for WhatsApp commerce and engagement workflows. This guide compares that commerce-hub focus with WhachatCRM as a broader customer engagement CRM — Unified Inbox, automation, team collaboration, and multi-channel conversations.",
    bullets: [
      "Unified Inbox for WhatsApp and supported messaging channels",
      "CRM timeline, notes, and lead follow-up in one place",
      "Automation and chatbot support for sales and support",
      "Meta Embedded Signup for WhatsApp Cloud API onboarding",
      "Useful when you need engagement CRM breadth beyond a commerce-centric WhatsApp hub",
    ],
    linksHtml:
      '<a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/shopify-crm">Shopify CRM</a> · <a href="/pricing">Pricing</a>',
  },
  "/zoko-alternative": {
    h1: "Zoko Alternative: Shopify-First WhatsApp vs Multi-Channel CRM Inbox",
    lead:
      "Zoko is often evaluated for Shopify-first WhatsApp commerce workflows. This page compares that Shopify-centric approach with WhachatCRM’s multi-channel CRM inbox — WhatsApp plus supported channels, order-aware follow-up where connected, and team collaboration.",
    bullets: [
      "Shopify connection alongside a broader Unified Inbox",
      "WhatsApp Cloud API onboarding with Meta Embedded Signup",
      "Team inbox, notes, and automated follow-up workflows",
      "Support for sales and service conversations beyond D2C chat alone",
      "Built for merchants that need WhatsApp CRM plus omnichannel context",
    ],
    linksHtml:
      '<a href="/shopify-crm">Shopify CRM</a> · <a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/pricing">Pricing</a>',
  },
  "/pabbly-alternative": {
    h1: "Pabbly Alternative: Upfront Credits vs Predictable Monthly CRM",
    lead:
      "Pabbly is often compared for credit-based messaging and automation packaging. This page contrasts that model with WhachatCRM’s predictable SaaS CRM inbox — WhatsApp, team collaboration, automation, and clear monthly plans for operators who want an inbox-first product.",
    bullets: [
      "Unified Inbox and CRM context for WhatsApp conversations",
      "Team collaboration with notes, tags, and follow-ups",
      "Automation and chatbot tools on eligible plans",
      "Meta Embedded Signup for official WhatsApp Cloud API setup",
      "Predictable subscription packaging instead of credit-only math",
    ],
    linksHtml:
      '<a href="/pricing">WhachatCRM pricing</a> · <a href="/best-whatsapp-crm-2026">Best WhatsApp CRM comparison</a> · <a href="/whatsapp-crm">WhatsApp CRM guide</a>',
  },
  "/best-whatsapp-crm-2026": {
    h1: "Best WhatsApp CRM in 2026: Why Businesses Are Choosing Omnichannel CRM Platforms",
    lead:
      "A practical 2026 buying guide for WhatsApp CRM platforms. Learn what matters for official WhatsApp Business API access, shared inbox, automation, AI assistance, and omnichannel customer conversations — and how WhachatCRM fits that checklist.",
    bullets: [
      "Official WhatsApp Business API path with Meta Embedded Signup",
      "Unified omnichannel inbox for WhatsApp and supported channels",
      "Shared team inbox, notes, tags, and pipeline context",
      "Automation templates and AI-assisted workflows where enabled",
      "Transparent Meta messaging fees without WhachatCRM markup",
    ],
    linksHtml:
      '<a href="/wati-alternative">WATI alternative</a> · <a href="/crm-for-whatsapp-business">CRM for WhatsApp Business</a> · <a href="/pricing">Pricing</a>',
  },
  "/crm-for-whatsapp-business": {
    h1: "CRM for WhatsApp Business: The Complete Guide for Growing Teams",
    lead:
      "Learn what a CRM for WhatsApp Business is, how it differs from the WhatsApp Business app alone, and how growing teams use official API onboarding, shared inbox, automation, and AI tools to manage customer conversations.",
    bullets: [
      "Official WhatsApp Business API setup with Embedded Signup",
      "Unified omnichannel and shared team inbox",
      "Automation, templates, and follow-up workflows",
      "AI Copilot and lead scoring for prioritization",
      "Transparent Meta conversation pricing guidance",
    ],
    linksHtml:
      '<a href="/whatsapp-business-api">WhatsApp Business API guide</a> · <a href="/best-whatsapp-crm-2026">Best WhatsApp CRM 2026</a> · <a href="/pricing">Pricing</a>',
  },
  "/prospect-ai": {
    h1: "Meet Your AI Sales Team",
    lead:
      "Prospect AI is WhachatCRM’s AI sales team for finding local business prospects, qualifying opportunities, launching personalized outreach, and managing replies in one CRM — from discovery to conversation in Unified Inbox.",
    bullets: [
      "Discover businesses by type and location",
      "AI qualification and fit scoring before outreach",
      "Personalized outreach with message control",
      "Replies land in Unified Inbox for follow-up",
      "Works inside WhachatCRM alongside your messaging channels",
    ],
    linksHtml:
      '<a href="/pricing">View plans</a> · <a href="/auth">Start free</a> · <a href="/whatsapp-crm">WhatsApp CRM overview</a>',
  },
  ...Object.fromEntries(
    ALL_SOLUTION_PAGES.map((solution) => [
      solution.path,
      {
        h1: solution.h1,
        lead: solution.heroIntro,
        bullets: solution.ssrBullets,
        linksHtml: [
          ...solution.relatedLinks.slice(0, 2).map((l) => `<a href="${l.href}">${l.label}</a>`),
          '<a href="/auth">Start Free Trial</a>',
          '<a href="/pricing">Pricing</a>',
        ].join(" · "),
      } satisfies MarketingSsrPage,
    ]),
  ),
  ...Object.fromEntries(
    ALL_PRODUCT_PAGES.map((product) => [
      product.path,
      {
        h1: product.h1,
        lead: product.heroIntro,
        bullets: product.ssrBullets,
        linksHtml: [
          ...product.relatedProducts.slice(0, 2).map((l) => `<a href="${l.href}">${l.label}</a>`),
          '<a href="/auth">Start Free Trial</a>',
          '<a href="/pricing">Pricing</a>',
        ].join(" · "),
      } satisfies MarketingSsrPage,
    ]),
  ),
};

function renderMarketingSsrPage(page: MarketingSsrPage): string {
  const bullets = page.bullets.map((b) => `<li>${b}</li>`).join("\n            ");
  return wrapCrawlableSsr(`
        <main>
          <h1>${page.h1}</h1>
          <p>${page.lead}</p>
          <ul>
            ${bullets}
          </ul>
          <p>${page.linksHtml}</p>
        </main>`);
}

/**
 * Lightweight page-specific initial HTML for selected marketing routes.
 * Returns null when the route has head-meta only (existing behavior).
 */
export function generateMarketingPageSsrHtml(route: string): string | null {
  const page = MARKETING_SSR_PAGES[route];
  if (!page) return null;
  return renderMarketingSsrPage(page);
}

/** Routes that currently receive crawlable SSR body markup (for tests / audits). */
export function getMarketingSsrBodyRoutes(): string[] {
  return Object.keys(MARKETING_SSR_PAGES);
}

const NOINDEX_EXACT_PATHS = new Set([
  "/auth",
  "/reset-password",
  "/sales-admin",
  "/sales-portal",
  "/sales-portal/forgot-password",
  "/sales-portal/reset-password",
  "/partner-portal",
  "/partner-portal/forgot-password",
  "/partner-portal/reset-password",
  "/demo-scan",
  "/post-checkout",
]);

/** Routes that must not be indexed (auth, portals, embeds). */
export function isNoIndexPath(path: string): boolean {
  const normalized = path.split("?")[0].replace(/\/$/, "") || "/";
  if (NOINDEX_EXACT_PATHS.has(normalized)) return true;
  if (normalized.startsWith("/widget-frame/")) return true;
  if (normalized.startsWith("/chat/")) return true;
  return false;
}

export function injectNoindexMeta(html: string): string {
  html = html.replace(/<meta name="robots"[^>]*>/gi, "");
  const robotsTag = `<meta name="robots" content="noindex, nofollow" />`;
  if (html.includes("</head>")) {
    return html.replace("</head>", `    ${robotsTag}\n  </head>`);
  }
  return html;
}

export function generateHomepageHtml(): string {
  const navLinks = getAllMarketingNavLinks()
    .map((item) => `<li><a href="${item.href}">${item.label}</a> — ${item.description}</li>`)
    .join("\n            ");
  const navGroups = MARKETING_NAV_DROPDOWNS.map((dropdown) => {
    const items = dropdown.groups
      .flatMap((g) => g.items)
      .map((item) => `<li><a href="${item.href}">${item.label}</a></li>`)
      .join("\n              ");
    return `<h3>${dropdown.label}</h3>\n            <ul>\n              ${items}\n            </ul>`;
  }).join("\n            ");

  // SSR content for SEO - visually hidden but accessible to crawlers
  return `
      <div data-ssr-content="true" style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;">
        <main>
          <h1>Meet Your AI Sales Team</h1>
          <p>WhachatCRM helps businesses find and qualify prospects, manage conversations across channels, personalize the next action with AI, automate follow-up, and convert more chats into revenue.</p>
          <p>Official Meta API · WhatsApp, Instagram, Facebook, SMS, Telegram, Email and more</p>
          <p>Prospect AI finds and qualifies businesses to sell to. AI Brain powers personalization and strategy. AI Copilot assists inside conversations. Unified Inbox brings messaging channels together. Growth Engines — including the live Realtor Growth Engine — package workflows for specific growth needs.</p>

          <nav aria-label="Primary">
            <h2>Explore WhachatCRM</h2>
            ${navGroups}
            <ul>
              <li><a href="/pricing">Pricing</a></li>
              <li><a href="/auth">Start Free Trial</a></li>
            </ul>
          </nav>

          <section>
            <h2>Find and qualify prospects</h2>
            <p>Use Prospect AI to discover local businesses, qualify fit, and launch personalized outreach — then manage replies in Unified Inbox.</p>
            <p><a href="/prospect-ai">Explore Prospect AI</a></p>
          </section>

          <section>
            <h2>Manage and convert conversations</h2>
            <p>Bring WhatsApp and supported channels into one Unified Inbox. Use AI Copilot in-thread and automate follow-up with templates and chatbots.</p>
            <ul>
              <li><a href="/unified-inbox">Unified Inbox</a></li>
              <li><a href="/automations">Workflows &amp; Automations</a></li>
              <li><a href="/chatbot-builder">Chatbot Builder</a></li>
              <li><a href="/ai-copilot">AI Copilot</a></li>
            </ul>
          </section>

          <section>
            <h2>AI Brain and AI Copilot</h2>
            <h3>AI Brain</h3>
            <p>Analyzes business knowledge, helps create personalized campaigns, recommends strategy, and powers AI features across the platform where enabled.</p>
            <p><a href="/ai-brain">Explore AI Brain</a></p>
            <h3>AI Copilot</h3>
            <p>Assists inside customer conversations with summaries, suggested replies, and lead context.</p>
            <p><a href="/ai-copilot">Explore AI Copilot</a></p>
          </section>

          <section>
            <h2>Everything you need to turn conversations into revenue</h2>
            <h3>Organized Conversations</h3>
            <p>Every chat becomes a customer record with notes, tags, and ownership.</p>
            <h3>Follow-Ups &amp; Tasks</h3>
            <p>Set reminders and tasks so every lead is followed up on time.</p>
            <h3>Automations &amp; Chatbots</h3>
            <p>Launch ready-to-use templates and automated messaging flows without building from scratch.</p>
            <h3>Integrations</h3>
            <p>Connect Meta messaging, Shopify, Gmail, Stripe, Calendly, and more.</p>
          </section>

          <section>
            <h2>Up and running in minutes</h2>
            <ol>
              <li>Connect your channels with guided Meta onboarding and supported integrations.</li>
              <li>Centralize leads with ownership, notes, tags, and next steps.</li>
              <li>Follow up faster with reminders, templates, and AI assistance.</li>
            </ol>
            <a href="/auth" rel="prefetch">Start Free Trial</a>
            <a href="/pricing" rel="prefetch">Compare Plans</a>
            <p>No credit card required. Free plan available forever.</p>
          </section>

          <section>
            <h2>Site navigation</h2>
            <ul>
            ${navLinks}
            </ul>
          </section>

          <footer>
            <p>© 2025 WhachatCRM. All rights reserved.</p>
            <nav>
              <a href="/privacy-policy">Privacy</a>
              <a href="/terms-of-use">Terms</a>
              <a href="/contact">Contact</a>
              <a href="/blog">Blog</a>
              <a href="/help">Help</a>
              <a href="/partner-program">Partner Program</a>
            </nav>
          </footer>
        </main>
      </div>`;
}

export function injectHomepageSeoMeta(html: string): string {
  const webPageSchema = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "name": "Meet Your AI Sales Team | WhachatCRM",
      "url": "${BASE_URL}/",
      "description": "AI-powered sales and messaging CRM: find and qualify prospects, manage WhatsApp and omnichannel conversations, automate follow-up, and convert more chats into revenue."
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
  const featuredPost = BLOG_POSTS.find(p => p.featured);
  const regularPosts = BLOG_POSTS.filter(p => !p.featured);
  
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
  const post = BLOG_POSTS.find(p => p.slug === slug);
  if (!post) return null;
  
  const content = BLOG_CONTENT_SSR[slug];
  const contentHtml = content ? markdownToHtml(content) : `<p style="font-size: 1.1rem; color: #555;">${post.excerpt}</p>`;
  const featuredImageUrl = resolveBlogFeaturedImageUrl(post, BASE_URL);
  const featuredImageHtml = featuredImageUrl
    ? `<figure style="margin:0 0 24px;border-radius:16px;overflow:hidden;border:1px solid #f3f4f6;background:linear-gradient(180deg,#f8fafc,#f1f5f9);">
        <img src="${featuredImageUrl}" alt="${escapeHtmlAttr(resolveBlogImageAlt(post))}" width="1200" height="630" style="display:block;width:100%;max-width:100%;height:auto;object-fit:contain;object-position:center;" loading="eager" decoding="async" />
      </figure>`
    : "";
  
  return `
    <div id="ssr-blog-content" style="font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <nav style="margin-bottom: 24px;">
        <a href="/blog" style="color: #22c55e; text-decoration: none;">← Back to Blog</a>
      </nav>
      <article>
        <header style="margin-bottom: 32px;">
          <span style="color: #22c55e; font-size: 14px; font-weight: 500;">${post.category}</span>
          <h1 style="font-size: 2rem; margin: 12px 0 16px;">${post.title}</h1>
          <div style="color: #666; font-size: 14px; margin-bottom: 16px;">
            <span>${formatDate(post.date)}</span> · <span>${post.readTime}</span>
          </div>
          ${featuredImageHtml}
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
