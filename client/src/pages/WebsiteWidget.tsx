import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  Copy, Check, Code2, Smartphone, Monitor, MessageCircle,
  ChevronRight, ExternalLink, AlertCircle, CheckCircle2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface WidgetSettings {
  enabled: boolean;
  color: string;
  welcomeMessage: string;
  position: "right" | "left";
  showOnMobile: boolean;
}

const DEFAULT_SETTINGS: WidgetSettings = {
  enabled: true,
  color: "#25D366",
  welcomeMessage: "Hi there! How can we help you today?",
  position: "right",
  showOnMobile: true,
};

const COLOR_PRESETS = [
  { name: "WhatsApp Green", value: "#25D366" },
  { name: "Brand Green", value: "#10b981" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
];

const PLATFORM_INSTRUCTIONS = [
  {
    id: "wordpress",
    name: "WordPress",
    icon: "W",
    color: "bg-blue-600",
    steps: [
      "Go to Appearance → Theme Editor (or use a plugin like 'Insert Headers and Footers')",
      "Find your theme's footer.php file",
      "Paste the code just before the closing </body> tag",
      "Click 'Update File' to save"
    ]
  },
  {
    id: "shopify",
    name: "Shopify",
    icon: "S",
    color: "bg-green-600",
    steps: [
      "Go to Online Store → Themes",
      "Click 'Actions' → 'Edit code'",
      "Find theme.liquid in the Layout folder",
      "Paste the code just before the closing </body> tag",
      "Click 'Save'"
    ]
  },
  {
    id: "wix",
    name: "Wix",
    icon: "W",
    color: "bg-black",
    steps: [
      "Go to Settings → Custom Code",
      "Click 'Add Custom Code'",
      "Paste the embed code",
      "Set placement to 'Body - end'",
      "Click 'Apply'"
    ]
  },
  {
    id: "squarespace",
    name: "Squarespace",
    icon: "S",
    color: "bg-gray-900",
    steps: [
      "Go to Settings → Advanced → Code Injection",
      "Scroll to the 'Footer' section",
      "Paste the embed code",
      "Click 'Save'"
    ]
  },
  {
    id: "webflow",
    name: "Webflow",
    icon: "W",
    color: "bg-blue-500",
    steps: [
      "Go to Project Settings → Custom Code",
      "Scroll to 'Footer Code'",
      "Paste the embed code",
      "Click 'Save Changes'",
      "Publish your site"
    ]
  },
  {
    id: "html",
    name: "Custom HTML",
    icon: "</>",
    color: "bg-orange-500",
    steps: [
      "Open your website's HTML file",
      "Find the closing </body> tag",
      "Paste the embed code just before it",
      "Save and upload the file"
    ]
  },
];

function WidgetPreview({ settings }: { settings: WidgetSettings }) {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="relative w-full h-[400px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden border-2 border-gray-300">
      <div className="absolute inset-4 bg-white rounded-lg shadow-sm border flex flex-col">
        <div className="h-12 bg-gray-50 border-b flex items-center px-4 gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-yellow-400" />
            <div className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-4">
            <div className="w-48 h-5 bg-gray-200 rounded-full mx-auto" />
          </div>
        </div>
        <div className="flex-1 p-4 space-y-3">
          <div className="w-3/4 h-4 bg-gray-100 rounded" />
          <div className="w-1/2 h-4 bg-gray-100 rounded" />
          <div className="w-2/3 h-4 bg-gray-100 rounded" />
          <div className="w-1/3 h-4 bg-gray-100 rounded" />
        </div>
      </div>
      
      <div 
        className={`absolute bottom-6 ${settings.position === 'right' ? 'right-6' : 'left-6'} transition-all duration-300`}
      >
        {isOpen ? (
          <div 
            className="w-72 bg-white rounded-2xl shadow-2xl overflow-hidden border animate-in slide-in-from-bottom-4"
            style={{ borderColor: settings.color }}
          >
            <div 
              className="p-4 text-white"
              style={{ backgroundColor: settings.color }}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-sm">WhachatCRM</div>
                  <div className="text-xs opacity-80">Usually replies instantly</div>
                </div>
              </div>
            </div>
            <div className="p-4">
              <div 
                className="p-3 rounded-lg text-sm text-white max-w-[80%]"
                style={{ backgroundColor: settings.color }}
              >
                {settings.welcomeMessage}
              </div>
            </div>
            <div className="p-3 border-t">
              <div className="flex items-center gap-2">
                <div className="flex-1 h-9 bg-gray-100 rounded-full px-4 flex items-center text-gray-400 text-sm">
                  Type a message...
                </div>
              </div>
            </div>
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30"
              data-testid="button-close-preview"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsOpen(true)}
            className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-110"
            style={{ backgroundColor: settings.color }}
            data-testid="button-open-preview"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        )}
      </div>
      
      <div className="absolute top-2 right-2">
        <Badge variant="secondary" className="text-xs">
          Live Preview
        </Badge>
      </div>
    </div>
  );
}

