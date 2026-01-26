import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  DollarSign, LogOut, Loader2, User, Mail, Link2, Copy, 
  CheckCircle, Users, TrendingUp, Calendar, FileText, AlertCircle,
  Eye, EyeOff, Facebook, Instagram, Twitter, Share2, BookOpen, Clock, ExternalLink
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Social Media Icons component for consistency
const XIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    aria-hidden="true" 
    className={className}
    fill="currentColor"
  >
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface ReferredUser {
  id: string;
  name: string;
  email: string;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  signupDate: string;
}

interface Commission {
  id: string;
  userId: string;
  amount: string;
  status: string;
  stripePaymentId: string | null;
  paidAt: string | null;
  createdAt: string;
}

interface PartnerStats {
  refCode: string;
  refLink: string;
  totalReferrals: number;
  activePaidUsers: number;
  totalEarnings: string;
  pendingEarnings: string;
  paidEarnings: string;
  thisMonthEarnings: string;
  commissionRate: string;
  commissionDurationMonths: number;
}

interface PartnerInfo {
  id: string;
  name: string;
  email: string;
  refCode: string;
}

// Shareable content - blog posts and guides
const SHAREABLE_CONTENT = [
  {
    id: "1",
    type: "blog",
    title: "WhatsApp CRM: The Complete Guide for Small Businesses in 2025",
    description: "Learn how to use WhatsApp as a powerful CRM tool to manage customer relationships, automate responses, and grow your business.",
    url: "/blog/whatsapp-crm-complete-guide-2025",
    category: "Guide",
    readTime: "12 min",
    shareMessage: "Struggling to manage WhatsApp leads? This guide shows you how to turn WhatsApp into a powerful CRM. Check it out:",
  },
  {
    id: "2",
    type: "blog",
    title: "WhatsApp Business API vs Business App: Which One Do You Need?",
    description: "Confused about the difference between WhatsApp Business App and WhatsApp Business API? This guide breaks it all down.",
    url: "/blog/whatsapp-business-api-vs-business-app",
    category: "Comparison",
    readTime: "8 min",
    shareMessage: "Not sure which WhatsApp Business solution is right for you? This comparison will help you decide:",
  },
  {
    id: "3",
    type: "blog",
    title: "How to Automate WhatsApp Messages for Your Small Business",
    description: "Save hours every day with WhatsApp automation. Learn how to set up auto-replies, away messages, and workflow triggers.",
    url: "/blog/automate-whatsapp-messages-small-business",
    category: "Automation",
    readTime: "10 min",
    shareMessage: "Want to automate your WhatsApp messages and save hours every day? Here's how:",
  },
  {
    id: "4",
    type: "blog",
    title: "10 WhatsApp Lead Management Tips That Actually Work",
    description: "Stop losing leads in your WhatsApp inbox. These proven strategies help you organize conversations and close more deals.",
    url: "/blog/whatsapp-lead-management-tips",
    category: "Tips",
    readTime: "7 min",
    shareMessage: "Are you losing leads in your WhatsApp inbox? These 10 tips will change your game:",
  },
  {
    id: "5",
    type: "blog",
    title: "Top 5 WATI Alternatives for WhatsApp Business in 2025",
    description: "Looking for a WATI alternative? Compare pricing, features, and ease of use of the best WhatsApp CRM tools.",
    url: "/blog/wati-alternatives-comparison",
    category: "Comparison",
    readTime: "9 min",
    shareMessage: "Looking for a better WhatsApp CRM? Here are the top alternatives to check out:",
  },
  {
    id: "6",
    type: "blog",
    title: "WhatsApp Customer Service: Best Practices for Teams",
    description: "Deliver exceptional customer support via WhatsApp. Learn response time benchmarks and team collaboration tips.",
    url: "/blog/whatsapp-customer-service-best-practices",
    category: "Customer Service",
    readTime: "8 min",
    shareMessage: "Want to provide better customer support on WhatsApp? These best practices will help:",
  },
  {
    id: "7",
    type: "blog",
    title: "How to Set Up Twilio for WhatsApp: Step-by-Step Guide",
    description: "Complete walkthrough for connecting your WhatsApp Business to Twilio, including webhooks and your first message.",
    url: "/blog/twilio-whatsapp-setup-guide",
    category: "Tutorial",
    readTime: "15 min",
    shareMessage: "Setting up Twilio for WhatsApp? This step-by-step guide makes it easy:",
  },
  {
    id: "8",
    type: "blog",
    title: "WhatsApp Drip Campaign Examples That Convert",
    description: "Real examples of successful WhatsApp drip sequences for lead nurturing and customer onboarding.",
    url: "/blog/whatsapp-drip-campaigns-examples",
    category: "Templates",
    readTime: "11 min",
    shareMessage: "Looking for WhatsApp drip campaign examples that actually work? Check these out:",
  },
];

