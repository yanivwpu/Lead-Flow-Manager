import { useState, useEffect } from "react";
import { Bell, Mail, Smartphone, Shield, LogOut, Phone, Plus, Trash2, Loader2, CreditCard, ExternalLink, Zap, CheckCircle2, XCircle, MessageSquare, Copy, Check, AlertTriangle, Users, UserPlus, Crown, Clock, Building2, FileText } from "lucide-react";
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
import { ConnectMetaWizard } from "@/components/ConnectMetaWizard";
import { ChannelSettings } from "@/components/ChannelSettings";
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
    isInTrial: boolean;
    trialDaysRemaining: number;
  };
  subscription: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

const DAYS_OF_WEEK = [
  { id: 0, label: "Sun" },
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
];

function AutoReplySettings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({
    businessHoursEnabled: false,
    businessHoursStart: "09:00",
    businessHoursEnd: "17:00",
    businessDays: [1, 2, 3, 4, 5],
    awayMessageEnabled: false,
    awayMessage: "Thanks for reaching out! We're currently away but will respond as soon as we're back.",
    autoReplyEnabled: false,
    autoReplyMessage: "Thanks for your message! We'll get back to you shortly.",
  });
  const [isSaving, setIsSaving] = useState(false);

  const { data: userSettings } = useQuery<any>({
    queryKey: ["/api/users/auto-reply-settings"],
  });

  useEffect(() => {
    if (userSettings) {
      setSettings({
        businessHoursEnabled: userSettings.businessHoursEnabled || false,
        businessHoursStart: userSettings.businessHoursStart || "09:00",
        businessHoursEnd: userSettings.businessHoursEnd || "17:00",
        businessDays: userSettings.businessDays || [1, 2, 3, 4, 5],
        awayMessageEnabled: userSettings.awayMessageEnabled || false,
        awayMessage: userSettings.awayMessage || "Thanks for reaching out! We're currently away but will respond as soon as we're back.",
        autoReplyEnabled: userSettings.autoReplyEnabled || false,
        autoReplyMessage: userSettings.autoReplyMessage || "Thanks for your message! We'll get back to you shortly.",
      });
    }
  }, [userSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/users/auto-reply-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
        credentials: "include",
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ["/api/users/auto-reply-settings"] });
      }
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
    setIsSaving(false);
  };

  const toggleDay = (dayId: number) => {
    setSettings(prev => ({
      ...prev,
      businessDays: prev.businessDays.includes(dayId)
        ? prev.businessDays.filter(d => d !== dayId)
        : [...prev.businessDays, dayId].sort((a, b) => a - b)
    }));
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-purple-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">Auto-Reply & Business Hours</h2>
          <p className="text-xs sm:text-sm text-gray-500">Automatically respond when you're away.</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <Label className="text-sm sm:text-base font-medium">Auto-Reply</Label>
            <p className="text-xs sm:text-sm text-gray-500">Send an instant reply when customers message you.</p>
          </div>
          <Switch 
            checked={settings.autoReplyEnabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, autoReplyEnabled: checked }))}
            className="flex-shrink-0"
            data-testid="switch-auto-reply"
          />
        </div>

        {settings.autoReplyEnabled && (
          <div className="pl-0 sm:pl-4 border-l-2 border-purple-100">
            <Label className="text-xs text-gray-500 mb-1 block">Auto-reply message</Label>
            <textarea
              value={settings.autoReplyMessage}
              onChange={(e) => setSettings(prev => ({ ...prev, autoReplyMessage: e.target.value }))}
              className="w-full h-20 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
              placeholder="Thanks for your message! We'll get back to you shortly."
              data-testid="textarea-auto-reply"
            />
          </div>
        )}

        <div className="h-px bg-gray-100" />

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <Label className="text-sm sm:text-base font-medium">Business Hours</Label>
            <p className="text-xs sm:text-sm text-gray-500">Set when you're available to respond.</p>
          </div>
          <Switch 
            checked={settings.businessHoursEnabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, businessHoursEnabled: checked }))}
            className="flex-shrink-0"
            data-testid="switch-business-hours"
          />
        </div>

        {settings.businessHoursEnabled && (
          <div className="pl-0 sm:pl-4 border-l-2 border-purple-100 space-y-4">
            <div className="flex flex-wrap gap-2">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.id}
                  onClick={() => toggleDay(day.id)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    settings.businessDays.includes(day.id)
                      ? "bg-purple-100 text-purple-700 border-purple-300"
                      : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                  data-testid={`button-day-${day.label.toLowerCase()}`}
                >
                  {day.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={settings.businessHoursStart}
                onChange={(e) => setSettings(prev => ({ ...prev, businessHoursStart: e.target.value }))}
                className="w-32"
                data-testid="input-hours-start"
              />
              <span className="text-gray-400">to</span>
              <Input
                type="time"
                value={settings.businessHoursEnd}
                onChange={(e) => setSettings(prev => ({ ...prev, businessHoursEnd: e.target.value }))}
                className="w-32"
                data-testid="input-hours-end"
              />
            </div>
          </div>
        )}

        <div className="h-px bg-gray-100" />

        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0 flex-1">
            <Label className="text-sm sm:text-base font-medium">Away Message</Label>
            <p className="text-xs sm:text-sm text-gray-500">Send a message when outside business hours.</p>
          </div>
          <Switch 
            checked={settings.awayMessageEnabled}
            onCheckedChange={(checked) => setSettings(prev => ({ ...prev, awayMessageEnabled: checked }))}
            className="flex-shrink-0"
            data-testid="switch-away-message"
          />
        </div>

        {settings.awayMessageEnabled && (
          <div className="pl-0 sm:pl-4 border-l-2 border-purple-100">
            <Label className="text-xs text-gray-500 mb-1 block">Away message</Label>
            <textarea
              value={settings.awayMessage}
              onChange={(e) => setSettings(prev => ({ ...prev, awayMessage: e.target.value }))}
              className="w-full h-20 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
              placeholder="Thanks for reaching out! We're currently away..."
              data-testid="textarea-away-message"
            />
          </div>
        )}

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
          data-testid="button-save-auto-reply"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Save Settings
        </Button>
      </div>
    </div>
  );
}

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
  const [connectMetaOpen, setConnectMetaOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [isUploading, setIsUploading] = useState(false);

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string) => {
      // For Replit environment, we'll try a different approach if standard fetch fails
      const fetchWithRetry = async (url: string, options: any, retries = 1) => {
        try {
          const res = await fetch(url, options);
          if (res.status === 401 && retries > 0) {
            // If unauthorized, try to refresh session once
            await fetch('/api/auth/me', { credentials: 'include' });
            return fetch(url, options);
          }
          return res;
        } catch (e) {
          if (retries > 0) return fetchWithRetry(url, options, retries - 1);
          throw e;
        }
      };

      const res = await fetchWithRetry("/api/users/avatar", {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ avatarUrl }),
        credentials: "include",
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "Failed to update avatar" }));
        throw new Error(error.error || "Failed to update avatar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Avatar Updated", description: "Your profile picture has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2000000) {
      toast({ title: "File too large", description: "Please use an image under 2MB", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Extract just the base64 part for size validation if it's a data URL
      const base64Content = base64String.includes(',') ? base64String.split(',')[1] : base64String;
      
      // Rough check for base64 size (4 chars = 3 bytes)
      if (base64Content.length > 2800000) {
        toast({ title: "File too large", description: "The processed image is too large. Please try a smaller file.", variant: "destructive" });
        setIsUploading(false);
        return;
      }
      
      updateAvatarMutation.mutate(base64String);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

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

  const { data: twilioStatus, isLoading: twilioLoading } = useQuery<{ connected: boolean; whatsappNumber: string | null }>({
    queryKey: ["/api/twilio/status"],
  });

  const { data: metaStatus, isLoading: metaLoading } = useQuery<{ connected: boolean; phoneNumber: string | null; activeProvider: string }>({
    queryKey: ["/api/meta/status"],
  });

  const switchProviderMutation = useMutation({
    mutationFn: async (provider: "twilio" | "meta") => {
      const res = await fetch("/api/whatsapp/switch-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to switch provider");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/status"] });
      toast({ title: "Provider Switched", description: "Your WhatsApp provider has been updated." });
    },
  });

  const disconnectTwilioMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/twilio/disconnect", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/twilio/status"] });
      toast({ title: "Twilio Disconnected", description: "Your Twilio account has been disconnected." });
    },
  });

  const disconnectMetaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/meta/disconnect", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/meta/status"] });
      toast({ title: "Meta Disconnected", description: "Your Meta account has been disconnected." });
    },
  });

  const { data: phones = [], isLoading: phonesLoading } = useQuery<RegisteredPhone[]>({
    queryKey: ["/api/phones"],
  });

  const { data: subscriptionData, isLoading: subscriptionLoading } = useQuery<SubscriptionData>({
    queryKey: ["/api/subscription"],
  });

  const { data: teamMembers = [], isLoading: teamLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
  });

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
  });

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
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ immediate: false }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to cancel subscription");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription"] });
      toast({ title: "Subscription Canceled", description: data.message });
    },
  });

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
  });

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
    if (typeof Notification === 'undefined') {
      toast({ title: "Not Supported", description: "Your browser doesn't support push notifications.", variant: "destructive" });
      return;
    }
    if (checked) {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        setPushEnabled(true);
        localStorage.setItem("chatcrm_push_enabled", "true");
      } else {
        setPushEnabled(false);
      }
    } else {
      setPushEnabled(false);
      localStorage.setItem("chatcrm_push_enabled", "false");
    }
  };

  const handleEmailToggle = (checked: boolean) => {
    setEmailEnabled(checked);
    localStorage.setItem("chatcrm_email_enabled", checked.toString());
  };

  return (
    <div className="flex-1 h-full bg-white flex flex-col overflow-hidden">
      <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-100 flex-shrink-0">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">Manage notifications and preferences.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
          
          {/* Communication Channels - First */}
          <ChannelSettings />

          {/* Auto-Reply & Business Hours */}
          <AutoReplySettings />

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
                  <p className="text-xs sm:text-sm text-gray-500">Receive alerts on your device.</p>
                </div>
                <Switch checked={pushEnabled} onCheckedChange={handlePushToggle} className="flex-shrink-0" />
              </div>
              <div className="h-px bg-gray-100" />
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0 flex-1">
                  <Label className="text-sm sm:text-base font-medium">Email Reminders</Label>
                  <p className="text-xs sm:text-sm text-gray-500">Get a daily summary sent to your inbox.</p>
                </div>
                <Switch checked={emailEnabled} onCheckedChange={handleEmailToggle} className="flex-shrink-0" />
              </div>
            </div>
          </div>

          {/* Team Members Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-900">Team Members</h2>
                <p className="text-xs sm:text-sm text-gray-500">Manage your team.</p>
              </div>
            </div>

            {teamLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  {teamMembers.map((member) => (
                    <div key={member.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          {member.role === "owner" ? (
                            <Crown className="h-4 w-4 text-blue-600" />
                          ) : (
                            <span className="text-sm font-medium text-blue-600">{(member.name || member.email)[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{member.name || member.email.split("@")[0]}</p>
                          <p className="text-xs text-gray-500 truncate">{member.email}</p>
                        </div>
                      </div>
                      {member.role !== "owner" && (
                        <Button variant="ghost" size="sm" onClick={() => removeMemberMutation.mutate(member.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Invite a team member</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input type="email" placeholder="Email address" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1" />
                    <Button onClick={() => inviteMutation.mutate({ email: inviteEmail, name: inviteName || undefined })} disabled={!inviteEmail || inviteMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                      {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="h-4 w-4 mr-1" /> Invite</>}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Subscription Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-slate-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-slate-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-900">Subscription</h2>
                <p className="text-xs sm:text-sm text-gray-500">Manage your plan and billing.</p>
              </div>
            </div>

            {subscriptionLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 bg-white rounded-xl border border-gray-200 flex flex-col h-full shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Crown className="h-4 w-4 text-blue-600" />
                    <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Current Plan</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 mb-1">{subscriptionData?.limits?.planName || "Free"}</p>
                  {subscriptionData?.subscription?.currentPeriodEnd && (
                    <p className="text-xs text-gray-400">
                      Next billing: {new Date(subscriptionData.subscription.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  )}
                  <div className="mt-auto pt-6">
                    <Link href="/pricing" className="w-full">
                      <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                        <Zap className="h-4 w-4 mr-2" />
                        {subscriptionData?.subscription?.plan === "free" ? "Upgrade Plan" : "View Plans"}
                      </Button>
                    </Link>
                  </div>
                </div>

                <div className="p-5 bg-white rounded-xl border border-gray-200 flex flex-col h-full shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard className="h-4 w-4 text-gray-400" />
                    <span className="text-xs text-gray-500 uppercase font-bold tracking-wider">Billing Portal</span>
                  </div>
                  <p className="text-base font-semibold text-gray-900 mb-1">Manage Subscription</p>
                  <p className="text-xs text-gray-500 mb-4">Update payment method or download invoices.</p>
                  
                  <div className="mt-auto pt-6">
                    {subscriptionData?.subscription?.plan !== "free" ? (
                      <Button 
                        variant="outline" 
                        className="w-full border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold"
                        onClick={() => portalMutation.mutate()} 
                        disabled={portalMutation.isPending}
                      >
                        {portalMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Manage in Stripe
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="w-full py-2.5 px-4 bg-gray-50 border border-gray-100 rounded-lg text-center text-xs text-gray-400 italic font-medium">
                        Subscription management available on paid plans
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Your Profile Section - Last */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4 sm:mb-6">
              <div className="h-9 w-9 sm:h-10 sm:w-10 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-gray-900">Your Profile</h2>
                <p className="text-xs sm:text-sm text-gray-500">Customize how you appear to your team.</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative group">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name || 'Profile'} className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xl font-bold border-2 border-white shadow-sm">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  {isUploading ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Smartphone className="h-5 w-5 text-white" />
                  )}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    disabled={isUploading}
                  />
                </label>
              </div>
              <div>
                <p className="font-medium text-gray-900">{user?.name}</p>
                <p className="text-sm text-gray-500">{user?.email}</p>
                <button 
                  onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-1"
                >
                  Change Photo
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
      
      <UpgradeModal open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen} reason={upgradeReason} currentPlan={subscriptionData?.limits?.plan} />
      <ConnectTwilioWizard open={connectTwilioOpen} onOpenChange={setConnectTwilioOpen} />
      <ConnectMetaWizard open={connectMetaOpen} onOpenChange={setConnectMetaOpen} />
    </div>
  );
}
