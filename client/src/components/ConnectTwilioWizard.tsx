import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink, Copy, Check } from "lucide-react";

interface ConnectTwilioWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = "credentials" | "webhook" | "success";

export function ConnectTwilioWizard({ open, onOpenChange, onSuccess }: ConnectTwilioWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusCopied, setStatusCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [statusCallbackUrl, setStatusCallbackUrl] = useState("");
  const [webhooksConfigured, setWebhooksConfigured] = useState(false);
  
  const [credentials, setCredentials] = useState({
    accountSid: "",
    authToken: "",
    whatsappNumber: "",
  });

  const handleValidateAndConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/twilio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to connect Twilio");
        return;
      }

      setWebhookUrl(data.webhookUrl);
      setStatusCallbackUrl(data.statusCallbackUrl);
      setWebhooksConfigured(data.webhooksConfigured || false);
      
      // If webhooks were auto-configured, skip to success
      if (data.webhooksConfigured) {
        handleComplete();
      } else {
        setStep("webhook");
      }
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyWebhook = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyStatus = async () => {
    await navigator.clipboard.writeText(statusCallbackUrl);
    setStatusCopied(true);
    setTimeout(() => setStatusCopied(false), 2000);
  };

  const handleComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/twilio/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    setStep("success");
    setTimeout(() => {
      onOpenChange(false);
      onSuccess?.();
      setStep("credentials");
      setCredentials({ accountSid: "", authToken: "", whatsappNumber: "" });
    }, 2000);
  };

  const handleClose = () => {
    onOpenChange(false);
    setStep("credentials");
    setError(null);
    setCredentials({ accountSid: "", authToken: "", whatsappNumber: "" });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg" data-testid="connect-twilio-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "success" ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                WhatsApp Connected!
              </>
            ) : (
              "Connect Your WhatsApp"
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "credentials" && "Enter your Twilio credentials to enable WhatsApp messaging."}
            {step === "webhook" && "Configure your Twilio webhook to receive incoming messages."}
            {step === "success" && "Your WhatsApp Business is now connected and ready to use."}
          </DialogDescription>
        </DialogHeader>

        {step === "credentials" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="accountSid">Twilio Account SID</Label>
              <Input
                id="accountSid"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={credentials.accountSid}
                onChange={(e) => setCredentials({ ...credentials, accountSid: e.target.value })}
                data-testid="input-account-sid"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="authToken">Twilio Auth Token</Label>
              <Input
                id="authToken"
                type="password"
                placeholder="Your auth token"
                value={credentials.authToken}
                onChange={(e) => setCredentials({ ...credentials, authToken: e.target.value })}
                data-testid="input-auth-token"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsappNumber">WhatsApp Business Number</Label>
              <Input
                id="whatsappNumber"
                placeholder="+1234567890"
                value={credentials.whatsappNumber}
                onChange={(e) => setCredentials({ ...credentials, whatsappNumber: e.target.value })}
                data-testid="input-whatsapp-number"
              />
              <p className="text-xs text-muted-foreground">
                The phone number must be enabled for WhatsApp in your Twilio account
              </p>
            </div>

            {error && (
              <Alert variant="destructive" data-testid="error-alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center gap-2 pt-2">
              <a
                href="https://console.twilio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-brand-green hover:underline flex items-center gap-1"
              >
                Open Twilio Console <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={handleClose} data-testid="button-cancel">
                Cancel
              </Button>
              <Button 
                onClick={handleValidateAndConnect} 
                disabled={loading || !credentials.accountSid || !credentials.authToken || !credentials.whatsappNumber}
                data-testid="button-connect"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Connect
              </Button>
            </div>
          </div>
        )}

        {step === "webhook" && (
          <div className="space-y-4 py-4">
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                Almost done! Copy these URLs to your Twilio Sandbox settings.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  When a message comes in:
                </label>
                <div className="flex items-center gap-2">
                  <Input 
                    value={webhookUrl} 
                    readOnly 
                    className="font-mono text-xs"
                    data-testid="input-webhook-url"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleCopyWebhook}
                    data-testid="button-copy-webhook"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-700">
                  Status callback URL:
                </label>
                <div className="flex items-center gap-2">
                  <Input 
                    value={statusCallbackUrl} 
                    readOnly 
                    className="font-mono text-xs"
                    data-testid="input-status-url"
                  />
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={handleCopyStatus}
                    data-testid="button-copy-status"
                  >
                    {statusCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-2">
                <p className="font-medium">Quick setup:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Click the button below to open Twilio settings</li>
                  <li>Paste the first URL in "When a message comes in"</li>
                  <li>Paste the second URL in "Status callback URL"</li>
                  <li>Set both to POST method and save</li>
                </ol>
              </div>

              <a
                href="https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn"
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Twilio Sandbox Settings
                </Button>
              </a>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("credentials")} data-testid="button-back">
                Back
              </Button>
              <Button onClick={handleComplete} data-testid="button-done">
                I've configured the webhooks
              </Button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="rounded-full bg-green-100 p-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-center text-muted-foreground">
              You can now send and receive WhatsApp messages!
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
