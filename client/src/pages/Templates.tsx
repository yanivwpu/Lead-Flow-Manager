import { useState } from "react";

function RealtorMark() {
  return (
    <span className="inline">Realtor<span style={{ fontSize: '0.35em', verticalAlign: 'super', lineHeight: 0, position: 'relative', top: '-0.15em' }}>&reg;</span></span>
  );
}
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/lib/subscription-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { 
  FileText, RefreshCw, Lock, Zap, Send, Clock, CheckCircle2, XCircle, 
  AlertCircle, Image, Video, FileIcon, LayoutGrid, ChevronLeft, ChevronRight,
  Users, Target, Sparkles, Rocket, Crown, Bot, MessageSquare, CalendarCheck, ArrowRight,
  Search
} from "lucide-react";
import { LocalizedTemplateSelector } from "@/components/LocalizedTemplateSelector";
import { getInboxTemplateSendBlockReason } from "@shared/metaTemplateSend";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

interface MessageTemplate {
  id: string;
  twilioSid: string;
  name: string;
  language: string;
  category: string;
  status: string;
  templateType: string;
  bodyText: string | null;
  headerType: string | null;
  headerContent: string | null;
  footerText: string | null;
  buttons: any[];
  carouselCards: any[];
  variables: string[];
  lastSyncedAt: string;
  createdAt: string;
}

interface RetargetableChat {
  id: string;
  name: string;
  avatar: string;
  whatsappPhone: string;
  lastMessage: string;
  lastMessageAt: string;
  daysSinceLastMessage: number;
}

interface Chat {
  id: string;
  name: string;
  avatar: string;
  whatsappPhone: string | null;
  lastMessage: string;
}

const CATEGORY_BADGE_CLASS: Record<string, string> = {
  marketing: "bg-gray-50 text-gray-700 border-gray-200",
  utility: "bg-gray-50 text-gray-700 border-gray-200",
  authentication: "bg-amber-50/80 text-amber-900 border-amber-100",
};

