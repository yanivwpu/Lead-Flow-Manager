import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Facebook,
  Instagram,
  Inbox,
  RefreshCcw,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface MetaPage {
  id: string;
  name: string;
  category: string;
  picture?: string;
  accessToken: string;
  instagramAccountId?: string;
  instagramUsername?: string;
}

interface ConnectPageResult {
  success: boolean;
  pageId?: string;
  pageName?: string;
  instagramAccountId?: string;
  instagramUsername?: string;
  steps: {
    tokenValid: boolean;
    permissionsOk: boolean;
    webhookSubscribed: boolean;
    instagramDetected: boolean;
  };
  warnings: string[];
  error?: string;
}

type WizardStage = "idle" | "page_select" | "connecting" | "success";

type ProgressStatus = "pending" | "running" | "done" | "warn" | "error";

interface ProgressState {
  token: ProgressStatus;
  permissions: ProgressStatus;
  webhook: ProgressStatus;
  instagram: ProgressStatus;
  saving: ProgressStatus;
}

const BLANK_PROGRESS: ProgressState = {
  token: "pending",
  permissions: "pending",
  webhook: "pending",
  instagram: "pending",
  saving: "pending",
};

function ProgressItem({ label, status }: { label: string; status: ProgressStatus }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {status === "pending" && (
        <div className="h-4 w-4 rounded-full border-2 border-gray-200 flex-shrink-0" />
      )}
      {status === "running" && (
        <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
      )}
      {status === "done" && (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
      )}
      {status === "warn" && (
        <CheckCircle2 className="h-4 w-4 text-amber-500 flex-shrink-0" />
      )}
      {status === "error" && (
        <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
      )}
      <span
        className={
          status === "pending"
            ? "text-sm text-gray-400"
            : status === "running"
            ? "text-sm text-gray-700 font-medium"
            : status === "done"
            ? "text-sm text-gray-700"
            : status === "warn"
            ? "text-sm text-amber-700"
            : "text-sm text-red-700"
        }
      >
        {label}
      </span>
    </div>
  );
}

export interface ConnectMetaFbIgWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: "facebook" | "instagram";
  initialStage?: "idle" | "page_select";
}

