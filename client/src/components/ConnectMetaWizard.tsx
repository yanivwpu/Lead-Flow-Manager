import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, AlertCircle, Loader2, ExternalLink, Copy, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface ConnectMetaWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Step = "credentials" | "webhook" | "success";

export function ConnectMetaWizard({ open, onOpenChange, onSuccess }: ConnectMetaWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("credentials");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  
  const [credentials, setCredentials] = useState({
    accessToken: "",
    phoneNumberId: "",
    businessAccountId: "",
    appSecret: "",
  });

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/meta/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(credentials),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to connect Meta WhatsApp API");
        return;
      }

      setWebhookUrl(data.webhookUrl);
      setVerifyToken(data.webhookVerifyToken || data.verifyToken);
      setStep("webhook");
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, setCopiedFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedFn(true);
    setTimeout(() => setCopiedFn(false), 2000);
  };

  const handleComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/meta/status"] });
    setStep("success");
    setTimeout(() => {
      onOpenChange(false);
      onSuccess?.();
      setStep("credentials");
    }, 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader data-tour="connection-header">
          <DialogTitle className="flex items-center gap-2">
            {step === "success" ? (
              <><CheckCircle2 className="h-5 w-5 text-emerald-600" /> Meta WhatsApp Connected!</>
            ) : "Connect Meta WhatsApp API"}
          </DialogTitle>
          <DialogDescription>
            {step === "credentials" && (
              <span className="text-gray-500">Direct Meta connection · No message markup · You pay Meta directly</span>
            )}
            {step === "webhook" && "Configure the webhook in your Meta Developer Dashboard."}
          </DialogDescription>
        </DialogHeader>

        {step === "credentials" && (
          <div className="space-y-4 py-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-900 mb-1.5">Before you connect</p>
              <p className="text-[11px] text-blue-800 mb-2">This option is for businesses that already have:</p>
              <ul className="text-[11px] text-blue-700 space-y-0.5 ml-1">
                <li>• A Meta Business Manager</li>
                <li>• A WhatsApp Business Account (WABA)</li>
                <li>• A Meta App with WhatsApp enabled</li>
                <li>• A Permanent Access Token</li>
              </ul>
              <a 
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 mt-2 font-medium"
                data-tour="meta-guide-btn"
              >
                Don't have these yet? View step-by-step guide <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-2" data-tour="access-token-field">
              <div className="flex items-center justify-between">
                <Label>Permanent Access Token</Label>
                <a 
                  href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#system-user-access-tokens" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] text-blue-600 hover:underline"
                >
                  How to generate
                </a>
              </div>
              <Input
                type="password"
                placeholder="EAAG..."
                value={credentials.accessToken}
                onChange={(e) => setCredentials({ ...credentials, accessToken: e.target.value })}
              />
              <p className="text-[10px] text-gray-500">
                Generated in Meta Business Manager → System Users. Must include WhatsApp Business permissions.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2" data-tour="phone-id-field">
                <div className="flex items-center justify-between">
                  <Label>Phone Number ID</Label>
                  <a 
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#phone-number" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    Where to find
                  </a>
                </div>
                <Input
                  placeholder="123456789..."
                  value={credentials.phoneNumberId}
                  onChange={(e) => setCredentials({ ...credentials, phoneNumberId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Business Account ID</Label>
                  <a 
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started#business-account-id" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[10px] text-blue-600 hover:underline"
                  >
                    Where to find
                  </a>
                </div>
                <Input
                  placeholder="123456789..."
                  value={credentials.businessAccountId}
                  onChange={(e) => setCredentials({ ...credentials, businessAccountId: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>App Secret (Optional - for signature verification)</Label>
              <Input
                type="password"
                placeholder="App Secret"
                value={credentials.appSecret}
                onChange={(e) => setCredentials({ ...credentials, appSecret: e.target.value })}
              />
            </div>
            {error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>}
            <Button className="w-full" onClick={handleConnect} disabled={loading || !credentials.accessToken || !credentials.phoneNumberId} data-tour="test-connection-btn">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Connect API
            </Button>
          </div>
        )}

        {step === "webhook" && (
          <div className="space-y-4 py-4" data-tour="webhook-section">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex gap-2">
                <Input value={webhookUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => handleCopy(webhookUrl, setCopied)}>
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Verify Token</Label>
              <div className="flex gap-2">
                <Input value={verifyToken} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => handleCopy(verifyToken, setTokenCopied)}>
                  {tokenCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button className="w-full" onClick={handleComplete}>I've configured Meta</Button>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="text-center font-medium">Official WhatsApp API is ready!</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
