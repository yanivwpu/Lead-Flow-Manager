import { ProductPage } from "@/components/marketing/ProductPage";
import {
  aiBrainProduct,
  aiCopilotProduct,
  automationsProduct,
  campaignsProduct,
  chatbotBuilderProduct,
  integrationsProduct,
  teamCollaborationProduct,
  unifiedInboxProduct,
} from "@shared/productPages";

export function AiBrainProductPage() {
  return <ProductPage content={aiBrainProduct} />;
}

export function AiCopilotProductPage() {
  return <ProductPage content={aiCopilotProduct} />;
}

export function AutomationsProductPage() {
  return <ProductPage content={automationsProduct} />;
}

export function ChatbotBuilderProductPage() {
  return <ProductPage content={chatbotBuilderProduct} />;
}

export function CampaignsProductPage() {
  return <ProductPage content={campaignsProduct} />;
}

export function IntegrationsProductPage() {
  return <ProductPage content={integrationsProduct} />;
}

export function UnifiedInboxProductPage() {
  return <ProductPage content={unifiedInboxProduct} />;
}

export function TeamCollaborationProductPage() {
  return <ProductPage content={teamCollaborationProduct} />;
}
