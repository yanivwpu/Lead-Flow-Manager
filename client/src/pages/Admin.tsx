import { useMemo, useState, useEffect } from "react";

const ADMIN_TOKEN_KEY = 'whachat_admin_token';
function getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
function adminHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAdminToken();
  return token ? { 'x-admin-token': token, ...extra } : { ...extra };
}
function adminFetch(url: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: { ...adminHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
}
function adminQueryFn<T = unknown>(url: string) {
  return async (): Promise<T> => {
    const res = await adminFetch(url);
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  };
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter
} from "@/components/ui/sheet";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { 
  Users, Calendar, DollarSign, Plus, Edit2, Trash2, 
  LogOut, Loader2, CheckCircle, XCircle, Lock, UserCircle,
  AlertCircle, MessageCircle, ArrowUpDown, Link2, Percent,
  Eye, EyeOff
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Salesperson {
  id: string;
  loginCode: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  totalBookings: number;
  totalConversions: number;
  totalEarnings: string;
  createdAt: string;
}

interface Booking {
  id: string;
  salespersonId: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  scheduledDate: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface Conversion {
  id: string;
  bookingId: string;
  salespersonId: string;
  userId?: string;
  amount: string;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  /** Effective plan (trial → pro, else override if enabled, else billing). */
  effectivePlan: string;
  billingPlan: string;
  planOverride: string | null;
  planOverrideEnabled: boolean;
  /** Legacy column kept for reference (admin PATCH still syncs this). */
  subscriptionPlanLegacy: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  isInTrial: boolean;
  twilioConnected: boolean | null;
  metaConnected: boolean | null;
  createdAt: string | null;
  hasDemo: boolean;
  demoStatus: string | null;
  demoDate: string | null;
  openTicketCount: number;
  totalTicketCount: number;
  latestTicket: any | null;
  // Attribution fields
  partnerId: string | null;
  partnerName: string | null;
  salespersonId: string | null;
  salespersonName: string | null;
}

type UserStatusFilter = "all" | "trial" | "active" | "expired";
type PlanFilter = "all" | "free" | "starter" | "pro";

interface GhlIntegration {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPlan: string;
  isActive: boolean;
  locationId: string | null;
  companyId: string | null;
  userType: string | null;
  installedAt: string | null;
  tokenExpiresAt: string | null;
  lastSyncAt: string | null;
  createdAt: string | null;
}

interface Partner {
  id: string;
  name: string;
  email: string;
  refCode: string;
  commissionRate: string;
  commissionDurationMonths: number;
  status: string;
  totalReferrals: number;
  totalEarnings: string;
  createdAt: string;
}

export function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Salesperson | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: "", email: "", phone: "" });
  const [addError, setAddError] = useState("");
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [isAddingPartner, setIsAddingPartner] = useState(false);
  const [newPartner, setNewPartner] = useState({ name: "", email: "", password: "", commissionRate: "50.00", commissionDurationMonths: 6 });
  const [addPartnerError, setAddPartnerError] = useState("");
  const [editingUserPlan, setEditingUserPlan] = useState<{ userId: string; plan: string } | null>(null);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    adminFetch('/api/admin/check')
      .then(res => res.json())
      .then(data => setIsLoggedIn(data.isAdmin))
      .catch(() => setIsLoggedIn(false));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      const data = await res.json();
      if (data.token) localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setIsLoggedIn(true);
      setPassword("");
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await adminFetch('/api/admin/logout', { method: 'POST' });
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setIsLoggedIn(false);
  };

  const { data: salespeople = [] } = useQuery<Salesperson[]>({
    queryKey: ['/api/admin/salespeople'],
    queryFn: adminQueryFn('/api/admin/salespeople'),
    enabled: isLoggedIn,
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['/api/admin/bookings'],
    queryFn: adminQueryFn('/api/admin/bookings'),
    enabled: isLoggedIn,
  });

  const { data: conversions = [] } = useQuery<Conversion[]>({
    queryKey: ['/api/admin/conversions'],
    queryFn: adminQueryFn('/api/admin/conversions'),
    enabled: isLoggedIn,
  });

  const { data: roiStats } = useQuery<{ totalCost: number; totalRevenue: number; roi: number }>({
    queryKey: ['/api/admin/conversions/roi'],
    queryFn: adminQueryFn('/api/admin/conversions/roi'),
    enabled: isLoggedIn,
  });

  const { data: adminUsers = [], isError: usersError, error: usersErrorDetails, refetch: refetchUsers } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    queryFn: adminQueryFn('/api/admin/users'),
    enabled: isLoggedIn,
    retry: 1,
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ['/api/admin/partners'],
    queryFn: adminQueryFn('/api/admin/partners'),
    enabled: isLoggedIn,
  });

  const { data: ghlIntegrations = [] } = useQuery<GhlIntegration[]>({
    queryKey: ['/api/admin/ghl-integrations'],
    queryFn: adminQueryFn('/api/admin/ghl-integrations'),
    enabled: isLoggedIn,
  });

  const [userSort, setUserSort] = useState<'date' | 'support' | 'plan'>('support');
  const [showSupportOnly, setShowSupportOnly] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<PlanFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [aiFilter, setAiFilter] = useState<"all" | "enabled">("all");
  const [overrideFilter, setOverrideFilter] = useState<"all" | "enabled">("all");
  const [pageSize, setPageSize] = useState<50 | 100>(50);
  const [page, setPage] = useState(1);
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminUser | null>(null);
  
  const openSupportCount = adminUsers.filter(u => u.openTicketCount > 0).length;
  const filteredUsers = showSupportOnly 
    ? adminUsers.filter(u => u.openTicketCount > 0 || u.totalTicketCount > 0)
    : adminUsers;

  const derivedUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();

    function deriveStatus(u: AdminUser): UserStatusFilter {
      if (u.isInTrial) return "trial";
      const st = (u.subscriptionStatus || "").toLowerCase();
      // Heuristic: treat active/trialing as active; canceled/unpaid/past_due as expired
      if (st === "active" || st === "trialing") return "active";
      if (st === "canceled" || st === "cancelled" || st === "past_due" || st === "unpaid") return "expired";
      // If billing plan is paid and no explicit status, treat as active
      if ((u.billingPlan || "").toLowerCase() !== "free") return "active";
      return "expired";
    }

    // We currently don't have AI Brain entitlement on /api/admin/users without backend I/O.
    // Keep column/filter ready; it will only show badges when the API includes this flag.
    function hasAiBrain(_u: AdminUser): boolean {
      return false;
    }

    const rows = filteredUsers
      .filter((u) => {
        if (!q) return true;
        const name = (u.name || "").toLowerCase();
        const email = (u.email || "").toLowerCase();
        return name.includes(q) || email.includes(q) || u.id.toLowerCase().includes(q);
      })
      .filter((u) => {
        if (planFilter === "all") return true;
        return (u.effectivePlan || "free").toLowerCase() === planFilter;
      })
      .filter((u) => {
        if (statusFilter === "all") return true;
        return deriveStatus(u) === statusFilter;
      })
      .filter((u) => {
        if (overrideFilter === "all") return true;
        return !!u.planOverrideEnabled;
      })
      .filter((u) => {
        if (aiFilter === "all") return true;
        return hasAiBrain(u);
      })
      .sort((a, b) => {
        if (userSort === "support") {
          if (a.openTicketCount > 0 && b.openTicketCount === 0) return -1;
          if (b.openTicketCount > 0 && a.openTicketCount === 0) return 1;
          return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
        } else if (userSort === "plan") {
          const planOrder = { pro: 0, starter: 1, free: 2 } as const;
          const aOrder = planOrder[(a.effectivePlan as keyof typeof planOrder) || "free"] ?? 3;
          const bOrder = planOrder[(b.effectivePlan as keyof typeof planOrder) || "free"] ?? 3;
          return aOrder - bOrder;
        }
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      });

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;

    return {
      rows,
      deriveStatus,
      hasAiBrain,
      total,
      totalPages,
      page: safePage,
      pageRows: rows.slice(start, end),
    };
  }, [aiFilter, filteredUsers, overrideFilter, page, pageSize, planFilter, statusFilter, userSearch, userSort]);

  useEffect(() => {
    // Reset to page 1 when filters change
    setPage(1);
  }, [userSearch, planFilter, statusFilter, aiFilter, overrideFilter, pageSize, showSupportOnly]);

  const createPartner = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string; commissionRate?: string; commissionDurationMonths?: number }) => {
      const res = await adminFetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create partner');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/partners'] });
      setIsAddingPartner(false);
      setNewPartner({ name: "", email: "", password: "", commissionRate: "50.00", commissionDurationMonths: 6 });
      setAddPartnerError("");
    },
    onError: (error: Error) => {
      setAddPartnerError(error.message);
    }
  });

  const updatePartner = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Partner> & { id: string }) => {
      const res = await adminFetch(`/api/admin/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update partner');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/partners'] });
      setEditingPartner(null);
    }
  });

  const deletePartner = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/admin/partners/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete partner');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/partners'] });
    }
  });

  const createSalesperson = useMutation({
    mutationFn: async (data: { name: string; email: string; phone?: string }) => {
      const res = await adminFetch('/api/admin/salespeople', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const errorData = await res.text();
        throw new Error(errorData || 'Failed to create salesperson');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salespeople'] });
      setIsAddingPerson(false);
      setNewPerson({ name: "", email: "", phone: "" });
      setAddError("");
    },
    onError: (error: Error) => {
      setAddError(error.message);
    }
  });

  const updateSalesperson = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Salesperson> & { id: string }) => {
      const res = await adminFetch(`/api/admin/salespeople/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update salesperson');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salespeople'] });
      setEditingPerson(null);
    }
  });

  const deleteSalesperson = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/admin/salespeople/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete salesperson');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salespeople'] });
    }
  });

  const updateBookingStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/admin/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to update booking');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/bookings'] });
    }
  });

  const markConversionPaid = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/conversions/${id}/paid`, { method: 'PATCH', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to mark as paid');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/conversions'] });
    }
  });

  const updateUserPlan = useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: string }) => {
      const res = await adminFetch(`/api/admin/users/${userId}/plan`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionPlan: plan })
      });
      if (!res.ok) throw new Error('Failed to update plan');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setEditingUserPlan(null);
    }
  });

  const getSalespersonName = (id: string) => {
    return salespeople.find(p => p.id === id)?.name || 'Unknown';
  };

  const totalCost = salespeople.reduce((sum, p) => sum + parseFloat(p.totalEarnings || '0'), 0);
  const totalConversions = salespeople.reduce((sum, p) => sum + (p.totalConversions || 0), 0);
  const pendingBookings = bookings.filter(b => b.status === 'pending').length;
  const conversionRate = bookings.length > 0 
    ? ((bookings.filter(b => b.status === 'converted').length / bookings.length) * 100).toFixed(1)
    : '0';

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="h-14 w-14 bg-brand-green rounded-xl flex items-center justify-center mx-auto mb-4">
              <Lock className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold text-gray-900">Admin Access</h1>
            <p className="text-gray-600 mt-2">Enter admin password to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                {loginError}
              </div>
            )}

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                  required
                  className="pr-10"
                  data-testid="input-admin-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                First login will set the admin password
              </p>
            </div>

            <Button 
              type="submit" 
              disabled={isLoggingIn}
              className="w-full bg-brand-green hover:bg-brand-dark"
              data-testid="button-admin-login"
            >
              {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Login"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-brand-green rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <h1 className="text-xl font-display font-bold text-gray-900">Sales Admin</h1>
          </div>
          <Button variant="ghost" onClick={handleLogout} className="text-gray-600">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 leading-tight">Pending Demos</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{pendingBookings}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-green-100 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 leading-tight">Conversions</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{totalConversions}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-red-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 leading-tight">Total Cost</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">${totalCost.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 leading-tight">Revenue</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">${(roiStats?.totalRevenue || 0).toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-purple-100 rounded-lg flex items-center justify-center shrink-0">
                <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 leading-tight">Conv. Rate</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{conversionRate}%</p>
          </div>
          <div className="bg-white rounded-xl p-4 sm:p-6 border border-gray-200">
            <div className="flex items-center gap-2 sm:gap-3 mb-1 sm:mb-2">
              <div className="h-8 w-8 sm:h-10 sm:w-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
              </div>
              <span className="text-xs sm:text-sm text-gray-600 leading-tight">ROI</span>
            </div>
            <p className={`text-2xl sm:text-3xl font-bold ${(roiStats?.roi || 0) >= 100 ? 'text-green-600' : 'text-red-600'}`}>
              {(roiStats?.roi || 0).toFixed(0)}%
            </p>
          </div>
        </div>

        <Tabs defaultValue="salespeople" className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex w-max sm:w-auto min-w-full sm:min-w-0">
              <TabsTrigger value="salespeople" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4">
                <Users className="h-4 w-4 shrink-0" />
                <span className="hidden xs:inline">Salespeople</span>
                <span className="xs:hidden">Sales</span>
              </TabsTrigger>
              <TabsTrigger value="bookings" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4">
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Bookings</span>
                <span className="sm:hidden">Book</span>
              </TabsTrigger>
              <TabsTrigger value="conversions" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4">
                <DollarSign className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Conversions</span>
                <span className="sm:hidden">Conv</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4">
                <UserCircle className="h-4 w-4 shrink-0" />
                Users
                {adminUsers.filter(u => u.openTicketCount > 0).length > 0 && (
                  <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-[10px]">
                    {adminUsers.filter(u => u.openTicketCount > 0).length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="partners" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4" data-testid="tab-partners">
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Partners</span>
                <span className="sm:hidden">Part</span>
              </TabsTrigger>
              <TabsTrigger value="ghl" className="gap-1.5 text-xs sm:text-sm px-2.5 sm:px-4" data-testid="tab-ghl">
                <MessageCircle className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">GHL</span>
                <span className="sm:hidden">GHL</span>
                {ghlIntegrations.length > 0 && (
                  <Badge className="ml-1 px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700">
                    {ghlIntegrations.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="salespeople">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="font-semibold text-gray-900">Sales Team</h2>
                <Button 
                  onClick={() => setIsAddingPerson(true)}
                  className="bg-brand-green hover:bg-brand-dark min-h-[44px] min-w-[44px] touch-manipulation"
                  size="default"
                  data-testid="button-add-salesperson"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add Salesperson
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Login Code</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Conversions</TableHead>
                    <TableHead>Earnings</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salespeople.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                        No salespeople yet. Add your first salesperson to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    salespeople.map((person) => (
                      <TableRow key={person.id}>
                        <TableCell className="font-medium">{person.name}</TableCell>
                        <TableCell>
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">
                            {person.loginCode}
                          </code>
                        </TableCell>
                        <TableCell>{person.email}</TableCell>
                        <TableCell>{person.phone || '-'}</TableCell>
                        <TableCell>{person.totalBookings || 0}</TableCell>
                        <TableCell>{person.totalConversions || 0}</TableCell>
                        <TableCell>${parseFloat(person.totalEarnings || '0').toFixed(2)}</TableCell>
                        <TableCell>
                          <Badge variant={person.isActive ? "default" : "secondary"}>
                            {person.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingPerson(person)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (confirm('Delete this salesperson?')) {
                                  deleteSalesperson.mutate(person.id);
                                }
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="bookings">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Demo Bookings</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visitor</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Scheduled</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        No demo bookings yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    bookings.map((booking) => (
                      <TableRow key={booking.id}>
                        <TableCell className="font-medium">{booking.visitorName}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{booking.visitorEmail}</div>
                            <div className="text-gray-500">{booking.visitorPhone}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(booking.scheduledDate).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })}
                        </TableCell>
                        <TableCell>{getSalespersonName(booking.salespersonId)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              booking.status === 'converted' ? 'default' : 
                              booking.status === 'completed' ? 'secondary' : 
                              booking.status === 'cancelled' ? 'destructive' : 'outline'
                            }
                          >
                            {booking.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <select
                            value={booking.status}
                            onChange={(e) => updateBookingStatus.mutate({ 
                              id: booking.id, 
                              status: e.target.value 
                            })}
                            className="text-sm border rounded px-2 py-1"
                          >
                            <option value="pending">Pending</option>
                            <option value="completed">Completed</option>
                            <option value="converted">Converted</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="conversions">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Conversion Payouts</h2>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Salesperson</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Payment Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conversions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                        No conversions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    conversions.map((conversion) => (
                      <TableRow key={conversion.id}>
                        <TableCell className="font-medium">
                          {getSalespersonName(conversion.salespersonId)}
                        </TableCell>
                        <TableCell>${parseFloat(conversion.amount).toFixed(2)}</TableCell>
                        <TableCell>
                          {new Date(conversion.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={conversion.paid ? "default" : "outline"}>
                            {conversion.paid ? 'Paid' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {!conversion.paid && (
                            <Button
                              size="sm"
                              onClick={() => markConversionPaid.mutate(conversion.id)}
                              className="bg-brand-green hover:bg-brand-dark"
                            >
                              Mark Paid
                            </Button>
                          )}
                          {conversion.paid && conversion.paidAt && (
                            <span className="text-sm text-gray-500">
                              Paid {new Date(conversion.paidAt).toLocaleDateString()}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="users">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h2 className="font-semibold text-gray-900 text-sm sm:text-base">
                    Users ({derivedUsers.total})
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetchUsers()} className="h-9">
                      Refresh
                    </Button>
                  </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
                  <Input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name, email, or userId…"
                    className="h-9 lg:max-w-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={planFilter}
                      onChange={(e) => setPlanFilter(e.target.value as any)}
                      className="h-9 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      aria-label="Plan filter"
                    >
                      <option value="all">All plans</option>
                      <option value="free">Free</option>
                      <option value="starter">Starter</option>
                      <option value="pro">Pro</option>
                    </select>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as any)}
                      className="h-9 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      aria-label="Status filter"
                    >
                      <option value="all">All status</option>
                      <option value="trial">Trial</option>
                      <option value="active">Active</option>
                      <option value="expired">Expired</option>
                    </select>
                    <select
                      value={overrideFilter}
                      onChange={(e) => setOverrideFilter(e.target.value as any)}
                      className="h-9 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      aria-label="Override filter"
                    >
                      <option value="all">Override (any)</option>
                      <option value="enabled">Override enabled</option>
                    </select>
                    <select
                      value={aiFilter}
                      onChange={(e) => setAiFilter(e.target.value as any)}
                      className="h-9 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      aria-label="AI Brain filter"
                      title="AI Brain entitlement is not included in the current /api/admin/users payload"
                    >
                      <option value="all">AI Brain (any)</option>
                      <option value="enabled">AI Brain enabled</option>
                    </select>
                    <Button
                      variant={showSupportOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowSupportOnly(!showSupportOnly)}
                      className={cn("h-9", showSupportOnly ? "bg-red-500 hover:bg-red-600" : "")}
                      title="Show only users with any support tickets"
                    >
                      <MessageCircle className="h-4 w-4 mr-1.5" />
                      Support
                      {openSupportCount > 0 && (
                        <span className={cn(
                          "ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded-full",
                          showSupportOnly ? "bg-white text-red-600" : "bg-red-500 text-white"
                        )}>
                          {openSupportCount}
                        </span>
                      )}
                    </Button>
                    <select
                      value={userSort}
                      onChange={(e) => setUserSort(e.target.value as any)}
                      className="h-9 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      aria-label="Sort"
                    >
                      <option value="support">Urgent first</option>
                      <option value="date">Newest signup</option>
                      <option value="plan">Plan</option>
                    </select>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value) as any)}
                      className="h-9 border border-gray-200 rounded-md px-2 text-sm bg-white"
                      aria-label="Rows per page"
                    >
                      <option value={50}>50 / page</option>
                      <option value={100}>100 / page</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Compact table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[260px]">User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>AI Brain</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Signup</TableHead>
                      <TableHead className="min-w-[180px]">Acquisition</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersError ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <p className="text-red-500 mb-2">Failed to load users: {usersErrorDetails?.message || 'Unknown error'}</p>
                          <Button variant="outline" size="sm" onClick={() => refetchUsers()}>
                            Retry
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : derivedUsers.total === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                          No users match the current filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      derivedUsers.pageRows.map((u) => {
                        const status = derivedUsers.deriveStatus(u);
                        const plan = (u.effectivePlan || "free").toLowerCase();
                        const planLabel = plan === "pro" ? "Pro" : plan === "starter" ? "Starter" : "Free";
                        const acq =
                          u.partnerName ? `Partner • ${u.partnerName}` :
                          u.salespersonName ? `Internal • ${u.salespersonName}` :
                          "Organic";
                        const hasAI = derivedUsers.hasAiBrain(u);

                        return (
                          <TableRow
                            key={u.id}
                            className={cn("cursor-pointer", u.openTicketCount > 0 && "bg-red-50")}
                            onClick={() => setSelectedAdminUser(u)}
                            data-testid={`admin-user-row-${u.id}`}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                {u.avatarUrl ? (
                                  <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                    <UserCircle className="h-5 w-5 text-gray-500" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-medium text-gray-900 truncate">{u.name || "No name"}</div>
                                  <div className="text-xs text-gray-500 truncate">{u.email}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant={plan === "pro" ? "default" : plan === "starter" ? "secondary" : "outline"}
                                  className={cn(plan === "pro" && "bg-brand-green")}
                                >
                                  {planLabel}
                                </Badge>
                                {u.planOverrideEnabled && (
                                  <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700">
                                    Override
                                  </Badge>
                                )}
                                {u.isInTrial && (
                                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                                    Trial
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {hasAI ? (
                                <Badge className="bg-purple-100 text-purple-700">AI</Badge>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  status === "trial" ? "outline" :
                                  status === "active" ? "default" :
                                  "secondary"
                                }
                                className={cn(
                                  status === "trial" && "border-amber-300 text-amber-700",
                                  status === "active" && "bg-emerald-600",
                                )}
                              >
                                {status === "trial" ? "Trial" : status === "active" ? "Active" : "Expired"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-sm text-gray-700">
                              {acq}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="p-3 sm:p-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-gray-500">
                  Showing{" "}
                  <span className="font-medium text-gray-700">
                    {(derivedUsers.page - 1) * pageSize + 1}
                  </span>
                  {"–"}
                  <span className="font-medium text-gray-700">
                    {Math.min(derivedUsers.page * pageSize, derivedUsers.total)}
                  </span>
                  {" "}of{" "}
                  <span className="font-medium text-gray-700">{derivedUsers.total}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={derivedUsers.page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-gray-600">
                    Page <span className="font-medium">{derivedUsers.page}</span> /{" "}
                    <span className="font-medium">{derivedUsers.totalPages}</span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={derivedUsers.page >= derivedUsers.totalPages}
                    onClick={() => setPage((p) => Math.min(derivedUsers.totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>

            {/* User details panel */}
            <Sheet open={!!selectedAdminUser} onOpenChange={(v) => { if (!v) setSelectedAdminUser(null); }}>
              <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>User details</SheetTitle>
                </SheetHeader>
                {selectedAdminUser && (
                  <div className="py-4 space-y-5">
                    <div className="flex items-start gap-3">
                      {selectedAdminUser.avatarUrl ? (
                        <img src={selectedAdminUser.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <UserCircle className="h-7 w-7 text-gray-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-base font-semibold text-gray-900 truncate">{selectedAdminUser.name || "No name"}</div>
                        <div className="text-sm text-gray-600 truncate">{selectedAdminUser.email}</div>
                        <div className="text-xs text-gray-400 mt-1">User ID: {selectedAdminUser.id}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-gray-500">Effective plan</div>
                        <div className="font-medium text-gray-900">{selectedAdminUser.effectivePlan}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-gray-500">Billing plan</div>
                        <div className="font-medium text-gray-900">{selectedAdminUser.billingPlan}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-gray-500">Override</div>
                        <div className="font-medium text-gray-900">
                          {selectedAdminUser.planOverrideEnabled ? (selectedAdminUser.planOverride || "—") : "disabled"}
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-gray-500">Legacy plan</div>
                        <div className="font-medium text-gray-900">{selectedAdminUser.subscriptionPlanLegacy || "—"}</div>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">Trial / status</div>
                        <Badge variant="outline" className="text-xs">
                          {selectedAdminUser.subscriptionStatus || "—"}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-700">
                        In trial: <span className="font-medium">{selectedAdminUser.isInTrial ? "yes" : "no"}</span>
                      </div>
                      {selectedAdminUser.trialEndsAt && (
                        <div className="text-sm text-gray-700">
                          Trial ends:{" "}
                          <span className="font-medium">{new Date(selectedAdminUser.trialEndsAt).toLocaleString()}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-sm font-semibold text-gray-900">Acquisition</div>
                      <div className="text-sm text-gray-700">
                        Partner: <span className="font-medium">{selectedAdminUser.partnerName || "—"}</span>
                      </div>
                      <div className="text-sm text-gray-700">
                        Salesperson: <span className="font-medium">{selectedAdminUser.salespersonName || "—"}</span>
                      </div>
                      <div className="text-sm text-gray-700">
                        Signup: <span className="font-medium">{selectedAdminUser.createdAt ? new Date(selectedAdminUser.createdAt).toLocaleString() : "—"}</span>
                      </div>
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-sm font-semibold text-gray-900">Support</div>
                      <div className="text-sm text-gray-700">
                        Open tickets: <span className="font-medium">{selectedAdminUser.openTicketCount}</span>
                      </div>
                      <div className="text-sm text-gray-700">
                        Total tickets: <span className="font-medium">{selectedAdminUser.totalTicketCount}</span>
                      </div>
                      {selectedAdminUser.latestTicket && (
                        <div className="text-xs text-gray-600">
                          Latest priority: <span className="font-medium">{selectedAdminUser.latestTicket.priority}</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="text-sm font-semibold text-gray-900">Connectivity</div>
                      <div className="flex gap-2">
                        {selectedAdminUser.twilioConnected ? <Badge variant="outline">Twilio</Badge> : <Badge variant="secondary">Twilio off</Badge>}
                        {selectedAdminUser.metaConnected ? <Badge variant="outline">Meta</Badge> : <Badge variant="secondary">Meta off</Badge>}
                      </div>
                    </div>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      AI Brain / usage / Stripe IDs aren’t included in the current `/api/admin/users` payload. This panel is ready to display them once the endpoint includes those fields.
                    </div>
                  </div>
                )}
                <SheetFooter>
                  <Button variant="outline" onClick={() => setSelectedAdminUser(null)}>
                    Close
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </TabsContent>

          <TabsContent value="partners">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="font-semibold text-gray-900">Partner Program</h2>
                <Button 
                  onClick={() => setIsAddingPartner(true)}
                  className="bg-brand-green hover:bg-brand-dark min-h-[44px] min-w-[44px] touch-manipulation"
                  size="default"
                  data-testid="button-add-partner"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Add Partner
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Ref Code</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Referrals</TableHead>
                    <TableHead>Earnings</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                        No partners yet. Add your first partner to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    partners.map(partner => (
                      <TableRow key={partner.id} data-testid={`row-partner-${partner.id}`}>
                        <TableCell className="font-medium">{partner.name}</TableCell>
                        <TableCell>
                          <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                            {partner.refCode}
                          </code>
                        </TableCell>
                        <TableCell>{partner.email}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Percent className="h-3 w-3 text-gray-400" />
                            {partner.commissionRate}
                          </div>
                        </TableCell>
                        <TableCell>{partner.commissionDurationMonths}mo</TableCell>
                        <TableCell>{partner.totalReferrals || 0}</TableCell>
                        <TableCell className="text-green-600 font-medium">
                          ${parseFloat(partner.totalEarnings || '0').toFixed(2)}
                        </TableCell>
                        <TableCell>
                          {partner.status === 'active' ? (
                            <Badge className="bg-green-100 text-green-700">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Paused</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-[44px] min-w-[44px]"
                              onClick={() => setEditingPartner(partner)}
                              data-testid={`button-edit-partner-${partner.id}`}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="min-h-[44px] min-w-[44px] text-amber-600 hover:text-amber-700"
                              onClick={() => {
                                if (confirm('Deactivate this partner? They will no longer earn new commissions, but existing commission history will be preserved.')) {
                                  deletePartner.mutate(partner.id);
                                }
                              }}
                              data-testid={`button-deactivate-partner-${partner.id}`}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="ghl">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">LeadConnector / GHL Integrations</h2>
                <p className="text-sm text-gray-500 mt-1">Users who connected via the GHL Marketplace</p>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Connected</TableHead>
                      <TableHead>Location ID</TableHead>
                      <TableHead>Company ID</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Token Expires</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ghlIntegrations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                          No LeadConnector integrations found yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      ghlIntegrations.map(ghl => (
                        <TableRow key={ghl.id} data-testid={`row-ghl-${ghl.id}`}>
                          <TableCell className="font-medium">{ghl.userName}</TableCell>
                          <TableCell className="text-sm">{ghl.userEmail}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {ghl.userPlan}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {ghl.isActive ? (
                              <Badge className="bg-green-100 text-green-700">Connected</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-gray-500">Disconnected</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {ghl.installedAt ? new Date(ghl.installedAt).toLocaleDateString() : '—'}
                          </TableCell>
                          <TableCell>
                            {ghl.locationId ? (
                              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{ghl.locationId}</code>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            {ghl.companyId ? (
                              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{ghl.companyId}</code>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm capitalize">{ghl.userType || '—'}</TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {ghl.tokenExpiresAt ? (
                              <span className={new Date(ghl.tokenExpiresAt) < new Date() ? 'text-red-600 font-medium' : ''}>
                                {new Date(ghl.tokenExpiresAt).toLocaleDateString()}
                              </span>
                            ) : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Sheet open={isAddingPartner} onOpenChange={(open) => {
          setIsAddingPartner(open);
          if (!open) setAddPartnerError("");
        }}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle>Add Partner</SheetTitle>
          </SheetHeader>
          {addPartnerError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {addPartnerError}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-partner-name">Name</Label>
              <Input
                id="new-partner-name"
                value={newPartner.name}
                onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })}
                placeholder="Partner Name"
                className="text-base"
                data-testid="input-partner-name"
              />
            </div>
            <div>
              <Label htmlFor="new-partner-email">Email</Label>
              <Input
                id="new-partner-email"
                type="email"
                value={newPartner.email}
                onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                placeholder="partner@example.com"
                className="text-base"
                data-testid="input-partner-email"
              />
            </div>
            <div>
              <Label htmlFor="new-partner-password">Password</Label>
              <Input
                id="new-partner-password"
                type="password"
                value={newPartner.password}
                onChange={(e) => setNewPartner({ ...newPartner, password: e.target.value })}
                placeholder="Set a password for portal access"
                className="text-base"
                data-testid="input-partner-password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="new-partner-rate">Commission Rate (%)</Label>
                <Input
                  id="new-partner-rate"
                  value={newPartner.commissionRate}
                  onChange={(e) => setNewPartner({ ...newPartner, commissionRate: e.target.value })}
                  placeholder="20.00"
                  className="text-base"
                  data-testid="input-partner-rate"
                />
              </div>
              <div>
                <Label htmlFor="new-partner-duration">Duration (months)</Label>
                <Input
                  id="new-partner-duration"
                  type="number"
                  value={newPartner.commissionDurationMonths}
                  onChange={(e) => setNewPartner({ ...newPartner, commissionDurationMonths: parseInt(e.target.value) || 6 })}
                  placeholder="6"
                  className="text-base"
                  data-testid="input-partner-duration"
                />
              </div>
            </div>
          </div>
          <SheetFooter className="pt-6">
            <Button
              onClick={() => createPartner.mutate(newPartner)}
              disabled={createPartner.isPending}
              className="w-full bg-brand-green hover:bg-brand-dark min-h-[48px]"
              data-testid="button-submit-partner"
            >
              {createPartner.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Partner'
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!editingPartner} onOpenChange={(open) => !open && setEditingPartner(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Partner</DialogTitle>
          </DialogHeader>
          {editingPartner && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={editingPartner.name}
                  onChange={(e) => setEditingPartner({ ...editingPartner, name: e.target.value })}
                  data-testid="input-edit-partner-name"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={editingPartner.email}
                  onChange={(e) => setEditingPartner({ ...editingPartner, email: e.target.value })}
                  data-testid="input-edit-partner-email"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Commission Rate (%)</Label>
                  <Input
                    value={editingPartner.commissionRate}
                    onChange={(e) => setEditingPartner({ ...editingPartner, commissionRate: e.target.value })}
                    data-testid="input-edit-partner-rate"
                  />
                </div>
                <div>
                  <Label>Duration (months)</Label>
                  <Input
                    type="number"
                    value={editingPartner.commissionDurationMonths}
                    onChange={(e) => setEditingPartner({ ...editingPartner, commissionDurationMonths: parseInt(e.target.value) || 6 })}
                    data-testid="input-edit-partner-duration"
                  />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant={editingPartner.status === 'active' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditingPartner({ ...editingPartner, status: 'active' })}
                  >
                    Active
                  </Button>
                  <Button
                    variant={editingPartner.status === 'paused' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditingPartner({ ...editingPartner, status: 'paused' })}
                  >
                    Paused
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPartner(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingPartner) {
                  updatePartner.mutate({
                    id: editingPartner.id,
                    name: editingPartner.name,
                    email: editingPartner.email,
                    commissionRate: editingPartner.commissionRate,
                    commissionDurationMonths: editingPartner.commissionDurationMonths,
                    status: editingPartner.status,
                  });
                }
              }}
              disabled={updatePartner.isPending}
              className="bg-brand-green hover:bg-brand-dark"
              data-testid="button-save-partner"
            >
              {updatePartner.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={isAddingPerson} onOpenChange={(open) => {
          setIsAddingPerson(open);
          if (!open) setAddError("");
        }}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle>Add Salesperson</SheetTitle>
          </SheetHeader>
          {addError && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {addError}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-name">Name</Label>
              <Input
                id="new-name"
                value={newPerson.name}
                onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                placeholder="John Smith"
                className="text-base"
              />
            </div>
            <div>
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={newPerson.email}
                onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })}
                placeholder="john@company.com"
                className="text-base"
              />
            </div>
            <div>
              <Label htmlFor="new-phone">Phone (optional)</Label>
              <Input
                id="new-phone"
                type="tel"
                value={newPerson.phone}
                onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })}
                placeholder="+1 (555) 123-4567"
                className="text-base"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 pt-6">
            <button 
              type="button"
              disabled={!newPerson.name || !newPerson.email || createSalesperson.isPending}
              onClick={async () => {
                try {
                  await createSalesperson.mutateAsync(newPerson);
                } catch (err: any) {
                  console.error('Create salesperson error:', err);
                }
              }}
              className="bg-brand-green hover:bg-brand-dark text-white w-full min-h-[52px] text-base font-medium rounded-md disabled:opacity-50"
              data-testid="button-submit-salesperson"
            >
              {createSalesperson.isPending ? "Adding..." : "Add Salesperson"}
            </button>
            <button 
              type="button"
              onClick={() => setIsAddingPerson(false)}
              className="border border-gray-300 bg-white w-full min-h-[52px] text-base font-medium rounded-md"
            >
              Cancel
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={!!editingPerson} onOpenChange={() => setEditingPerson(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Salesperson</DialogTitle>
          </DialogHeader>
          {editingPerson && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input
                  id="edit-name"
                  value={editingPerson.name}
                  onChange={(e) => setEditingPerson({ ...editingPerson, name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingPerson.email}
                  onChange={(e) => setEditingPerson({ ...editingPerson, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={editingPerson.phone || ''}
                  onChange={(e) => setEditingPerson({ ...editingPerson, phone: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editingPerson.isActive}
                  onChange={(e) => setEditingPerson({ ...editingPerson, isActive: e.target.checked })}
                />
                <Label htmlFor="edit-active">Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPerson(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (editingPerson) {
                  updateSalesperson.mutate({
                    id: editingPerson.id,
                    name: editingPerson.name,
                    email: editingPerson.email,
                    phone: editingPerson.phone,
                    isActive: editingPerson.isActive
                  });
                }
              }}
              className="bg-brand-green hover:bg-brand-dark"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
