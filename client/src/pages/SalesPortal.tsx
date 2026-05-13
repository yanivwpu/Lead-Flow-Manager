import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Calendar, DollarSign, CheckCircle, Clock, LogOut, Loader2, 
  User, Phone, Mail, ExternalLink, FileText, AlertCircle,
  Eye, EyeOff, ClipboardList
} from "lucide-react";
import { isSalespersonSubscriptionCommissionActiveAt } from "@shared/salespersonSubscriptionCommissionWindow";

interface Demo {
  id: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  scheduledDate: string;
  status: string;
  notes?: string;
  createdAt: string;
  source?: string;
}

interface Conversion {
  id: string;
  bookingId: string;
  amount: string;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}

interface CommissionRow {
  id: string;
  amount: string;
  status: string;
  createdAt: string;
  billingPeriod?: string | null;
  invoiceId?: string | null;
  paidAt?: string | null;
}

interface Stats {
  totalBookings: number;
  totalConversions: number;
  totalEarnings: string;
  pendingSetupTasks?: number;
  setupTasksCompleted?: number;
  defaultTaskPayoutDollars?: number;
  effectiveTaskPayoutDollars?: number;
  hasCustomTaskPayout?: boolean;
  demoConversionBonusesTotal?: string;
  subscriptionCommissionsTotal?: string;
  setupTaskPayoutsTotal?: string;
}

interface SetupTaskRow {
  id: string;
  userId: string;
  templateId: string;
  salespersonId: string | null;
  submissionId: string | null;
  status: string;
  onboardingSubmittedAt: string | null;
  sessionBookedAt: string | null;
  completedAt: string | null;
  internalNotes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  userEmail: string | null;
  userName: string | null;
}

interface SalespersonInfo {
  id: string;
  name: string;
  email: string;
}

function subscriptionCommissionWindowBadge(createdAt: string): { label: string; active: boolean } {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return { label: "Commission expired", active: false };
  const active = isSalespersonSubscriptionCommissionActiveAt(d, new Date());
  return { label: active ? "Commission active" : "Commission expired", active };
}

const SALESPERSON_AGREEMENT_TEXT = `Internal Sales Commission Policy

WhachatCRM Internal Sales Team
Last updated: January 3, 2026

This document defines commission rules for WhachatCRM internal sales representatives.

1. Purpose
This policy governs commission eligibility, calculation, and payment for internal sales personnel who close customer subscriptions following demos or direct sales efforts.

2. Eligibility
A salesperson is eligible for commission if:
They conduct or materially contribute to a demo or sales process
The prospect becomes a paying customer
Payment is successfully collected

3. Lead Ownership
Leads are assigned via WhachatCRM's internal systems
Commission credit is based on recorded assignment at time of demo
Management decisions on disputes are final

4. Commission Structure & Payout Schedule
A) Demo-attributed subscriptions: internal sales earn 30% of subscription revenue collected (excluding AI add-ons, messaging fees, and third-party costs), for up to twelve (12) months from the sales conversion record date, while the customer remains active and paying. Commissions are calculated from Stripe invoice payments and may be paid monthly on the first business day of the month.
B) Growth Engine setup tasks: separately from subscription commission, eligible specialists may earn a fixed payout per completed internal setup task (default amount set by the company; admins may set a per-person override). Setup payouts are not subscription percentages.

Commission duration and rates for (A) follow management-approved schedules. Upgrades increase commission proportionally; downgrades reduce commission. Commissions related to refunded, disputed, or failed payments are not payable and may be reversed.

5. No Lifetime Commission Guarantee
Sales commissions are not guaranteed for the lifetime of any customer.
Commission eligibility is limited to the duration defined by WhachatCRM (currently up to twelve (12) months from the sales conversion record date).
WhachatCRM may modify, suspend, or terminate commission plans, rates, payout schedules, or eligibility criteria at any time. Commission plans do not create a vested or guaranteed right to future commissions.

6. Exclusions
No subscription commission is paid for:
Organic signups with no demo involvement
Partner-referred customers (unless explicitly approved)
Non-paying or refunded accounts

Fixed setup task payouts (4.B) only apply when an internal setup task is completed and credited under company policy.

6. Payment Timing
Commissions are calculated monthly
Paid after customer payment clears
Refunds or chargebacks may result in commission reversal

7. Employment Status
Commission eligibility does not alter employment status.
WhachatCRM may modify or discontinue commissions at any time.

8. Misconduct
Manipulating attribution, self-dealing, or falsifying activity may result in:
Loss of commissions
Termination
Legal action if applicable

9. Changes to Policy
WhachatCRM reserves the right to modify this policy at any time.

10. Governing Law
This policy is governed by the laws of the State of Florida, USA.`;

