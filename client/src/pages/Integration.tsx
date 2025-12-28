import { useState, useEffect } from "react";
import { Loader2, CheckCircle2, MessageSquare, ExternalLink, AlertCircle, Unplug, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface TwilioStatus {
  connected: boolean;
  hasCredentials: boolean;
  whatsappNumber: string | null;
}

export function Integration() {
  const { toast } = useToast();
  const [status, setStatus] = useState<TwilioStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhook/twilio/incoming`
    : '';

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/twilio/status", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("Failed to fetch Twilio status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!accountSid || !authToken || !whatsappNumber) {
      setError("Please fill in all fields");
      return;
    }

    setConnecting(true);
    setError("");

    try {
      const response = await fetch("/api/twilio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accountSid, authToken, whatsappNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to connect");
        setConnecting(false);
        return;
      }

      toast({
        title: "Connected!",
        description: "Twilio WhatsApp is now connected to your account.",
      });

      setAccountSid("");
      setAuthToken("");
      setWhatsappNumber("");
      fetchStatus();
    } catch (err) {
      setError("Connection failed. Please check your credentials.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const response = await fetch("/api/twilio/disconnect", {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        toast({
          title: "Disconnected",
          description: "Twilio has been disconnected from your account.",
        });
        fetchStatus();
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to disconnect Twilio.",
        variant: "destructive",
      });
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 h-full bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-green-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 h-full bg-white flex flex-col">
      <div className="p-8 pb-4 border-b border-gray-100">
        <h1 className="text-3xl font-display font-bold text-gray-900">WhatsApp Integration</h1>
        <p className="text-gray-500 mt-1">Connect your Twilio account to send and receive WhatsApp messages.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl space-y-6">
          
          {status?.connected ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-green-900">Connected</h2>
                  <p className="text-sm text-green-700">WhatsApp number: {status.whatsappNumber}</p>
                </div>
              </div>
              <p className="text-sm text-green-800 mb-4">
                Your Twilio WhatsApp is connected. You can now send and receive messages through the CRM.
              </p>
              <Button 
                variant="outline" 
                onClick={handleDisconnect}
                data-testid="button-disconnect-twilio"
                className="border-red-300 text-red-600 hover:bg-red-50"
              >
                <Unplug className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-10 w-10 bg-green-50 rounded-lg flex items-center justify-center">
                  <MessageSquare className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Connect Twilio</h2>
                  <p className="text-sm text-gray-500">Enter your Twilio credentials to get started.</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <Label htmlFor="accountSid">Account SID</Label>
                  <Input
                    id="accountSid"
                    data-testid="input-account-sid"
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={accountSid}
                    onChange={(e) => setAccountSid(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="authToken">Auth Token</Label>
                  <Input
                    id="authToken"
                    data-testid="input-auth-token"
                    type="password"
                    placeholder="Your auth token"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="whatsappNumber">WhatsApp Business Number</Label>
                  <Input
                    id="whatsappNumber"
                    data-testid="input-whatsapp-number"
                    placeholder="+14155238886"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Include country code (e.g., +1 for US)</p>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm mb-4 p-3 bg-red-50 rounded-lg">
                  <AlertCircle className="h-4 w-4" />
                  <span>{error}</span>
                </div>
              )}

              <Button 
                onClick={handleConnect}
                disabled={connecting}
                data-testid="button-connect-twilio"
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {connecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  "Connect Twilio"
                )}
              </Button>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
            <h3 className="font-bold text-blue-900 mb-3">How to get your Twilio credentials:</h3>
            <ol className="text-sm text-blue-800 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                <span>Sign up at <a href="https://www.twilio.com" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-1">twilio.com <ExternalLink className="h-3 w-3" /></a></span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                <span>Find your Account SID and Auth Token in the Console Dashboard</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                <span>Go to Messaging - Try WhatsApp to activate the Sandbox (for testing)</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">4.</span>
                <span>For production, apply for a WhatsApp Business Number</span>
              </li>
            </ol>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
            <h3 className="font-bold text-amber-900 mb-3">Webhook URL (configure in Twilio):</h3>
            <p className="text-sm text-amber-800 mb-3">
              Add this URL in your Twilio Console under WhatsApp Sandbox Settings - "When a message comes in":
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs text-amber-800 bg-amber-100 p-3 rounded-lg break-all">
                {webhookUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copyWebhook}
                className="shrink-0 border-amber-300"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
            <h3 className="font-bold text-gray-900 mb-3">Pricing</h3>
            <p className="text-sm text-gray-600">
              Twilio charges <strong>$0.005 per message</strong> plus Meta's conversation fees. 
              There's no monthly subscription fee - you only pay for what you use.
            </p>
            <a 
              href="https://www.twilio.com/en-us/whatsapp/pricing" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:underline inline-flex items-center gap-1 mt-2"
            >
              View full pricing <ExternalLink className="h-3 w-3" />
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
