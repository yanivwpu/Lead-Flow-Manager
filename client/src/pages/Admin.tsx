import { useState, useEffect } from "react";
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
  AlertCircle, MessageCircle, ArrowUpDown, Link2, Percent
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
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
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
  const [editingPerson, setEditingPerson] = useState<Salesperson | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: "", email: "", phone: "" });
  const [addError, setAddError] = useState("");
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [isAddingPartner, setIsAddingPartner] = useState(false);
  const [newPartner, setNewPartner] = useState({ name: "", email: "", password: "", commissionRate: "20.00", commissionDurationMonths: 6 });
  const [addPartnerError, setAddPartnerError] = useState("");
  
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch('/api/admin/check')
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
        body: JSON.stringify({ password })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }

      setIsLoggedIn(true);
      setPassword("");
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    setIsLoggedIn(false);
  };

  const { data: salespeople = [] } = useQuery<Salesperson[]>({
    queryKey: ['/api/admin/salespeople'],
    enabled: isLoggedIn,
  });

  const { data: bookings = [] } = useQuery<Booking[]>({
    queryKey: ['/api/admin/bookings'],
    enabled: isLoggedIn,
  });

  const { data: conversions = [] } = useQuery<Conversion[]>({
    queryKey: ['/api/admin/conversions'],
    enabled: isLoggedIn,
  });

  const { data: roiStats } = useQuery<{ totalCost: number; totalRevenue: number; roi: number }>({
    queryKey: ['/api/admin/conversions/roi'],
    enabled: isLoggedIn,
  });

  const { data: adminUsers = [] } = useQuery<AdminUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: isLoggedIn,
  });

  const { data: partners = [] } = useQuery<Partner[]>({
    queryKey: ['/api/admin/partners'],
    enabled: isLoggedIn,
  });

  const [userSort, setUserSort] = useState<'date' | 'support' | 'plan'>('support');

  const createPartner = useMutation({
    mutationFn: async (data: { name: string; email: string; password: string; commissionRate?: string; commissionDurationMonths?: number }) => {
      const res = await fetch('/api/admin/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      setNewPartner({ name: "", email: "", password: "", commissionRate: "20.00", commissionDurationMonths: 6 });
      setAddPartnerError("");
    },
    onError: (error: Error) => {
      setAddPartnerError(error.message);
    }
  });

  const updatePartner = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Partner> & { id: string }) => {
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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
      const res = await fetch(`/api/admin/partners/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete partner');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/partners'] });
    }
  });

  const createSalesperson = useMutation({
    mutationFn: async (data: { name: string; email: string; phone?: string }) => {
      const res = await fetch('/api/admin/salespeople', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      const res = await fetch(`/api/admin/salespeople/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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
      const res = await fetch(`/api/admin/salespeople/${id}`, { method: 'DELETE' });
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
        body: JSON.stringify({ status })
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
      const res = await fetch(`/api/admin/conversions/${id}/paid`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Failed to mark as paid');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/conversions'] });
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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                required
                data-testid="input-admin-password"
              />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="h-5 w-5 text-blue-600" />
              </div>
              <span className="text-gray-600">Pending Demos</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{pendingBookings}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <span className="text-gray-600">Total Conversions</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{totalConversions}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-red-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-red-600" />
              </div>
              <span className="text-gray-600">Total Cost</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">${totalCost.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-gray-600">Total Revenue</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">${(roiStats?.totalRevenue || 0).toFixed(2)}</p>
            <p className="text-xs text-gray-500 mt-1">From converted users</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-gray-600">Conversion Rate</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{conversionRate}%</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-amber-600" />
              </div>
              <span className="text-gray-600">Revenue ROI</span>
            </div>
            <p className={`text-3xl font-bold ${(roiStats?.roi || 0) >= 100 ? 'text-green-600' : 'text-red-600'}`}>
              {(roiStats?.roi || 0).toFixed(0)}%
            </p>
            <p className="text-xs text-gray-500 mt-1">Revenue vs Commission</p>
          </div>
        </div>

        <Tabs defaultValue="salespeople" className="space-y-6">
          <TabsList>
            <TabsTrigger value="salespeople" className="gap-2">
              <Users className="h-4 w-4" />
              Salespeople
            </TabsTrigger>
            <TabsTrigger value="bookings" className="gap-2">
              <Calendar className="h-4 w-4" />
              Bookings
            </TabsTrigger>
            <TabsTrigger value="conversions" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Conversions
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <UserCircle className="h-4 w-4" />
              Users
              {adminUsers.filter(u => u.openTicketCount > 0).length > 0 && (
                <Badge variant="destructive" className="ml-1 px-1.5 py-0.5 text-xs">
                  {adminUsers.filter(u => u.openTicketCount > 0).length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="partners" className="gap-2" data-testid="tab-partners">
              <Link2 className="h-4 w-4" />
              Partners
            </TabsTrigger>
          </TabsList>

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
              <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="font-semibold text-gray-900">
                  All Users ({adminUsers.length})
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant={userSort === 'support' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUserSort('support')}
                    className={userSort === 'support' ? 'bg-brand-green hover:bg-brand-dark' : ''}
                  >
                    <AlertCircle className="h-4 w-4 mr-1" />
                    Support First
                  </Button>
                  <Button
                    variant={userSort === 'date' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUserSort('date')}
                    className={userSort === 'date' ? 'bg-brand-green hover:bg-brand-dark' : ''}
                  >
                    <ArrowUpDown className="h-4 w-4 mr-1" />
                    Date
                  </Button>
                  <Button
                    variant={userSort === 'plan' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setUserSort('plan')}
                    className={userSort === 'plan' ? 'bg-brand-green hover:bg-brand-dark' : ''}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    Plan
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Demo</TableHead>
                      <TableHead>Support</TableHead>
                      <TableHead>Connected</TableHead>
                      <TableHead>Signed Up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                          No users yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      [...adminUsers]
                        .sort((a, b) => {
                          if (userSort === 'support') {
                            if (a.openTicketCount > 0 && b.openTicketCount === 0) return -1;
                            if (b.openTicketCount > 0 && a.openTicketCount === 0) return 1;
                            return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
                          } else if (userSort === 'plan') {
                            const planOrder = { 'scale': 0, 'pro': 1, 'starter': 2, 'free': 3 };
                            const aOrder = planOrder[a.subscriptionPlan as keyof typeof planOrder] ?? 4;
                            const bOrder = planOrder[b.subscriptionPlan as keyof typeof planOrder] ?? 4;
                            return aOrder - bOrder;
                          }
                          return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
                        })
                        .map((user) => (
                          <TableRow 
                            key={user.id}
                            className={user.openTicketCount > 0 ? 'bg-red-50' : ''}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {user.avatarUrl ? (
                                  <img 
                                    src={user.avatarUrl} 
                                    alt="" 
                                    className="w-8 h-8 rounded-full"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                                    <UserCircle className="h-5 w-5 text-gray-500" />
                                  </div>
                                )}
                                <div>
                                  <div className="font-medium">{user.name || 'No name'}</div>
                                  <div className="text-sm text-gray-500">{user.email}</div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                {user.partnerName ? (
                                  <Badge className="bg-blue-100 text-blue-700">Partner</Badge>
                                ) : user.salespersonName ? (
                                  <Badge className="bg-purple-100 text-purple-700">Internal</Badge>
                                ) : (
                                  <Badge variant="secondary">Organic</Badge>
                                )}
                                {user.partnerName && (
                                  <span className="text-xs text-blue-600">{user.partnerName}</span>
                                )}
                                {user.salespersonName && (
                                  <span className="text-xs text-purple-600">{user.salespersonName}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge 
                                  variant={
                                    user.subscriptionPlan === 'scale' ? 'default' :
                                    user.subscriptionPlan === 'pro' ? 'default' :
                                    user.subscriptionPlan === 'starter' ? 'secondary' : 'outline'
                                  }
                                  className={
                                    user.subscriptionPlan === 'scale' ? 'bg-purple-600' :
                                    user.subscriptionPlan === 'pro' ? 'bg-brand-green' : ''
                                  }
                                >
                                  {user.subscriptionPlan || 'free'}
                                </Badge>
                                {user.subscriptionStatus && (
                                  <span className="text-xs text-gray-500">
                                    {user.subscriptionStatus}
                                  </span>
                                )}
                                {user.trialEndsAt && (
                                  <span className="text-xs text-amber-600">
                                    Trial ends: {new Date(user.trialEndsAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              {user.hasDemo ? (
                                <div className="flex flex-col gap-1">
                                  <Badge 
                                    variant={
                                      user.demoStatus === 'converted' ? 'default' :
                                      user.demoStatus === 'completed' ? 'secondary' :
                                      user.demoStatus === 'scheduled' ? 'outline' : 'destructive'
                                    }
                                    className={user.demoStatus === 'converted' ? 'bg-brand-green' : ''}
                                  >
                                    {user.demoStatus}
                                  </Badge>
                                  {user.demoDate && (
                                    <span className="text-xs text-gray-500">
                                      {new Date(user.demoDate).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {user.openTicketCount > 0 ? (
                                <div className="flex items-center gap-1">
                                  <Badge 
                                    variant={user.latestTicket?.priority === 'urgent' ? 'destructive' : 'default'}
                                    className={cn(
                                      "flex items-center gap-1",
                                      user.latestTicket?.priority === 'urgent' && 'bg-red-600',
                                      user.latestTicket?.priority === 'high' && 'bg-orange-500',
                                      user.latestTicket?.priority === 'normal' && 'bg-amber-500',
                                      user.latestTicket?.priority === 'low' && 'bg-gray-400'
                                    )}
                                  >
                                    <MessageCircle className="h-3 w-3" />
                                    {user.openTicketCount} open
                                  </Badge>
                                  {user.latestTicket && (
                                    <Badge 
                                      variant="outline" 
                                      className={cn(
                                        "text-xs ml-1",
                                        user.latestTicket.priority === 'urgent' && 'border-red-500 text-red-600',
                                        user.latestTicket.priority === 'high' && 'border-orange-500 text-orange-600',
                                        user.latestTicket.priority === 'normal' && 'border-amber-500 text-amber-600',
                                        user.latestTicket.priority === 'low' && 'border-gray-400 text-gray-500'
                                      )}
                                    >
                                      {user.latestTicket.priority}
                                    </Badge>
                                  )}
                                </div>
                              ) : user.totalTicketCount > 0 ? (
                                <span className="text-gray-500 text-sm">
                                  {user.totalTicketCount} resolved
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                {user.twilioConnected && (
                                  <Badge variant="outline" className="text-xs">Twilio</Badge>
                                )}
                                {user.metaConnected && (
                                  <Badge variant="outline" className="text-xs">Meta</Badge>
                                )}
                                {!user.twilioConnected && !user.metaConnected && (
                                  <span className="text-gray-400">-</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-gray-600">
                                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
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
