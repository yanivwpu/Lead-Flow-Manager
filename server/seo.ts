interface BlogPostMeta {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  category: string;
}

const BLOG_POSTS_META: BlogPostMeta[] = [
  {
    slug: "whatsapp-crm-complete-guide-2025",
    title: "WhatsApp CRM: The Complete Guide for Small Businesses in 2025",
    excerpt: "Learn how to use WhatsApp as a powerful CRM tool to manage customer relationships, automate responses, and grow your business.",
    category: "Guides",
    date: "2025-12-15",
  },
  {
    slug: "whatsapp-business-api-vs-business-app",
    title: "WhatsApp Business API vs Business App: Which One Do You Need?",
    excerpt: "Confused about the difference between WhatsApp Business App and WhatsApp Business API? This guide breaks down features, pricing, and helps you choose.",
    category: "Comparison",
    date: "2025-12-10",
  },
  {
    slug: "automate-whatsapp-messages-small-business",
    title: "How to Automate WhatsApp Messages for Your Small Business",
    excerpt: "Save hours every day with WhatsApp automation. Learn how to set up auto-replies, away messages, drip campaigns, and workflow triggers.",
    category: "Automation",
    date: "2025-12-05",
  },
  {
    slug: "whatsapp-lead-management-tips",
    title: "10 WhatsApp Lead Management Tips That Actually Work",
    excerpt: "Stop losing leads in your WhatsApp inbox. These proven strategies help you organize conversations, follow up on time, and close more deals.",
    category: "Tips",
    date: "2025-11-28",
  },
  {
    slug: "wati-alternatives-comparison",
    title: "5 Best WATI Alternatives for Small Teams in 2025",
    excerpt: "Looking for WATI alternatives? We compare the top WhatsApp CRM tools for small teams, including pricing, features, and ease of use.",
    category: "Comparison",
    date: "2025-11-20",
  },
  {
    slug: "whatsapp-customer-service-best-practices",
    title: "WhatsApp Customer Service: 8 Best Practices for 2025",
    excerpt: "Deliver exceptional customer support via WhatsApp. Learn response time benchmarks, template strategies, and how to handle difficult conversations.",
    category: "Best Practices",
    date: "2025-11-15",
  },
  {
    slug: "twilio-whatsapp-setup-guide",
    title: "How to Set Up Twilio for WhatsApp Business: Step-by-Step Guide",
    excerpt: "A complete walkthrough for connecting your WhatsApp Business account to Twilio. From sandbox testing to production approval in one guide.",
    category: "Guides",
    date: "2025-11-10",
  },
  {
    slug: "whatsapp-drip-campaigns-examples",
    title: "WhatsApp Drip Campaigns: 5 Examples That Convert",
    excerpt: "Learn how to create automated WhatsApp message sequences that nurture leads and drive sales. Includes ready-to-use templates.",
    category: "Automation",
    date: "2025-11-05",
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
      html = html.replace(/<meta name="twitter:title"[^>]*>/gi, '');
      html = html.replace(/<meta name="twitter:description"[^>]*>/gi, '');
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
    html = html.replace(/<meta name="twitter:title"[^>]*>/gi, '');
    html = html.replace(/<meta name="twitter:description"[^>]*>/gi, '');
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