export function ConnectMetaFbIgWizard({
  open,
  onOpenChange,
  channel,
  initialStage = "idle",
}: ConnectMetaFbIgWizardProps) {
  const queryClient = useQueryClient();
  const isFacebook = channel === "facebook";
  const ChannelIcon = isFacebook ? Facebook : Instagram;
  const iconColor = isFacebook ? "#1877F2" : "#E4405F";

  const [stage, setStage] = useState<WizardStage>(
    initialStage === "page_select" ? "page_select" : "idle"
  );
  const [pages, setPages] = useState<MetaPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [redirectLoading, setRedirectLoading] = useState(false);
  const [selectedPage, setSelectedPage] = useState<MetaPage | null>(null);
  const [connectResult, setConnectResult] = useState<ConnectPageResult | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState>(BLANK_PROGRESS);

  // Fetch pending pages from session when opened in page_select stage
  useEffect(() => {
    if (open && stage === "page_select") {
      void fetchPendingPages();
    }
  }, [open, stage]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPendingPages = async () => {
    setPagesLoading(true);
    setPagesError(null);
    try {
      const resp = await fetch("/api/integrations/meta/oauth-pages", { credentials: "include" });
      if (!resp.ok) {
        const data = (await resp.json()) as any;
        setPagesError(data.error || "Could not load your pages — please reconnect");
        setStage("idle");
        return;
      }
      const data = (await resp.json()) as { channel: string; pages: MetaPage[] };
      let pageList = data.pages || [];
      if (channel === "instagram") {
        pageList = pageList.filter((p) => !!p.instagramAccountId);
      }
      setPages(pageList);
    } catch (e: any) {
      setPagesError(e.message || "Failed to load pages");
      setStage("idle");
    } finally {
      setPagesLoading(false);
    }
  };

  const handleConnect = async () => {
    setRedirectLoading(true);
    try {
      const resp = await fetch(
        `/api/integrations/meta/auth-url?channel=${channel}`,
        { credentials: "include" }
      );
      if (!resp.ok) {
        const data = (await resp.json()) as any;
        toast({
          title: "Setup unavailable",
          description: data.error || "Could not start the connection",
          variant: "destructive",
        });
        setRedirectLoading(false);
        return;
      }
      const data = (await resp.json()) as { url: string };
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setRedirectLoading(false);
    }
  };

  const handlePageSelect = async (page: MetaPage) => {
    setSelectedPage(page);
    setConnectError(null);
    setStage("connecting");

    // Animate steps optimistically, fire request in background
    setProgress({ ...BLANK_PROGRESS, token: "running" });
    await delay(500);
    setProgress((p) => ({ ...p, token: "running", permissions: "pending" }));

    let result: ConnectPageResult;
    try {
      // Fire the request (validation + subscription + save all happen server-side)
      const resp = await fetch("/api/integrations/meta/connect-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pageId: page.id }),
      });
      result = (await resp.json()) as ConnectPageResult;
      if (!resp.ok || !result.success) {
        throw new Error(result.error || "Connection failed");
      }
    } catch (e: any) {
      setProgress({
        token: "error",
        permissions: "error",
        webhook: "error",
        instagram: "error",
        saving: "error",
      });
      setConnectError(e.message || "Connection failed — please try again");
      return;
    }

    // Animate remaining steps based on what succeeded
    setProgress((p) => ({ ...p, token: "done", permissions: "running" }));
    await delay(350);
    setProgress((p) => ({
      ...p,
      permissions: result.steps.permissionsOk ? "done" : "warn",
      webhook: "running",
    }));
    await delay(350);
    setProgress((p) => ({
      ...p,
      webhook: result.steps.webhookSubscribed ? "done" : "warn",
      instagram: "running",
    }));
    await delay(350);
    setProgress((p) => ({
      ...p,
      instagram:
        channel === "instagram"
          ? result.steps.instagramDetected
            ? "done"
            : "warn"
          : "done",
      saving: "running",
    }));
    await delay(300);
    setProgress((p) => ({ ...p, saving: "done" }));

    setConnectResult(result);
    queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/integrations/meta-webhook-config"] });

    await delay(400);
    setStage("success");
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after dialog close animation
    setTimeout(() => {
      setStage("idle");
      setPages([]);
      setSelectedPage(null);
      setConnectResult(null);
      setConnectError(null);
      setPagesError(null);
      setProgress(BLANK_PROGRESS);
    }, 300);
  };

  const channelNoun = isFacebook ? "Facebook Page" : "Instagram account";
  const channelTitle = isFacebook ? "Facebook Messenger" : "Instagram DMs";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-meta-connect">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div
              className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${iconColor}18` }}
            >
              <ChannelIcon className="h-4 w-4" style={{ color: iconColor }} />
            </div>
            <DialogTitle className="text-base">
              {stage === "success"
                ? `${channelTitle} connected`
                : `Connect ${channelTitle}`}
            </DialogTitle>
          </div>
          {stage === "idle" && (
            <DialogDescription className="text-sm text-gray-500">
              Sign in with Facebook to grant access to your {channelNoun}.
            </DialogDescription>
          )}
          {stage === "page_select" && !pagesLoading && pages.length > 0 && (
            <DialogDescription className="text-sm text-gray-500">
              Select which {channelNoun} to connect.
            </DialogDescription>
          )}
        </DialogHeader>

        {/* ── IDLE ── */}
        {stage === "idle" && (
          <div className="space-y-4">
            {pagesError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{pagesError}</p>
              </div>
            )}

            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <p className="text-xs font-medium text-gray-700">This will request permission to:</p>
              <ul className="space-y-1.5">
                {(isFacebook
                  ? [
                      "Send and receive messages on your Facebook Pages",
                      "Read page conversations and engagement",
                      "Subscribe to new message notifications",
                    ]
                  : [
                      "Access your linked Instagram professional account",
                      "Send and receive Instagram Direct Messages",
                      "Read message history and engagement",
                    ]
                ).map((item) => (
                  <li key={item} className="flex items-center gap-2 text-xs text-gray-600">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              className="w-full text-white font-medium"
              style={{ backgroundColor: iconColor }}
              onClick={handleConnect}
              disabled={redirectLoading}
              data-testid="button-connect-meta-oauth"
            >
              {redirectLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Redirecting to Facebook…
                </>
              ) : (
                <>
                  <Facebook className="h-4 w-4 mr-2" />
                  Continue with Facebook
                </>
              )}
            </Button>

            <p className="text-[10px] text-gray-400 text-center">
              You'll be taken to Facebook to approve access, then returned here automatically.
            </p>
          </div>
        )}

        {/* ── PAGE SELECT ── */}
        {stage === "page_select" && (
          <div className="space-y-3">
            {pagesLoading ? (
              <div className="flex items-center justify-center py-10 gap-2 text-gray-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading your {isFacebook ? "Pages" : "Instagram accounts"}…</span>
              </div>
            ) : pages.length === 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1.5">
                    {channel === "instagram" ? (
                      <>
                        <p className="font-medium">No linked Instagram account found.</p>
                        <p>To connect Instagram DMs your setup needs two things:</p>
                        <ol className="list-decimal list-inside space-y-1.5 pl-1">
                          <li>
                            <strong>Instagram must be a Business or Creator account.</strong> Go to Instagram → Settings → Account → Switch to Professional Account.
                          </li>
                          <li>
                            <strong>That Instagram account must be linked to your Facebook Page.</strong> Go to your Facebook Page → Settings → Linked Accounts → Instagram, and connect it there.
                          </li>
                          <li>
                            <strong>Instagram product must be added to your Meta App.</strong> In the Meta Developer Console, go to your App → Add Product → Instagram, then enable the <em>instagram_manage_messages</em> permission.
                          </li>
                        </ol>
                        <p>Once done, click Reconnect below.</p>
                      </>
                    ) : (
                      <p>No Facebook Pages found. Make sure you manage at least one Facebook Page and granted the requested permissions.</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setStage("idle")}
                  data-testid="button-try-again"
                >
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Reconnect with Facebook
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {pages.map((page) => (
                    <button
                      key={page.id}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50/40 transition-colors text-left group"
                      onClick={() => handlePageSelect(page)}
                      data-testid={`button-select-page-${page.id}`}
                    >
                      {page.picture ? (
                        <img
                          src={page.picture}
                          alt={page.name}
                          className="h-9 w-9 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: `${iconColor}18` }}
                        >
                          <ChannelIcon className="h-4 w-4" style={{ color: iconColor }} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm text-gray-900 truncate">{page.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {channel === "instagram" && page.instagramUsername
                            ? `@${page.instagramUsername}`
                            : page.category || "Facebook Page"}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 group-hover:text-blue-500 transition-colors" />
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400">
                  Can't see your {channelNoun}?{" "}
                  <button
                    className="text-blue-500 hover:underline"
                    onClick={() => setStage("idle")}
                  >
                    Reconnect with Facebook
                  </button>
                </p>
              </>
            )}
          </div>
        )}

        {/* ── CONNECTING ── */}
        {stage === "connecting" && (
          <div className="space-y-4">
            {selectedPage && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                {selectedPage.picture ? (
                  <img
                    src={selectedPage.picture}
                    alt={selectedPage.name}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${iconColor}18` }}
                  >
                    <ChannelIcon className="h-4 w-4" style={{ color: iconColor }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{selectedPage.name}</p>
                  <p className="text-xs text-gray-500">
                    {connectError ? "Connection failed" : "Setting up…"}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-0.5 px-1">
              <ProgressItem label="Verifying page access" status={progress.token} />
              <ProgressItem label="Checking granted permissions" status={progress.permissions} />
              <ProgressItem label="Subscribing to incoming messages" status={progress.webhook} />
              <ProgressItem
                label={
                  channel === "instagram"
                    ? "Detecting linked Instagram account"
                    : "Finalising channel setup"
                }
                status={progress.instagram}
              />
              <ProgressItem label="Saving connection" status={progress.saving} />
            </div>

            {connectError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-medium text-red-700">Connection failed</p>
                  <p className="text-xs text-red-600">{connectError}</p>
                  <button
                    className="text-xs text-blue-600 hover:underline mt-0.5"
                    onClick={() => {
                      setStage("page_select");
                      setConnectError(null);
                      setProgress(BLANK_PROGRESS);
                    }}
                  >
                    Go back and try a different page
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SUCCESS ── */}
        {stage === "success" && connectResult && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <p className="font-semibold text-emerald-800">Ready to receive messages</p>
              </div>
              <p className="text-sm text-emerald-700 pl-7">
                {channel === "instagram" && connectResult.instagramUsername
                  ? `@${connectResult.instagramUsername}`
                  : connectResult.pageName}
              </p>
              {channel === "instagram" && connectResult.instagramUsername && (
                <p className="text-xs text-emerald-600 pl-7">via {connectResult.pageName}</p>
              )}
            </div>

            {connectResult.warnings && connectResult.warnings.length > 0 && (
              <div className="space-y-1.5">
                {connectResult.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg"
                  >
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">{w}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-2">
              <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-blue-800 font-medium mb-1">Test your connection</p>
                <ol className="text-xs text-blue-700 space-y-0.5 list-decimal list-inside">
                  <li>
                    Send a message to your {isFacebook ? "Facebook Page" : "Instagram account"} from another account
                  </li>
                  <li>
                    Open your{" "}
                    <a
                      href="/app/inbox"
                      className="underline font-medium"
                      onClick={handleClose}
                    >
                      Unified Inbox
                    </a>{" "}
                    — it should appear within seconds
                  </li>
                  <li>Reply from the inbox to confirm two-way messaging</li>
                </ol>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 text-center">
              Only new inbound messages will sync — existing conversation history is not imported.
            </p>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClose}
                data-testid="button-close-success"
              >
                Close
              </Button>
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  handleClose();
                  window.location.href = "/app/inbox";
                }}
                data-testid="button-go-to-inbox"
              >
                <Inbox className="h-4 w-4 mr-1.5" />
                Go to Inbox
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
