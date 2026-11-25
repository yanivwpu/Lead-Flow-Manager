import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PRESET_CAMPAIGNS_API } from "@shared/appNav";
import type { PresetCampaignDetail, PresetCampaignListItem } from "@/lib/presetCampaignTypes";

export function usePresetCampaignWorkspace(options: {
  detailId: string | null;
  detailEnabled: boolean;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pendingDeleteCampaignId, setPendingDeleteCampaignId] = useState<string | null>(null);

  const { data: savedPresetCampaigns = [], isLoading: savedCampaignsLoading, isError: savedCampaignsError, refetch: retrySavedCampaigns } = useQuery<
    PresetCampaignListItem[]
  >({
    queryKey: [PRESET_CAMPAIGNS_API],
    staleTime: 0,
  });

  const { data: savedCampaignDetail, isLoading: savedCampaignDetailLoading } = useQuery<PresetCampaignDetail>({
    queryKey: [PRESET_CAMPAIGNS_API, options.detailId],
    queryFn: async () => {
      const res = await fetch(`${PRESET_CAMPAIGNS_API}/${options.detailId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load campaign");
      return res.json();
    },
    enabled: options.detailEnabled && !!options.detailId,
    staleTime: 0,
  });

  const invalidateListAndDetail = async () => {
    queryClient.invalidateQueries({ queryKey: [PRESET_CAMPAIGNS_API] });
    if (options.detailId) {
      queryClient.invalidateQueries({ queryKey: [PRESET_CAMPAIGNS_API, options.detailId] });
    }
    await queryClient.refetchQueries({ queryKey: [PRESET_CAMPAIGNS_API] });
    if (options.detailId) {
      await queryClient.refetchQueries({ queryKey: [PRESET_CAMPAIGNS_API, options.detailId] });
    }
  };

  const patchPresetCampaignMutation = useMutation({
    mutationFn: async (vars: { id: string; body: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `${PRESET_CAMPAIGNS_API}/${vars.id}`, vars.body);
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: async () => {
      await invalidateListAndDetail();
    },
    onError: () => {
      toast({
        title: t("outreachUi.saveFailed"),
        variant: "destructive",
      });
    },
  });

  const deletePresetCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `${PRESET_CAMPAIGNS_API}/${id}`);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [PRESET_CAMPAIGNS_API] });
      setPendingDeleteCampaignId(null);
      await queryClient.refetchQueries({ queryKey: [PRESET_CAMPAIGNS_API] });
      options.onDeleted?.();
    },
    onError: () => {
      toast({
        title: t("outreachUi.deleteFailed"),
        variant: "destructive",
      });
    },
  });

  const enrollmentActionMutation = useMutation({
    mutationFn: async (vars: {
      enrollmentId: string;
      action: "pause" | "resume" | "cancel" | "retry";
    }) => {
      const res = await apiRequest(
        "POST",
        `/api/campaign-enrollments/${vars.enrollmentId}/${vars.action}`,
        {},
      );
      return res.json() as Promise<{ enrollment?: unknown }>;
    },
    onSuccess: async () => {
      await invalidateListAndDetail();
    },
    onError: () => {
      toast({
        title: t("outreachUi.enrollmentFailed"),
        variant: "destructive",
      });
    },
  });

  const duplicatePresetCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `${PRESET_CAMPAIGNS_API}/${id}/duplicate`);
      return res.json() as Promise<{ message?: string }>;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: [PRESET_CAMPAIGNS_API] });
      await queryClient.refetchQueries({ queryKey: [PRESET_CAMPAIGNS_API] });
    },
    onError: () => {
      toast({
        title: t("outreachUi.copyFailed"),
        variant: "destructive",
      });
    },
  });

  return {
    savedPresetCampaigns,
    savedCampaignsLoading,
    savedCampaignsError,
    retrySavedCampaigns,
    savedCampaignDetail,
    savedCampaignDetailLoading,
    pendingDeleteCampaignId,
    setPendingDeleteCampaignId,
    patchPresetCampaignMutation,
    deletePresetCampaignMutation,
    enrollmentActionMutation,
    duplicatePresetCampaignMutation,
  };
}
