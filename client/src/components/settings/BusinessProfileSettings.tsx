import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CheckCircle2, ExternalLink, Globe, Loader2, Upload } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import type { BusinessProfileResponse } from "@shared/businessProfileSchema";

async function readImageFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(`Please use an image under ${Math.round(maxBytes / 1_000_000)}MB`);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.includes(",") ? base64String.split(",")[1] : base64String;
      if (base64Content.length > 2_800_000) {
        reject(new Error("The processed image is too large. Please try a smaller file."));
        return;
      }
      resolve(base64String);
    };
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function profileInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  return (parts[0]?.charAt(0) || "W").toUpperCase();
}

export function BusinessProfileSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [publicPhone, setPublicPhone] = useState("");
  const [publicEmail, setPublicEmail] = useState("");
  const [publicWebsite, setPublicWebsite] = useState("");
  const [aboutText, setAboutText] = useState("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [publishListingsPublicly, setPublishListingsPublicly] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["/api/business-profile"],
    queryFn: async () => {
      const res = await fetch("/api/business-profile", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load business profile");
      return res.json() as Promise<BusinessProfileResponse>;
    },
  });

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setBusinessName(profile.businessName || "");
    setPublicPhone(profile.publicPhone || "");
    setPublicEmail(profile.publicEmail || "");
    setPublicWebsite(profile.publicWebsite || "");
    setAboutText(profile.aboutText || "");
    setCompanyLogo(profile.companyLogo);
    setAvatarPreview(profile.avatarUrl);
    setPublishListingsPublicly(profile.publishListingsPublicly === true);
  }, [profile]);

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string) => {
      const res = await fetch("/api/users/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to update avatar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      toast({ title: "Profile photo updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/business-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          businessName: businessName.trim() || null,
          publicPhone: publicPhone.trim() || null,
          publicEmail: publicEmail.trim() || null,
          publicWebsite: publicWebsite.trim() || null,
          aboutText: aboutText.trim() || null,
          companyLogo,
          publishListingsPublicly,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to save business profile");
      }
      return res.json() as Promise<BusinessProfileResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      toast({ title: "Business profile saved", description: "Public listing pages will use these details." });
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const handleAvatarChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await readImageFile(file, 2_000_000);
        setAvatarPreview(dataUrl);
        await updateAvatarMutation.mutateAsync(dataUrl);
      } catch (error) {
        toast({
          title: "Upload failed",
          description: error instanceof Error ? error.message : "Could not upload photo",
          variant: "destructive",
        });
      } finally {
        e.target.value = "";
      }
    },
    [updateAvatarMutation],
  );

  const handleLogoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFile(file, 2_000_000);
      setCompanyLogo(dataUrl);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Could not upload logo",
        variant: "destructive",
      });
    } finally {
      e.target.value = "";
    }
  }, []);

  const displayAvatar = avatarPreview || user?.avatarUrl || null;
  const initials = profileInitials(displayName || user?.name || "W");

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm" data-testid="business-profile-settings">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-indigo-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <Building2 className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">Business Profile</h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Public branding for listing flyers, share pages, and customer-facing content.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading business profile…
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Profile photo</Label>
              <div className="flex items-center gap-3">
                <div className="relative">
                  {displayAvatar ? (
                    <img src={displayAvatar} alt="" className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm" />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xl font-bold border-2 border-white shadow-sm">
                      {initials}
                    </div>
                  )}
                  {updateAvatarMutation.isPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div>
                  <Button type="button" variant="outline" size="sm" onClick={() => avatarInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload photo
                  </Button>
                  <input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </div>
              </div>
            </div>

            <div className="space-y-2 flex-1">
              <Label className="text-sm font-medium">Company logo</Label>
              <div className="flex items-center gap-3">
                {companyLogo ? (
                  <img src={companyLogo} alt="" className="h-12 max-w-[140px] object-contain border border-gray-100 rounded-md p-1 bg-white" />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-slate-100 flex items-center justify-center text-slate-500 text-sm font-bold">W</div>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload logo
                </Button>
                {companyLogo && (
                  <Button type="button" variant="ghost" size="sm" className="text-gray-500" onClick={() => setCompanyLogo(null)}>
                    Remove
                  </Button>
                )}
                <input ref={logoInputRef} type="file" className="hidden" accept="image/*" onChange={handleLogoChange} />
              </div>
              <p className="text-xs text-gray-500">Shown on public listing page headers. W logo is used if none is uploaded.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bp-display-name">Display name</Label>
              <Input id="bp-display-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={user?.name || "Your name"} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-business-name">Company / Brokerage / Agency</Label>
              <Input id="bp-business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Summit Realty" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-phone">Phone</Label>
              <Input id="bp-phone" value={publicPhone} onChange={(e) => setPublicPhone(e.target.value)} placeholder="+1 555-0100" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-email">Email</Label>
              <Input id="bp-email" type="email" value={publicEmail} onChange={(e) => setPublicEmail(e.target.value)} placeholder={user?.email || "you@agency.com"} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bp-website">Website</Label>
              <Input id="bp-website" value={publicWebsite} onChange={(e) => setPublicWebsite(e.target.value)} placeholder="https://yourcompany.com" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="bp-about">About</Label>
              <Textarea
                id="bp-about"
                value={aboutText}
                onChange={(e) => setAboutText(e.target.value)}
                placeholder="Optional about me / about us blurb"
                rows={3}
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-3" data-testid="publish-listings-publicly-toggle">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Globe className="h-4 w-4 text-indigo-600" />
                  Publish listings publicly
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Master switch for public /share listing pages. Each listing must also be published individually
                  and pass MLS internet-display rules before a share URL is live.
                </p>
              </div>
              <Switch
                checked={publishListingsPublicly}
                onCheckedChange={setPublishListingsPublicly}
                aria-label="Publish listings publicly"
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 space-y-2">
            <p className="text-sm font-medium text-gray-900">Schedule Showing (Calendly)</p>
            {profile?.calendlyConnected ? (
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p>
                    Connected
                    {profile.calendlyEventTypeName ? (
                      <> — <span className="font-medium">{profile.calendlyEventTypeName}</span></>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    This scheduling link is used automatically for &quot;Schedule Showing&quot; on public listing pages.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 space-y-2">
                <p>Connect Calendly to allow customers to book appointments directly.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/app/integrations">
                    Connect in Integrations
                    <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                  </Link>
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              className="bg-brand-green hover:bg-brand-dark"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid="button-save-business-profile"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Business Profile"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
