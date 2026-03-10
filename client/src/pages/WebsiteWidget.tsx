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
  const [copied, setCopied] = useState(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [settings, setSettings] = useState<WidgetSettings>(DEFAULT_SETTINGS);
  const [leadSource, setLeadSource] = useState("");
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
    <div className="h-full overflow-y-auto overflow-x-hidden bg-gray-50/50">
      <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto pb-20">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="text-page-title">Website Widget</h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm">
            Let visitors message you on WhatsApp from your site
          </p>
        </div>
        
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900">How it works</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Add this widget to capture leads. Visitors click it and go straight to WhatsApp.
              </p>
            </div>
          </div>
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
          
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                <Code2 className="w-4 h-4 text-gray-700" />
                Installation Methods
              </CardTitle>
              <CardDescription className="text-xs">Choose how to add the widget to your site</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
              <Tabs defaultValue="javascript" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-gray-100 p-1 h-auto">
                  <TabsTrigger value="javascript" className="text-xs">JavaScript</TabsTrigger>
                  <TabsTrigger value="iframe" className="text-xs">iframe</TabsTrigger>
                  <TabsTrigger value="hosted" className="text-xs">Hosted Link</TabsTrigger>
                </TabsList>

                <TabsContent value="javascript" className="space-y-3 mt-3">
                  <p className="text-xs text-gray-600 mb-2">Embed as a floating button on your website</p>
                  <div className="relative bg-white rounded-t-lg border border-b-0 border-gray-200 px-3 py-2 flex justify-end">
                    <button
                      onClick={copyEmbedCode}
                      disabled={!embedCode}
                      title={copiedType === "javascript" ? "Copied!" : "Copy code"}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-500 hover:text-gray-900"
                      data-testid="button-copy-embed"
                    >
                      {copiedType === "javascript" ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-b-lg text-[10px] sm:text-xs overflow-x-auto font-mono leading-relaxed max-h-32 overflow-y-auto border border-gray-200 border-t-0">
                    {embedCode || 'Loading...'}
                  </pre>
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-100 rounded-md text-blue-800">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <p className="text-[10px] sm:text-xs">
                      Paste before <code className="bg-blue-100 px-1 rounded">&lt;/body&gt;</code> tag
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="iframe" className="space-y-4 mt-3">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-900 mb-1">A) Floating iframe widget</p>
                      <p className="text-[10px] text-gray-600 mb-2">Best for: sites that allow iframe and support floating placement</p>
                      <div className="relative bg-white rounded-t-lg border border-b-0 border-gray-200 px-3 py-2 flex justify-end">
                        <button
                          onClick={() => {
                            if (user) {
                              navigator.clipboard.writeText(`<iframe\n  src="${baseUrl}/widget-frame/${user.id}"\n  style="position:fixed;bottom:20px;right:20px;width:380px;height:620px;border:none;z-index:9999;"\n></iframe>`);
                              setCopiedType("iframe-floating");
                              setTimeout(() => setCopiedType(null), 2000);
                            }
                          }}
                          disabled={!user}
                          title={copiedType === "iframe-floating" ? "Copied!" : "Copy code"}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-500 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-copy-iframe-floating"
                        >
                          {copiedType === "iframe-floating" ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <pre className="bg-gray-900 text-gray-100 p-3 rounded-b-lg text-[10px] sm:text-xs overflow-x-auto font-mono leading-relaxed max-h-32 overflow-y-auto border border-gray-200 border-t-0">
{user ? `<iframe
  src="${baseUrl}/widget-frame/${user.id}"
  style="position:fixed;bottom:20px;right:20px;width:380px;height:620px;border:none;z-index:9999;"
></iframe>` : 'Loading...'}
                      </pre>
                    </div>

                    <div className="border-t pt-3">
                      <p className="text-xs font-semibold text-gray-900 mb-1">B) Embedded iframe panel</p>
                      <p className="text-[10px] text-gray-600 mb-2">Best for: website builders and HTML blocks that allow iframe but do not support floating/fixed position</p>
                      <div className="relative bg-white rounded-t-lg border border-b-0 border-gray-200 px-3 py-2 flex justify-end">
                        <button
                          onClick={() => {
                            if (user) {
                              navigator.clipboard.writeText(`<iframe\n  src="${baseUrl}/widget-frame/${user.id}"\n  width="380"\n  height="620"\n  style="border:none;"\n></iframe>`);
                              setCopiedType("iframe-embedded");
                              setTimeout(() => setCopiedType(null), 2000);
                            }
                          }}
                          disabled={!user}
                          title={copiedType === "iframe-embedded" ? "Copied!" : "Copy code"}
                          className="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-500 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          data-testid="button-copy-iframe-embedded"
                        >
                          {copiedType === "iframe-embedded" ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      <pre className="bg-gray-900 text-gray-100 p-3 rounded-b-lg text-[10px] sm:text-xs overflow-x-auto font-mono leading-relaxed max-h-32 overflow-y-auto border border-gray-200 border-t-0">
{user ? `<iframe
  src="${baseUrl}/widget-frame/${user.id}"
  width="380"
  height="620"
  style="border:none;"
></iframe>` : 'Loading...'}
                      </pre>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="hosted" className="space-y-3 mt-3">
                  <p className="text-xs text-gray-600 mb-3">Full-page chat widget with optional lead source tracking</p>
                  
                  <div className="space-y-2 mb-3">
                    <Label htmlFor="lead-source" className="text-xs font-semibold text-gray-600">Lead Source (optional)</Label>
                    <Input
                      id="lead-source"
                      value={leadSource}
                      onChange={(e) => setLeadSource(e.target.value)}
                      placeholder="e.g., website, facebook, instagram, googleads"
                      className="h-9 text-sm border-gray-200 rounded-lg"
                      data-testid="input-lead-source"
                    />
                    <p className="text-[10px] text-gray-500">Track where leads come from by adding a source parameter</p>
                  </div>

                  <div className="relative bg-white rounded-t-lg border border-b-0 border-gray-200 px-3 py-2 flex justify-end">
                    <button
                      onClick={() => {
                        if (user) {
                          const url = leadSource ? `${baseUrl}/chat/${user.id}?source=${leadSource}` : `${baseUrl}/chat/${user.id}`;
                          navigator.clipboard.writeText(url);
                          setCopiedType("hosted");
                          setTimeout(() => setCopiedType(null), 2000);
                        }
                      }}
                      disabled={!user}
                      title={copiedType === "hosted" ? "Copied!" : "Copy code"}
                      className="p-1.5 hover:bg-gray-100 rounded transition-colors text-gray-500 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                      data-testid="button-copy-hosted"
                    >
                      {copiedType === "hosted" ? (
                        <Check className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-b-lg text-[10px] sm:text-xs overflow-x-auto font-mono leading-relaxed max-h-32 overflow-y-auto border border-gray-200 border-t-0">
{user ? leadSource ? `${baseUrl}/chat/${user.id}?source=${leadSource}` : `${baseUrl}/chat/${user.id}` : 'Loading...'}
                  </pre>
                  <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-100 rounded-md text-blue-800">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <p className="text-[10px] sm:text-xs">
                      Share this link directly or embed in a button/menu. The source parameter is optional.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-bold">Appearance</CardTitle>
              <CardDescription className="text-xs">Customize widget look</CardDescription>
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
                <Label htmlFor="welcome-message" className="text-xs font-semibold text-gray-600">Greeting</Label>
                <Input
                  id="welcome-message"
                  value={settings.welcomeMessage}
                  onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                  className="h-10 text-sm border-gray-200 rounded-lg"
                  placeholder="Hi! How can we help?"
                  data-testid="input-welcome-message"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
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

                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-gray-600">Mobile</Label>
                  <div className="flex items-center justify-between h-[34px] px-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                    <div className="flex items-center gap-1.5">
                      <Smartphone className="w-3 h-3 text-gray-400" />
                      <span className="text-xs text-gray-600">Show</span>
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
              
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-bold">Install Guide</CardTitle>
              <CardDescription className="text-xs">Platform instructions</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
              {PLATFORM_INSTRUCTIONS.map((platform) => (
                <div
                  key={platform.id}
                  className={cn(
                    "rounded-lg transition-all border",
                    expandedPlatform === platform.id ? "border-emerald-200 bg-emerald-50/30" : "border-gray-100"
                  )}
                  data-testid={`platform-${platform.id}`}
                >
                  <button
                    onClick={() => setExpandedPlatform(
                      expandedPlatform === platform.id ? null : platform.id
                    )}
                    className="w-full flex items-center gap-3 p-2.5 hover:bg-gray-50 transition-colors rounded-lg"
                    data-testid={`button-expand-${platform.id}`}
                  >
                    <div className={`w-7 h-7 rounded-lg ${platform.color} flex items-center justify-center text-white text-xs font-bold`}>
                      {platform.icon}
                    </div>
                    <span className="font-medium text-sm text-gray-800 flex-1 text-left">{platform.name}</span>
                    <ChevronRight className={cn(
                      "w-4 h-4 text-gray-400 transition-transform",
                      expandedPlatform === platform.id && "rotate-90 text-emerald-500"
                    )} />
                  </button>
                  {expandedPlatform === platform.id && (
                    <div className="px-3 pb-3 pt-1 border-t border-emerald-100">
                      <ol className="space-y-1.5">
                        {platform.steps.map((step, i) => (
                          <li key={i} className="flex gap-2 text-xs text-gray-600">
                            <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[9px] font-bold">
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
