import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Shield, LogOut, Phone, DollarSign, Plus, Trash2, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface RegisteredPhone {
  id: string;
  phoneNumber: string;
  businessName: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface UsageSummary {
  totalMessages: number;
  totalCost: string;
}

export function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [newPhone, setNewPhone] = useState("");
  const [businessName, setBusinessName] = useState("");

  // Fetch registered phones
  const { data: phones = [], isLoading: phonesLoading } = useQuery<RegisteredPhone[]>({
    queryKey: ["/api/phones"],
  });

  // Fetch usage summary
  const { data: usageSummary } = useQuery<UsageSummary>({
    queryKey: ["/api/usage/summary"],
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
    registerPhoneMutation.mutate({ phoneNumber: newPhone, businessName });
  };

  const handlePushToggle = async (checked: boolean) => {
    if (typeof Notification === 'undefined') {
      toast({
        title: "Not Supported",
        description: "Push notifications are not supported on this device.",
        variant: "destructive"
      });
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
      } else {
        setPushEnabled(false);
        toast({
          title: "Permission Denied",
          description: "Please enable notifications in your browser settings.",
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
    <div className="flex-1 h-full bg-white flex flex-col">
       <div className="p-8 pb-4 border-b border-gray-100">
         <h1 className="text-3xl font-display font-bold text-gray-900">Settings</h1>
         <p className="text-gray-500 mt-1">Manage notifications and preferences.</p>
       </div>

       <div className="flex-1 overflow-y-auto p-8">
         <div className="max-w-2xl space-y-8">
           
           {/* Notifications Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
               <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                 <Bell className="h-5 w-5 text-blue-600" />
               </div>
               <div>
                 <h2 className="text-lg font-bold text-gray-900">Notifications</h2>
                 <p className="text-sm text-gray-500">Choose how you want to be reminded.</p>
               </div>
             </div>

             <div className="space-y-6">
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label className="text-base font-medium">Push Notifications</Label>
                   <p className="text-sm text-gray-500">Receive alerts on your device for due follow-ups.</p>
                 </div>
                 <Switch 
                   checked={pushEnabled}
                   onCheckedChange={handlePushToggle}
                 />
               </div>
               
               <div className="h-px bg-gray-100" />

               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label className="text-base font-medium">Email Reminders</Label>
                   <p className="text-sm text-gray-500">Get a daily summary of tasks sent to your inbox.</p>
                 </div>
                 <Switch 
                    checked={emailEnabled}
                    onCheckedChange={handleEmailToggle}
                 />
               </div>
             </div>
           </div>

           {/* WhatsApp Phone Numbers Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
               <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center">
                 <Phone className="h-5 w-5 text-green-600" />
               </div>
               <div>
                 <h2 className="text-lg font-bold text-gray-900" data-testid="text-phones-title">WhatsApp Numbers</h2>
                 <p className="text-sm text-gray-500">Register your WhatsApp Business phone numbers.</p>
               </div>
             </div>

             <div className="space-y-4">
               {/* Add new phone form */}
               <div className="flex gap-2">
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
                   className="bg-green-600 hover:bg-green-700"
                   data-testid="button-register-phone"
                 >
                   {registerPhoneMutation.isPending ? (
                     <Loader2 className="h-4 w-4 animate-spin" />
                   ) : (
                     <Plus className="h-4 w-4" />
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

           {/* Billing & Usage Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
               <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center">
                 <DollarSign className="h-5 w-5 text-amber-600" />
               </div>
               <div>
                 <h2 className="text-lg font-bold text-gray-900" data-testid="text-billing-title">Billing & Usage</h2>
                 <p className="text-sm text-gray-500">Track your messaging costs.</p>
               </div>
             </div>

             <div className="grid grid-cols-2 gap-4">
               <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                 <span className="text-xs text-green-700 uppercase font-semibold">Total Messages</span>
                 <p className="text-2xl font-bold text-green-800 mt-1" data-testid="text-total-messages">
                   {usageSummary?.totalMessages || 0}
                 </p>
               </div>
               <div className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg border border-amber-200">
                 <span className="text-xs text-amber-700 uppercase font-semibold">Total Cost</span>
                 <p className="text-2xl font-bold text-amber-800 mt-1" data-testid="text-total-cost">
                   ${parseFloat(usageSummary?.totalCost || "0").toFixed(2)}
                 </p>
               </div>
             </div>

             <p className="text-xs text-gray-500 mt-4 text-center">
               View our <a href="/terms-of-use" target="_blank" className="text-brand-green hover:underline">Terms of Use</a> for pricing details.
             </p>
           </div>

           {/* Account Section */}
           <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
             <div className="flex items-center gap-3 mb-6">
               <div className="h-10 w-10 bg-gray-50 rounded-lg flex items-center justify-center">
                 <Shield className="h-5 w-5 text-gray-600" />
               </div>
               <div>
                 <h2 className="text-lg font-bold text-gray-900">Account</h2>
                 <p className="text-sm text-gray-500">Manage your profile and session.</p>
               </div>
             </div>

             <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <div className="p-3 bg-gray-50 rounded-lg">
                   <span className="text-xs text-gray-500 uppercase font-semibold">Name</span>
                   <p className="font-medium text-gray-900">{user?.name}</p>
                 </div>
                 <div className="p-3 bg-gray-50 rounded-lg">
                   <span className="text-xs text-gray-500 uppercase font-semibold">Email</span>
                   <p className="font-medium text-gray-900">{user?.email}</p>
                 </div>
               </div>
             </div>
           </div>

         </div>
       </div>
    </div>
  );
}