function formatCategoryBadgeLabel(category: string): string {
  const c = (category || "").toLowerCase();
  if (c === "marketing") return "Marketing";
  if (c === "utility") return "Utility";
  if (c === "authentication") return "Authentication";
  return (category || "Unknown").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatLanguageCode(lang: string): string {
  return (lang || "").replace(/-/g, "_").toUpperCase() || "—";
}

function libraryQuickSendMeta(template: MessageTemplate) {
  return getInboxTemplateSendBlockReason({
    name: template.name,
    bodyText: template.bodyText,
    headerType: template.headerType,
    headerContent: template.headerContent,
    buttons: template.buttons,
    templateType: template.templateType,
    carouselCards: template.carouselCards,
    category: template.category,
  });
}

const STATUS_ICONS: Record<string, any> = {
  approved: { icon: CheckCircle2, color: "text-green-500" },
  pending: { icon: Clock, color: "text-amber-500" },
  rejected: { icon: XCircle, color: "text-red-500" },
};

function GrowthEnginesTab() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const features = [
    { icon: MessageSquare, text: t("templates.growthEngines.feature1") },
    { icon: Bot, text: t("templates.growthEngines.feature2") },
    { icon: Clock, text: t("templates.growthEngines.feature3") },
    { icon: Target, text: t("templates.growthEngines.feature4") },
    { icon: CalendarCheck, text: t("templates.growthEngines.feature5") },
  ];

  return (
    <div className="space-y-3 md:space-y-4">
      <div className="space-y-0.5">
        <h2 className="text-base md:text-lg font-semibold text-gray-900">Growth Engines</h2>
        <p className="text-sm text-gray-500">
          Install full industry playbooks powered by templates, automations, and AI.
        </p>
      </div>

      <Card className="overflow-hidden border-purple-200/50 shadow-sm" data-testid="card-realtor-growth-engine">
        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 p-5 lg:p-6 min-w-0">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-gradient-to-r from-violet-600 to-purple-600 text-white border-0 text-[10px] px-2 py-0">Premium</Badge>
                </div>
                <h3 className="text-lg font-bold text-gray-900" data-testid="text-engine-title"><RealtorMark /> Growth Engine</h3>
              </div>
              <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-lg bg-purple-50 shrink-0">
                <Rocket className="h-5 w-5 text-purple-600" />
              </div>
            </div>

            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Convert more WhatsApp inquiries into qualified buyers & booked showings — automatically.
            </p>

            <div className="space-y-2 mb-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-gray-700">
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-50 shrink-0">
                    <f.icon className="h-3 w-3 text-purple-600" />
                  </div>
                  <span>{f.text}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mb-4">Includes onboarding + live setup call + system configuration</p>

            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto"
              onClick={() => setLocation("/app/templates/realtor-growth-engine")}
              data-testid="button-view-activate-engine"
            >
              View & Activate
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="lg:w-56 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/50 p-5 lg:p-6 flex flex-col justify-center">
            <div className="text-center lg:text-left">
              <div className="flex items-baseline gap-1 justify-center lg:justify-start">
                <span className="text-2xl font-bold text-gray-900">$199</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">one-time template license</p>

              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>Requires Pro + AI plan</span>
                </div>
              </div>

              <p className="text-[10px] text-gray-400 mt-3 leading-snug">
                WhatsApp conversation fees billed separately by Meta
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function Templates() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");

  const templatesEnabled = (subscription?.limits as any)?.templatesEnabled;

  const { data: templates = [], isLoading: templatesLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: !!templatesEnabled,
  });

  const { data: retargetableChats = [], isLoading: chatsLoading } = useQuery<RetargetableChat[]>({
    queryKey: ["/api/templates/retargetable-chats"],
    enabled: !!templatesEnabled,
  });

  const { data: allChats = [] } = useQuery<Chat[]>({
    queryKey: ["/api/chats"],
    enabled: !!templatesEnabled,
  });

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/templates/sync");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      const count = (data?.inserted ?? 0) + (data?.updated ?? 0);
      toast({
        title: "Templates synced",
        description: data?.message || `${count} template(s) synced successfully.`,
      });
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      const clean = msg.replace(/^\d+:\s*/, "").replace(/^\{"error":"/, "").replace(/"\}$/, "");
      toast({
        title: "Sync failed",
        description: clean || "Failed to sync templates. Check your WhatsApp connection in Settings.",
        variant: "destructive",
      });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async (data: { templateId: string; chatId: string; variables: Record<string, string> }) => {
      const payload = { ...data, sendSource: "templates_page" as const };
      console.log(
        `[WA_TEMPLATE_SEND_CLIENT] ${JSON.stringify({
          source: "templates_page",
          templateId: payload.templateId,
          chatId: payload.chatId,
          variables: payload.variables,
          components: "(built server-side from template row + variables)",
        })}`
      );
      const res = await apiRequest("POST", "/api/templates/send", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/retargetable-chats"] });
      setSendDialogOpen(false);
      setSelectedTemplate(null);
      setSelectedChat(null);
      setVariableValues({});
      toast({
        title: "Template sent",
        description: data?.message || "Template message sent successfully.",
      });
    },
    onError: (error: any) => {
      const msg = error?.message || "";
      const clean = msg.replace(/^\d+:\s*/, "").replace(/^\{"error":"/, "").replace(/"\}$/, "");
      toast({
        title: "Send failed",
        description: clean || "Failed to send template message.",
        variant: "destructive",
      });
    },
  });

  const handleSendTemplate = (template: MessageTemplate, chat: Chat | RetargetableChat) => {
    console.log(`[UseTemplate] Template selected: ${template.name} (id=${template.id}, status=${template.status})`);
    console.log(`[UseTemplate] Contact selected: ${chat.name} (id=${chat.id}, phone=${chat.whatsappPhone})`);
    setSelectedTemplate(template);
    setSelectedChat(chat as Chat);
    setVariableValues({});
    setContactPickerOpen(false);
    setSendDialogOpen(true);
    console.log(`[UseTemplate] Send dialog opened — variables required: ${template.variables?.length ?? 0}`);
  };

  const handleUseTemplate = (template: MessageTemplate) => {
    console.log(`[UseTemplate] Button clicked for template: ${template.name}`);
    setSelectedTemplate(template);
    setContactSearch("");
    setContactPickerOpen(true);
  };

  const getTemplateIcon = (type: string) => {
    switch (type) {
      case "carousel": return LayoutGrid;
      case "media": return Image;
      default: return FileText;
    }
  };

  const renderTemplatePreview = (template: MessageTemplate) => {
    if (template.templateType === "carousel" && template.carouselCards.length > 0) {
      const card = template.carouselCards[carouselIndex];
      return (
        <div className="space-y-3">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden">
            {card?.headerUrl && (
              <img src={card.headerUrl} alt="Card header" className="w-full h-32 object-cover" />
            )}
            {!card?.headerUrl && (
              <div className="w-full h-32 bg-gray-200 flex items-center justify-center">
                <Image className="h-8 w-8 text-gray-400" />
              </div>
            )}
            <div className="absolute bottom-2 right-2 flex gap-1">
              <Button 
                size="icon" 
                variant="secondary" 
                className="h-6 w-6"
                disabled={carouselIndex === 0}
                onClick={() => setCarouselIndex(i => i - 1)}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button 
                size="icon" 
                variant="secondary" 
                className="h-6 w-6"
                disabled={carouselIndex === template.carouselCards.length - 1}
                onClick={() => setCarouselIndex(i => i + 1)}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-gray-700">{card?.bodyText || "Card body text"}</p>
          <p className="text-xs text-gray-500">Card {carouselIndex + 1} of {template.carouselCards.length}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {template.headerType && template.headerType !== "text" && (
          <div className="bg-gray-100 rounded-lg p-4 flex items-center justify-center">
            {template.headerType === "image" && <Image className="h-8 w-8 text-gray-400" />}
            {template.headerType === "video" && <Video className="h-8 w-8 text-gray-400" />}
            {template.headerType === "document" && <FileIcon className="h-8 w-8 text-gray-400" />}
          </div>
        )}
        {template.headerType === "text" && template.headerContent && (
          <p className="font-semibold text-gray-900">{template.headerContent}</p>
        )}
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {template.bodyText || "Template body text"}
        </p>
        {template.footerText && (
          <p className="text-xs text-gray-500">{template.footerText}</p>
        )}
        {template.buttons && template.buttons.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {template.buttons.map((btn: any, i: number) => (
              <Badge key={i} variant="outline" className="text-blue-600 border-blue-300">
                {btn.text || btn.title || `Button ${i + 1}`}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (subLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!templatesEnabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Template Messaging is a Pro Feature</h2>
        <p className="text-gray-500 max-w-md mb-6">
          Send pre-approved WhatsApp templates to re-engage customers after the 24-hour window. 
          Perfect for follow-ups, promotions, and smart retargeting campaigns.
        </p>
        <Link href="/pricing">
          <Button className="bg-brand-green hover:bg-brand-green/90" data-testid="button-upgrade-templates">
            <Zap className="h-4 w-4 mr-2" />
            Upgrade to Pro
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-white flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-2 md:py-4 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          <div className="min-w-0 space-y-0.5">
            <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Message Templates</h1>
            <p className="text-gray-500 text-xs md:text-sm leading-snug">
              Manage WhatsApp-approved templates, campaigns, and automation sequences.
            </p>
          </div>
          <Button 
            variant="outline"
            size="sm"
            onClick={() => syncTemplatesMutation.mutate()}
            disabled={syncTemplatesMutation.isPending}
            data-testid="button-sync-templates"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncTemplatesMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Templates
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-2 md:py-3 pb-24 md:pb-6">
        <div className="max-w-5xl mx-auto">
          <Tabs defaultValue="presets" className="space-y-2 md:space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-auto gap-0.5 p-0.5 sticky top-0 z-10 bg-muted/95 backdrop-blur-sm rounded-lg border border-gray-100/80 shadow-sm">
            <TabsTrigger value="presets" data-testid="tab-presets" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span>Presets</span>
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span className="text-center whitespace-normal break-words px-0.5">
                <span className="hidden min-[420px]:inline">WhatsApp Library ({templates.length})</span>
                <span className="min-[420px]:hidden">WA Lib. ({templates.length})</span>
              </span>
            </TabsTrigger>
            <TabsTrigger value="retargeting" data-testid="tab-retargeting" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight">
              <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span>Campaigns ({retargetableChats.length})</span>
            </TabsTrigger>
            <TabsTrigger value="growth-engines" data-testid="tab-growth-engines" className="text-[11px] sm:text-sm py-1.5 px-1 sm:px-2 md:px-3 flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1 rounded-md leading-tight relative">
              <Rocket className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 sm:mr-0" />
              <span className="text-center leading-tight">
                <span className="hidden sm:inline">Growth Engines</span>
                <span className="sm:hidden">Growth</span>
              </span>
              <Badge variant="secondary" className="absolute -top-0.5 -right-0.5 text-[9px] px-1 py-0 h-4 bg-purple-100 text-purple-700 border-0 hidden sm:flex">NEW</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="space-y-3 md:space-y-4 mt-0">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2 pt-4 md:pt-6 px-4 md:px-6">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <Sparkles className="h-5 w-5 text-purple-500 shrink-0" />
                  Preset Automation Templates
                </CardTitle>
                <CardDescription className="text-sm">
                  Start with ready-made WhatsApp sequences in English, Spanish, and Hebrew.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 md:px-6">
                <LocalizedTemplateSelector 
                  showPreviewOnly={false}
                  onSelectTemplate={(template, values) => {
                    console.log("Selected template:", template, values);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-3 md:space-y-4 mt-0">
            <div className="space-y-0.5 px-0.5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900">WhatsApp Approved Library</h2>
              <p className="text-sm text-gray-500">
                Templates synced from Meta WhatsApp Manager and ready for compliant sending.
              </p>
            </div>

            {templatesLoading ? (
              <div className="flex items-center justify-center py-10 md:py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : templates.length === 0 ? (
              <Card className="overflow-hidden">
                <CardContent className="py-10 md:py-12 text-center px-4">
                  <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <h3 className="font-semibold text-gray-900 mb-2">No Templates Found</h3>
                  <p className="text-gray-500 text-sm mb-4 max-w-md mx-auto">
                    Sync your approved templates from your WhatsApp provider to start sending messages.
                  </p>
                  <Button 
                    onClick={() => syncTemplatesMutation.mutate()}
                    disabled={syncTemplatesMutation.isPending}
                    className="bg-brand-green hover:bg-brand-green/90"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncTemplatesMutation.isPending ? 'animate-spin' : ''}`} />
                    Sync Templates
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 md:gap-4 md:grid-cols-2">
                {templates.map((template) => {
                  const StatusIcon = STATUS_ICONS[template.status]?.icon || AlertCircle;
                  const statusColor = STATUS_ICONS[template.status]?.color || "text-gray-500";
                  const TypeIcon = getTemplateIcon(template.templateType);
                  const qs = libraryQuickSendMeta(template);
                  const syncMeta = template.twilioSid?.startsWith("meta_");
                  const approved = template.status === "approved";
                  const catClass =
                    CATEGORY_BADGE_CLASS[(template.category || "").toLowerCase()] ||
                    "bg-gray-50 text-gray-700 border-gray-200";

                  return (
                    <Card key={template.id} className="overflow-hidden border-gray-200/80 shadow-sm min-w-0" data-testid={`template-card-${template.id}`}>
                      <CardHeader className="pb-2 pt-4 px-4 space-y-3">
                        <div className="flex items-start justify-between gap-2 min-w-0">
                          <div className="flex items-start gap-2 min-w-0">
                            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                              <TypeIcon className="h-4 w-4 text-gray-600" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="text-base leading-snug break-words">{template.name}</CardTitle>
                              <div className="flex items-center gap-1.5 mt-1">
                                <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${statusColor}`} />
                                <span className={`text-xs capitalize ${statusColor}`}>{template.status}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {approved ? (
                            <Badge variant="outline" className="text-[10px] font-medium border-emerald-200 bg-emerald-50/90 text-emerald-800">
                              WhatsApp approved
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="text-[10px] font-normal border-gray-200 bg-white text-gray-600">
                            {syncMeta ? "Synced from Meta" : "Synced from Twilio"}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] font-medium border ${catClass}`}>
                            {formatCategoryBadgeLabel(template.category)}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] font-mono font-normal border-gray-200 bg-gray-50 text-gray-700">
                            {formatLanguageCode(template.language)}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={
                              qs.blocked
                                ? "text-[10px] font-normal border-gray-200 bg-gray-50 text-gray-700"
                                : "text-[10px] font-normal border-emerald-200 bg-emerald-50/80 text-emerald-900"
                            }
                          >
                            {qs.blocked ? "Advanced template" : "Quick-send ready"}
                          </Badge>
                          {(template.variables?.length ?? 0) > 0 ? (
                            <Badge variant="outline" className="text-[10px] font-normal border-gray-200 bg-white text-gray-700">
                              Variables required
                            </Badge>
                          ) : null}
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 pt-0">
                        <div className="bg-gray-50 rounded-lg p-3 mb-3 max-h-28 md:max-h-32 overflow-y-auto overscroll-contain">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4 break-words">
                            {template.bodyText || "No body text"}
                          </p>
                        </div>
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3 min-w-0">
                            {template.variables.map((v: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-[10px] max-w-full truncate">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Button 
                          size="sm" 
                          className="w-full bg-brand-green hover:bg-brand-green/90"
                          disabled={template.status !== "approved"}
                          onClick={() => handleUseTemplate(template)}
                          data-testid={`button-use-template-${template.id}`}
                        >
                          <Send className="h-3 w-3 mr-2" />
                          Use Template
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <Card className="border-gray-200 bg-gray-50/80 shadow-none">
              <CardContent className="py-3 md:py-4 px-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-gray-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-1 text-gray-900">About WhatsApp Templates</p>
                    <p className="leading-relaxed">
                      Templates must be created and approved in your WhatsApp Business (Meta) or Twilio console before they appear here.
                      Use &quot;Sync Templates&quot; to fetch your latest approved templates from your active provider.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retargeting" className="space-y-3 md:space-y-4 mt-0">
            <div className="space-y-0.5 px-0.5">
              <h2 className="text-base md:text-lg font-semibold text-gray-900">Retargeting Campaigns</h2>
              <p className="text-sm text-gray-500">
                Re-engage leads using approved WhatsApp templates and smart timing.
              </p>
            </div>
            <Card className="overflow-hidden border-gray-200/80">
              <CardHeader className="pb-3 px-4 pt-4">
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-brand-green shrink-0" />
                  Contacts ready to message
                </CardTitle>
                <CardDescription className="text-sm">
                  These contacts haven&apos;t messaged in over 24 hours. Send them an approved template to re-engage.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {chatsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : retargetableChats.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No contacts ready for retargeting</p>
                    <p className="text-sm">All your contacts are within the 24-hour messaging window</p>
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-3 max-h-[280px] md:max-h-[320px] overflow-y-auto pr-1 md:pr-2 overscroll-contain" style={{ scrollbarWidth: 'thin' }}>
                    {retargetableChats.map((chat) => (
                      <div 
                        key={chat.id} 
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between p-3 border border-gray-200 rounded-xl hover:bg-gray-50/80 min-w-0"
                        data-testid={`retarget-chat-${chat.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div 
                            className="h-10 w-10 rounded-full bg-cover bg-center bg-gray-200"
                            style={{ backgroundImage: chat.avatar ? `url(${chat.avatar})` : undefined }}
                          >
                            {!chat.avatar && (
                              <div className="h-full w-full flex items-center justify-center text-gray-500 font-medium">
                                {chat.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{chat.name}</p>
                            <p className="text-xs text-gray-500">
                              Last active {chat.daysSinceLastMessage} day{chat.daysSinceLastMessage !== 1 ? 's' : ''} ago
                            </p>
                          </div>
                        </div>
                        <Select 
                          onValueChange={(templateId) => {
                            const template = templates.find(t => t.id === templateId);
                            if (template) handleSendTemplate(template, chat);
                          }}
                        >
                          <SelectTrigger className="w-full sm:w-[160px] min-h-[40px] shrink-0" data-testid={`select-template-${chat.id}`}>
                            <SelectValue placeholder="Send template" />
                          </SelectTrigger>
                          <SelectContent position="popper" side="bottom" align="end" className="z-[100] w-[200px] max-h-[300px] overflow-y-auto bg-white border border-gray-200 shadow-lg">
                            {templates.filter(t => t.status === "approved").length > 0 ? (
                              templates.filter(t => t.status === "approved").map((template) => (
                                <SelectItem key={template.id} value={template.id} className="cursor-pointer hover:bg-gray-100">
                                  {template.name}
                                </SelectItem>
                              ))
                            ) : (
                              <div className="p-2 text-xs text-gray-500 text-center">
                                No approved templates found.<br/>
                                Please sync or approve templates first.
                              </div>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="growth-engines" className="mt-0 space-y-2 md:space-y-4">
            <GrowthEnginesTab />
          </TabsContent>
        </Tabs>

        {/* Contact Picker Dialog */}
        <Dialog open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
          <DialogContent className="max-w-md" data-testid="dialog-contact-picker">
            <DialogHeader>
              <DialogTitle>Select a Contact</DialogTitle>
              <DialogDescription>
                Choose who to send <strong>{selectedTemplate?.name}</strong> to
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Search contacts..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  data-testid="input-contact-search"
                />
              </div>
              <div className="max-h-[340px] overflow-y-auto space-y-1 pr-1" style={{ scrollbarWidth: "thin" }}>
                {allChats
                  .filter(c => c.whatsappPhone && (
                    !contactSearch ||
                    c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
                    (c.whatsappPhone || "").includes(contactSearch)
                  ))
                  .map((chat) => (
                    <button
                      key={chat.id}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200 transition-colors"
                      onClick={() => selectedTemplate && handleSendTemplate(selectedTemplate, chat)}
                      data-testid={`contact-picker-chat-${chat.id}`}
                    >
                      <div className="h-9 w-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-gray-600 font-medium text-sm">
                        {chat.avatar ? (
                          <img src={chat.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
                        ) : (
                          chat.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{chat.name}</p>
                        <p className="text-xs text-gray-500 truncate">{chat.whatsappPhone}</p>
                      </div>
                    </button>
                  ))}
                {allChats.filter(c => c.whatsappPhone).length === 0 && (
                  <p className="text-center text-sm text-gray-500 py-6">No contacts with WhatsApp numbers found.</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Send Template Dialog */}
        <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
          <DialogContent className="max-w-lg">
            {selectedTemplate && selectedChat && (
              <>
                <DialogHeader>
                  <DialogTitle>Send Template to {selectedChat.name}</DialogTitle>
                  <DialogDescription>
                    Fill in the template variables and send
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    {renderTemplatePreview(selectedTemplate)}
                  </div>
                  
                  {selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                    <div className="space-y-3">
                      <Label>Template Variables</Label>
                      {selectedTemplate.variables.map((variable: string, i: number) => (
                        <div key={i} className="space-y-1">
                          <Label htmlFor={`var-${variable}`} className="text-sm text-gray-600">
                            {`{{${variable}}}`}
                          </Label>
                          <Input
                            id={`var-${variable}`}
                            placeholder={`Enter value for ${variable}`}
                            value={variableValues[variable] || ""}
                            onChange={(e) => setVariableValues(prev => ({ ...prev, [variable]: e.target.value }))}
                            data-testid={`input-variable-${variable}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={() => sendTemplateMutation.mutate({
                      templateId: selectedTemplate.id,
                      chatId: selectedChat.id,
                      variables: variableValues,
                    })}
                    disabled={sendTemplateMutation.isPending}
                    className="bg-brand-green hover:bg-brand-green/90"
                    data-testid="button-send-template"
                  >
                    {sendTemplateMutation.isPending ? "Sending..." : "Send Template"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
        </div>
      </div>
    </div>
  );
}
