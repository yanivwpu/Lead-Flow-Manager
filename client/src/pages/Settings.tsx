import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Shield, LogOut, Phone, Plus, Trash2, Loader2, CreditCard, ExternalLink, Zap, CheckCircle2, XCircle, MessageSquare, Copy, Check, AlertTriangle, Users, UserPlus, Crown, Clock, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "wouter";
import { UpgradeModal, type UpgradeReason } from "@/components/UpgradeModal";
import { ConnectTwilioWizard } from "@/components/ConnectTwilioWizard";
import { cn } from "@/lib/utils";

interface TeamMember {
  id: string;
  ownerId: string;
  memberId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
  invitedAt: string;
  joinedAt: string | null;
}

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
  const [connectTwilioOpen, setConnectTwilioOpen] = useState(false);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [statusCopied, setStatusCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${baseUrl}/api/webhook/twilio/incoming`;
  const statusCallbackUrl = `${baseUrl}/api/webhook/twilio/status`;

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setWebhookCopied(true);
    setTimeout(() => setWebhookCopied(false), 2000);
  };

  const handleCopyStatus = async () => {
    await navigator.clipboard.writeText(statusCallbackUrl);
    setStatusCopied(true);
    setTimeout(() => setStatusCopied(false), 2000);
  };

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

  // Fetch Twilio connection status
  const { data: twilioStatus, isLoading: twilioLoading } = useQuery<{ connected: boolean; whatsappNumber: string | null }>({
    queryKey: ["/api/twilio/status"],
  });

  // Disconnect Twilio mutation
  const disconnectTwilioMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/twilio/disconnect", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/status"] });
      toast({ title: "WhatsApp Disconnected", description: "Your Twilio account has been disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Twilio", variant: "destructive" });
    },
  });

  // Fetch registered phones
  const { data: phones = [], isLoading: phonesLoading } = useQuery<RegisteredPhone[]>({
    queryKey: ["/api/phones"],
  });

  // Fetch subscription data
  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
  });

  // Fetch team members
  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

  // Invite team member mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; name?: string }) => {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to invite team member");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      setInviteEmail("");
      setInviteName("");
      toast({ title: "Invitation Sent", description: "Team member has been invited." });
    },
    onError: (error: Error) => {
      if (error.message.includes("Upgrade")) {
        setUpgradeReason("add_team_member");
        setUpgradeModalOpen(true);
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
    },
  });

  // Remove team member mutation
  const removeMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/team/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to remove team member");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Removed", description: "Team member has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove team member", variant: "destructive" });
    },
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
           
           {/* WhatsApp Connection Section - Most Important */}
           <div className={cn(
             "bg-white border rounded-xl p-4 sm:p-6 shadow-sm",
             twilioStatus?.connected ? "border-gray-200" : "border-slate-300 bg-slate-50"
           )}>
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className={cn(
                 "h-9 w-9 sm:h-10 sm:w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                 twilioStatus?.connected ? "bg-green-50" : "bg-slate-100"
               )}>
                 <MessageSquare className={cn(
                   "h-4 w-4 sm:h-5 sm:w-5",
                   twilioStatus?.connected ? "text-emerald-600" : "text-slate-600"
                 )} />
               </div>
               <div className="min-w-0 flex-1">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900" data-testid="text-whatsapp-connection-title">
                   WhatsApp Connection
                 </h2>
                 <p className="text-xs sm:text-sm text-gray-500">
                   {twilioStatus?.connected 
                     ? "Your Twilio account is connected and ready to send/receive messages."
                     : "Connect your Twilio account to start messaging."}
                 </p>
               </div>
               {twilioStatus?.connected ? (
                 <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
               ) : (
                 <XCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
               )}
             </div>

             {twilioLoading ? (
               <div className="flex items-center justify-center py-4">
                 <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
               </div>
             ) : twilioStatus?.connected ? (
               <div className="space-y-4">
                 <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-emerald-100">
                   <div className="flex items-center gap-3">
                     <Phone className="h-4 w-4 text-emerald-600" />
                     <span className="font-mono text-sm text-green-800">{twilioStatus.whatsappNumber}</span>
                   </div>
                   <span className="text-xs text-emerald-600 font-medium">Connected</span>
                 </div>
                 
                 {/* Webhook Configuration Reminder */}
                 <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                   <div className="flex items-start gap-3 mb-3">
                     <AlertTriangle className="h-4 w-4 text-slate-600 mt-0.5 flex-shrink-0" />
                     <div>
                       <p className="text-sm font-medium text-slate-900">Not receiving messages?</p>
                       <p className="text-xs text-slate-700 mt-1">
                         Make sure you've configured both webhook URLs in your Twilio Console.
                       </p>
                     </div>
                   </div>
                   
                   <div className="space-y-3">
                     <div className="space-y-1">
                       <Label className="text-xs text-slate-800">When a message comes in:</Label>
                       <div className="flex items-center gap-2">
                         <Input 
                           value={webhookUrl} 
                           readOnly 
                           className="font-mono text-xs bg-white border-slate-300"
                           data-testid="input-webhook-url-settings"
                         />
                         <Button 
                           variant="outline" 
                           size="icon" 
                           onClick={handleCopyWebhook}
                           className="flex-shrink-0 border-slate-300 hover:bg-slate-100"
                           data-testid="button-copy-webhook-settings"
                         >
                           {webhookCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-600" />}
                         </Button>
                       </div>
                     </div>
                     
                     <div className="space-y-1">
                       <Label className="text-xs text-slate-800">Status callback URL:</Label>
                       <div className="flex items-center gap-2">
                         <Input 
                           value={statusCallbackUrl} 
                           readOnly 
                           className="font-mono text-xs bg-white border-slate-300"
                           data-testid="input-status-url-settings"
                         />
                         <Button 
                           variant="outline" 
                           size="icon" 
                           onClick={handleCopyStatus}
                           className="flex-shrink-0 border-slate-300 hover:bg-slate-100"
                           data-testid="button-copy-status-settings"
                         >
                           {statusCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4 text-slate-600" />}
                         </Button>
                       </div>
                     </div>
                   </div>
                   
                   <a
                     href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                     target="_blank"
                     rel="noopener noreferrer"
                     className="inline-flex items-center gap-1 mt-3 text-xs text-slate-800 hover:text-slate-900 underline"
                   >
                     Open Twilio Sandbox Settings <ExternalLink className="h-3 w-3" />
                   </a>
                </div>

                {/* Business Profile Section */}
                <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex items-start gap-3 mb-3">
                    <Building2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-emerald-900">Business Profile</p>
                      <p className="text-xs text-emerald-700 mt-1">
                        Your business name, logo, and description that customers see on WhatsApp are managed in your Twilio Console.
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-emerald-300 rounded-lg text-sm text-emerald-700 hover:bg-emerald-50 transition-colors"
                    data-testid="link-whatsapp-profile"
                  >
                    <span>Customize Your WhatsApp Business Profile</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                 </div>
                 
                 <Button 
                   variant="outline" 
                   size="sm"
                   onClick={() => disconnectTwilioMutation.mutate()}
                   disabled={disconnectTwilioMutation.isPending}
                   className="text-red-600 hover:text-red-700 hover:bg-red-50"
                   data-testid="button-disconnect-twilio"
                 >
                   {disconnectTwilioMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   Disconnect
                 </Button>
               </div>
             ) : (
               <div className="space-y-4">
                 <p className="text-sm text-slate-800">
                   You need to connect your Twilio account before you can send or receive WhatsApp messages.
                 </p>
                 <Button 
                   onClick={() => setConnectTwilioOpen(true)}
                   className="bg-brand-green hover:bg-brand-green/90"
                   data-testid="button-connect-twilio"
                 >
                   Connect Twilio Account
                 </Button>
               </div>
             )}
           </div>

           {/* Profile Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <Users className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
               </div>
               <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900">Your Profile</h2>
                 <p className="text-xs sm:text-sm text-gray-500">Customize how you appear to your team.</p>
               </div>
             </div>

             <div className="flex items-center gap-4">
               <div className="relative">
                 {user?.avatarUrl ? (
                   <img 
                     src={user.avatarUrl} 
                     alt={user.name || 'Profile'} 
                     className="h-16 w-16 rounded-full object-cover"
                   />
                 ) : (
                   <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xl font-bold">
                     {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                   </div>
                 )}
                 <label 
                   htmlFor="avatar-upload"
                   className="absolute -bottom-1 -right-1 h-7 w-7 bg-emerald-600 hover:bg-emerald-700 rounded-full flex items-center justify-center cursor-pointer transition-colors shadow-sm"
                 >
                   <Plus className="h-4 w-4 text-white" />
                   <input
                     id="avatar-upload"
                     type="file"
                     accept="image/*"
                     className="hidden"
                     onChange={async (e) => {
                       const file = e.target.files?.[0];
                       if (!file) return;
                       
                       if (file.size > 500000) {
                         toast({
                           title: "Image too large",
                           description: "Please use an image under 500KB",
                           variant: "destructive"
                         });
                         return;
                       }
                       
                       const reader = new FileReader();
                       reader.onload = async (event) => {
                         const dataUrl = event.target?.result as string;
                         try {
                           const res = await fetch('/api/users/avatar', {
                             method: 'PATCH',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ avatarUrl: dataUrl }),
                             credentials: 'include'
                           });
                           if (res.ok) {
                             toast({
                               title: "Avatar updated",
                               description: "Your profile picture has been updated"
                             });
                             window.location.reload();
                           } else {
                             const data = await res.json();
                             toast({
                               title: "Upload failed",
                               description: data.error || "Failed to update avatar",
                               variant: "destructive"
                             });
                           }
                         } catch (err) {
                           toast({
                             title: "Upload failed",
                             description: "Failed to update avatar",
                             variant: "destructive"
                           });
                         }
                       };
                       reader.readAsDataURL(file);
                     }}
                     data-testid="input-avatar-upload"
                   />
                 </label>
               </div>
               <div>
                 <p className="font-medium text-gray-900">{user?.name}</p>
                 <p className="text-sm text-gray-500">{user?.email}</p>
                 <p className="text-xs text-gray-400 mt-1">Click the + to upload a profile picture</p>
               </div>
             </div>
           </div>

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
                 <Phone className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
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
                   className="bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto"
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
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
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
                 <div className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg border border-slate-200">
                   <div className="flex items-center justify-between mb-2">
                     <span className="text-xs text-slate-700 uppercase font-semibold">Current Plan</span>
                     {subscriptionData?.subscription?.plan !== "free" && (
                       <span className="text-xs px-2 py-0.5 bg-slate-600 text-white rounded-full">
                         {subscriptionData?.subscription?.status === "active" ? "Active" : subscriptionData?.subscription?.status}
                       </span>
                     )}
                   </div>
                   <p className="text-2xl font-bold text-slate-800" data-testid="text-current-plan">
                     {PLAN_NAMES[subscriptionData?.subscription?.plan || "free"] || "Free"}
                   </p>
                   {subscriptionData?.subscription?.currentPeriodEnd && (
                     <p className="text-sm text-slate-600 mt-1">
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
                     <Button className="w-full bg-brand-green hover:bg-emerald-700 text-sm sm:text-base" data-testid="button-view-plans">
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

           {/* Team Members Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-4 sm:mb-6">
               <div className="h-9 w-9 sm:h-10 sm:w-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                 <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
               </div>
               <div className="min-w-0">
                 <h2 className="text-base sm:text-lg font-bold text-gray-900">Team Members</h2>
                 <p className="text-xs sm:text-sm text-gray-500">Manage your team and invite new members.</p>
               </div>
             </div>

             {teamLoading ? (
               <div className="flex justify-center py-4">
                 <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
               </div>
             ) : (
               <div className="space-y-4">
                 {/* Team member list */}
                 <div className="space-y-2">
                   {teamMembers.map((member) => (
                     <div 
                       key={member.id} 
                       className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                       data-testid={`team-member-${member.id}`}
                     >
                       <div className="flex items-center gap-3 min-w-0">
                         <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                           {member.role === "owner" ? (
                             <Crown className="h-4 w-4 text-blue-600" />
                           ) : (
                             <span className="text-sm font-medium text-blue-600">
                               {(member.name || member.email)[0].toUpperCase()}
                             </span>
                           )}
                         </div>
                         <div className="min-w-0">
                           <div className="flex items-center gap-2">
                             <p className="font-medium text-gray-900 truncate">
                               {member.name || member.email.split("@")[0]}
                             </p>
                             {member.role === "owner" && (
                               <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">Owner</span>
                             )}
                             {member.status === "pending" && (
                               <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded flex items-center gap-1">
                                 <Clock className="h-3 w-3" /> Pending
                               </span>
                             )}
                           </div>
                           <p className="text-xs text-gray-500 truncate">{member.email}</p>
                         </div>
                       </div>
                       {member.role !== "owner" && (
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={() => removeMemberMutation.mutate(member.id)}
                           disabled={removeMemberMutation.isPending}
                           className="text-red-500 hover:text-red-700 hover:bg-red-50"
                           data-testid={`button-remove-member-${member.id}`}
                         >
                           <Trash2 className="h-4 w-4" />
                         </Button>
                       )}
                     </div>
                   ))}
                 </div>

                 {/* Invite form - only show if under limit */}
                 {(subscriptionData?.limits.usersLimit || 1) > teamMembers.length ? (
                   <div className="pt-2 border-t border-gray-200">
                     <p className="text-sm font-medium text-gray-700 mb-2">Invite a team member</p>
                     <div className="flex flex-col sm:flex-row gap-2">
                       <Input
                         type="email"
                         placeholder="Email address"
                         value={inviteEmail}
                         onChange={(e) => setInviteEmail(e.target.value)}
                         className="flex-1"
                         data-testid="input-invite-email"
                       />
                       <Input
                         type="text"
                         placeholder="Name (optional)"
                         value={inviteName}
                         onChange={(e) => setInviteName(e.target.value)}
                         className="flex-1 sm:max-w-[150px]"
                         data-testid="input-invite-name"
                       />
                       <Button
                         onClick={() => inviteMutation.mutate({ email: inviteEmail, name: inviteName || undefined })}
                         disabled={!inviteEmail || inviteMutation.isPending}
                         className="bg-blue-600 hover:bg-blue-700"
                         data-testid="button-invite-member"
                       >
                         {inviteMutation.isPending ? (
                           <Loader2 className="h-4 w-4 animate-spin" />
                         ) : (
                           <>
                             <UserPlus className="h-4 w-4 mr-1" /> Invite
                           </>
                         )}
                       </Button>
                     </div>
                   </div>
                 ) : (
                   <div className="pt-2 border-t border-gray-200">
                     <p className="text-sm text-gray-500 mb-2">
                       You've reached your team member limit ({subscriptionData?.limits.usersLimit}).
                     </p>
                     <Link href="/pricing">
                       <Button variant="outline" size="sm" data-testid="button-upgrade-team">
                         <Zap className="h-4 w-4 mr-1" /> Upgrade for more
                       </Button>
                     </Link>
                   </div>
                 )}
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
       
       <ConnectTwilioWizard
         open={connectTwilioOpen}
         onOpenChange={setConnectTwilioOpen}
       />
    </div>
  );
}
