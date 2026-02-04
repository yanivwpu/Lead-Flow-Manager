import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  ShoppingCart, 
  Users, 
  Bell, 
  Tag, 
  Building2, 
  Stethoscope, 
  Home, 
  Plane, 
  Store,
  Clock,
  Send,
  Eye,
  Check,
  Rocket,
  Loader2
} from "lucide-react";
import { getCurrentLanguage, getDirection, type SupportedLanguage } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";

interface AutomationTemplate {
  id: string;
  language: string;
  category: string;
  industry: string;
  name: string;
  description: string;
  messages: Array<{
    delay: string;
    content: string;
    type: string;
  }>;
  placeholders: string[];
  aiEnabled: boolean;
}

interface TemplateResponse {
  templates: AutomationTemplate[];
  categoryLabels: Record<string, Record<string, string>>;
  industryLabels: Record<string, Record<string, string>>;
}

const CATEGORY_ICONS: Record<string, any> = {
  abandoned_cart: ShoppingCart,
  lead_nurture: Users,
  service_reminder: Bell,
  promotions: Tag,
};

const INDUSTRY_ICONS: Record<string, any> = {
  general: Building2,
  clinic: Stethoscope,
  real_estate: Home,
  travel: Plane,
  ecommerce: Store,
};

interface LocalizedTemplateSelectorProps {
  onSelectTemplate?: (template: AutomationTemplate, placeholderValues: Record<string, string>) => void;
  showPreviewOnly?: boolean;
}

