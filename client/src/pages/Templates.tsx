import { useState } from "react";
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
  Users, Target, Sparkles
} from "lucide-react";
import { LocalizedTemplateSelector } from "@/components/LocalizedTemplateSelector";
import { apiRequest } from "@/lib/queryClient";

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

const CATEGORY_COLORS: Record<string, string> = {
  marketing: "bg-purple-100 text-purple-700",
  utility: "bg-blue-100 text-blue-700",
  authentication: "bg-amber-100 text-amber-700",
};

const STATUS_ICONS: Record<string, any> = {
  approved: { icon: CheckCircle2, color: "text-green-500" },
  pending: { icon: Clock, color: "text-amber-500" },
  rejected: { icon: XCircle, color: "text-red-500" },
};

export function Templates() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedChat, setSelectedChat] = useState<RetargetableChat | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [carouselIndex, setCarouselIndex] = useState(0);

  const templatesEnabled = (subscription?.limits as any)?.templatesEnabled;

  const { data: templates = [], isLoading: templatesLoading } = useQuery<MessageTemplate[]>({
    queryKey: ["/api/templates"],
    enabled: !!templatesEnabled,
  });

  const { data: retargetableChats = [], isLoading: chatsLoading } = useQuery<RetargetableChat[]>({
    queryKey: ["/api/templates/retargetable-chats"],
    enabled: !!templatesEnabled,
  });

  const syncTemplatesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/templates/sync");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
    },
  });

  const sendTemplateMutation = useMutation({
    mutationFn: async (data: { templateId: string; chatId: string; variables: Record<string, string> }) => {
      return apiRequest("POST", "/api/templates/send", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates/retargetable-chats"] });
      setSendDialogOpen(false);
      setSelectedTemplate(null);
      setSelectedChat(null);
      setVariableValues({});
    },
  });

  const handleSendTemplate = (template: MessageTemplate, chat: RetargetableChat) => {
    setSelectedTemplate(template);
    setSelectedChat(chat);
    setVariableValues({});
    setSendDialogOpen(true);
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
    <div className="flex-1 overflow-auto pb-20 md:pb-6">
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
            <p className="text-gray-500 mt-1">Send pre-approved templates for smart retargeting</p>
          </div>
          <Button 
            variant="outline"
            onClick={() => syncTemplatesMutation.mutate()}
            disabled={syncTemplatesMutation.isPending}
            data-testid="button-sync-templates"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncTemplatesMutation.isPending ? 'animate-spin' : ''}`} />
            Sync Templates
          </Button>
        </div>

        <Tabs defaultValue="presets" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto p-1">
            <TabsTrigger value="presets" data-testid="tab-presets" className="text-xs sm:text-sm py-2 px-1 sm:px-3 flex flex-col sm:flex-row items-center gap-1">
              <Sparkles className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Preset Templates</span>
              <span className="sm:hidden">Presets</span>
            </TabsTrigger>
            <TabsTrigger value="templates" data-testid="tab-templates" className="text-xs sm:text-sm py-2 px-1 sm:px-3 flex flex-col sm:flex-row items-center gap-1">
              <FileText className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Template Library ({templates.length})</span>
              <span className="sm:hidden">Library ({templates.length})</span>
            </TabsTrigger>
            <TabsTrigger value="retargeting" data-testid="tab-retargeting" className="text-xs sm:text-sm py-2 px-1 sm:px-3 flex flex-col sm:flex-row items-center gap-1">
              <Target className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Retargeting ({retargetableChats.length})</span>
              <span className="sm:hidden">Retarget ({retargetableChats.length})</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="presets" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Preset Automation Templates
                </CardTitle>
                <CardDescription className="text-sm">
                  Pre-built message sequences for different industries. Available in English, Spanish, and Hebrew.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 md:px-6 flex flex-col h-[60vh] md:h-[500px] min-h-0">
                <LocalizedTemplateSelector 
                  showPreviewOnly={false}
                  onSelectTemplate={(template, values) => {
                    console.log("Selected template:", template, values);
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : templates.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="font-semibold text-gray-900 mb-2">No Templates Found</h3>
                  <p className="text-gray-500 text-sm mb-4">
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
              <div className="grid gap-4 md:grid-cols-2">
                {templates.map((template) => {
                  const StatusIcon = STATUS_ICONS[template.status]?.icon || AlertCircle;
                  const statusColor = STATUS_ICONS[template.status]?.color || "text-gray-500";
                  const TypeIcon = getTemplateIcon(template.templateType);
                  
                  return (
                    <Card key={template.id} className="overflow-hidden" data-testid={`template-card-${template.id}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                              <TypeIcon className="h-4 w-4 text-gray-600" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={CATEGORY_COLORS[template.category] || "bg-gray-100 text-gray-700"}>
                                  {template.category}
                                </Badge>
                                <span className="text-xs text-gray-500">{template.language.toUpperCase()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                            <span className={`text-xs ${statusColor}`}>{template.status}</span>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="bg-gray-50 rounded-lg p-3 mb-3 max-h-32 overflow-y-auto">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">
                            {template.bodyText || "No body text"}
                          </p>
                        </div>
                        {template.variables && template.variables.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {template.variables.map((v: string, i: number) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {`{{${v}}}`}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Button 
                          size="sm" 
                          className="w-full bg-brand-green hover:bg-brand-green/90"
                          disabled={template.status !== "approved"}
                          onClick={() => setSelectedTemplate(template)}
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

            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">About WhatsApp Templates</p>
                    <p>Templates must be created and approved in your WhatsApp Business (Meta) or Twilio console before they appear here. 
                    Use the "Sync Templates" button to fetch your latest approved templates from your active provider.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="retargeting" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-brand-green" />
                  Contacts Ready for Retargeting
                </CardTitle>
                <CardDescription>
                  These contacts haven't messaged in over 24 hours. Send them a template to re-engage.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
                  <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin' }}>
                    {retargetableChats.map((chat) => (
                      <div 
                        key={chat.id} 
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        data-testid={`retarget-chat-${chat.id}`}
                      >
                        <div className="flex items-center gap-3">
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
                          <SelectTrigger className="w-[160px] min-h-[40px]" data-testid={`select-template-${chat.id}`}>
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
        </Tabs>

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
  );
}
