import { Helmet } from "react-helmet";
import { Check, X, Shield, Zap, Users, MessageSquare, ArrowRight, BarChart3, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Link } from "wouter";

export function Comparison() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is the difference between CRM-first and BSP-first WhatsApp platforms?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "CRM-first platforms like WhachatCRM focus on lead management, team collaboration, and follow-ups. BSP-first (Business Solution Provider) platforms focus primarily on the technical API connection and often charge high per-message fees."
        }
      },
      {
        "@type": "Question",
        "name": "Why do small businesses struggle with official WhatsApp APIs?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Most official platforms are built for enterprise needs, featuring complex setups, mandatory monthly minimums, and confusing per-message markups that drain small business budgets."
        }
      },
      {
        "@type": "Question",
        "name": "Is WhachatCRM really better for small teams?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Yes, because it combines the power of the official API with a simple interface designed for sales people, not developers, with zero message markups."
        }
      }
    ]
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <Helmet>
        <title>Best WhatsApp CRM for Small Businesses (2026 Guide) | WhachatCRM</title>
        <meta name="description" content="Compare the best WhatsApp CRM solutions for small businesses in 2026. Learn why CRM-first approaches outperform traditional BSP platforms." />
        <script type="application/ld+json">
          {JSON.stringify(faqSchema)}
        </script>
      </Helmet>

      {/* Hero Section */}
      <section className="bg-white border-b border-gray-100 pt-16 pb-24">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 text-green-700 text-sm font-medium mb-6">
            <Shield className="w-4 h-4" />
            2026 Industry Guide
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-6">
            Best WhatsApp CRM for Small Businesses: <span className="text-green-600">The 2026 Guide</span>
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed mb-8">
            Stop losing leads in a messy inbox. Learn how to choose a WhatsApp CRM that scales with your team without breaking the bank.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/auth">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 h-12 px-8">
                Start Free Trial
              </Button>
            </Link>
            <Link href="/help">
              <Button size="lg" variant="outline" className="h-12 px-8">
                View Docs
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="container mx-auto px-4 max-w-4xl py-16">
        <article className="prose prose-green max-w-none">
          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">What is a WhatsApp CRM?</h2>
            <p className="text-lg text-gray-600 mb-6">
              A WhatsApp CRM is more than just a messaging app. It's a specialized layer that sits on top of the official WhatsApp Business API, designed to transform a simple chat window into a powerful sales and support machine. 
            </p>
            <div className="grid md:grid-cols-3 gap-6 my-8">
              <Card className="bg-white border-gray-100 shadow-sm">
                <CardContent className="pt-6">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-4 text-blue-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">Team Collaboration</h3>
                  <p className="text-sm text-gray-500">Multiple agents managing one official number simultaneously.</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-gray-100 shadow-sm">
                <CardContent className="pt-6">
                  <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-4 text-green-600">
                    <Zap className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">Automation</h3>
                  <p className="text-sm text-gray-500">Auto-replies, drip campaigns, and lead routing workflows.</p>
                </CardContent>
              </Card>
              <Card className="bg-white border-gray-100 shadow-sm">
                <CardContent className="pt-6">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-4 text-purple-600">
                    <BarChart3 className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold mb-2">Tracking</h3>
                  <p className="text-sm text-gray-500">Conversion rates, response times, and pipeline stages.</p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mb-16 bg-red-50/50 border border-red-100 rounded-2xl p-8">
            <h2 className="text-3xl font-bold mb-6 flex items-center gap-3">
              <X className="text-red-600 w-8 h-8" />
              Why SMBs Struggle with Traditional Platforms
            </h2>
            <p className="text-lg text-gray-700 mb-6">
              Most "Business Solution Providers" (BSPs) were built for enterprises with thousands of employees. For small businesses, these platforms present three major hurdles:
            </p>
            <ul className="space-y-4 text-gray-700">
              <li className="flex gap-3">
                <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">1</div>
                <div><strong>Per-Message Markups:</strong> Many platforms charge $0.05 or more on top of Meta's fees for every single message.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">2</div>
                <div><strong>Complex Setup:</strong> Requiring developer knowledge just to connect a phone number.</div>
              </li>
              <li className="flex gap-3">
                <div className="mt-1 flex-shrink-0 w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold text-xs">3</div>
                <div><strong>Inbox Chaos:</strong> Lack of internal notes, tags, or follow-up reminders.</div>
              </li>
            </ul>
          </section>

          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-6">Comparison: CRM-first vs. BSP-first</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse bg-white rounded-xl overflow-hidden border border-gray-100">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="p-4 text-left font-semibold text-gray-900">Feature</th>
                    <th className="p-4 text-left font-semibold text-green-600">WhachatCRM (CRM-first)</th>
                    <th className="p-4 text-left font-semibold text-gray-500">Enterprise BSPs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-600">
                  <tr>
                    <td className="p-4 font-medium text-gray-900">Message Markup</td>
                    <td className="p-4 text-green-600 font-semibold">$0.00</td>
                    <td className="p-4">$0.02 - $0.10</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium text-gray-900">Lead Tagging</td>
                    <td className="p-4"><Check className="text-green-500 w-5 h-5" /></td>
                    <td className="p-4">Add-on cost</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium text-gray-900">Follow-up System</td>
                    <td className="p-4">Built-in Reminders</td>
                    <td className="p-4">External CRM required</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium text-gray-900">Setup Time</td>
                    <td className="p-4">5 Minutes</td>
                    <td className="p-4">2-7 Days</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="text-3xl font-bold mb-8">What to Look For</h2>
            <div className="space-y-6">
              {[
                { 
                  title: "Official API Support", 
                  desc: "Ensure they use Meta's Cloud API or Twilio. Avoid 'Web-scraping' solutions that get your number banned.",
                  icon: Shield
                },
                { 
                  title: "Ease of Use", 
                  desc: "Can your sales team use it without a 2-week training course?",
                  icon: Users
                },
                { 
                  title: "Integrated Automation", 
                  desc: "Drip campaigns and auto-responders should be part of the CRM, not a separate tool.",
                  icon: Zap
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-6 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center">
                    <item.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                    <p className="text-gray-600">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-green-600 rounded-3xl p-8 md:p-12 text-white text-center">
            <h2 className="text-3xl font-bold mb-4 text-white">Who is WhachatCRM best for?</h2>
            <p className="text-xl text-green-50 mb-8 max-w-2xl mx-auto">
              Small teams (1-50 members) who want to professionally manage WhatsApp sales, book more demos, and close deals without technical headaches.
            </p>
            <Link href="/auth">
              <Button size="lg" className="bg-white text-green-600 hover:bg-green-50 font-bold h-12 px-10">
                Get Started for Free
              </Button>
            </Link>
          </section>

          <section className="mt-16 border-t border-gray-200 pt-16">
            <h2 className="text-3xl font-bold mb-8">Comparison FAQ</h2>
            <div className="space-y-8">
              {faqSchema.mainEntity.map((faq, i) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
                  <h3 className="text-lg font-bold mb-3 text-gray-900">{faq.name}</h3>
                  <p className="text-gray-600 leading-relaxed">{faq.acceptedAnswer.text}</p>
                </div>
              ))}
            </div>
          </section>
        </article>
      </main>

      {/* Footer CTA */}
      <footer className="bg-gray-900 py-12 text-center text-white">
        <p className="text-gray-400 mb-4 uppercase tracking-widest text-xs font-semibold">Join 500+ Small Businesses</p>
        <Link href="/auth">
          <Button variant="link" className="text-white hover:text-green-400 text-lg group">
            Ready to upgrade your WhatsApp? <ArrowRight className="inline ml-2 transition-transform group-hover:translate-x-1" />
          </Button>
        </Link>
      </footer>
    </div>
  );
}
