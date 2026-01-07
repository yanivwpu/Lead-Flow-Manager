import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { Calendar, Clock, ArrowRight, Search, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  image?: string;
  featured?: boolean;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "whatsapp-crm-complete-guide-2025",
    title: "WhatsApp CRM: The Complete Guide for Small Businesses in 2025",
    excerpt: "Learn how to use WhatsApp as a powerful CRM tool to manage customer relationships, automate responses, and grow your business. Everything you need to know about WhatsApp Business API and CRM integration.",
    category: "Guides",
    readTime: "12 min read",
    date: "2025-12-15",
    featured: true,
  },
  {
    slug: "whatsapp-business-api-vs-business-app",
    title: "WhatsApp Business API vs Business App: Which One Do You Need?",
    excerpt: "Confused about the difference between WhatsApp Business App and WhatsApp Business API? This guide breaks down features, pricing, and helps you choose the right solution for your team size.",
    category: "Comparison",
    readTime: "8 min read",
    date: "2025-12-10",
  },
  {
    slug: "automate-whatsapp-messages-small-business",
    title: "How to Automate WhatsApp Messages for Your Small Business",
    excerpt: "Save hours every day with WhatsApp automation. Learn how to set up auto-replies, away messages, drip campaigns, and workflow triggers to respond faster and convert more leads.",
    category: "Automation",
    readTime: "10 min read",
    date: "2025-12-05",
  },
  {
    slug: "whatsapp-lead-management-tips",
    title: "10 WhatsApp Lead Management Tips That Actually Work",
    excerpt: "Stop losing leads in your WhatsApp inbox. These proven strategies help you organize conversations, follow up on time, and close more deals using WhatsApp as your main sales channel.",
    category: "Tips",
    readTime: "7 min read",
    date: "2025-11-28",
  },
  {
    slug: "wati-alternatives-comparison",
    title: "Top 5 WATI Alternatives for WhatsApp Business in 2025",
    excerpt: "Looking for a WATI alternative? Compare pricing, features, and ease of use of the best WhatsApp CRM tools including WhachatCRM, Respond.io, and more.",
    category: "Comparison",
    readTime: "9 min read",
    date: "2025-11-20",
  },
  {
    slug: "whatsapp-customer-service-best-practices",
    title: "WhatsApp Customer Service: Best Practices for Teams",
    excerpt: "Deliver exceptional customer support via WhatsApp. Learn response time benchmarks, team collaboration tips, and how to handle high message volumes effectively.",
    category: "Customer Service",
    readTime: "8 min read",
    date: "2025-11-15",
  },
  {
    slug: "twilio-whatsapp-setup-guide",
    title: "How to Set Up Twilio for WhatsApp: Step-by-Step Guide",
    excerpt: "Complete walkthrough for connecting your WhatsApp Business to Twilio. Includes getting approved, configuring webhooks, and sending your first message via the API.",
    category: "Tutorials",
    readTime: "15 min read",
    date: "2025-11-10",
  },
  {
    slug: "whatsapp-drip-campaigns-examples",
    title: "WhatsApp Drip Campaign Examples That Convert",
    excerpt: "Real examples of successful WhatsApp drip sequences for lead nurturing, customer onboarding, and re-engagement. Copy these templates for your business.",
    category: "Templates",
    readTime: "11 min read",
    date: "2025-11-05",
  },
];

const CATEGORIES = ["All", "Guides", "Comparison", "Automation", "Tips", "Customer Service", "Tutorials", "Templates"];