export function SalesPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [salesperson, setSalesperson] = useState<SalespersonInfo | null>(null);
  const [email, setEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [agreementRequired, setAgreementRequired] = useState(false);
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  const [showCode, setShowCode] = useState(false);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch('/api/sales-portal/check')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setIsLoggedIn(true);
          setSalesperson(data.salesperson);
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
      const res = await fetch('/api/sales-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, loginCode })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setIsLoggedIn(true);
      setSalesperson(data.salesperson);
      setEmail("");
      setLoginCode("");
      
      // Check if agreement is required after login
      const checkRes = await fetch('/api/sales-portal/check');
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
      const res = await fetch('/api/sales-portal/accept-agreement', {
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
    await fetch('/api/sales-portal/logout', { method: 'POST' });
    setIsLoggedIn(false);
    setSalesperson(null);
    queryClient.clear();
  };

  const { data: stats } = useQuery<Stats>({
    queryKey: ['/api/sales-portal/stats'],
    enabled: isLoggedIn,
  });

  const { data: demos = [] } = useQuery<Demo[]>({
    queryKey: ['/api/sales-portal/demos'],
    enabled: isLoggedIn,
  });

  const { data: conversions = [] } = useQuery<Conversion[]>({
    queryKey: ['/api/sales-portal/conversions'],
    enabled: isLoggedIn,
  });

  const { data: commissions = [] } = useQuery<CommissionRow[]>({
    queryKey: ['/api/sales-portal/commissions'],
    enabled: isLoggedIn,
  });

  const { data: setupTasks = [] } = useQuery<SetupTaskRow[]>({
    queryKey: ['/api/sales-portal/setup-tasks'],
    enabled: isLoggedIn,
  });

  const markComplete = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sales-portal/demos/${id}/complete`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to mark complete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-portal/demos'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-portal/stats'] });
    }
  });

  const markSetupComplete = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/sales-portal/setup-tasks/${id}/complete`, { method: 'PATCH', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to mark setup complete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sales-portal/setup-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/sales-portal/stats'] });
    }
  });

  const demoBonusTotal = parseFloat(stats?.demoConversionBonusesTotal ?? '0');
  const subscriptionCommissionsTotal = parseFloat(stats?.subscriptionCommissionsTotal ?? '0');
  const setupTaskPayoutsLedger = parseFloat(stats?.setupTaskPayoutsTotal ?? '0');
  const demoCommissionsCombined = demoBonusTotal + subscriptionCommissionsTotal;
  const totalEarningsLedger = parseFloat(stats?.totalEarnings ?? '0');
  const earningsBreakdownSum = demoCommissionsCombined + setupTaskPayoutsLedger;
  const earningsBreakdownMismatch =
    stats != null && Math.abs(earningsBreakdownSum - totalEarningsLedger) > 0.05;

  const pendingDemos = demos.filter(d => d.status === 'pending');
  const completedDemos = demos.filter(d => d.status !== 'pending');
  const pendingSetup = setupTasks.filter(t => t.status !== 'setup_completed');
  const completedSetup = setupTasks.filter(t => t.status === 'setup_completed');

  function setupStatusLabel(s: string) {
    const m: Record<string, string> = {
      purchased: 'Purchased',
      onboarding_submitted: 'Onboarding submitted',
      session_pending: 'Session pending',
      session_booked: 'Session booked',
      setup_completed: 'Setup completed',
    };
    return m[s] || s;
  }

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="h-14 w-14 bg-brand-green rounded-xl flex items-center justify-center mx-auto mb-4">
              <User className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Sales Portal</h1>
            <p className="text-gray-600 mt-2">Login with your email and ID code</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                {loginError}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                data-testid="input-portal-email"
              />
              <p className="text-[10px] text-gray-400 mt-1">Demo: demo@sales.com / 123456</p>
            </div>

            <div>
              <Label htmlFor="loginCode">Login Code (6 digits)</Label>
              <div className="relative">
                <Input
                  id="loginCode"
                  type={showCode ? "text" : "password"}
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  required
                  className="pr-10"
                  data-testid="input-portal-code"
                />
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showCode ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={isLoggingIn}
              className="w-full bg-brand-green hover:bg-brand-dark"
              data-testid="button-portal-login"
            >
              {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
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
            <h1 className="text-2xl font-display font-bold text-gray-900">Internal Sales Commission Policy</h1>
            <p className="text-gray-600 mt-2">Please review and accept the policy to continue</p>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-800">
                You must accept this policy before accessing the Sales Portal.
              </p>
            </div>

            <ScrollArea className="h-80 border rounded-lg p-4 bg-gray-50">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans">
                {SALESPERSON_AGREEMENT_TEXT}
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
                I have read and agree to the Internal Sales Commission Policy. I understand that my acceptance 
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
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-brand-green rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div>
              <h1 className="text-lg font-display font-bold text-gray-900">Sales Portal</h1>
              <p className="text-sm text-gray-500">Welcome, {salesperson?.name}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="text-gray-600">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-gray-600">Total Demos</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.totalBookings || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-gray-600">Conversions</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.totalConversions || 0}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-gray-600">Earnings</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">${parseFloat(stats?.totalEarnings || '0').toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-violet-100 rounded-lg flex items-center justify-center">
                <ClipboardList className="h-5 w-5 text-violet-600" />
              </div>
              <span className="text-gray-600">GE setup open</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.pendingSetupTasks ?? 0}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-slate-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-slate-600" />
              </div>
              <span className="text-gray-600">GE setups done</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stats?.setupTasksCompleted ?? 0}</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <span className="font-medium text-gray-900">How you earn</span> Earnings include demo conversion commissions and
          completed setup task payouts. Each completed Growth Engine setup task pays a fixed amount:{" "}
          <span className="font-semibold text-gray-900">
            ${(stats?.effectiveTaskPayoutDollars ?? stats?.defaultTaskPayoutDollars ?? 50).toFixed(2)}
          </span>
          {stats?.hasCustomTaskPayout ? (
            <span className="text-gray-600"> (custom override)</span>
          ) : (
            <span className="text-gray-600"> (default ${(stats?.defaultTaskPayoutDollars ?? 50).toFixed(2)})</span>
          )}
          . Demo conversions can also earn one-time credits plus subscription-based commission (for example 30% for up to 12
          months) when Stripe records a qualifying payment.
        </p>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending Demos ({pendingDemos.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed Demos ({completedDemos.length})
            </TabsTrigger>
            <TabsTrigger value="setup-pending" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              GE Setup ({pendingSetup.length})
            </TabsTrigger>
            <TabsTrigger value="setup-done" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              GE Done ({completedSetup.length})
            </TabsTrigger>
            <TabsTrigger value="earnings" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Earnings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Upcoming Demos</h2>
                <p className="text-sm text-gray-500">Mark as completed after the demo call</p>
              </div>
              {pendingDemos.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No pending demos. Check back later for new assignments.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingDemos.map((demo) => (
                    <div key={demo.id} className="p-4 hover:bg-gray-50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{demo.visitorName}</h3>
                            {demo.source === 'qr_code' && (
                              <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-600 border-amber-200">
                                QR Scan
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Mail className="h-3.5 w-3.5" />
                              {demo.visitorEmail}
                            </span>
                            <span className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {demo.visitorPhone}
                            </span>
                          </div>
                          <p className="text-sm text-brand-green font-medium">
                            <Calendar className="h-3.5 w-3.5 inline mr-1" />
                            {new Date(demo.scheduledDate).toLocaleString('en-US', {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })}
                          </p>
                        </div>
                        <Button
                          onClick={() => markComplete.mutate(demo.id)}
                          disabled={markComplete.isPending}
                          className="bg-brand-green hover:bg-brand-dark shrink-0"
                        >
                          {markComplete.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Mark Complete
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="completed">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Past Demos</h2>
                <p className="text-sm text-gray-500">Reach out to prospects for follow-up</p>
              </div>
              {completedDemos.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No completed demos yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Demo Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedDemos.map((demo) => (
                      <TableRow key={demo.id}>
                        <TableCell className="font-medium">{demo.visitorName}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{demo.visitorEmail}</div>
                            <div className="text-gray-500">{demo.visitorPhone}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(demo.scheduledDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={demo.status === 'converted' ? 'default' : 'secondary'}>
                            {demo.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="setup-pending">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Growth Engine — concierge / launch setup</h2>
                <p className="text-sm text-gray-500">
                  Tasks created after purchase and onboarding submission. Mark complete after the launch session is delivered.
                </p>
              </div>
              {pendingSetup.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No open setup tasks. If you expect work here, ask an admin to set your role to &quot;setup&quot; or &quot;both&quot; and assign
                  calendar links.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {pendingSetup.map((task) => (
                    <div key={task.id} className="p-4 hover:bg-gray-50">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-gray-900 truncate">
                              {task.userName || task.userEmail || "Customer"}
                            </h3>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {setupStatusLabel(task.status)}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-500 flex flex-wrap gap-3">
                            <span className="flex items-center gap-1 min-w-0">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{task.userEmail || "—"}</span>
                            </span>
                          </div>
                          <p className="text-xs text-gray-400 font-mono truncate">User ID: {task.userId}</p>
                        </div>
                        <Button
                          onClick={() => markSetupComplete.mutate(task.id)}
                          disabled={markSetupComplete.isPending || task.status === "setup_completed"}
                          className="bg-brand-green hover:bg-brand-dark shrink-0"
                        >
                          {markSetupComplete.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Mark setup complete
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="setup-done">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Completed Growth Engine setups</h2>
              </div>
              {completedSetup.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No completed setup tasks yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedSetup.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.userName || "—"}</TableCell>
                        <TableCell>{task.userEmail || "—"}</TableCell>
                        <TableCell>
                          {task.completedAt ? new Date(task.completedAt).toLocaleString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>

          <TabsContent value="earnings">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Earnings</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Earnings include demo conversion commissions and completed setup task payouts.
                </p>
              </div>

              <div className="grid gap-3 border-b border-gray-100 bg-slate-50/90 p-4 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Demo commissions</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">${demoCommissionsCombined.toFixed(2)}</p>
                  <p className="mt-2 text-[11px] leading-snug text-gray-500">
                    Conversion credits ${demoBonusTotal.toFixed(2)} + subscription payouts $
                    {subscriptionCommissionsTotal.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Setup task payouts</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">${setupTaskPayoutsLedger.toFixed(2)}</p>
                  <p className="mt-2 text-[11px] leading-snug text-gray-500">
                    Fixed amount per completed internal Growth Engine setup (tracked separately from subscription commission).
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:col-span-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total earnings</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">${totalEarningsLedger.toFixed(2)}</p>
                  <p className="mt-2 text-[11px] leading-snug text-gray-500">Ledger total on your account (all credited sources).</p>
                </div>
              </div>

              {earningsBreakdownMismatch && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  The sum of the breakdown above may differ from total earnings for older activity recorded before setup payouts
                  were tracked separately, or after manual adjustments.
                </div>
              )}

              <div className="divide-y divide-gray-100">
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Demo conversion records</h3>
                  <p className="text-xs text-gray-500 mt-0.5 mb-3">One-time credits when a booked demo converts.</p>
                  {conversions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
                      No conversion records yet.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Payment status</TableHead>
                          <TableHead>Subscription commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversions.map((conv) => {
                          const sub = subscriptionCommissionWindowBadge(conv.createdAt);
                          return (
                            <TableRow key={conv.id}>
                              <TableCell>{new Date(conv.createdAt).toLocaleDateString()}</TableCell>
                              <TableCell className="font-medium">${parseFloat(conv.amount).toFixed(2)}</TableCell>
                              <TableCell>
                                <Badge variant={conv.paid ? 'default' : 'outline'}>
                                  {conv.paid ? 'Paid' : 'Pending'}
                                </Badge>
                                {conv.paid && conv.paidAt && (
                                  <span className="ml-2 text-xs text-gray-500">
                                    {new Date(conv.paidAt).toLocaleDateString()}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={sub.active ? 'default' : 'secondary'} className="whitespace-nowrap font-normal">
                                  {sub.label}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Subscription commissions</h3>
                  <p className="text-xs text-gray-500 mt-0.5 mb-3">
                    Ongoing commission from paid subscription invoices (30% while active). New commission rows are created only
                    within 12 months of the conversion record date; older rows below are unchanged.
                  </p>
                  {commissions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">
                      No subscription commission rows yet.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Billing period</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="hidden sm:table-cell">Invoice</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commissions.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell>
                              {row.billingPeriod
                                ? new Date(row.billingPeriod).toLocaleDateString()
                                : new Date(row.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="font-medium">${parseFloat(row.amount).toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant={row.status === 'paid' ? 'default' : 'outline'}>{row.status}</Badge>
                              {row.paidAt && (
                                <span className="ml-2 text-xs text-gray-500">
                                  Paid {new Date(row.paidAt).toLocaleDateString()}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="hidden max-w-[140px] truncate font-mono text-xs text-gray-600 sm:table-cell">
                              {row.invoiceId || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
