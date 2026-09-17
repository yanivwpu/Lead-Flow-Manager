/**
 * Workspace Marketing Materials — approved flyers, brochures, images, and PDFs
 * the Website Chat AI may send. Files stay on existing tenant object storage.
 */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type MarketingAsset = {
  id: string;
  displayName: string;
  description: string | null;
  language: string;
  topics: string[];
  kind: "image" | "document";
  enabled: boolean;
  mimeType: string;
  originalFilename: string;
  size: number;
  fileUrl: string;
};

const LANGUAGE_OPTIONS = [
  { value: "all", label: "All languages" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "he", label: "Hebrew" },
] as const;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MarketingMaterialsSettings() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("all");
  const [topicsText, setTopicsText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ assets: MarketingAsset[] }>({
    queryKey: ["/api/marketing-assets"],
  });
  const assets = data?.assets || [];

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pendingFile) throw new Error("Choose a JPG, PNG, WebP, or PDF file");
      const form = new FormData();
      form.append("file", pendingFile);
      form.append("displayName", displayName.trim() || pendingFile.name);
      form.append("description", description.trim());
      form.append("language", language);
      form.append("topics", topicsText);
      const res = await fetch("/api/marketing-assets", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing-assets"] });
      setDisplayName("");
      setDescription("");
      setTopicsText("");
      setLanguage("all");
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast({ title: "Marketing material added" });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Upload failed", variant: "destructive" });
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (input: { id: string; body: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/marketing-assets/${input.id}`, input.body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing-assets"] });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Update failed", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/marketing-assets/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/marketing-assets"] });
      setDeleteId(null);
      toast({ title: "Material removed. Past chat messages are unchanged." });
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Delete failed", variant: "destructive" });
    },
  });

  return (
    <Card
      className="rounded-2xl border-0 bg-white/95 shadow-md shadow-slate-900/[0.03] ring-1 ring-violet-100/50"
      data-testid="marketing-materials"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-slate-900">Marketing Materials</CardTitle>
        <CardDescription className="text-slate-600" data-testid="text-marketing-send-modes">
          Upload approved flyers, brochures, images, and PDFs. In Auto mode, Website Chat AI may send an enabled file only when a visitor asks for it. Suggest and Manual never send a file automatically — review the draft in Inbox and send it yourself if you want.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="marketing-name">Display name</Label>
              <Input
                id="marketing-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Summer brochure"
                data-testid="input-marketing-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger data-testid="select-marketing-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="marketing-description">Short description (optional)</Label>
            <Textarea
              id="marketing-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Pricing flyer for new listings"
              className="min-h-[64px]"
              data-testid="input-marketing-description"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="marketing-topics">Topics / tags</Label>
            <Input
              id="marketing-topics"
              value={topicsText}
              onChange={(e) => setTopicsText(e.target.value)}
              placeholder="pricing, brochure, listings"
              data-testid="input-marketing-topics"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              data-testid="input-marketing-file"
              onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              data-testid="btn-marketing-choose-file"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {pendingFile ? pendingFile.name : "Choose JPG, PNG, WebP, or PDF"}
            </Button>
            <Button
              type="button"
              onClick={() => uploadMutation.mutate()}
              disabled={!pendingFile || uploadMutation.isPending}
              data-testid="btn-marketing-upload"
            >
              {uploadMutation.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Upload
            </Button>
          </div>
          <p className="text-xs text-slate-500">Images up to 5 MB. PDFs up to 16 MB. Past chats keep files even after you delete or disable them here.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading materials…
          </div>
        ) : assets.length === 0 ? (
          <p className="text-sm text-slate-500" data-testid="text-marketing-empty">
            No approved materials yet. Upload a flyer or PDF to let AI send it in Website Chat.
          </p>
        ) : (
          <ul className="space-y-3">
            {assets.map((asset) => (
              <li
                key={asset.id}
                className={cn(
                  "rounded-xl border border-slate-200 p-3 sm:p-4",
                  !asset.enabled && "opacity-70",
                )}
                data-testid={`marketing-asset-${asset.id}`}
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {asset.kind === "image" ? (
                      <img
                        src={asset.fileUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <FileText className="h-6 w-6 text-rose-600" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <Input
                      defaultValue={asset.displayName}
                      aria-label="Display name"
                      data-testid={`input-marketing-rename-${asset.id}`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next && next !== asset.displayName) {
                          patchMutation.mutate({ id: asset.id, body: { displayName: next } });
                        }
                      }}
                    />
                    <Textarea
                      defaultValue={asset.description || ""}
                      aria-label="Description"
                      className="min-h-[56px]"
                      data-testid={`input-marketing-describe-${asset.id}`}
                      onBlur={(e) => {
                        const next = e.target.value.trim();
                        if (next !== (asset.description || "")) {
                          patchMutation.mutate({ id: asset.id, body: { description: next } });
                        }
                      }}
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={asset.language}
                        onValueChange={(value) =>
                          patchMutation.mutate({ id: asset.id, body: { language: value } })
                        }
                      >
                        <SelectTrigger data-testid={`select-marketing-lang-${asset.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        defaultValue={asset.topics.join(", ")}
                        aria-label="Topics"
                        placeholder="topics, tags"
                        data-testid={`input-marketing-tags-${asset.id}`}
                        onBlur={(e) => {
                          const next = e.target.value;
                          patchMutation.mutate({ id: asset.id, body: { topics: next } });
                        }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      {asset.kind === "image" ? (
                        <ImageIcon className="mr-1 inline h-3 w-3" />
                      ) : (
                        <FileText className="mr-1 inline h-3 w-3" />
                      )}
                      {asset.originalFilename} · {formatSize(asset.size)}
                    </p>
                    <p className="text-[11px] text-slate-500" data-testid={`text-marketing-history-${asset.id}`}>
                      Disabling or deleting stops future AI sends. Past Website Chat messages keep their file.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`enabled-${asset.id}`} className="text-xs text-slate-600">
                        Enabled
                      </Label>
                      <Switch
                        id={`enabled-${asset.id}`}
                        checked={asset.enabled}
                        onCheckedChange={(enabled) =>
                          patchMutation.mutate({ id: asset.id, body: { enabled } })
                        }
                        data-testid={`switch-marketing-enabled-${asset.id}`}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => setDeleteId(asset.id)}
                      data-testid={`btn-marketing-delete-${asset.id}`}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this marketing material?</AlertDialogTitle>
            <AlertDialogDescription>
              AI will no longer be able to send it. Messages already delivered in Website Chat keep their copy of the file.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="btn-marketing-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="btn-marketing-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