export function WebsiteWidget() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
  
  const { data: user } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
  });
  
  const { data: savedSettings } = useQuery<WidgetSettings>({
    queryKey: ["/api/widget-settings"],
  });
  
  useEffect(() => {
    if (savedSettings) {
      setSettings(savedSettings);
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
  const embedCode = user ? `<!-- WhachatCRM Chat Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['WhachatWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','wcw','${baseUrl}/widget.js'));
  wcw('init', '${user.id}');
</script>` : '';
  
  const copyEmbedCode = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  return (
    <div className="h-full bg-gray-50/30">
      <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight" data-testid="text-page-title">Website Widget</h1>
          <p className="text-gray-500 mt-2 text-lg">
            Connect with your website visitors directly on WhatsApp
          </p>
        </div>
        
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-base text-emerald-900 font-semibold leading-none mb-1">How it works</p>
              <p className="text-sm text-emerald-700/90 leading-relaxed">
                Add this widget to your site to capture leads. When visitors click it, they'll be taken straight to a WhatsApp chat with you. 
                All conversations are automatically tracked in your Unified Inbox.
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 space-y-8">
            <Card className="border-none shadow-sm ring-1 ring-gray-200 overflow-hidden">
              <CardHeader className="pb-4 bg-white">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-xl font-bold">Widget Status</CardTitle>
                    <CardDescription>Control visibility on your live site</CardDescription>
                  </div>
                  <Switch
                    checked={settings.enabled}
                    onCheckedChange={(enabled) => updateSettings({ enabled })}
                    data-testid="switch-widget-enabled"
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
              </CardHeader>
              <CardContent className="pt-0 pb-6">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100 w-fit">
                  {settings.enabled ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-sm text-emerald-700 font-semibold">Active & Live</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-gray-400" />
                      <span className="text-sm text-gray-600 font-medium">Currently Disabled</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-none shadow-sm ring-1 ring-gray-200">
              <CardHeader>
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Code2 className="w-6 h-6 text-gray-700" />
                  Installation Code
                </CardTitle>
                <CardDescription>Copy this snippet and add it to your website header or footer</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="group relative">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-100 to-teal-100 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-5 rounded-xl text-[13px] overflow-x-auto font-mono leading-relaxed ring-1 ring-white/10 shadow-lg">
                      {embedCode || 'Loading installation script...'}
                    </pre>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="absolute top-3 right-3 shadow-md hover:bg-white"
                      onClick={copyEmbedCode}
                      disabled={!embedCode}
                      data-testid="button-copy-embed"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4 mr-2 text-emerald-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 mr-2" />
                          Copy Code
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-blue-50/50 border border-blue-100 rounded-lg text-blue-800">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p className="text-xs font-medium">
                    Best practice: Paste just before the closing <code className="bg-blue-100/50 px-1 rounded">&lt;/body&gt;</code> tag.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-none shadow-sm ring-1 ring-gray-200">
              <CardHeader>
                <CardTitle className="text-xl font-bold">Appearance Settings</CardTitle>
                <CardDescription>Match the widget to your brand identity</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <Label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Brand Color</Label>
                  <div className="grid grid-cols-4 sm:flex sm:flex-wrap gap-3">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => updateSettings({ color: color.value })}
                        className={`w-10 h-10 rounded-xl border-2 transition-all duration-200 shadow-sm ${
                          settings.color === color.value ? 'ring-2 ring-emerald-500 ring-offset-2 scale-105 border-transparent' : 'border-gray-100 hover:border-gray-300'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                        data-testid={`color-${color.value}`}
                      />
                    ))}
                    <div className="relative group">
                      <input
                        type="color"
                        value={settings.color}
                        onChange={(e) => updateSettings({ color: e.target.value })}
                        className="w-10 h-10 rounded-xl cursor-pointer border-2 border-dashed border-gray-300 bg-white p-1 hover:border-gray-400 transition-colors"
                        title="Custom color"
                        data-testid="input-custom-color"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <Label htmlFor="welcome-message" className="text-sm font-bold text-gray-700 uppercase tracking-wider">Default Greeting</Label>
                  <Input
                    id="welcome-message"
                    value={settings.welcomeMessage}
                    onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                    className="h-12 border-gray-200 focus:ring-emerald-500 rounded-lg"
                    placeholder="e.g. Hi! How can we help you today?"
                    data-testid="input-welcome-message"
                  />
                  <p className="text-xs text-gray-500">This will be the first thing your customers see.</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Desktop Position</Label>
                    <div className="flex p-1 bg-gray-100 rounded-xl">
                      <button
                        onClick={() => updateSettings({ position: "left" })}
                        className={cn(
                          "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all",
                          settings.position === "left" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                        data-testid="button-position-left"
                      >
                        Left
                      </button>
                      <button
                        onClick={() => updateSettings({ position: "right" })}
                        className={cn(
                          "flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all",
                          settings.position === "right" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                        )}
                        data-testid="button-position-right"
                      >
                        Right
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm font-bold text-gray-700 uppercase tracking-wider">Mobile View</Label>
                    <div className="flex items-center justify-between h-[44px] px-3 bg-gray-50 border border-gray-100 rounded-xl">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-gray-400" />
                        <span className="text-xs font-medium text-gray-600">Show</span>
                      </div>
                      <Switch
                        checked={settings.showOnMobile}
                        onCheckedChange={(showOnMobile) => updateSettings({ showOnMobile })}
                        data-testid="switch-show-mobile"
                        className="scale-75 data-[state=checked]:bg-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="lg:col-span-5 space-y-8">
            <div className="sticky top-6 space-y-8">
              <Card className="border-none shadow-xl ring-1 ring-gray-200 overflow-hidden bg-white">
                <CardHeader className="border-b bg-gray-50/50">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-gray-600" />
                    Preview
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <WidgetPreview settings={settings} />
                </CardContent>
              </Card>
              
              <Card className="border-none shadow-sm ring-1 ring-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-bold">Installation Guides</CardTitle>
                  <CardDescription>Select your platform for instructions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {PLATFORM_INSTRUCTIONS.map((platform) => (
                    <div
                      key={platform.id}
                      className={cn(
                        "rounded-xl transition-all duration-200 border",
                        expandedPlatform === platform.id ? "border-emerald-200 ring-4 ring-emerald-50 shadow-sm" : "border-gray-100"
                      )}
                      data-testid={`platform-${platform.id}`}
                    >
                      <button
                        onClick={() => setExpandedPlatform(
                          expandedPlatform === platform.id ? null : platform.id
                        )}
                        className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors rounded-xl"
                        data-testid={`button-expand-${platform.id}`}
                      >
                        <div className={`w-10 h-10 rounded-xl ${platform.color} flex items-center justify-center text-white text-lg font-bold shadow-sm`}>
                          {platform.icon}
                        </div>
                        <span className="font-bold text-gray-800 flex-1 text-left">{platform.name}</span>
                        <ChevronRight className={cn(
                          "w-5 h-5 text-gray-400 transition-transform duration-300",
                          expandedPlatform === platform.id && "rotate-90 text-emerald-500"
                        )} />
                      </button>
                      {expandedPlatform === platform.id && (
                        <div className="px-5 pb-5 pt-2 border-t border-emerald-50 bg-emerald-50/20">
                          <ol className="space-y-3">
                            {platform.steps.map((step, i) => (
                              <li key={i} className="flex gap-3 text-sm text-gray-700">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold mt-0.5">
                                  {i + 1}
                                </span>
                                <span className="leading-relaxed">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-amber-900">Pro Tip</p>
                  <p className="text-xs text-amber-800/80 leading-relaxed">
                    Test the widget in an incognito window after installation to ensure cached versions aren't interfering with your changes.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
