import { useState, useEffect, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Calendar, DollarSign, CheckCircle, Clock, LogOut, Loader2, 
  User, Phone, Mail, ExternalLink, FileText, AlertCircle,
  Eye, EyeOff, ClipboardList, CircleHelp
} from "lucide-react";
import {
  SALESPERSON_AGREEMENT_VERSION,
} from "@shared/salespersonAgreement";

const DEMO_PAYOUT_DOLLARS = 50;

/** Payout-only policy shown in Sales Portal (no subscription commission language). */
const SALES_PORTAL_PAYOUT_POLICY_TEXT = `WhachatCRM Sales Portal payout policy

Demo session payouts: $${DEMO_PAYOUT_DOLLARS} per completed and approved demo session.

Growth Engine setup payouts: $${DEMO_PAYOUT_DOLLARS} per completed and approved setup/onboarding session.

All payouts are reviewed and approved by admin before being credited to your account.`;

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

interface Stats {
  totalEarnings: string;
  defaultTaskPayoutDollars?: number;
  effectiveTaskPayoutDollars?: number;
  hasCustomTaskPayout?: boolean;
  demoConversionBonusesTotal?: string;
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
  onboardingSummary?: Record<string, unknown> | null;
  sessionBooking?: { startTime?: string; eventTypeName?: string; inviteeName?: string } | null;
}

interface SalespersonInfo {
  id: string;
  name: string;
  email: string;
  role?: string;
}

/** React Query keys scoped to Sales Portal — cleared on login/logout to avoid cross-account stale cache. */
const SALES_PORTAL_QUERY_KEYS = [
  ["/api/sales-portal/stats"],
  ["/api/sales-portal/demos"],
  ["/api/sales-portal/setup-tasks"],
] as const;

function demoStatusLabel(status: string): string {
  if (status === "converted" || status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "pending") return "Pending";
  return status;
}

function isSalesPortalQueryKey(key: readonly unknown[]): boolean {
  const path = key[0];
  return typeof path === "string" && path.startsWith("/api/sales-portal/");
}

function removeSalesPortalQueries(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (q) => isSalesPortalQueryKey(q.queryKey as readonly unknown[]),
  });
}

async function refetchSalesPortalQueries(queryClient: QueryClient) {
  // fetchQuery runs even before enabled queries mount (e.g. immediately after login).
  await Promise.all(
    SALES_PORTAL_QUERY_KEYS.map((queryKey) => queryClient.fetchQuery({ queryKey })),
  );
}

async function fetchSalesPortalCheck(): Promise<{
  authenticated: boolean;
  agreementRequired?: boolean;
  salesperson?: SalespersonInfo;
}> {
  const res = await fetch("/api/sales-portal/check", {
    credentials: "include",
    cache: "no-store",
  });
  return res.json();
}

function EarningsInfoSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-slate-100 py-4 last:border-0 last:pb-0 first:pt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{title}</h3>
      {children}
    </section>
  );
}

