import { useQuery } from "@tanstack/react-query";
import type { PipelineLayoutResponse } from "@shared/pipelineLayout";
import { withUserQueryScope } from "./accountQueryScope";

export function usePipelineLayout(actorId: string | undefined, enabled: boolean) {
  const queryKey = withUserQueryScope(["/api/inbox/pipeline-layout"], actorId);
  const query = useQuery<PipelineLayoutResponse>({
    queryKey,
    enabled: Boolean(actorId) && enabled,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    retry: false,
  });
  return { query, queryKey };
}