export function Blog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const filteredPosts = BLOG_POSTS.filter(post => {
    const matchesSearch = searchQuery === "" || 
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = selectedCategory === "All" || post.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const featuredPost = BLOG_POSTS.find(p => p.featured);
  const regularPosts = filteredPosts.filter(p => !p.featured || selectedCategory !== "All" || searchQuery !== "");

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>WhatsApp CRM Blog | Tips, Guides & Best Practices | WhachatCRM</title>
        <meta name="description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service best practices." />
        <meta name="keywords" content="WhatsApp CRM blog, WhatsApp business tips, WhatsApp automation guide, WhatsApp lead management, WhatsApp customer service" />
        <meta property="og:title" content="WhatsApp CRM Blog | Tips, Guides & Best Practices" />
        <meta property="og:description" content="Learn how to grow your business with WhatsApp. Expert guides on WhatsApp CRM, automation, lead management, and customer service." />
        <meta property="og:type" content="website" />
        <link rel="canonical" href="https://whachatcrm.com/blog" />
      </Helmet>

      <header className="bg-gradient-to-b from-gray-50 to-white border-b border-gray-100">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-brand-green flex items-center justify-center text-white font-bold">
                C
              </div>
              <span className="font-display font-bold text-xl text-brand-teal">WhachatCRM</span>
            </a>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/pricing">
              <a className="text-gray-600 hover:text-gray-900 text-sm font-medium hidden sm:block">Pricing</a>
            </Link>
            <Link href="/auth">
              <Button className="bg-brand-green hover:bg-brand-green/90 h-9">
                Start Free
              </Button>
            </Link>
          </div>
        </nav>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold text-gray-900 mb-4">
            WhatsApp CRM Blog
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-8">
            Expert guides, tips, and best practices to help you grow your business with WhatsApp
          </p>

          <div className="max-w-md mx-auto relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search articles..."
              className="pl-10 h-12"
              data-testid="input-search-blog"
            />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex gap-2 overflow-x-auto pb-4 mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
                selectedCategory === category
                  ? "bg-brand-green text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
              data-testid={`button-category-${category.toLowerCase()}`}
            >
              {category}
            </button>
          ))}
        </div>

        {featuredPost && selectedCategory === "All" && searchQuery === "" && (
          <Link href={`/blog/${featuredPost.slug}`}>
            <a className="block mb-12 group" data-testid="link-featured-post">
              <div className="bg-gradient-to-br from-brand-green/5 to-brand-teal/5 rounded-2xl p-6 sm:p-8 border border-brand-green/20 hover:border-brand-green/40 transition-colors">
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-3 py-1 bg-brand-green text-white text-xs font-medium rounded-full">
                    Featured
                  </span>
                  <span className="text-sm text-gray-500">{featuredPost.category}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-3 group-hover:text-brand-green transition-colors">
                  {featuredPost.title}
                </h2>
                <p className="text-gray-600 mb-4 line-clamp-2">
                  {featuredPost.excerpt}
                </p>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(featuredPost.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {featuredPost.readTime}
                  </span>
                </div>
              </div>
            </a>
          </Link>
        )}

        {filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No articles found. Try a different search term.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularPosts.map((post) => (
              <Link key={post.slug} href={`/blog/${post.slug}`}>
                <a className="group block bg-white rounded-xl border border-gray-200 hover:border-brand-green/50 hover:shadow-lg transition-all overflow-hidden" data-testid={`link-post-${post.slug}`}>
                  <div className="p-6">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="h-4 w-4 text-brand-green" />
                      <span className="text-sm text-brand-green font-medium">{post.category}</span>
                    </div>
                    <h3 className="text-lg font-display font-bold text-gray-900 mb-2 group-hover:text-brand-green transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {post.readTime}
                      </span>
                      <span className="flex items-center gap-1 text-brand-green group-hover:gap-2 transition-all">
                        Read more
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </a>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-16 bg-gray-50 rounded-2xl p-8 sm:p-12 text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 mb-4">
            Ready to grow with WhatsApp?
          </h2>
          <p className="text-gray-600 mb-6 max-w-xl mx-auto">
            Start managing your WhatsApp conversations like a pro. Free plan available, no credit card required.
          </p>
          <Link href="/auth">
            <Button size="lg" className="bg-brand-green hover:bg-brand-green/90">
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </main>

      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-500">© 2025 WhachatCRM. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy-policy">
              <a className="text-sm text-gray-500 hover:text-gray-900">Privacy</a>
            </Link>
            <Link href="/terms-of-use">
              <a className="text-sm text-gray-500 hover:text-gray-900">Terms</a>
            </Link>
            <Link href="/contact">
              <a className="text-sm text-gray-500 hover:text-gray-900">Contact</a>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
