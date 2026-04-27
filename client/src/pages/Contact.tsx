import { useState } from "react";
import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Send, Loader2, MessageSquare } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

export function Contact() {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !message) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        toast({
          title: "Message sent!",
          description: "We'll get back to you as soon as possible."
        });
        setName("");
        setEmail("");
        setMessage("");
      } else {
        toast({
          title: "Failed to send",
          description: data.error || "Please try again later",
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Helmet>
        <title>Contact WhachatCRM | Get Support & Sales Help</title>
        <meta name="description" content="Contact WhachatCRM for sales questions, support, or partnership inquiries. We're here to help you get the most out of your WhatsApp CRM." />
        <link rel="canonical" href={`${MARKETING_URL}/contact`} />
        <meta property="og:title" content="Contact WhachatCRM | Get Support & Sales Help" />
        <meta property="og:description" content="Contact WhachatCRM for sales questions, support, or partnership inquiries." />
        <meta property="og:url" content={`${MARKETING_URL}/contact`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
      </Helmet>
      <div className="max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8" data-testid="link-back-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Get in Touch
            </h1>
            <p className="text-slate-600 mb-8">
              Have a question, feedback, or need help? We'd love to hear from you. Fill out the form and we'll get back to you as soon as possible.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Response Time</h3>
                  <p className="text-slate-600 text-sm">Usually within 24 hours</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Your Name
                </label>
                <Input
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-contact-name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email Address
                </label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-contact-email"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Message
                </label>
                <Textarea
                  placeholder="How can we help you?"
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  data-testid="input-contact-message"
                />
              </div>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-contact-submit"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {isSubmitting ? "Sending..." : "Send Message"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
