import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VICTORIA_PARK_TITLE, victoriaParkContentComplete } from "@shared/agent/victoriaPark";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { parseAgentPageApiError } from "@/lib/agentPageApi";

const endpoint = "/api/agent-page/neighborhood";

type PilotSettings = {
  content: string;
  published: boolean;
  eligible: boolean;
  publicUrl: string | null;
};

export function VictoriaParkPilotSettings({ publicPageUrl }: { publicPageUrl: string | null }) {
  const client = useQueryClient();
  const [edited, setEdited] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: [endpoint, publicPageUrl],
    queryFn: async (): Promise<PilotSettings | null> => {
      const response = await fetch(endpoint, { credentials: "include" });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Unable to load neighborhood settings");
      return response.json();
    },
  });
  const save = useMutation({
    mutationFn: async (published: boolean): Promise<Omit<PilotSettings, "eligible">> => {
      const response = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: edited ?? data?.content ?? "", published }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(parseAgentPageApiError(result));
      return result;
    },
    onSuccess: (result) => {
      client.setQueryData([endpoint, publicPageUrl], { ...data, ...result });
      setEdited(null);
      toast({ title: result.published ? "Neighborhood page published" : "Neighborhood draft saved" });
    },
    onError: (error: Error) => toast({ title: "Save failed", description: error.message, variant: "destructive" }),
  });

  if (!data) return null;
  const content = edited ?? data.content;
  const dirty = content.trim() !== data.content;
  const canPublish = data.eligible && victoriaParkContentComplete(content);
  const publicUrl = data.publicUrl;

  return (
    <section className="space-y-3 border-t border-gray-100 px-4 py-4 sm:px-6" aria-labelledby="neighborhood-pages-heading">
      <h3 id="neighborhood-pages-heading" className="text-sm font-semibold">Neighborhood Pages</h3>
      <Label htmlFor="victoria-park-content">{VICTORIA_PARK_TITLE}</Label>
      <Textarea
        id="victoria-park-content"
        rows={9}
        maxLength={5000}
        value={content}
        disabled={save.isPending}
        onChange={(event) => setEdited(event.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Review the local copy before publishing. Save at least two paragraphs, with 240 characters total. Listings are omitted during the pilot.
      </p>
      {!data.eligible && <p className="text-xs text-muted-foreground">Enable your pilot Agent Page to preview or publish.</p>}
      <div className="flex flex-wrap gap-2">
        {!data.published && (
          <Button type="button" variant="outline" size="sm" disabled={save.isPending || !dirty} onClick={() => save.mutate(false)}>
            Save draft
          </Button>
        )}
        {data.eligible && !dirty && (
          <Button asChild variant="outline" size="sm">
            <a href={`${endpoint}/preview`} target="_blank" rel="noopener noreferrer">Preview saved page</a>
          </Button>
        )}
        <Button type="button" size="sm" disabled={save.isPending || !canPublish || (data.published && !dirty)} onClick={() => save.mutate(true)}>
          {data.published ? "Update published page" : "Publish"}
        </Button>
        {data.published && (
          <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate(false)}>
            Unpublish
          </Button>
        )}
      </div>
      {publicUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <a className="break-all text-sm underline" href={publicUrl} target="_blank" rel="noopener noreferrer">{publicUrl}</a>
          <Button type="button" size="sm" variant="outline" onClick={async () => {
            try {
              await navigator.clipboard.writeText(publicUrl);
              toast({ title: "Link copied" });
            } catch {
              toast({ title: "Could not copy the URL", description: "Select the displayed URL to copy it." });
            }
          }}>Copy URL</Button>
        </div>
      )}
    </section>
  );
}
