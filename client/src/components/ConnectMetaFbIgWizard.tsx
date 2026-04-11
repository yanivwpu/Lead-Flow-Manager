import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  Eye,
  EyeOff,
  Facebook,
  Instagram,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConnectMetaFbIgWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: "facebook" | "instagram";
  mode?: "connect" | "manage";
  existingWebhookUrl?: string;
  existingVerifyToken?: string;
}

type Step = 1 | 2 | 3;

export function ConnectMetaFbIgWizard({
  open,
  onOpenChange,
  channel,
  mode = "connect",
  existingWebhookUrl,
  existingVerifyToken,
}: ConnectMetaFbIgWizardProps) {
  const queryClient = useQueryClient();
  const isFacebook = channel === "facebook";
  const channelLabel = isFacebook ? "Facebook Messenger" : "Instagram";
  const ChannelIcon = isFacebook ? Facebook : Instagram;
  const iconColor = isFacebook ? "#1877F2" : "#E4405F";

  const [step, setStep] = useState<Step>(mode === "manage" ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(existingWebhookUrl || "");
  const [verifyToken, setVerifyToken] = useState(existingVerifyToken || "");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const copy = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const reset = () => {
    setStep(mode === "manage" ? 2 : 1);
    setLoading(false);
    setError(null);
    setAccessToken("");
    setPageId("");
    setWebhookUrl(existingWebhookUrl || "");
    setVerifyToken(existingVerifyToken || "");
    setShowToken(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const type = isFacebook ? "meta_facebook" : "meta_instagram";
      const config = isFacebook
        ? { accessToken, pageId }
        : { accessToken, instagramId: pageId };

      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type,
          name: channelLabel,
          config,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save credentials. Check your token and ID.");
        return;
      }
      if (data.webhookSetup) {
        setWebhookUrl(data.webhookSetup.webhookUrl);
        setVerifyToken(data.webhookSetup.verifyToken);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/meta-webhook-config"] });
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Connection failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    setStep(3);
  };

  const webhookEvents = ["messages", "messaging_postbacks", "messaging_seen"];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading) {
          if (!v) reset();
          onOpenChange(v);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${iconColor}20` }}
            >
              <ChannelIcon className="h-5 w-5" style={{ color: iconColor }} />
            </div>
            <div>
              <DialogTitle>
                {step === 3 ? `${channelLabel} Connected!` : `Connect ${channelLabel}`}
              </DialogTitle>
              <DialogDescription>
                {step === 1 && "Enter your credentials from Meta Developer Portal"}
                {step === 2 && (mode === "manage"
                  ? "Your webhook configuration for Meta Developer Portal"
                  : "Configure the webhook in Meta Developer Portal")}
                {step === 3 && "Your channel is set up and ready to use"}
              </DialogDescription>
            </div>
          </div>

          {step !== 3 && (
            <div className="flex items-center gap-1 mt-4">
              {([1, 2] as Step[]).map((s, i) => (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                      step === s
                        ? "bg-blue-600 text-white"
                        : step > s
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {step > s ? <Check className="h-3 w-3" /> : s}
                  </div>
                  <span
                    className={`text-xs ${
                      step === s ? "text-gray-900 font-medium" : "text-gray-400"
                    }`}
                  >
                    {s === 1 ? "Credentials" : "Webhook"}
                  </span>
                  {i < 1 && <div className="w-8 h-px bg-gray-200 mx-1" />}
                </div>
              ))}
            </div>
          )}
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-900 mb-1">Before you start</p>
              <p className="text-[11px] text-blue-800">
                You need a Meta App with{" "}
                {isFacebook ? "Messenger" : "Instagram"} enabled and a
                {isFacebook ? " Facebook Page" : "n Instagram Business account"}.
              </p>
              <a
                href={
                  isFacebook
                    ? "https://developers.facebook.com/docs/messenger-platform/getting-started"
                    : "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 mt-1.5 font-medium"
              >
                View setup guide <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-access-token">
                {isFacebook ? "Page Access Token" : "Instagram Graph Token"}
              </Label>
              <Input
                id="meta-access-token"
                type="password"
                placeholder={isFacebook ? "EAAGm..." : "IGQB..."}
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                data-testid={`input-${channel}-access-token`}
              />
              <p className="text-[10px] text-gray-500">
                {isFacebook
                  ? "From Meta Business Manager → System Users. Requires pages_messaging permission."
                  : "From Meta Developer Portal. Requires instagram_basic and instagram_manage_messages permissions."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="meta-page-id">
                {isFacebook ? "Page ID" : "Instagram Account ID"}
              </Label>
              <Input
                id="meta-page-id"
                placeholder={isFacebook ? "123456789" : "17841400000000000"}
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                data-testid={`input-${channel}-page-id`}
              />
              <p className="text-[10px] text-gray-500">
                {isFacebook
                  ? "Found on your Facebook Page → About → Page ID"
                  : "Found in Instagram → Settings → Professional account → Instagram account ID"}
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleConnect}
                disabled={loading || !accessToken.trim() || !pageId.trim()}
                data-testid={`button-${channel}-save-credentials`}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save & Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2">
            {mode !== "manage" && (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">
                  Credentials saved — messaging engine is ready
                </p>
              </div>
            )}

            <p className="text-sm font-semibold text-gray-800">
              Configure webhook in Meta Developer Portal
            </p>

            <div className="space-y-4 text-sm text-gray-700">
              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
                  1
                </span>
                <p>
                  Go to{" "}
                  <a
                    href="https://developers.facebook.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 underline font-medium"
                  >
                    Meta Developer Portal
                  </a>{" "}
                  → Your App →{" "}
                  <strong>{isFacebook ? "Messenger" : "Instagram"} Settings</strong>
                </p>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
                  2
                </span>
                <p>
                  Under <strong>Webhooks</strong>, click{" "}
                  <strong>Edit Callback URL</strong> or{" "}
                  <strong>Add Webhooks</strong>
                </p>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
                  3
                </span>
                <div className="flex-1 space-y-2">
                  <p>
                    Paste this <strong>Callback URL</strong>:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={webhookUrl}
                      className="text-xs font-mono bg-gray-50"
                      data-testid="input-fb-ig-webhook-url"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copy(webhookUrl, setCopiedUrl)}
                      data-testid="button-copy-webhook-url"
                    >
                      {copiedUrl ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
                  4
                </span>
                <div className="flex-1 space-y-2">
                  <p>
                    Paste this <strong>Verify Token</strong>:
                  </p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      type={showToken ? "text" : "password"}
                      value={verifyToken}
                      className="text-xs font-mono bg-gray-50"
                      data-testid="input-fb-ig-verify-token"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowToken(!showToken)}
                      data-testid="button-toggle-verify-token"
                    >
                      {showToken ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copy(verifyToken, setCopiedToken)}
                      data-testid="button-copy-verify-token"
                    >
                      {copiedToken ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
                  5
                </span>
                <p>
                  Click <strong>Verify and Save</strong> — Meta will ping your
                  webhook URL to confirm it works
                </p>
              </div>

              <div className="flex gap-3">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
                  6
                </span>
                <div className="flex-1 space-y-1.5">
                  <p>
                    Under <strong>Webhook Fields</strong>, subscribe to:
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {webhookEvents.map((ev) => (
                      <span
                        key={ev}
                        className="text-xs bg-gray-100 border border-gray-200 px-2 py-0.5 rounded font-mono"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Inbound messages won't arrive</strong> until the webhook
                is verified and subscribed in Meta Developer Portal.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleClose}
                data-testid="button-webhook-later"
              >
                {mode === "manage" ? "Close" : "I'll do this later"}
              </Button>
              {mode !== "manage" && (
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleDone}
                  data-testid="button-webhook-done"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Done — Webhook Configured
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-semibold text-gray-900">{channelLabel} is connected!</p>
              <p className="text-sm text-gray-500">
                {isFacebook ? "Facebook Messenger" : "Instagram DM"} messages
                will appear in your inbox once the webhook is active.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleClose}
              data-testid="button-close-success"
            >
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
