import {
  crmWithMlsIntegrationConfig,
  realEstateCrmConfig,
  unifiedInboxConfig,
  shopifyCrmConfig,
  whatsappBusinessApiConfig,
  aiLeadScoringConfig,
  sharedTeamInboxConfig,
  automationTemplatesConfig,
} from "@/content/seo";
import { SeoLandingPage } from "@/components/marketing/SeoLandingPage";

export function CrmWithMlsIntegrationPage() {
  return <SeoLandingPage config={crmWithMlsIntegrationConfig} />;
}
export function RealEstateCrmPage() {
  return <SeoLandingPage config={realEstateCrmConfig} />;
}
export function UnifiedInboxPage() {
  return <SeoLandingPage config={unifiedInboxConfig} />;
}
export function ShopifyCrmPage() {
  return <SeoLandingPage config={shopifyCrmConfig} />;
}
export function WhatsappBusinessApiPage() {
  return <SeoLandingPage config={whatsappBusinessApiConfig} />;
}
export function AiLeadScoringPage() {
  return <SeoLandingPage config={aiLeadScoringConfig} />;
}
export function SharedTeamInboxPage() {
  return <SeoLandingPage config={sharedTeamInboxConfig} />;
}
export function AutomationTemplatesPage() {
  return <SeoLandingPage config={automationTemplatesConfig} />;
}