const PARTNER_AGREEMENT_TEXT = `Partner Referral Agreement

WhachatCRM Partner Program
Last updated: January 3, 2026

This Partner Referral Agreement ("Agreement") governs participation in the WhachatCRM Partner Program.
By registering as a Partner, you agree to these terms.

1. Definitions
"Company" – WhachatCRM
"Partner" – An approved freelancer, agency, or individual promoting WhachatCRM
"Referral Link" – A unique tracking link or identifier assigned to the Partner
"Qualified Referral" – A referred user who becomes a paying subscriber in good standing

2. Program Participation
Participation is subject to approval by WhachatCRM
Approval may be revoked at any time at WhachatCRM's discretion
Partners must provide accurate payment and contact information

3. Referral Attribution
Attribution is determined solely by WhachatCRM's tracking systems
Only the first valid referral recorded for a customer is eligible
WhachatCRM's decision on attribution is final

5. Commission Payout Schedule
Partners earn 20% of subscription revenue collected from Qualified Referrals.
Commission duration: up to six (6) months from the customer's first paid invoice.
Commissions are calculated monthly based on payments successfully collected during the previous calendar month and are paid on the first business day of each month.
A minimum payout threshold of $50 USD applies. Commission balances below the threshold will roll over to the next payout cycle.
Payments are made via Stripe, ACH, PayPal, or another payment method supported by WhachatCRM. Partners are responsible for any applicable taxes.
If a customer payment is refunded, disputed, reversed, or fails, the related commission is not payable and may be reversed or deducted from future payouts.

6. No Lifetime Commission Guarantee
Commissions are not guaranteed for the lifetime of any customer.
Partner commissions are limited to the commission duration defined by WhachatCRM at the time the commission is earned (currently up to six (6) months).
WhachatCRM reserves the right to modify, limit, or discontinue commission rates, durations, eligibility requirements, or payout terms at any time, provided such changes do not retroactively reduce commissions already earned.

7. Partner Responsibilities
Partners must:
Market WhachatCRM honestly and accurately
Avoid misleading claims, spam, or unauthorized discounts
Comply with all applicable laws and platform policies

7. Prohibited Activities
Partners may not:
Self-refer or create fake accounts
Use spam, bots, or deceptive advertising
Impersonate WhachatCRM or act as an employee
Modify branding or make contractual promises
Violations may result in immediate termination and forfeiture of unpaid commissions.

8. Independent Contractor Relationship
Partners are independent contractors, not employees, agents, or representatives of WhachatCRM.

9. Termination
Either party may terminate participation at any time.
Upon termination:
No new commissions accrue
Earned but unpaid commissions may be paid at WhachatCRM's discretion

10. Limitation of Liability
WhachatCRM is not liable for indirect or consequential damages related to the Partner Program.

11. Governing Law
This Agreement is governed by the laws of the State of Florida, USA.`;

