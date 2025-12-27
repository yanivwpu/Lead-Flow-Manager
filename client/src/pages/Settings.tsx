import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Shield, LogOut } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toast } from "@/hooks/use-toast";

export function Settings() {
  const { user } = useAuth();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [permission, setPermission] = useState(Notification.permission);

  useEffect(() => {
    // Load saved settings
    const savedPush = localStorage.getItem("chatcrm_push_enabled") === "true";
    const savedEmail = localStorage.getItem("chatcrm_email_enabled") === "true";
    setPushEnabled(savedPush && Notification.permission === "granted");
    setEmailEnabled(savedEmail);
  }, []);

  const handlePushToggle = async (checked: boolean) => {
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
