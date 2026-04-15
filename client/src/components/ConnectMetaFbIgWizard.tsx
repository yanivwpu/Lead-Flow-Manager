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
  Clock,
  XCircle,
  AlertTriangle,
  Info,
  Inbox,
  MessageSquare,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConnectMetaFbIgWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: "facebook" | "instagram";
  /** "connect" = full 3-step flow from credentials
   *  "pending-webhook" = start at step 2 (credentials already saved)
   *  "manage" = view-only webhook config for fully connected channel
   */
  mode?: "connect" | "pending-webhook" | "manage";
  existingWebhookUrl?: string;
  existingVerifyToken?: string;
}

type Step = 1 | 2 | 3;

interface ValidationResult {
  tokenValid: boolean;
  tokenOwner: string | null;
  grantedScopes: string[];
  missingScopes: string[];
  pageAccessible: boolean;
  pageName: string | null;
  pageSubscribed: boolean;
  pageSubscriptionError: string | null;
  error?: string;
}

type ValidationStatus = "idle" | "running" | "done";

const REQUIRED_SCOPE_LABELS: Record<string, string> = {
  pages_messaging: "Send/receive messages",
  pages_read_engagement: "Read page engagement",
  pages_manage_metadata: "Manage page metadata",
  instagram_basic: "Instagram basic access",
  instagram_manage_messages: "Manage Instagram messages",
  pages_show_list: "List Facebook Pages",
  instagram_manage_metadata: "Manage Instagram metadata",
};

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

  const initialStep: Step = mode === "connect" ? 1 : 2;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState(existingWebhookUrl || "");
  const [verifyToken, setVerifyToken] = useState(existingVerifyToken || "");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  // Resolved page/account name from validation — persisted for the test step
  const [savedPageName, setSavedPageName] = useState<string>("");

  // Validation state
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const copy = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const reset = () => {
    setStep(initialStep);
    setLoading(false);
    setConfirmLoading(false);
    setError(null);
    setAccessToken("");
    setPageId("");
    setWebhookUrl(existingWebhookUrl || "");
    setVerifyToken(existingVerifyToken || "");
    setShowToken(false);
    setValidationStatus("idle");
    setValidationResult(null);
    setSavedPageName("");
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  // Phase A: Validate credentials against Facebook Graph API
  const handleValidateAndSave = async () => {
    if (!accessToken.trim() || !pageId.trim()) return;

    setLoading(true);
    setError(null);
    setValidationStatus("running");
    setValidationResult(null);

    try {
      // Step A1: Validate token, check scopes, verify page access, subscribe page
      const validateRes = await fetch("/api/integrations/meta-validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accessToken, pageId, channel }),
      });
      const vData: ValidationResult & { error?: string } = await validateRes.json();

      setValidationResult(vData);
      setValidationStatus("done");
      if (vData.pageName) setSavedPageName(vData.pageName);

      // Critical failures: bad token or no page access — block proceeding
      if (!vData.tokenValid || !vData.pageAccessible) {
        setError(vData.error || "Validation failed. Please check your credentials.");
        setLoading(false);
        return;
      }

      // Token + page OK — save credentials (include pageName so channel card can display it)
      const type = isFacebook ? "meta_facebook" : "meta_instagram";
      const config = isFacebook
        ? { accessToken, pageId, pageName: vData.pageName || "" }
        : { accessToken, instagramId: pageId, pageName: vData.pageName || "" };

      const saveRes = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, name: channelLabel, config }),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) {
        setError(saveData.error || "Failed to save credentials.");
        setLoading(false);
        return;
      }
      if (saveData.webhookSetup) {
        setWebhookUrl(saveData.webhookSetup.webhookUrl);
        setVerifyToken(saveData.webhookSetup.verifyToken);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/meta-webhook-config"] });
      setStep(2);
    } catch (err: any) {
      setError(err.message || "Connection failed. Please try again.");
      setValidationStatus("idle");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmWebhook = async () => {
    setConfirmLoading(true);
    try {
      const res = await fetch("/api/integrations/meta-webhook-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Could not confirm webhook",
          description: data.error || "Please try again.",
          variant: "destructive",
        });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/meta-webhook-config"] });
      setStep(3);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to confirm webhook. Please try again.",
        variant: "destructive",
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  const webhookEvents = isFacebook
    ? ["messages", "messaging_postbacks", "messaging_seen", "messaging_referrals"]
    : ["messages", "messaging_seen"];

  // Derived: can the user proceed to step 2?
  const validationPassed =
    validationResult !== null &&
    validationResult.tokenValid &&
    validationResult.pageAccessible;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!loading && !confirmLoading) {
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
                {step === 3
                  ? `${channelLabel} — Ready to receive messages`
                  : mode === "manage"
                  ? `${channelLabel} — Webhook Config`
                  : `Connect ${channelLabel}`}
              </DialogTitle>
              <DialogDescription>
                {step === 1 && "Enter your credentials from Meta Developer Portal"}
                {step === 2 &&
                  (mode === "manage"
                    ? "Your webhook configuration for Meta Developer Portal"
                    : "Configure the webhook in Meta Developer Portal to activate inbound messages")}
                {step === 3 && "Send a test message to confirm the pipeline is live"}
              </DialogDescription>
            </div>
          </div>

          {mode !== "manage" && (
            <div className="flex items-center gap-1 mt-4">
              {([1, 2, 3] as Step[]).map((s, i) => (
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
                    {s === 1 ? "Credentials" : s === 2 ? "Webhook" : "Test"}
                  </span>
                  {i < 2 && <div className="w-6 h-px bg-gray-200 mx-1" />}
                </div>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* ── Step 1: Credentials + Validation ── */}
        {step === 1 && (
          <div className="space-y-4 py-2">
            {/* Instagram prerequisite notice */}
            {!isFacebook && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-900 mb-1">
                    Facebook Page required before connecting Instagram
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Your Instagram Professional account must be linked to a Facebook Page.
                    Complete Facebook Messenger setup first (or confirm your Instagram account
                    is already linked to a Page in Meta Business Suite).
                  </p>
                  <p className="text-[11px] text-amber-800 mt-1">
                    The token you enter must have <strong>instagram_manage_messages</strong>{" "}
                    and <strong>pages_show_list</strong> permissions.
                  </p>
                </div>
              </div>
            )}

            {/* Facebook: required scopes notice */}
            {isFacebook && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-900 mb-1">Before you start</p>
                <p className="text-[11px] text-blue-800">
                  You need a Meta App with Messenger enabled and a Facebook Page. Your Page
                  Access Token must include:{" "}
                  <strong>pages_messaging</strong>,{" "}
                  <strong>pages_manage_metadata</strong>.
                </p>
                <a
                  href="https://developers.facebook.com/docs/messenger-platform/getting-started"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 mt-1.5 font-medium"
                >
                  View setup guide <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="meta-access-token">
                {isFacebook ? "Page Access Token" : "Instagram Graph Token"}
              </Label>
              <Input
                id="meta-access-token"
                type="password"
                placeholder={isFacebook ? "EAAGm..." : "IGQB..."}
                value={accessToken}
                onChange={(e) => {
                  setAccessToken(e.target.value);
                  if (validationStatus === "done") {
                    setValidationStatus("idle");
                    setValidationResult(null);
                  }
                  setError(null);
                }}
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
                onChange={(e) => {
                  setPageId(e.target.value);
                  if (validationStatus === "done") {
                    setValidationStatus("idle");
                    setValidationResult(null);
                  }
                  setError(null);
                }}
                data-testid={`input-${channel}-page-id`}
              />
              <p className="text-[10px] text-gray-500">
                {isFacebook
                  ? "Found on your Facebook Page → About → Page ID"
                  : "Found in Instagram → Settings → Professional account → Instagram account ID"}
              </p>
            </div>

            {/* Validation results checklist */}
            {validationStatus === "running" && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Validating credentials with Meta…</span>
                </div>
              </div>
            )}

            {validationStatus === "done" && validationResult && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-700 mb-1">Validation results</p>

                <ChecklistRow
                  ok={validationResult.tokenValid}
                  label={
                    validationResult.tokenValid
                      ? `Token valid${validationResult.tokenOwner ? ` — ${validationResult.tokenOwner}` : ""}`
                      : "Token invalid — check your access token"
                  }
                />

                <ChecklistRow
                  ok={validationResult.pageAccessible}
                  label={
                    validationResult.pageAccessible
                      ? `${isFacebook ? "Page" : "Account"} accessible${validationResult.pageName ? ` — ${validationResult.pageName}` : ""}`
                      : `Cannot access ${isFacebook ? "Facebook Page" : "Instagram account"} with this ID`
                  }
                />

                {validationResult.missingScopes.length > 0 ? (
                  <div className="flex gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-amber-800 font-medium">
                        Missing permissions (you can still proceed, but some features may not work):
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {validationResult.missingScopes.map((s) => (
                          <li key={s} className="text-[10px] text-amber-700 font-mono">
                            {s} — {REQUIRED_SCOPE_LABELS[s] ?? s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : validationResult.grantedScopes.length > 0 ? (
                  <ChecklistRow ok label="Required permissions granted" />
                ) : null}

                {validationResult.pageSubscribed ? (
                  <ChecklistRow ok label="Page auto-subscribed to webhook events" />
                ) : validationResult.pageSubscriptionError ? (
                  <div className="flex gap-2">
                    <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-blue-800">
                      Page subscription: {validationResult.pageSubscriptionError} — you can
                      subscribe manually in Meta Developer Portal (webhook fields step).
                    </p>
                  </div>
                ) : null}
              </div>
            )}

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

              {/* If validation passed — show "Save & Continue" to proceed to step 2 */}
              {validationPassed ? (
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleValidateAndSave}
                  disabled={loading}
                  data-testid={`button-${channel}-save-credentials`}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & Continue
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  onClick={handleValidateAndSave}
                  disabled={loading || !accessToken.trim() || !pageId.trim()}
                  data-testid={`button-${channel}-validate`}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {validationStatus === "done" && !validationPassed
                    ? "Re-validate"
                    : "Validate & Save"}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Webhook Setup ── */}
        {step === 2 && (
          <div className="space-y-4 py-2">
            {mode !== "manage" && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Clock className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 font-medium">
                    Credentials saved — complete webhook setup to start receiving messages
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    The channel won't show as connected until you confirm webhook setup below.
                  </p>
                </div>
              </div>
            )}

            <p className="text-sm font-semibold text-gray-800">
              Configure webhook in Meta Developer Portal
            </p>

            <div className="space-y-4 text-sm text-gray-700">
              <div className="flex gap-3">
                <StepBadge n={1} />
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
                <StepBadge n={2} />
                <p>
                  Under <strong>Webhooks</strong>, click{" "}
                  <strong>Edit Callback URL</strong> or <strong>Add Webhooks</strong>
                </p>
              </div>

              <div className="flex gap-3">
                <StepBadge n={3} />
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
                <StepBadge n={4} />
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
                <StepBadge n={5} />
                <p>
                  Click <strong>Verify and Save</strong> — Meta will ping your webhook URL
                  to confirm it works
                </p>
              </div>

              <div className="flex gap-3">
                <StepBadge n={6} />
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
                  <p className="text-[11px] text-gray-500 mt-1">
                    Note: page subscription to webhook events was auto-attempted during
                    validation. If it failed, complete this step manually.
                  </p>
                </div>
              </div>
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
                  onClick={handleConfirmWebhook}
                  disabled={confirmLoading}
                  data-testid="button-webhook-done"
                >
                  {confirmLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                  )}
                  I've completed webhook setup
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3: Test & Ready ── */}
        {step === 3 && (
          <div className="space-y-4 py-2">
            {/* Status banner */}
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900">
                  Ready to receive messages
                </p>
                {savedPageName ? (
                  <p className="text-xs text-emerald-700 truncate">
                    {isFacebook ? "Page" : "Account"}:{" "}
                    <span className="font-medium">{savedPageName}</span>
                    {pageId && (
                      <span className="text-emerald-600 ml-1 font-mono">({pageId})</span>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-emerald-700">
                    {isFacebook ? "Facebook Messenger" : "Instagram DM"} channel active
                  </p>
                )}
              </div>
            </div>

            {/* Sync scope caveat */}
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Info className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-900">
                  Only new messages will sync
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Historical conversations and past messages are{" "}
                  <strong>not</strong> imported. Only new inbound messages arriving
                  after this setup will appear in your inbox. Contact support if
                  you need historical message import.
                </p>
              </div>
            </div>

            {/* Live test instructions */}
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-gray-500 flex-shrink-0" />
                <p className="text-sm font-semibold text-gray-800">
                  Confirm with a live test message
                </p>
              </div>
              <ol className="space-y-1.5 pl-1">
                <li className="flex gap-2 text-xs text-gray-700">
                  <StepBadge n={1} />
                  <span>
                    {isFacebook
                      ? "Open Facebook on your personal account and go to your Page"
                      : "Open Instagram and go to your Professional account"}
                  </span>
                </li>
                <li className="flex gap-2 text-xs text-gray-700">
                  <StepBadge n={2} />
                  <span>
                    {isFacebook
                      ? 'Send a message to the Page from a different account (or use Facebook\'s "Test User" feature in Meta Developer Portal)'
                      : "Send a Direct Message to your Instagram Professional account from a different account"}
                  </span>
                </li>
                <li className="flex gap-2 text-xs text-gray-700">
                  <StepBadge n={3} />
                  <span>
                    Open your{" "}
                    <a
                      href="/app/inbox"
                      className="text-blue-600 hover:underline font-medium"
                      onClick={handleClose}
                    >
                      Unified Inbox
                    </a>{" "}
                    — the message should appear within a few seconds
                  </span>
                </li>
              </ol>
            </div>

            {/* What appears in inbox */}
            <div className="flex gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <Inbox className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800">
                Each message from a new sender automatically creates a contact and
                opens a conversation in your inbox. Replies you send from the inbox
                are delivered back through{" "}
                {isFacebook ? "Messenger" : "Instagram DM"}.
              </p>
            </div>

            <div className="flex gap-2 pt-1">
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

// Small helper components

function ChecklistRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
      )}
      <p className={`text-xs ${ok ? "text-gray-700" : "text-red-700 font-medium"}`}>
        {label}
      </p>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mt-0.5">
      {n}
    </span>
  );
}