export function PartnerPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [partner, setPartner] = useState<PartnerInfo | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [copied, setCopied] = useState(false);
  const [agreementRequired, setAgreementRequired] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch('/api/partner-portal/check')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setIsLoggedIn(true);
          setPartner(data.partner);
          setAgreementRequired(data.agreementRequired === true);
        }
      })
      .catch(() => setIsLoggedIn(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const res = await fetch('/api/partner-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setIsLoggedIn(true);
      setPartner(data.partner);
      setEmail("");
      setPassword("");
      
      // Check if agreement is required after login
      const checkRes = await fetch('/api/partner-portal/check');
      const checkData = await checkRes.json();
      setAgreementRequired(checkData.agreementRequired === true);
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAcceptAgreement = async () => {
    setIsAccepting(true);
    setAcceptError("");
    try {
      const res = await fetch('/api/partner-portal/accept-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to accept agreement');
      }
      
      setAgreementRequired(false);
      setAgreementChecked(false);
    } catch (err: any) {
      console.error('Error accepting agreement:', err);
      setAcceptError(err.message || 'Failed to accept agreement. Please try again.');
    } finally {
      setIsAccepting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/partner-portal/logout', { method: 'POST' });
    setIsLoggedIn(false);
    setPartner(null);
    queryClient.clear();
  };

  const copyRefLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { data: stats } = useQuery<PartnerStats>({
    queryKey: ['/api/partner-portal/stats'],
    enabled: isLoggedIn,
  });

  const { data: referrals = [] } = useQuery<ReferredUser[]>({
    queryKey: ['/api/partner-portal/referrals'],
    enabled: isLoggedIn,
  });

  const { data: commissions = [] } = useQuery<Commission[]>({
    queryKey: ['/api/partner-portal/commissions'],
    enabled: isLoggedIn,
  });

  const paidUsers = referrals.filter(u => 
    u.subscriptionPlan && u.subscriptionPlan !== 'free' && 
    u.subscriptionStatus === 'active'
  );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="h-14 w-14 bg-brand-green rounded-xl flex items-center justify-center mx-auto mb-4">
              <Users className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900" data-testid="text-page-title">Partner Portal</h1>
            <p className="text-gray-600 mt-2">Login to your partner dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm" data-testid="text-login-error">
                {loginError}
              </div>
            )}
            
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input 
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  placeholder="partner@example.com"
                  required
                  data-testid="input-email"
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">Demo: partner@demo.com / password123</p>
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1">
                <Input 
                  id="password" 
                  type={showPassword ? "text" : "password"} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  required
                  className="pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-brand-green hover:bg-green-700"
              disabled={isLoggingIn}
              data-testid="button-login"
            >
              {isLoggingIn ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Logging in...
                </>
              ) : 'Log In'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // Agreement gate - must accept before accessing portal
  if (agreementRequired) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-2xl">
          <div className="text-center mb-6">
            <div className="h-14 w-14 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <FileText className="h-7 w-7 text-amber-600" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Partner Referral Agreement</h1>
            <p className="text-gray-600 mt-2">Please review and accept the agreement to continue</p>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                You must accept this agreement before accessing the Partner Portal.
              </p>
            </div>

            <ScrollArea className="h-80 border rounded-lg p-4 bg-gray-50">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                {PARTNER_AGREEMENT_TEXT}
              </pre>
            </ScrollArea>
          </div>

          <div className="space-y-4">
            {acceptError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {acceptError}
              </div>
            )}

            <div className="flex items-start gap-3">
              <Checkbox 
                id="agreement-check"
                checked={agreementChecked}
                onCheckedChange={(checked) => setAgreementChecked(checked === true)}
                data-testid="checkbox-agreement"
              />
              <label 
                htmlFor="agreement-check" 
                className="text-sm text-gray-700 cursor-pointer leading-relaxed"
              >
                I have read and agree to the Partner Referral Agreement. I understand that my acceptance 
                is legally binding and my IP address and timestamp will be recorded.
              </label>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleAcceptAgreement}
                className="flex-1 bg-brand-green hover:bg-green-700"
                disabled={!agreementChecked || isAccepting}
                data-testid="button-accept-agreement"
              >
                {isAccepting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    I Agree
                  </>
                )}
              </Button>
              <Button 
                variant="outline"
                onClick={handleLogout}
                data-testid="button-logout-agreement"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Log Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-brand-green rounded-lg flex items-center justify-center">
              <Users className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-gray-900" data-testid="text-partner-name">{partner?.name}</h1>
              <p className="text-sm text-gray-500">{partner?.email}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="h-4 w-4 mr-2" />
            Log Out
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-gradient-to-r from-brand-green to-green-600 rounded-2xl p-6 mb-8 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-green-100 text-sm mb-1">Your Referral Link</p>
              <div className="flex items-center gap-2">
                <Link2 className="h-5 w-5" />
                <span className="font-mono text-lg" data-testid="text-ref-link">
                  {stats?.refLink || `https://whachatcrm.com/?ref=${partner?.refCode}`}
                </span>
              </div>
            </div>
            <Button 
              variant="secondary" 
              className="bg-white text-brand-green hover:bg-gray-100"
              onClick={() => copyRefLink(stats?.refLink || '')}
              data-testid="button-copy-link"
            >
              {copied ? (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
          
          <div className="mt-6 pt-6 border-t border-green-400/30">
            <p className="text-green-100 text-sm mb-4 font-medium flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              Quick Share to Social Media
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                size="sm"
                className="bg-[#1877F2] hover:bg-[#166fe5] text-white border-none gap-2"
                onClick={() => {
                  const url = stats?.refLink || `https://whachatcrm.com/?ref=${partner?.refCode}`;
                  const text = "I'm using WhaChatCRM to manage my WhatsApp sales and it's a game changer! Check it out:";
                  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, '_blank');
                }}
                data-testid="button-share-facebook"
              >
                <Facebook className="h-4 w-4" />
                Facebook
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="bg-[#000000] hover:bg-[#333333] text-white border-none gap-2"
                onClick={() => {
                  const url = stats?.refLink || `https://whachatcrm.com/?ref=${partner?.refCode}`;
                  const text = "Stop losing WhatsApp leads! WhaChatCRM is the best way to organize your sales. Try it here:";
                  window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
                }}
                data-testid="button-share-x"
              >
                <XIcon className="h-4 w-4" />
                Share on X
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="bg-[#E4405F] hover:bg-[#d62e4c] text-white border-none gap-2"
                onClick={() => {
                  const url = stats?.refLink || `https://whachatcrm.com/?ref=${partner?.refCode}`;
                  navigator.clipboard.writeText(`Check out WhaChatCRM! The best WhatsApp CRM for sales teams: ${url}`);
                  alert("Link and message copied for Instagram! Since Instagram doesn't support direct link sharing in posts, you can now paste this into your Bio or Story.");
                }}
                data-testid="button-share-instagram"
              >
                <Instagram className="h-4 w-4" />
                Instagram
              </Button>
            </div>
          </div>

          <p className="text-green-100 text-sm mt-4">
            Earn {stats?.commissionRate || '20'}% commission for {stats?.commissionDurationMonths || 6} months on every paid subscription
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-gray-600 text-sm">Total Referrals</span>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900" data-testid="text-total-referrals">
              {stats?.totalReferrals || 0}
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-gray-600 text-sm">Paid Users</span>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900" data-testid="text-paid-users">
              {stats?.activePaidUsers || 0}
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-gray-600 text-sm">Pending</span>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900" data-testid="text-pending-earnings">
              ${parseFloat(stats?.pendingEarnings || '0').toFixed(2)}
            </p>
          </div>

          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-gray-600 text-sm">Total Earned</span>
            </div>
            <p className="text-3xl font-display font-bold text-gray-900" data-testid="text-total-earnings">
              ${parseFloat(stats?.totalEarnings || '0').toFixed(2)}
            </p>
          </div>
        </div>

        <Tabs defaultValue="referrals" className="bg-white rounded-xl shadow-sm">
          <TabsList className="border-b w-full justify-start rounded-none px-4 pt-2 flex-wrap">
            <TabsTrigger value="referrals" data-testid="tab-referrals">
              <Users className="h-4 w-4 mr-2" />
              Referred Users ({referrals.length})
            </TabsTrigger>
            <TabsTrigger value="commissions" data-testid="tab-commissions">
              <DollarSign className="h-4 w-4 mr-2" />
              Commissions ({commissions.length})
            </TabsTrigger>
            <TabsTrigger value="content" data-testid="tab-content">
              <BookOpen className="h-4 w-4 mr-2" />
              Shareable Content
            </TabsTrigger>
          </TabsList>

          <TabsContent value="referrals" className="p-4">
            {referrals.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No referrals yet</p>
                <p className="text-sm mt-1">Share your referral link to start earning</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Signup Date</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((user) => (
                    <TableRow key={user.id} data-testid={`row-referral-${user.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <User className="h-4 w-4 text-gray-500" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{user.name}</p>
                            <p className="text-sm text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="h-4 w-4" />
                          {user.signupDate ? new Date(user.signupDate).toLocaleDateString() : 'N/A'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.subscriptionPlan === 'pro' ? 'default' : 'secondary'}>
                          {user.subscriptionPlan || 'Free'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {user.subscriptionStatus === 'active' && user.subscriptionPlan !== 'free' ? (
                          <Badge className="bg-green-100 text-green-700">Active</Badge>
                        ) : user.subscriptionStatus === 'trialing' ? (
                          <Badge className="bg-blue-100 text-blue-700">Trial</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="commissions" className="p-4">
            {commissions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p>No commissions yet</p>
                <p className="text-sm mt-1">Commissions are generated when referred users pay</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((commission) => (
                    <TableRow key={commission.id} data-testid={`row-commission-${commission.id}`}>
                      <TableCell>
                        {new Date(commission.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        ${parseFloat(commission.amount).toFixed(2)}
                      </TableCell>
                      <TableCell>
                        {commission.status === 'paid' ? (
                          <Badge className="bg-green-100 text-green-700">Paid</Badge>
                        ) : commission.status === 'pending' ? (
                          <Badge className="bg-amber-100 text-amber-700">Pending</Badge>
                        ) : (
                          <Badge variant="secondary">{commission.status}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {commission.paidAt ? new Date(commission.paidAt).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="content" className="p-4">
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Share Content & Earn</h3>
              <p className="text-gray-600 text-sm">
                Share these blog posts and guides on social media. All links include your referral code automatically!
              </p>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              {SHAREABLE_CONTENT.map((content) => {
                const baseUrl = "https://whachatcrm.com";
                const contentUrl = `${baseUrl}${content.url}?ref=${partner?.refCode}`;
                
                return (
                  <Card key={content.id} className="overflow-hidden" data-testid={`card-content-${content.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {content.category}
                        </Badge>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {content.readTime}
                        </span>
                      </div>
                      <CardTitle className="text-base leading-tight">{content.title}</CardTitle>
                      <CardDescription className="text-sm line-clamp-2">
                        {content.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1.5"
                          onClick={() => {
                            navigator.clipboard.writeText(contentUrl);
                            alert("Link copied with your referral code!");
                          }}
                          data-testid={`button-copy-content-${content.id}`}
                        >
                          <Copy className="h-3 w-3" />
                          Copy Link
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs gap-1.5 bg-[#1877F2] hover:bg-[#166fe5]"
                          onClick={() => {
                            window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(contentUrl)}&quote=${encodeURIComponent(content.shareMessage)}`, '_blank');
                          }}
                          data-testid={`button-share-fb-${content.id}`}
                        >
                          <Facebook className="h-3 w-3" />
                          Facebook
                        </Button>
                        <Button
                          size="sm"
                          className="text-xs gap-1.5 bg-black hover:bg-gray-800"
                          onClick={() => {
                            window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(contentUrl)}&text=${encodeURIComponent(content.shareMessage)}`, '_blank');
                          }}
                          data-testid={`button-share-x-${content.id}`}
                        >
                          <XIcon className="h-3 w-3" />
                          X
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1.5"
                          onClick={() => window.open(contentUrl, '_blank')}
                          data-testid={`button-view-content-${content.id}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          View
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            
            <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-green/10 flex items-center justify-center flex-shrink-0">
                  <Share2 className="h-5 w-5 text-brand-green" />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Pro Tip: Personalize Your Shares</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    Add your own experience or insights when sharing. Personal recommendations convert 3x better than generic shares!
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
