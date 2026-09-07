import { useEffect, useState } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import { Lock, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InAppProUpgradeButton } from "@/components/InAppProUpgradeButton";
import { SavedPresetCampaignModals } from "@/components/SavedPresetCampaignModals";
import { SavedPresetCampaignsTable } from "@/components/SavedPresetCampaignsTable";
import { usePresetCampaignWorkspace } from "@/hooks/usePresetCampaignWorkspace";
import { useSubscription } from "@/lib/subscription-context";
import { mustUseShopifyBilling } from "@/lib/shopifyBillingContext";
import { useShopifyShopHint } from "@/lib/shopifyBillingHint";
import { APP_CAMPAIGNS_PATH, parsePresetCampaignEditQuery, presetCampaignHref } from "@shared/appNav";

export function Campaigns() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const [, params] = useRoute("/app/campaigns/:id?");
  const campaignId =
    params?.id && String(params.id).length > 0 ? String(params.id) : null;

  const { data: subscription, isLoading: subLoading } = useSubscription();
  const shopHint = useShopifyShopHint();
  const isShopifyBilling = mustUseShopifyBilling(subscription?.subscription, shopHint);
  const canStartInternalTrial = !!subscription?.subscription?.canStartInternalTrial;
  const workflowsEnabled = Boolean(subscription?.limits?.workflowsEnabled);

  const [openInEditMode, setOpenInEditMode] = useState(false);

  useEffect(() => {
    if (campaignId && parsePresetCampaignEditQuery(searchString)) {
      setOpenInEditMode(true);
    }
  }, [campaignId, searchString]);

  const workspace = usePresetCampaignWorkspace({
    detailId: campaignId,
    detailEnabled: !!campaignId,
    onDeleted: () => {
      setOpenInEditMode(false);
      setLocation(APP_CAMPAIGNS_PATH);
    },
  });

  const closeEditor = () => {
    setOpenInEditMode(false);
    setLocation(APP_CAMPAIGNS_PATH);
  };

  const openCampaign = (id: string, edit = false) => {
    setOpenInEditMode(edit);
    setLocation(presetCampaignHref(id, { edit }));
  };

  if (
    !subLoading &&
    !workspace.savedCampaignsLoading &&
    !workflowsEnabled &&
    workspace.savedPresetCampaigns.length === 0
  ) {
    return (
      <div className="h-full overflow-y-auto px-4 md:px-6 py-6" data-testid="campaigns-page">
        <div className="max-w-5xl mx-auto">
          <Card className="overflow-hidden" data-testid="campaigns-paid-gate">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-gray-400" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 mb-2">
                Campaign automation is on Starter and Pro
              </h1>
              <p className="text-gray-500 max-w-md mb-6">
                Preset campaigns, bulk enrollment, and automation sequences require Starter or Pro.
                Start from Templates after upgrading.
              </p>
              <InAppProUpgradeButton
                canStartInternalTrial={canStartInternalTrial}
                isShopify={isShopifyBilling}
                className="bg-brand-green hover:bg-brand-green/90"
                testId="button-upgrade-template-campaigns"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" data-testid="campaigns-page">
      <div className="px-4 md:px-6 py-2 md:py-4 border-b border-gray-100 flex-shrink-0">
        <div className="max-w-5xl mx-auto space-y-0.5">
          <h1 className="text-lg md:text-2xl font-bold text-gray-900 leading-tight">Campaigns</h1>
          <p className="text-gray-500 text-xs md:text-sm leading-snug">
            Operational campaigns created from Templates. Prospect AI and Growth Engine campaigns stay
            inside their own workspaces.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-2 md:py-3 pb-24 md:pb-6">
        <div className="max-w-5xl mx-auto">
          <Card className="overflow-hidden border-gray-200/90">
            <CardHeader className="pb-2 pt-4 px-4 md:px-6">
              <CardTitle className="text-base md:text-lg">Your campaigns</CardTitle>
              <CardDescription className="text-sm">
                Draft, Active, Paused, and Completed campaigns from general templates. Enroll contacts
                from the inbox; the scheduler sends steps on each delay.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 md:px-6 pb-4">
              {workspace.savedCampaignsLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : workspace.savedPresetCampaigns.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center" data-testid="campaigns-empty">
                  No campaigns yet.{" "}
                  <Link href="/app/templates">
                    <a className="text-brand-green font-medium hover:underline">Choose a template</a>
                  </Link>{" "}
                  to create a draft.
                </p>
              ) : (
                <SavedPresetCampaignsTable
                  campaigns={workspace.savedPresetCampaigns}
                  onOpen={openCampaign}
                  onActivate={(id) =>
                    workspace.patchPresetCampaignMutation.mutate({ id, body: { status: "active" } })
                  }
                  onPause={(id) =>
                    workspace.patchPresetCampaignMutation.mutate({ id, body: { action: "pause" } })
                  }
                  onResume={(id) =>
                    workspace.patchPresetCampaignMutation.mutate({ id, body: { action: "resume" } })
                  }
                  onDuplicate={(id) => workspace.duplicatePresetCampaignMutation.mutate(id)}
                  onDelete={(id) => workspace.setPendingDeleteCampaignId(id)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SavedPresetCampaignModals
        savedCampaignModalOpen={!!campaignId}
        setSavedCampaignModalOpen={(open) => {
          if (!open) closeEditor();
        }}
        savedCampaignModalId={campaignId}
        setSavedCampaignModalId={(id) => {
          if (!id) closeEditor();
        }}
        savedCampaignOpenInEditMode={openInEditMode}
        onConsumedOpenInEditMode={() => setOpenInEditMode(false)}
        savedCampaignDetail={workspace.savedCampaignDetail}
        savedCampaignDetailLoading={workspace.savedCampaignDetailLoading}
        pendingDeleteCampaignId={workspace.pendingDeleteCampaignId}
        setPendingDeleteCampaignId={workspace.setPendingDeleteCampaignId}
        patchPresetCampaignMutation={workspace.patchPresetCampaignMutation}
        duplicatePresetCampaignMutation={workspace.duplicatePresetCampaignMutation}
        deletePresetCampaignMutation={workspace.deletePresetCampaignMutation}
        enrollmentMutation={workspace.enrollmentActionMutation}
      />
    </div>
  );
}
