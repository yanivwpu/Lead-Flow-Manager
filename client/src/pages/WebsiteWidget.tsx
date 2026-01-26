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
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-6xl mx-auto pb-20">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">Website Widget</h1>
          <p className="text-gray-500 mt-1">
            Add a chat widget to your website so visitors can message you directly on WhatsApp
          </p>
        </div>
        
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-emerald-900 font-medium">How it works</p>
              <p className="text-sm text-emerald-700 mt-1">
                This widget lets website visitors chat with you on WhatsApp. Messages appear instantly 
                in your WhachatCRM inbox and can be handled automatically by your chatbot or your team.
              </p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Widget Status</CardTitle>
                    <CardDescription>Enable or disable the chat widget on your website</CardDescription>
                  </div>
                  <Switch
                    checked={settings.enabled}
                    onCheckedChange={(enabled) => updateSettings({ enabled })}
                    data-testid="switch-widget-enabled"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  {settings.enabled ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm text-green-700 font-medium">Widget is active</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-500">Widget is disabled</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code2 className="w-5 h-5" />
                  Embed Code
                </CardTitle>
                <CardDescription>Copy and paste this code into your website</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto font-mono">
                    {embedCode || 'Loading...'}
                  </pre>
                  <Button
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={copyEmbedCode}
                    disabled={!embedCode}
                    data-testid="button-copy-embed"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy Code
                      </>
                    )}
                  </Button>
                </div>
                
                <p className="text-sm text-gray-600">
                  Paste this code just before the closing <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono">&lt;/body&gt;</code> tag of your website.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Customization</CardTitle>
                <CardDescription>Personalize how the widget looks on your site</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Widget Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => updateSettings({ color: color.value })}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          settings.color === color.value ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                        data-testid={`color-${color.value}`}
                      />
                    ))}
                    <div className="relative">
                      <input
                        type="color"
                        value={settings.color}
                        onChange={(e) => updateSettings({ color: e.target.value })}
                        className="w-8 h-8 rounded-full cursor-pointer border-2 border-dashed border-gray-300"
                        title="Custom color"
                        data-testid="input-custom-color"
                      />
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="welcome-message" className="text-sm font-medium">Welcome Message</Label>
                  <Input
                    id="welcome-message"
                    value={settings.welcomeMessage}
                    onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                    placeholder="Hi there! How can we help you today?"
                    data-testid="input-welcome-message"
                  />
                  <p className="text-xs text-gray-500">This message appears when visitors open the chat</p>
                </div>
                
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Widget Position</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={settings.position === "left" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSettings({ position: "left" })}
                      className="flex-1"
                      data-testid="button-position-left"
                    >
                      Bottom Left
                    </Button>
                    <Button
                      variant={settings.position === "right" ? "default" : "outline"}
                      size="sm"
                      onClick={() => updateSettings({ position: "right" })}
                      className="flex-1"
                      data-testid="button-position-right"
                    >
                      Bottom Right
                    </Button>
                  </div>
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Smartphone className="w-4 h-4" />
                      Show on Mobile
                    </Label>
                    <p className="text-xs text-gray-500">Display widget on mobile devices</p>
                  </div>
                  <Switch
                    checked={settings.showOnMobile}
                    onCheckedChange={(showOnMobile) => updateSettings({ showOnMobile })}
                    data-testid="switch-show-mobile"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Monitor className="w-5 h-5" />
                  Live Preview
                </CardTitle>
                <CardDescription>See how your widget will look on your website</CardDescription>
              </CardHeader>
              <CardContent>
                <WidgetPreview settings={settings} />
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Installation Guides</CardTitle>
                <CardDescription>Step-by-step instructions for popular platforms</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLATFORM_INSTRUCTIONS.map((platform) => (
                  <div
                    key={platform.id}
                    className="border rounded-lg overflow-hidden"
                    data-testid={`platform-${platform.id}`}
                  >
                    <button
                      onClick={() => setExpandedPlatform(
                        expandedPlatform === platform.id ? null : platform.id
                      )}
                      className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                      data-testid={`button-expand-${platform.id}`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${platform.color} flex items-center justify-center text-white text-xs font-bold`}>
                        {platform.icon}
                      </div>
                      <span className="font-medium text-sm flex-1 text-left">{platform.name}</span>
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${
                        expandedPlatform === platform.id ? 'rotate-90' : ''
                      }`} />
                    </button>
                    {expandedPlatform === platform.id && (
                      <div className="px-3 pb-3 pt-1 border-t bg-gray-50">
                        <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                          {platform.steps.map((step, i) => (
                            <li key={i} className="leading-relaxed">{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
            
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-amber-900">Troubleshooting</p>
                    <ul className="text-sm text-amber-800 space-y-1">
                      <li>• If the widget doesn't appear, make sure you published your site</li>
                      <li>• Ad blockers may hide chat widgets - try disabling them</li>
                      <li>• Clear your browser cache if changes don't appear</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
