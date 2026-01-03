import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Shield, LogOut, Phone, Plus, Trash2, Loader2, CreditCard, ExternalLink, Zap } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { UpgradeModal, type UpgradeReason } from "@/components/UpgradeModal";

interface RegisteredPhone {
  id: string;
  phoneNumber: string;
  businessName: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface SubscriptionData {
  limits: {
    conversationsUsed: number;
    conversationsLimit: number;
    isLifetimeLimit: boolean;
    usersCount: number;
    usersLimit: number;
    maxWhatsappNumbers: number;
    planName: string;
    plan: string;
  };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  pro: "Pro",
};

export function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const searchString = useSearch();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [newPhone, setNewPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason>("add_whatsapp_number");
  const [syncingSubscription, setSyncingSubscription] = useState(false);

  // Auto-sync subscription when returning from Stripe checkout
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    if (params.get('subscription') === 'success') {
      setSyncingSubscription(true);
      fetch('/api/subscription/sync', { 
        method: 'POST', 
        credentials: 'include' 
      })
        .then(res => res.json())
        .then(data => {
          if (data.synced && data.plan !== 'free') {
            toast({
              title: "Subscription Activated!",
              description: `You're now on the ${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} plan.`,
            });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
          // Remove the query param from URL
          window.history.replaceState({}, '', '/app/settings');
        })
        .catch(err => {
          console.error('Sync error:', err);
        })
        .finally(() => {
          setSyncingSubscription(false);
        });
    }
  }, [searchString, queryClient]);

  // Fetch registered phones
  const { data: phones = [], isLoading: phonesLoading } = useQuery<RegisteredPhone[]>({
    queryKey: ["/api/phones"],
  });

