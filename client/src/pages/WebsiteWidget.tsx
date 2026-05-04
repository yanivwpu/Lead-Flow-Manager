import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { 
  Copy, Check, Smartphone, Monitor, MessageCircle,
  AlertCircle, Plus, Trash2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

export type WidgetTriggerType = "always" | "delay" | "scroll" | "exit_intent";

export interface WidgetPageRule {
  urlContains: string;
  greeting: string;
  prefilledMessage: string;
}

interface WidgetSettings {
  enabled: boolean;
  color: string;
  welcomeMessage: string;
  position: "right" | "left";
  showOnMobile: boolean;
  showOnDesktop: boolean;
  triggerType: WidgetTriggerType;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  pageRules: WidgetPageRule[];
}

const DEFAULT_PAGE_RULES: WidgetPageRule[] = [
  { urlContains: "/pricing", greeting: "Questions about pricing?", prefilledMessage: "Hi! I have a question about your pricing." },
  { urlContains: "/contact", greeting: "Let us get in touch", prefilledMessage: "Hi! I would like to get in touch." },
  { urlContains: "/services", greeting: "Tell us what you need", prefilledMessage: "Hi! I am interested in your services." },
];

const DEFAULT_SETTINGS: WidgetSettings = {
  enabled: true,
  color: "#25D366",
  welcomeMessage: "Hi there! How can we help you today?",
  position: "right",
  showOnMobile: true,
  showOnDesktop: true,
  triggerType: "always",
  triggerDelaySeconds: 5,
  triggerScrollPercent: 50,
  pageRules: DEFAULT_PAGE_RULES,
};

function mergeWidgetSettings(input: Partial<WidgetSettings> | undefined): WidgetSettings {
  if (!input || typeof input !== "object") return { ...DEFAULT_SETTINGS, pageRules: [...DEFAULT_PAGE_RULES] };
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    pageRules: Array.isArray(input.pageRules) ? input.pageRules : [...DEFAULT_PAGE_RULES],
  };
}