export function LocalizedTemplateSelector({ 
  onSelectTemplate,
  showPreviewOnly = false 
}: LocalizedTemplateSelectorProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const currentLang = (getCurrentLanguage() || "en") as "en" | "he" | "es";
  
  const [selectedLanguage, setSelectedLanguage] = useState<string>(currentLang);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("all");
  const [previewTemplate, setPreviewTemplate] = useState<AutomationTemplate | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [launchImmediately, setLaunchImmediately] = useState(false);
  const isRTL = getDirection() === 'rtl';

  const { data, isLoading } = useQuery<TemplateResponse>({
    queryKey: ["/api/automation-templates", selectedLanguage, selectedCategory, selectedIndustry],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLanguage !== "all") params.set("language", selectedLanguage);
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (selectedIndustry !== "all") params.set("industry", selectedIndustry);
      
      const res = await fetch(`/api/automation-templates?${params.toString()}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    }
  });
  
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: { template: AutomationTemplate; placeholderDefaults: Record<string, string>; activate: boolean }) => {
      const response = await apiRequest("POST", "/api/user-automation-templates", {
        presetTemplateId: data.template.id,
        name: data.template.name,
        language: data.template.language,
        category: data.template.category,
        industry: data.template.industry,
        messages: data.template.messages,
        placeholders: data.template.placeholders,
        placeholderDefaults: data.placeholderDefaults,
        aiEnabled: data.template.aiEnabled,
        isActive: data.activate,
      });
      return response;
    },
    onSuccess: (savedTemplate, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/user-automation-templates"] });
      toast({
        title: variables.activate 
          ? t("templates.launchedSuccess", "Automation Launched!") 
          : t("templates.savedSuccess", "Template Saved!"),
        description: variables.activate 
          ? t("templates.launchedDesc", "Your automation flow is now active.")
          : t("templates.savedDesc", "Template saved to your library."),
      });
      setPreviewDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: t("errors.somethingWentWrong", "Something went wrong"),
        description: t("templates.saveFailed", "Failed to save template"),
        variant: "destructive",
      });
    }
  });

  const templates = data?.templates || [];
  const categoryLabels = data?.categoryLabels?.[selectedLanguage as keyof typeof data.categoryLabels] || {};
  const industryLabels = data?.industryLabels?.[selectedLanguage as keyof typeof data.industryLabels] || {};

  const handlePreview = (template: AutomationTemplate) => {
    setPreviewTemplate(template);
    const initialValues: Record<string, string> = {};
    template.placeholders.forEach(p => {
      initialValues[p] = `{{${p}}}`;
    });
    setPlaceholderValues(initialValues);
    setLaunchImmediately(false);
    setPreviewDialogOpen(true);
  };

  const handleUseTemplate = () => {
    if (previewTemplate) {
      if (onSelectTemplate) {
        onSelectTemplate(previewTemplate, placeholderValues);
      }
      saveTemplateMutation.mutate({
        template: previewTemplate,
        placeholderDefaults: placeholderValues,
        activate: launchImmediately,
      });
    }
  };

  const replacePlaceholders = (content: string): string => {
    let result = content;
    for (const [key, value] of Object.entries(placeholderValues)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
    }
    return result;
  };

  const getCategoryIcon = (category: string) => {
    const IconComponent = CATEGORY_ICONS[category] || Tag;
    return <IconComponent className="h-4 w-4" />;
  };

  const getIndustryIcon = (industry: string) => {
    const IconComponent = INDUSTRY_ICONS[industry] || Building2;
    return <IconComponent className="h-4 w-4" />;
  };

  const getMessageTypeColor = (type: string) => {
    switch (type) {
      case "initial": return "bg-emerald-100 text-emerald-700";
      case "followup": return "bg-blue-100 text-blue-700";
      case "reminder": return "bg-amber-100 text-amber-700";
      case "feedback": return "bg-purple-100 text-purple-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Filters - stay fixed at top */}
      <div className={`shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white py-2 mb-2 ${isRTL ? 'text-right' : ''}`}>
        <div>
          <Label className={`text-sm font-medium mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t("language.select", "Language")}
          </Label>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger data-testid="template-language-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", "All Languages")}</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="he">עברית (Hebrew)</SelectItem>
              <SelectItem value="es">Español (Spanish)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className={`text-sm font-medium mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t("templates.category", "Category")}
          </Label>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger data-testid="template-category-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", "All Categories")}</SelectItem>
              <SelectItem value="abandoned_cart">{categoryLabels.abandoned_cart || "Abandoned Cart"}</SelectItem>
              <SelectItem value="lead_nurture">{categoryLabels.lead_nurture || "Lead Nurture"}</SelectItem>
              <SelectItem value="service_reminder">{categoryLabels.service_reminder || "Service Reminder"}</SelectItem>
              <SelectItem value="promotions">{categoryLabels.promotions || "Promotions"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className={`text-sm font-medium mb-2 block ${isRTL ? 'text-right' : ''}`}>
            {t("templates.industry", "Industry")}
          </Label>
          <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
            <SelectTrigger data-testid="template-industry-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("common.all", "All Industries")}</SelectItem>
              <SelectItem value="general">{industryLabels.general || "General"}</SelectItem>
              <SelectItem value="clinic">{industryLabels.clinic || "Healthcare"}</SelectItem>
              <SelectItem value="real_estate">{industryLabels.real_estate || "Real Estate"}</SelectItem>
              <SelectItem value="travel">{industryLabels.travel || "Travel"}</SelectItem>
              <SelectItem value="ecommerce">{industryLabels.ecommerce || "E-commerce"}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Templates grid - scrollable area */}
      {isLoading ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 mt-2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-20 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <Card className="p-8 text-center w-full max-w-sm">
            <p className="text-gray-500">{t("templates.noTemplates", "No templates found for the selected filters")}</p>
          </Card>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-10 ${isRTL ? 'text-right' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow touch-manipulation">
                <CardHeader className="pb-2">
                  <div className={`flex items-start justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      {getCategoryIcon(template.category)}
                      <CardTitle className="text-base">{template.name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {template.language.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription className="text-sm">
                    {template.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`flex flex-wrap gap-1 mb-3 ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
                    <Badge className={getMessageTypeColor(template.category)} variant="secondary">
                      <span className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        {getIndustryIcon(template.industry)}
                        <span>{industryLabels[template.industry] || template.industry}</span>
                      </span>
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <span className={`flex items-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Clock className="h-3 w-3" />
                        <span>{template.messages.length} {t("templates.messages", "messages")}</span>
                      </span>
                    </Badge>
                    {template.aiEnabled && (
                      <Badge className="bg-purple-100 text-purple-700">AI</Badge>
                    )}
                  </div>
                  
                  <div className={`flex flex-row gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 min-h-[44px]"
                      onClick={() => handlePreview(template)}
                      data-testid={`template-preview-${template.id}`}
                    >
                      <span className={`flex items-center justify-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Eye className="h-4 w-4" />
                        <span>{t("common.view", "Preview")}</span>
                      </span>
                    </Button>
                    {!showPreviewOnly && (
                      <Button 
                        size="sm" 
                        className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => handlePreview(template)}
                        data-testid={`template-use-${template.id}`}
                      >
                        <span className={`flex items-center justify-center gap-1 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          <Check className="h-4 w-4" />
                          <span>{t("common.select", "Use")}</span>
                        </span>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewTemplate && getCategoryIcon(previewTemplate.category)}
              {previewTemplate?.name}
            </DialogTitle>
            <DialogDescription>
              {previewTemplate?.description}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 overflow-auto">
            <Tabs defaultValue="preview" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="preview">{t("templates.preview", "Preview")}</TabsTrigger>
                <TabsTrigger value="placeholders">{t("templates.customize", "Customize")}</TabsTrigger>
              </TabsList>
              
              <TabsContent value="preview" className="space-y-4 mt-4">
                {previewTemplate?.messages.map((msg, idx) => (
                  <div key={idx} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getMessageTypeColor(msg.type)}>
                        {msg.type}
                      </Badge>
                      <span className="text-xs text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {msg.delay === "0" ? t("templates.immediate", "Immediate") : msg.delay}
                      </span>
                    </div>
                    <div 
                      className="whitespace-pre-wrap text-sm bg-white p-3 rounded border"
                      dir={previewTemplate.language === "he" ? "rtl" : "ltr"}
                    >
                      {replacePlaceholders(msg.content)}
                    </div>
                  </div>
                ))}
              </TabsContent>
              
              <TabsContent value="placeholders" className="space-y-4 mt-4">
                <p className="text-sm text-gray-500 mb-4">
                  {t("templates.customizeDesc", "Customize the placeholders with your actual values:")}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {previewTemplate?.placeholders.map((placeholder) => (
                    <div key={placeholder}>
                      <Label className="text-sm font-medium capitalize">
                        {placeholder.replace(/_/g, " ")}
                      </Label>
                      <Input
                        value={placeholderValues[placeholder] || ""}
                        onChange={(e) => setPlaceholderValues(prev => ({
                          ...prev,
                          [placeholder]: e.target.value
                        }))}
                        placeholder={`{{${placeholder}}}`}
                        className="mt-1"
                        data-testid={`placeholder-${placeholder}`}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </ScrollArea>
          
          <DialogFooter className="flex flex-col gap-3 pt-4 border-t mt-auto shrink-0">
            {!showPreviewOnly && (
              <div className="flex items-center gap-2 w-full">
                <Switch 
                  id="launch-immediately" 
                  checked={launchImmediately}
                  onCheckedChange={setLaunchImmediately}
                />
                <Label htmlFor="launch-immediately" className="text-sm cursor-pointer">
                  {t("templates.launchImmediately", "Launch immediately")}
                </Label>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 w-full">
              <Button variant="outline" onClick={() => setPreviewDialogOpen(false)} className="w-full sm:w-auto">
                {t("common.close", "Close")}
              </Button>
              {!showPreviewOnly && (
                <Button 
                  className={`w-full sm:w-auto ${launchImmediately ? "bg-purple-600 hover:bg-purple-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  onClick={handleUseTemplate}
                  disabled={saveTemplateMutation.isPending}
                >
                  {saveTemplateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : launchImmediately ? (
                    <Rocket className="h-4 w-4 mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  {launchImmediately 
                    ? t("templates.launchNow", "Launch Now")
                    : t("templates.saveTemplate", "Save Template")}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
