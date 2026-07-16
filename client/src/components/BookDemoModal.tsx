import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { trackDemoBooked } from "@/lib/ga4Events";

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Passed through to API as `source` (e.g. qr_code). */
  bookingSource?: string;
}

export function BookDemoModal({ isOpen, onClose, bookingSource = "web" }: BookDemoModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !phone) {
      setError("Please fill in all fields");
      return;
    }

    if (!consent) {
      setError("Please agree to be contacted");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/demo/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          consent,
          source: bookingSource,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to start demo booking");
      }

      if (!data.calendlyUrl) {
        throw new Error("Calendar link unavailable. Please try again later.");
      }

      // GA4: demo_booked — marketing demo booking record created (before Calendly redirect)
      trackDemoBooked({
        source: bookingSource,
        bookingType: "marketing_demo",
        bookingId: typeof data.bookingId === "string" ? data.bookingId : undefined,
      });

      // Same-window redirect: visitor schedules once on the assigned rep's Calendly immediately.
      window.location.assign(data.calendlyUrl);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start demo booking";
      setError(message);
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setEmail("");
    setPhone("");
    setConsent(false);
    setError("");
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">Book a Demo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-gray-600 text-sm">
            Enter your details below. We&apos;ll assign your demo specialist and take you directly to
            their live calendar to choose a convenient date and time.
          </p>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <Label htmlFor="name">Your Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              required
              disabled={isSubmitting}
              data-testid="input-demo-name"
            />
          </div>

          <div>
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@company.com"
              required
              disabled={isSubmitting}
              data-testid="input-demo-email"
            />
          </div>

          <div>
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 (555) 123-4567"
              required
              disabled={isSubmitting}
              data-testid="input-demo-phone"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="consent"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
              disabled={isSubmitting}
              data-testid="checkbox-consent"
            />
            <Label htmlFor="consent" className="text-sm text-gray-600 leading-tight cursor-pointer">
              I agree to be contacted by a WhachatCRM representative regarding this demo request.
            </Label>
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand-green hover:bg-brand-dark"
            data-testid="button-submit-demo"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Opening calendar…
              </>
            ) : (
              "Choose a Time"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
