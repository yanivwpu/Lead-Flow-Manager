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
  LogOut, Loader2, CheckCircle, XCircle, Lock
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

export function Admin() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [editingPerson, setEditingPerson] = useState<Salesperson | null>(null);
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: "", email: "", phone: "" });
  
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
    },
    onError: (error: Error) => {
      alert('Error: ' + error.message);
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

  const totalEarnings = salespeople.reduce((sum, p) => sum + parseFloat(p.totalEarnings || '0'), 0);
  const totalConversions = salespeople.reduce((sum, p) => sum + (p.totalConversions || 0), 0);
  const pendingBookings = bookings.filter(b => b.status === 'pending').length;

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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
              <div className="h-10 w-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-gray-600">Total Earnings</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">${totalEarnings.toFixed(2)}</p>
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
        </Tabs>
      </main>

      <Sheet open={isAddingPerson} onOpenChange={setIsAddingPerson}>
        <SheetContent side="bottom" className="rounded-t-xl pb-8">
          <SheetHeader className="pb-4">
            <SheetTitle>Add Salesperson</SheetTitle>
          </SheetHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (newPerson.name && newPerson.email) {
              createSalesperson.mutate(newPerson);
            }
          }}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-name">Name</Label>
                <Input
                  id="new-name"
                  value={newPerson.name}
                  onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })}
                  placeholder="John Smith"
                  className="text-base"
                  required
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
                  required
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
              <Button 
                type="submit"
                disabled={createSalesperson.isPending}
                className="bg-brand-green hover:bg-brand-dark w-full min-h-[52px] text-base"
                data-testid="button-submit-salesperson"
              >
                {createSalesperson.isPending ? "Adding..." : "Add Salesperson"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setIsAddingPerson(false)}
                className="w-full min-h-[52px] text-base"
                type="button"
              >
                Cancel
              </Button>
            </div>
          </form>
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