function SalesPortalEarningsDialog({
  earningsOpen,
  onEarningsOpenChange,
  stats,
}: {
  earningsOpen: boolean;
  onEarningsOpenChange: (open: boolean) => void;
  stats?: Stats;
}) {
  const setupPayout =
    stats?.effectiveTaskPayoutDollars ?? stats?.defaultTaskPayoutDollars ?? DEMO_PAYOUT_DOLLARS;

  return (
    <Dialog open={earningsOpen} onOpenChange={onEarningsOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden sm:max-w-md">
        <DialogHeader className="px-5 pt-5 pb-0 text-start space-y-1">
          <DialogTitle className="text-base font-semibold text-slate-900">How earnings work</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Fixed payouts for completed demo and Growth Engine setup sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-5 pt-3 max-h-[min(70vh,520px)] overflow-y-auto">
          <EarningsInfoSection title="Demo payouts">
            <ul className="list-disc pl-4 space-y-1.5 text-sm text-slate-600 leading-relaxed">
              <li>
                <span className="font-medium text-slate-800">${DEMO_PAYOUT_DOLLARS.toFixed(2)}</span> per completed
                and approved demo session.
              </li>
            </ul>
          </EarningsInfoSection>
          <EarningsInfoSection title="Growth Engine setup payouts">
            <ul className="list-disc pl-4 space-y-1.5 text-sm text-slate-600 leading-relaxed">
              <li>
                <span className="font-medium text-slate-800">${setupPayout.toFixed(2)}</span> per completed and
                approved setup/onboarding session
                {stats?.hasCustomTaskPayout ? " (custom rate)" : ""}.
              </li>
            </ul>
          </EarningsInfoSection>
          <p className="text-sm text-slate-600 leading-relaxed pt-2">
            Payouts are reviewed and approved by admin.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
  const [earningsInfoOpen, setEarningsInfoOpen] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    fetchSalesPortalCheck()
      .then(async (data) => {
        if (data.authenticated) {
          removeSalesPortalQueries(queryClient);
          setIsLoggedIn(true);
          setSalesperson(data.salesperson ?? null);
          setAgreementRequired(data.agreementRequired === true);
          await refetchSalesPortalQueries(queryClient);
        }
      })
      .catch(() => setIsLoggedIn(false));
  }, [queryClient]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const res = await fetch("/api/sales-portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, loginCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Drop cached data from any prior salesperson session before refetching.
      removeSalesPortalQueries(queryClient);

      setIsLoggedIn(true);
      setSalesperson(data.salesperson);
      setEmail("");
      setLoginCode("");
      setAgreementChecked(false);
      setAcceptError("");

      const checkData = await fetchSalesPortalCheck();
      if (checkData.salesperson) {
        setSalesperson(checkData.salesperson);
      }
      setAgreementRequired(checkData.agreementRequired === true);

      await refetchSalesPortalQueries(queryClient);
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
    try {
      await fetch("/api/sales-portal/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      removeSalesPortalQueries(queryClient);
      setIsLoggedIn(false);
      setSalesperson(null);
      setAgreementRequired(false);
      setAgreementChecked(false);
      setAcceptError("");
      setLoginError("");
      setEmail("");
      setLoginCode("");
      setEarningsInfoOpen(false);
    }
  };

  const { data: stats } = useQuery<Stats>({
    queryKey: ['/api/sales-portal/stats'],
    enabled: isLoggedIn,
  });

  const { data: demos = [] } = useQuery<Demo[]>({
    queryKey: ['/api/sales-portal/demos'],
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

  const demoPayoutsTotal = parseFloat(stats?.demoConversionBonusesTotal ?? "0");
  const setupPayoutsTotal = parseFloat(stats?.setupTaskPayoutsTotal ?? "0");
  const totalEarningsLedger = parseFloat(stats?.totalEarnings ?? "0");
  const earningsBreakdownSum = demoPayoutsTotal + setupPayoutsTotal;
  const earningsBreakdownMismatch =
    stats != null && Math.abs(earningsBreakdownSum - totalEarningsLedger) > 0.05;
  const setupPayoutRate =
    stats?.effectiveTaskPayoutDollars ?? stats?.defaultTaskPayoutDollars ?? DEMO_PAYOUT_DOLLARS;

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
            <h1 className="text-2xl font-display font-bold text-gray-900">Sales payout policy</h1>
            <p className="text-gray-600 mt-2">Please review and accept the payout policy to continue</p>
            <p className="text-xs text-gray-500 mt-1">Version {SALESPERSON_AGREEMENT_VERSION}</p>
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
                {SALES_PORTAL_PAYOUT_POLICY_TEXT}
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
                I have read and agree to the Sales payout policy (version{" "}
                {SALESPERSON_AGREEMENT_VERSION}). I understand that my acceptance is legally binding and my
                salesperson account ID, IP address, user agent, and timestamp will be recorded.
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
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                <p className="text-sm text-gray-500">Welcome, {salesperson?.name}</p>
                {salesperson?.email && (
                  <p className="text-xs text-gray-400">{salesperson.email}</p>
                )}
                <button
                  type="button"
                  onClick={() => setEarningsInfoOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  data-testid="button-how-earnings-work"
                >
                  <CircleHelp className="h-3 w-3 text-slate-400" />
                  How earnings work
                </button>
              </div>
            </div>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="text-gray-600">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Tabs defaultValue="pending" className="space-y-4">
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
                          <Badge variant={demo.status === "pending" ? "outline" : "secondary"}>
                            {demoStatusLabel(demo.status)}
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
                          {task.onboardingSummary && typeof task.onboardingSummary === "object" ? (
                            <p className="text-xs text-gray-600 line-clamp-2">
                              {String(
                                (task.onboardingSummary as { legalName?: string }).legalName ||
                                  (task.onboardingSummary as { legalBusinessName?: string }).legalBusinessName ||
                                  "",
                              )}
                              {(task.onboardingSummary as { country?: string }).country
                                ? ` · ${(task.onboardingSummary as { country?: string }).country}`
                                : ""}
                            </p>
                          ) : null}
                          {task.sessionBooking?.startTime ? (
                            <p className="text-xs text-emerald-700">
                              Session: {new Date(task.sessionBooking.startTime).toLocaleString()}
                            </p>
                          ) : null}
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
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Demo session payouts</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">${demoPayoutsTotal.toFixed(2)}</p>
                  <p className="mt-2 text-[11px] leading-snug text-gray-500">
                    ${DEMO_PAYOUT_DOLLARS} per completed and approved demo.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">GE setup payouts</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">${setupPayoutsTotal.toFixed(2)}</p>
                  <p className="mt-2 text-[11px] leading-snug text-gray-500">
                    ${setupPayoutRate.toFixed(0)} per completed and approved setup/onboarding session.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total earnings</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800">${totalEarningsLedger.toFixed(2)}</p>
                  <p className="mt-2 text-[11px] leading-snug text-gray-500">Approved payouts credited to your account.</p>
                </div>
              </div>

              {earningsBreakdownMismatch && (
                <div className="px-4 py-3 text-xs text-amber-900 bg-amber-50 border-b border-amber-200">
                  Total may include older payouts recorded before setup payouts were tracked separately.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <SalesPortalEarningsDialog
        earningsOpen={earningsInfoOpen}
        onEarningsOpenChange={setEarningsInfoOpen}
        stats={stats}
      />
    </div>
  );
}
