export type CampaignExecutionStats = {
  enrollmentCount: number;
  activeEnrollments: number;
  completedEnrollments: number;
  sentStepEvents: number;
  failedStepEvents: number;
};

export type PresetCampaignListItem = {
  id: string;
  name: string;
  sourcePresetId: string;
  status: string;
  statusLabel: string;
  channel: string;
  messages: unknown[];
  stepCount?: number;
  updatedAt: string;
  createdAt?: string;
  executionStats?: CampaignExecutionStats;
};

export type PresetCampaignDetail = PresetCampaignListItem & {
  language?: string | null;
  category?: string | null;
  industry?: string | null;
  delays?: unknown[];
  placeholders?: unknown[];
  placeholderDefaults?: Record<string, unknown> | null;
  aiEnabled?: boolean | null;
  audienceConfig?: Record<string, unknown> | null;
  totalSteps?: number;
  enrollments?: Array<{
    id: string;
    status: string;
    currentStepIndex: number;
    nextRunAt?: string | null;
    contactId: string;
    contactName?: string;
    createdAt?: string | null;
    totalSteps?: number;
  }>;
  recentStepEvents?: Array<{
    id: string;
    stepIndex: number;
    status: string;
    sentAt?: string | null;
    errorMessage?: string | null;
    createdAt?: string | null;
    contactId: string;
  }>;
};