  // Fetch subscription data
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
  });

  // Manage billing portal
  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/portal", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to open billing portal");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not open billing portal. Make sure you have an active subscription.",
        variant: "destructive",
      });
    },
  });

  // Register phone mutation
  const registerPhoneMutation = useMutation({
    mutationFn: async (data: { phoneNumber: string; businessName: string }) => {
      const res = await fetch("/api/phones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to register phone");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phones"] });
      setNewPhone("");
      setBusinessName("");
      toast({ title: "Phone Registered", description: "WhatsApp number added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
    },
  });

  // Delete phone mutation
  const deletePhoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/phones/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete phone");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/phones"] });
      toast({ title: "Phone Removed", description: "WhatsApp number removed." });
    },
  });

  useEffect(() => {
    // Load saved settings
    const savedPush = localStorage.getItem("chatcrm_push_enabled") === "true";
    const savedEmail = localStorage.getItem("chatcrm_email_enabled") === "true";
    const notificationGranted = typeof Notification !== 'undefined' && Notification.permission === "granted";
    setPushEnabled(savedPush && notificationGranted);
    setEmailEnabled(savedEmail);
  }, []);

  const handleRegisterPhone = () => {
    if (!newPhone.trim()) {
      toast({ title: "Error", description: "Please enter a phone number", variant: "destructive" });
      return;
    }
    
    const maxNumbers = subscriptionData?.limits?.maxWhatsappNumbers || 1;
    if (phones.length >= maxNumbers) {
      setUpgradeReason("add_whatsapp_number");
      setUpgradeModalOpen(true);
      return;
    }
    
    registerPhoneMutation.mutate({ phoneNumber: newPhone, businessName });
  };

  const handlePushToggle = async (checked: boolean) => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
    
    if (typeof Notification === 'undefined') {
      if (isIOS && !isStandalone) {
        toast({
          title: "Install App First",
          description: "On iPhone/iPad, tap Share > Add to Home Screen, then open from there to enable notifications.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Not Supported",
          description: "Your browser doesn't support push notifications. Try Chrome, Firefox, or Edge.",
          variant: "destructive"
        });
      }
      return;
    }
    
    if (checked) {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        setPushEnabled(true);
        localStorage.setItem("chatcrm_push_enabled", "true");
        new Notification("Notifications Enabled", {
          body: "You will now receive follow-up reminders.",
          icon: "/pwa-icon.png"
        });
      } else if (result === 'denied') {
        setPushEnabled(false);
        if (isIOS) {
          toast({
            title: "Permission Blocked",
            description: "Go to Settings > Notifications > Find this app and enable notifications.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Permission Blocked",
            description: "Click the lock icon in your browser's address bar to allow notifications.",
            variant: "destructive"
          });
        }
      } else {
        setPushEnabled(false);
        toast({
          title: "Permission Required",
          description: "Please allow notifications when prompted to receive reminders.",
          variant: "destructive"
        });
      }
    } else {
      setPushEnabled(false);
      localStorage.setItem("chatcrm_push_enabled", "false");
    }
  };

  const handleEmailToggle = (checked: boolean) => {
    setEmailEnabled(checked);
    localStorage.setItem("chatcrm_email_enabled", String(checked));
    if (checked) {
      toast({
        title: "Email Reminders Enabled",
        description: `Reminders will be sent to ${user?.email}`,
      });
    }
  };

  return (
    <div className="flex-1 h-full bg-white flex flex-col overflow-hidden">
       <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-100 flex-shrink-0">
         <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900">Settings</h1>
         <p className="text-gray-500 mt-1 text-sm sm:text-base">Manage notifications and preferences.</p>
       </div>

       <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
         <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
           
           {/* Notifications Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
               </div>
               <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900">Notifications</h2>
                 <p className="text-xs sm:text-sm text-gray-500">Choose how you want to be reminded.</p>
               </div>
             </div>

             <div className="space-y-4 sm:space-y-6">
               <div className="flex items-center justify-between gap-3">
                 <div className="space-y-0.5 min-w-0 flex-1">
                   <Label className="text-sm sm:text-base font-medium">Push Notifications</Label>
                   <p className="text-xs sm:text-sm text-gray-500">Receive alerts on your device for due follow-ups.</p>
                 </div>
                 <Switch 
                   checked={pushEnabled}
                   onCheckedChange={handlePushToggle}
                   className="flex-shrink-0"
                 />
               </div>
               
               <div className="h-px bg-gray-100" />

               <div className="flex items-center justify-between gap-3">
                 <div className="space-y-0.5 min-w-0 flex-1">
                   <Label className="text-sm sm:text-base font-medium">Email Reminders</Label>
                   <p className="text-xs sm:text-sm text-gray-500">Get a daily summary of tasks sent to your inbox.</p>
                 </div>
                 <Switch 
                    checked={emailEnabled}
                    onCheckedChange={handleEmailToggle}
                    className="flex-shrink-0"
                 />
               </div>
             </div>
           </div>

           {/* WhatsApp Phone Numbers Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
               </div>
               <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900" data-testid="text-phones-title">WhatsApp Numbers</h2>
                 <p className="text-xs sm:text-sm text-gray-500">Register your WhatsApp Business phone numbers.</p>
               </div>
             </div>

             <div className="space-y-4">
               {/* Add new phone form */}
               <div className="flex flex-col sm:flex-row gap-2">
                 <Input
                   placeholder="+1234567890"
                   value={newPhone}
                   onChange={(e) => setNewPhone(e.target.value)}
                   className="flex-1"
                   data-testid="input-phone-number"
                 />
                 <Input
                   placeholder="Business Name (optional)"
                   value={businessName}
                   onChange={(e) => setBusinessName(e.target.value)}
                   className="flex-1"
                   data-testid="input-business-name"
                 />
                 <Button 
                   onClick={handleRegisterPhone}
                   disabled={registerPhoneMutation.isPending}
                   className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                   data-testid="button-register-phone"
                 >
                   {registerPhoneMutation.isPending ? (
                     <Loader2 className="h-4 w-4 animate-spin" />
                   ) : (
                     <>
                       <Plus className="h-4 w-4 sm:mr-0 mr-2" />
                       <span className="sm:hidden">Add Number</span>
                     </>
                   )}
                 </Button>
               </div>

               {/* Registered phones list */}
               {phonesLoading ? (
                 <div className="flex justify-center py-4">
                   <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                 </div>
               ) : phones.length === 0 ? (
                 <p className="text-sm text-gray-500 text-center py-4" data-testid="text-no-phones">
                   No phone numbers registered yet.
                 </p>
               ) : (
                 <div className="space-y-2">
                   {phones.map((phone) => (
                     <div 
                       key={phone.id} 
                       className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                       data-testid={`card-phone-${phone.id}`}
                     >
                       <div>
                         <p className="font-medium text-gray-900" data-testid={`text-phone-number-${phone.id}`}>
                           {phone.phoneNumber.replace("whatsapp:", "")}
                         </p>
                         {phone.businessName && (
                           <p className="text-sm text-gray-500">{phone.businessName}</p>
                         )}
                       </div>
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => deletePhoneMutation.mutate(phone.id)}
                         disabled={deletePhoneMutation.isPending}
                         className="text-red-600 hover:text-red-700 hover:bg-red-50"
                         data-testid={`button-delete-phone-${phone.id}`}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>

           {/* Subscription Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
               </div>
               <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900" data-testid="text-subscription-title">Subscription</h2>
                 <p className="text-xs sm:text-sm text-gray-500">Manage your plan and billing.</p>
               </div>
             </div>

             {subscriptionLoading ? (
               <div className="flex justify-center py-8">
                 <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
               </div>
             ) : (
               <div className="space-y-4">
                 <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-xs text-purple-700 uppercase font-semibold">Current Plan</span>
                     {subscriptionData?.subscription?.plan !== "free" && (
                       <span className="text-xs px-2 py-0.5 bg-purple-600 text-white rounded-full">
                         {subscriptionData?.subscription?.status === "active" ? "Active" : subscriptionData?.subscription?.status}
                       </span>
                     )}
                   </div>
                   <p className="text-2xl font-bold text-purple-800" data-testid="text-current-plan">
                     {PLAN_NAMES[subscriptionData?.subscription?.plan || "free"] || "Free"}
                   </p>
                   {subscriptionData?.subscription?.currentPeriodEnd && (
                     <p className="text-sm text-purple-600 mt-1">
                       Renews {new Date(subscriptionData.subscription.currentPeriodEnd).toLocaleDateString()}
                     </p>
                   )}
                 </div>

                 <div className="grid grid-cols-2 gap-3 sm:gap-4">
                   <div className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                     <span className="text-xs text-gray-500 uppercase font-semibold">Conversations</span>
                     <p className="text-base sm:text-lg font-bold text-gray-900 mt-1" data-testid="text-conversations-usage">
                       {subscriptionData?.limits.conversationsUsed || 0} / {subscriptionData?.limits.conversationsLimit === null ? "∞" : subscriptionData?.limits.conversationsLimit}
                     </p>
                     <p className="text-xs text-gray-500">
                       {subscriptionData?.limits.isLifetimeLimit ? "Lifetime" : "This month"}
                     </p>
                   </div>
                   <div className="p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                     <span className="text-xs text-gray-500 uppercase font-semibold">Team Members</span>
                     <p className="text-base sm:text-lg font-bold text-gray-900 mt-1" data-testid="text-users-usage">
                       {subscriptionData?.limits.usersCount || 1} / {subscriptionData?.limits.usersLimit === null ? "∞" : subscriptionData?.limits.usersLimit}
                     </p>
                   </div>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-2">
                   <Link href="/pricing" className="flex-1">
                     <Button className="w-full bg-brand-green hover:bg-green-600 text-sm sm:text-base" data-testid="button-view-plans">
                       <Zap className="h-4 w-4 mr-2" />
                       {subscriptionData?.subscription?.plan === "free" ? "Upgrade Plan" : "View Plans"}
                     </Button>
                   </Link>
                   {subscriptionData?.subscription?.plan !== "free" && (
                     <Button
                       variant="outline"
                       onClick={() => portalMutation.mutate()}
                       disabled={portalMutation.isPending}
                       className="text-sm sm:text-base"
                       data-testid="button-manage-billing"
                     >
                       {portalMutation.isPending ? (
                         <Loader2 className="h-4 w-4 animate-spin" />
                       ) : (
                         <>
                           Manage Billing
                           <ExternalLink className="h-4 w-4 ml-2" />
                         </>
                       )}
                     </Button>
                   )}
                 </div>
               </div>
             )}
           </div>

           {/* Account Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
               </div>
               <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900">Account</h2>
                 <p className="text-xs sm:text-sm text-gray-500">Manage your profile and session.</p>
               </div>
             </div>

             <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                 <div className="p-3 bg-gray-50 rounded-lg overflow-hidden">
                   <span className="text-xs text-gray-500 uppercase font-semibold">Name</span>
                   <p className="font-medium text-gray-900 truncate">{user?.name}</p>
                 </div>
                 <div className="p-3 bg-gray-50 rounded-lg overflow-hidden">
                   <span className="text-xs text-gray-500 uppercase font-semibold">Email</span>
                   <p className="font-medium text-gray-900 truncate">{user?.email}</p>
                 </div>
               </div>
             </div>
           </div>

         </div>
       </div>
       
       <UpgradeModal
         open={upgradeModalOpen}
         onOpenChange={setUpgradeModalOpen}
         reason={upgradeReason}
         currentPlan={subscriptionData?.limits?.plan}
       />
    </div>
  );
}
