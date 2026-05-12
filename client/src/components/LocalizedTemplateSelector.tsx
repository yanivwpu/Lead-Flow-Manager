import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  Loader2,
} from "lucide-react";
import { getCurrentLanguage, getDirection } from "@/lib/i18n";
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

type CreatePresetCampaignResponse = {
  campaign?: { id: string };
  message?: string;
};

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

function defaultPlaceholderMap(template: AutomationTemplate): Record<string, string> {
  const initial: Record<string, string> = {};
  template.placeholders.forEach((p) => {
    initial[p] = `{{${p}}}`;
  });
  return initial;
}

interface LocalizedTemplateSelectorProps {
  /** Optional legacy hook after a campaign is created from a preset */
  onSelectTemplate?: (template: AutomationTemplate, placeholderValues: Record<string, string>) => void;
  /** Opens the full saved-campaign editor for the new draft */
  onCampaignCreated?: (campaignId: string) => void;
  showPreviewOnly?: boolean;
}

export function LocalizedTemplateSelector({
  onSelectTemplate,
  onCampaignCreated,
  showPreviewOnly = false,
}: LocalizedTemplateSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const VALID_TEMPLATE_LANGS = ["en", "he", "es"] as const;
  const rawLang = getCurrentLanguage() || "en";
  const normalizedLang = rawLang.split("-")[0].toLowerCase();
  const currentLang = (VALID_TEMPLATE_LANGS as readonly string[]).includes(normalizedLang)
    ? (normalizedLang as "en" | "he" | "es")
    : null;

  const [selectedLanguage, setSelectedLanguage] = useState<string>(currentLang ?? "all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedIndustry, setSelectedIndustry] = useState<string>("all");
  const [readOnlyPreviewTemplate, setReadOnlyPreviewTemplate] = useState<AutomationTemplate | null>(null);
  const [readOnlyPreviewOpen, setReadOnlyPreviewOpen] = useState(false);
  const isRTL = getDirection() === "rtl";

  const { data, isLoading } = useQuery<TemplateResponse>({
    queryKey: ["/api/automation-templates", selectedLanguage, selectedCategory, selectedIndustry],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedLanguage !== "all") params.set("language", selectedLanguage);
      if (selectedCategory !== "all") params.set("category", selectedCategory);
      if (selectedIndustry !== "all") params.set("industry", selectedIndustry);

      const res = await fetch(`/api/automation-templates?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: { template: AutomationTemplate; placeholderDefaults: Record<string, string> }) => {
      const res = await apiRequest("POST", "/api/preset-campaigns", {
        sourcePresetId: data.template.id,
        name: data.template.name,
        language: data.template.language,
        category: data.template.category,
        industry: data.template.industry,
        messages: data.template.messages,
        placeholders: data.template.placeholders,
        placeholderDefaults: data.placeholderDefaults,
        aiEnabled: data.template.aiEnabled,
        channel: "whatsapp",
        launchImmediately: false,
      });
      return res.json() as Promise<CreatePresetCampaignResponse>;
    },
    onSuccess: (payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/preset-campaigns"] });
      const id = payload.campaign?.id;
      if (id) onCampaignCreated?.(id);
      onSelectTemplate?.(variables.template, variables.placeholderDefaults);
    },
    onError: () => {
      toast({
        title: t("errors.somethingWentWrong", "Something went wrong"),
        description: t("templates.campaignSaveFailed", "Could not save campaign"),
        variant: "destructive",
      });
    },
  });

  const templates = data?.templates || [];
  const categoryLabels = data?.categoryLabels?.[selectedLanguage as keyof typeof data.categoryLabels] || {};
  const industryLabels = data?.industryLabels?.[selectedLanguage as keyof typeof data.industryLabels] || {};

  const openReadOnlyPreview = (template: AutomationTemplate) => {
    setReadOnlyPreviewTemplate(template);
    setReadOnlyPreviewOpen(true);
  };

  const useTemplateFromPreset = (template: AutomationTemplate) => {
    createCampaignMutation.mutate({
      template,
      placeholderDefaults: defaultPlaceholderMap(template),
    });
  };

  const replacePlaceholders = (content: string, map: Record<string, string>): string => {
    let result = content;
    for (const [key, value] of Object.entries(map)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value || `{{${key}}}`);
    }
    return result;
  };

  const readOnlyPlaceholderMap = readOnlyPreviewTemplate
    ? defaultPlaceholderMap(readOnlyPreviewTemplate)
    : {};

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
      case "initial":
        return "bg-emerald-100 text-emerald-700";
      case "followup":
        return "bg-blue-100 text-blue-700";
      case "reminder":
        return "bg-amber-100 text-amber-700";
      case "feedback":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4" dir={isRTL ? "rtl" : "ltr"}>
        <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${isRTL ? "text-right" : ""}`}>
          <div>
            <Label className={`text-sm font-medium mb-2 block ${isRTL ? "text-right" : ""}`}>
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
            <Label className={`text-sm font-medium mb-2 block ${isRTL ? "text-right" : ""}`}>
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
            <Label className={`text-sm font-medium mb-2 block ${isRTL ? "text-right" : ""}`}>
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

        {isLoading ? (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
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
          <div className="py-8 text-center text-gray-500">
            {t("templates.noTemplates", "No templates found for the selected filters")}
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4 ${isRTL ? "text-right" : ""}`}
            dir={isRTL ? "rtl" : "ltr"}
          >
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-md transition-shadow touch-manipulation">
                <CardHeader className="pb-2">
                  <div className={`flex items-start justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                    <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                      {getCategoryIcon(template.category)}
                      <CardTitle className="text-base">{template.name}</CardTitle>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {template.language.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription className="text-sm">{template.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className={`flex flex-wrap gap-1 mb-3 ${isRTL ? "flex-row-reverse justify-end" : ""}`}>
                    <Badge className={getMessageTypeColor(template.category)} variant="secondary">
                      <span className={`flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                        {getIndustryIcon(template.industry)}
                        <span>{industryLabels[template.industry] || template.industry}</span>
                      </span>
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <span className={`flex items-center gap-1 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <Clock className="h-3 w-3" />
                        <span>
                          {template.messages.length} {t("templates.messages", "messages")}
                        </span>
                      </span>
                    </Badge>
                    {template.aiEnabled && <Badge className="bg-purple-100 text-purple-700">AI</Badge>}
                  </div>

                  <div
                    className={`flex items-stretch gap-2 ${isRTL ? "flex-row-reverse" : ""} ${showPreviewOnly ? "justify-end" : ""}`}
                  >
                    {!showPreviewOnly && (
                      <Button
                        type="button"
                        size="sm"
                        className="min-w-0 flex-1 min-h-[44px] bg-brand-green hover:bg-brand-green/90 text-white font-medium shadow-sm"
                        onClick={() => useTemplateFromPreset(template)}
                        disabled={createCampaignMutation.isPending}
                        data-testid={`template-use-${template.id}`}
                      >
                        <span className={`flex items-center justify-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                          {createCampaignMutation.isPending ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{t("templates.useTemplate", "Use Template")}</span>
                        </span>
                      </Button>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 min-h-[44px] min-w-[44px] border-gray-200"
                          onClick={() => openReadOnlyPreview(template)}
                          data-testid={`template-preview-${template.id}`}
                          aria-label={t("templates.previewPresetAria", "Preview template")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {t("templates.quickPreview", "Quick preview")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={readOnlyPreviewOpen} onOpenChange={setReadOnlyPreviewOpen}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[75vh] sm:max-h-[85vh] overflow-hidden flex flex-col pb-safe">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {readOnlyPreviewTemplate && getCategoryIcon(readOnlyPreviewTemplate.category)}
                {readOnlyPreviewTemplate?.name}
              </DialogTitle>
              <DialogDescription>{readOnlyPreviewTemplate?.description}</DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 overflow-auto">
              <p className="text-xs text-muted-foreground mb-3">
                {t(
                  "templates.readOnlyPreviewHint",
                  "Read-only preview. Placeholders show as {{name}} until you edit the campaign."
                )}
              </p>
              <div className="space-y-4 pr-2">
                {readOnlyPreviewTemplate?.messages.map((msg, idx) => (
                  <div key={idx} className="border rounded-lg p-4 bg-gray-50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getMessageTypeColor(msg.type)}>{msg.type}</Badge>
                      <span className="text-xs text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {msg.delay === "0" ? t("templates.immediate", "Immediate") : msg.delay}
                      </span>
                    </div>
                    <div
                      className="whitespace-pre-wrap text-sm bg-white p-3 rounded border"
                      dir={readOnlyPreviewTemplate.language === "he" ? "rtl" : "ltr"}
                    >
                      {replacePlaceholders(msg.content, readOnlyPlaceholderMap)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <DialogFooter className="pt-4 border-t mt-auto shrink-0">
              <Button type="button" variant="outline" onClick={() => setReadOnlyPreviewOpen(false)} className="w-full sm:w-auto">
                {t("common.close", "Close")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