const COLOR_PRESETS = [
  { name: "WhatsApp Green", value: "#25D366" },
  { name: "Brand Green", value: "#10b981" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
];

function WidgetPreview({ settings }: { settings: WidgetSettings }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative w-full h-[200px] sm:h-[280px] md:h-[320px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg overflow-hidden border border-gray-200">
      <div className="absolute inset-2 sm:inset-3 bg-white rounded-md shadow-sm border flex flex-col">
        <div className="h-6 sm:h-8 bg-gray-50 border-b flex items-center px-2 gap-1">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-red-400" />
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-yellow-400" />
            <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-2">
            <div className="w-16 sm:w-24 h-2 sm:h-3 bg-gray-200 rounded-full mx-auto" />
          </div>
        </div>
        <div className="flex-1 p-2 space-y-1.5">
          <div className="w-3/4 h-2 bg-gray-100 rounded" />
          <div className="w-1/2 h-2 bg-gray-100 rounded" />
          <div className="w-2/3 h-2 bg-gray-100 rounded" />
        </div>
      </div>
      
      <div 
        className={`absolute bottom-3 sm:bottom-4 ${settings.position === 'right' ? 'right-3 sm:right-4' : 'left-3 sm:left-4'} transition-all duration-300`}
      >
        {isOpen ? (
          <div 
            className="w-36 sm:w-48 bg-white rounded-xl shadow-xl overflow-hidden border animate-in slide-in-from-bottom-4"
            style={{ borderColor: settings.color }}
          >
            <div 
              className="p-2 sm:p-3 text-white"
              style={{ backgroundColor: settings.color }}
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircle className="w-3 h-3 sm:w-4 sm:h-4" />
                </div>
                <div>
                  <div className="font-semibold text-[10px] sm:text-xs">WhachatCRM</div>
                  <div className="text-[8px] sm:text-[10px] opacity-80">Replies instantly</div>
                </div>
              </div>
            </div>
            <div className="p-2">
              <div 
                className="p-1.5 sm:p-2 rounded text-[9px] sm:text-[11px] text-white max-w-[90%] leading-tight"
                style={{ backgroundColor: settings.color }}
              >
                {settings.welcomeMessage.slice(0, 30)}...
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-1 right-1 w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-white text-[10px] hover:bg-white/30"
              data-testid="button-close-preview"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-110"
            style={{ backgroundColor: settings.color }}
            data-testid="button-open-preview"
          >
            <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        )}
      </div>
      
      <div className="absolute top-1 right-1 sm:top-2 sm:right-2">
        <Badge variant="secondary" className="text-[8px] sm:text-[10px] px-1.5 py-0.5">
          Preview
        </Badge>
      </div>
    </div>
  );
}

export function WebsiteWidget() {
  const queryClient = useQueryClient();
  const [copiedType, setCopiedType] = useState<
    "script" | "iframe" | "iframeParent" | "hosted" | null
  >(null);
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const [leadSource, setLeadSource] = useState("");
  
  const { data: user } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });
  
  const { data: savedSettings } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });
  
  useEffect(() => {
    if (savedSettings) {
      setSettings(mergeWidgetSettings(savedSettings));
    }
  }, [savedSettings]);
  
  const saveMutation = useMutation({
    mutationFn: async (newSettings: WidgetSettings) => {
      return apiRequest("PATCH", "/api/widget-settings", newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/widget-settings"] });
    },
  });
  
  const updateSettings = (updates: Partial<WidgetSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    saveMutation.mutate(newSettings);
  };
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  // widget.js receives ?id= so the server can inline the user's colour/position/welcome settings.
  // fetchpriority="low" tells the browser to deprioritise this script behind page-critical assets.
  // The setTimeout(fn, 1) wrapper defers execution until after the first paint on mobile.
  const scriptCode = user ? `<!-- WhachatCRM Chat Widget -->
<script>
  (function(w,d,o,f){
    w['WhachatWidget']=o;
    var js=d.createElement('script');
    js.src=f+'?id=${user.id}';
    js.async=true;
    js.setAttribute('fetchpriority','low');
    d.head.appendChild(js);
  }(window,document,'wcw','${baseUrl}/widget.js'));
</script>` : '';

  const iframeFloatingCode = user
    ? `<iframe
  src="${baseUrl}/widget-frame/${user.id}"
  style="position:fixed;bottom:20px;right:20px;width:380px;height:620px;border:none;z-index:9999;"
></iframe>`
    : "";

  const iframeWithParentScript = user
    ? `<!-- WhachatCRM — floating iframe + parent URL (for page rules) -->
<script>
(function(){
  var base=${JSON.stringify(`${baseUrl}/widget-frame/${user.id}`)};
  var f=document.createElement('iframe');
  f.src=base+'?parentUrl='+encodeURIComponent(window.location.href);
  f.setAttribute('title','WhachatCRM chat');
  f.style.cssText='position:fixed;bottom:20px;right:20px;width:380px;height:620px;border:none;z-index:9999;';
  document.body.appendChild(f);
})();
</script>`
    : "";

  const hostedLinkUrl = user
    ? leadSource
      ? `${baseUrl}/chat/${user.id}?source=${encodeURIComponent(leadSource)}`
      : `${baseUrl}/chat/${user.id}`
    : "";

  const copyScript = () => {
    if (!scriptCode) return;
    navigator.clipboard.writeText(scriptCode);
    setCopiedType("script");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyIframe = () => {
    if (!iframeFloatingCode) return;
    navigator.clipboard.writeText(iframeFloatingCode);
    setCopiedType("iframe");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyIframeWithParentScript = () => {
    if (!iframeWithParentScript) return;
    navigator.clipboard.writeText(iframeWithParentScript);
    setCopiedType("iframeParent");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyHostedLink = () => {
    if (!hostedLinkUrl) return;
    navigator.clipboard.writeText(hostedLinkUrl);
    setCopiedType("hosted");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const updatePageRule = (index: number, patch: Partial<WidgetPageRule>) => {
    const next = settings.pageRules.map((r, i) =>
      i === index ? { ...r, ...patch } : r
    );
    updateSettings({ pageRules: next });
  };

  const addPageRule = () => {
    updateSettings({
      pageRules: [
        ...settings.pageRules,
        { urlContains: "", greeting: "", prefilledMessage: "" },
      ],
    });
  };

  const removePageRule = (index: number) => {
    updateSettings({
      pageRules: settings.pageRules.filter((_, i) => i !== index),
    });
  };
  
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-gray-50/50">
      <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto pb-20">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="text-page-title">
            Website → WhatsApp
          </h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm max-w-xl">
            Capture visitors and start WhatsApp conversations automatically.
          </p>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg font-bold">Status</CardTitle>
                  <CardDescription className="text-xs">Widget visibility</CardDescription>
                </div>
                <Switch
                  checked={settings.enabled}
                  onCheckedChange={(enabled) => updateSettings({ enabled })}
                  data-testid="switch-widget-enabled"
                  className="data-[state=checked]:bg-emerald-500 shrink-0"
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-100 w-fit">
                {settings.enabled ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-emerald-700 font-medium">Active</span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="text-xs text-gray-600">Disabled</span>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Monitor className="w-4 h-4 text-gray-600" />
                Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0">
              <WidgetPreview settings={settings} />
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-semibold">Smart Entry</CardTitle>
              <CardDescription className="text-xs">
                Control when the floating widget appears and on which devices.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trigger-type" className="text-xs font-semibold text-gray-600">
                  When to show
                </Label>
                <select
                  id="trigger-type"
                  value={settings.triggerType}
                  onChange={(e) =>
                    updateSettings({ triggerType: e.target.value as WidgetTriggerType })
                  }
                  className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  data-testid="select-widget-trigger"
                >
                  <option value="always">Always (after load)</option>
                  <option value="delay">After a delay</option>
                  <option value="scroll">After scroll depth</option>
                  <option value="exit_intent">Exit intent</option>
                </select>
              </div>

              {settings.triggerType === "delay" && (
                <div className="space-y-2">
                  <Label htmlFor="delay-sec" className="text-xs font-semibold text-gray-600">
                    Delay (seconds)
                  </Label>
                  <Input
                    id="delay-sec"
                    type="number"
                    min={0}
                    max={3600}
                    value={settings.triggerDelaySeconds}
                    onChange={(e) =>
                      updateSettings({
                        triggerDelaySeconds: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="h-10 text-sm border-gray-200 rounded-lg max-w-xs"
                    data-testid="input-widget-delay"
                  />
                </div>
              )}

              {(settings.triggerType === "scroll" || settings.triggerType === "exit_intent") && (
                <div className="space-y-2">
                  <Label htmlFor="scroll-pct" className="text-xs font-semibold text-gray-600">
                    {settings.triggerType === "exit_intent"
                      ? "Scroll depth — used for scroll trigger and mobile exit fallback (%)"
                      : "Scroll depth (%)"}
                  </Label>
                  <Input
                    id="scroll-pct"
                    type="number"
                    min={1}
                    max={100}
                    value={settings.triggerScrollPercent}
                    onChange={(e) =>
                      updateSettings({
                        triggerScrollPercent: Math.min(
                          100,
                          Math.max(1, parseInt(e.target.value, 10) || 50)
                        ),
                      })
                    }
                    className="h-10 text-sm border-gray-200 rounded-lg max-w-xs"
                    data-testid="input-widget-scroll"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-800">Desktop</span>
                  </div>
                  <Switch
                    checked={settings.showOnDesktop}
                    onCheckedChange={(showOnDesktop) => updateSettings({ showOnDesktop })}
                    data-testid="switch-show-desktop"
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-800">Mobile</span>
                  </div>
                  <Switch
                    checked={settings.showOnMobile}
                    onCheckedChange={(showOnMobile) => updateSettings({ showOnMobile })}
                    data-testid="switch-show-mobile"
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg font-semibold">Page rules</CardTitle>
                  <CardDescription className="text-xs">
                    If the visitor&apos;s URL contains your text, use that greeting and optional prefilled message.
                    First matching rule wins.
                  </CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addPageRule} className="shrink-0">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add rule
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
              {settings.pageRules.map((rule, index) => (
                <div
                  key={`rule-${index}-${rule.urlContains}`}
                  className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-3"
                  data-testid={`page-rule-${index}`}
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-700">Rule {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-gray-500 hover:text-red-600"
                      onClick={() => removePageRule(index)}
                      data-testid={`button-remove-rule-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">URL contains</Label>
                    <Input
                      value={rule.urlContains}
                      onChange={(e) => updatePageRule(index, { urlContains: e.target.value })}
                      placeholder="/pricing or ?campaign=spring"
                      className="h-9 text-sm border-gray-200 bg-white"
                      data-testid={`input-rule-url-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">Greeting</Label>
                    <Input
                      value={rule.greeting}
                      onChange={(e) => updatePageRule(index, { greeting: e.target.value })}
                      placeholder="Bubble and chat welcome"
                      className="h-9 text-sm border-gray-200 bg-white"
                      data-testid={`input-rule-greeting-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">Prefilled message</Label>
                    <Textarea
                      value={rule.prefilledMessage}
                      onChange={(e) => updatePageRule(index, { prefilledMessage: e.target.value })}
                      placeholder="Optional — appears in the visitor message field"
                      rows={2}
                      className="text-sm border-gray-200 bg-white resize-y min-h-[60px]"
                      data-testid={`input-rule-prefill-${index}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-bold">Appearance</CardTitle>
              <CardDescription className="text-xs">Default look when no page rule overrides the greeting</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-600">Color</Label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => updateSettings({ color: color.value })}
                      className={cn(
                        "w-8 h-8 rounded-lg border-2 transition-all",
                        settings.color === color.value ? 'ring-2 ring-emerald-500 ring-offset-1 border-transparent' : 'border-gray-200'
                      )}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                      data-testid={`color-${color.value}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(e) => updateSettings({ color: e.target.value })}
                    className="w-8 h-8 rounded-lg cursor-pointer border-2 border-dashed border-gray-300 bg-white"
                    title="Custom"
                    data-testid="input-custom-color"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="welcome-message" className="text-xs font-semibold text-gray-600">Default greeting</Label>
                <Input
                  id="welcome-message"
                  value={settings.welcomeMessage}
                  onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                  className="h-10 text-sm border-gray-200 rounded-lg"
                  placeholder="Hi! How can we help?"
                  data-testid="input-welcome-message"
                />
              </div>
              
              <div className="space-y-2 max-w-xs">
                <Label className="text-xs font-semibold text-gray-600">Position</Label>
                <div className="flex p-0.5 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => updateSettings({ position: "left" })}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                      settings.position === "left" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    )}
                    data-testid="button-position-left"
                  >
                    Left
                  </button>
                  <button
                    onClick={() => updateSettings({ position: "right" })}
                    className={cn(
                      "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                      settings.position === "right" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                    )}
                    data-testid="button-position-right"
                  >
                    Right
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Install</CardTitle>
              <CardDescription>Add WhachatCRM to your website in seconds.</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      JavaScript <span className="text-xs font-medium text-slate-500">(Recommended)</span>
                    </h3>
                    <p className="text-sm text-slate-500">
                      Add this snippet before <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">&lt;/body&gt;</code> on your website.
                    </p>
                  </div>

                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={copyScript}
                    disabled={!scriptCode}
                    data-testid="button-copy-embed"
                  >
                    {copiedType === "script" ? (
                      <>
                        <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                        Copy Script
                      </>
                    )}
                  </Button>
                </div>

                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                  <code>{scriptCode || "Loading…"}</code>
                </pre>

                <p className="text-xs text-slate-500">
                  Works on WordPress, Shopify, Wix, Webflow, Squarespace, or any HTML site.
                </p>
              </div>

              <Accordion type="single" collapsible className="rounded-xl border border-slate-200 px-4">
                <AccordionItem value="advanced" className="border-none">
                  <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                    Advanced options
                  </AccordionTrigger>

                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-slate-900">iFrame</h4>
                          <p className="text-xs text-slate-500">
                            Simple floating chat — paste on any page that allows iframes.
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-slate-200"
                          onClick={copyIframe}
                          disabled={!iframeFloatingCode}
                          data-testid="button-copy-iframe-floating"
                        >
                          {copiedType === "iframe" ? (
                            <>
                              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              Copy iFrame
                            </>
                          )}
                        </Button>
                      </div>

                      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                        <code>{iframeFloatingCode || "Loading…"}</code>
                      </pre>

                      <p className="text-xs text-slate-500">
                        Page rules and Smart Entry triggers work best with the JavaScript install.
                      </p>

                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <p className="text-xs font-medium text-slate-800">
                          Optional: iframe + script (parent URL for page rules)
                        </p>
                        <p className="text-xs text-slate-500">
                          Plain HTML cannot put <code className="rounded bg-slate-100 px-1">window.location.href</code>{" "}
                          inside a static <code className="rounded bg-slate-100 px-1">src</code>. This snippet creates the
                          iframe and appends{" "}
                          <code className="rounded bg-slate-100 px-1">?parentUrl=…</code> so greetings and prefills can
                          match your real page URL (e.g. <code className="rounded bg-slate-100 px-1">/pricing</code>).
                        </p>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 border-slate-200"
                            onClick={copyIframeWithParentScript}
                            disabled={!iframeWithParentScript}
                            data-testid="button-copy-iframe-parent-url"
                          >
                            {copiedType === "iframeParent" ? (
                              <>
                                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1.5 h-3.5 w-3.5" />
                                Copy snippet
                              </>
                            )}
                          </Button>
                        </div>
                        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                          <code>{iframeWithParentScript || "Loading…"}</code>
                        </pre>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-slate-900">Hosted Link</h4>
                          <p className="text-xs text-slate-500">
                            Use this URL for buttons, QR codes, or redirects. Optional lead source below.
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-slate-200"
                          onClick={copyHostedLink}
                          disabled={!hostedLinkUrl}
                          data-testid="button-copy-hosted"
                        >
                          {copiedType === "hosted" ? (
                            <>
                              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              Copy Link
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lead-source" className="text-xs text-slate-600">
                          Lead source (optional)
                        </Label>
                        <Input
                          id="lead-source"
                          value={leadSource}
                          onChange={(e) => setLeadSource(e.target.value)}
                          placeholder="e.g. website, instagram, googleads"
                          className="h-9 max-w-md border-slate-200 text-sm"
                          data-testid="input-lead-source"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-900">Tip</p>
              <p className="text-[10px] sm:text-xs text-amber-800/80">
                Test in incognito mode after installing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
