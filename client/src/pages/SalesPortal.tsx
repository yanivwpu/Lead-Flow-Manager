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
import { 
  Calendar, DollarSign, CheckCircle, Clock, LogOut, Loader2, 
  User, Phone, Mail, ExternalLink
} from "lucide-react";

interface Demo {
  id: string;
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
  amount: string;
  paid: boolean;
  paidAt?: string;
  createdAt: string;
}

interface Stats {
  totalBookings: number;
  totalConversions: number;
  totalEarnings: string;
}

interface SalespersonInfo {
  id: string;
  name: string;
  email: string;
}

export function SalesPortal() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [salesperson, setSalesperson] = useState<SalespersonInfo | null>(null);
  const [email, setEmail] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch('/api/sales-portal/check')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) {
          setIsLoggedIn(true);
          setSalesperson(data.salesperson);
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
    } catch (err: any) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
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

  const pendingDemos = demos.filter(d => d.status === 'pending');
  const completedDemos = demos.filter(d => d.status !== 'pending');

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
            </div>

            <div>
              <Label htmlFor="loginCode">Login Code (6 digits)</Label>
              <Input
                id="loginCode"
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                data-testid="input-portal-code"
              />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending Demos ({pendingDemos.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle className="h-4 w-4" />
              Completed ({completedDemos.length})
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
                          <h3 className="font-medium text-gray-900">{demo.visitorName}</h3>
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

          <TabsContent value="earnings">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Commission History</h2>
                <p className="text-sm text-gray-500">$50 per converted demo</p>
              </div>
              {conversions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No conversions yet. Keep following up with your prospects!
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conversions.map((conv) => (
                      <TableRow key={conv.id}>
                        <TableCell>
                          {new Date(conv.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="font-medium">
                          ${parseFloat(conv.amount).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={conv.paid ? 'default' : 'outline'}>
                            {conv.paid ? 'Paid' : 'Pending'}
                          </Badge>
                          {conv.paid && conv.paidAt && (
                            <span className="text-xs text-gray-500 ml-2">
                              {new Date(conv.paidAt).toLocaleDateString()}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
