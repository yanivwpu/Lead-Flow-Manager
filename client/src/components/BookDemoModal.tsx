import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, Clock, Loader2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface BookDemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TIME_SLOTS = [
  "9:00 AM", "9:30 AM", "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM", "2:30 PM",
  "3:00 PM", "3:30 PM", "4:00 PM", "4:30 PM"
];

function getNextBusinessDays(count: number): Date[] {
  const days: Date[] = [];
  const today = new Date();
  let current = new Date(today);
  
  while (days.length < count) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      days.push(new Date(current));
    }
  }
  
  return days;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

function parseTimeSlot(date: Date, timeSlot: string): Date {
  const result = new Date(date);
  const [time, period] = timeSlot.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function BookDemoModal({ isOpen, onClose }: BookDemoModalProps) {
  const [step, setStep] = useState<'schedule' | 'details' | 'success'>('schedule');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const businessDays = getNextBusinessDays(21);
  const visibleDays = businessDays.slice(weekOffset * 5, (weekOffset + 1) * 5);
  const maxWeeks = Math.ceil(businessDays.length / 5) - 1;

  const handleContinue = () => {
    if (selectedDate && selectedTime) {
      setStep('details');
    }
  };

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

    if (!selectedDate || !selectedTime) {
      setError("Please select a date and time");
      return;
    }

    setIsSubmitting(true);

    try {
      const scheduledDate = parseTimeSlot(selectedDate, selectedTime);
      
      const response = await fetch('/api/demo/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          scheduledDate: scheduledDate.toISOString(),
          consent,
          source: 'qr_code'
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to book demo');
      }

      setStep('success');
    } catch (err: any) {
      setError(err.message || 'Failed to book demo');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setStep('schedule');
    setSelectedDate(null);
    setSelectedTime(null);
    setName("");
    setEmail("");
    setPhone("");
    setConsent(false);
    setError("");
    setWeekOffset(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-display">
            {step === 'success' ? 'Demo Booked!' : 'Book a Demo'}
          </DialogTitle>
        </DialogHeader>

        {step === 'schedule' && (
          <div className="space-y-6">
            <p className="text-gray-600">
              We're sure you'll love it! Pick a time that works best for you.
            </p>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-brand-green" />
                  Select a Date (Mon-Fri)
                </Label>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                    disabled={weekOffset === 0}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setWeekOffset(Math.min(maxWeeks, weekOffset + 1))}
                    disabled={weekOffset >= maxWeeks}
                    className="h-7 w-7 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {visibleDays.map((day) => (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-colors text-sm",
                      selectedDate?.toDateString() === day.toDateString()
                        ? "bg-brand-green text-white border-brand-green"
                        : "bg-white border-gray-200 hover:border-brand-green hover:bg-green-50"
                    )}
                  >
                    <div className="font-medium">{formatDate(day).split(' ')[0]}</div>
                    <div className="text-xs opacity-80">
                      {formatDate(day).split(' ').slice(1).join(' ')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-brand-green" />
                Select a Time (EST)
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {TIME_SLOTS.map((time) => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={cn(
                      "p-2 rounded-lg border text-sm transition-colors",
                      selectedTime === time
                        ? "bg-brand-green text-white border-brand-green"
                        : "bg-white border-gray-200 hover:border-brand-green hover:bg-green-50"
                    )}
                  >
                    {time}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={handleContinue}
              disabled={!selectedDate || !selectedTime}
              className="w-full bg-brand-green hover:bg-brand-dark"
            >
              Continue
            </Button>
          </div>
        )}

        {step === 'details' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
              <p className="text-green-800">
                <strong>Selected:</strong> {selectedDate && formatDate(selectedDate)} at {selectedTime} EST
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Smith"
                required
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
                data-testid="input-demo-phone"
              />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="consent"
                checked={consent}
                onCheckedChange={(checked) => setConsent(checked === true)}
                data-testid="checkbox-consent"
              />
              <Label htmlFor="consent" className="text-sm text-gray-600 leading-tight cursor-pointer">
                I agree to be contacted by a WhachatCRM representative regarding this demo request.
              </Label>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep('schedule')}
                className="flex-1"
              >
                Back
              </Button>
              <Button 
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-brand-green hover:bg-brand-dark"
                data-testid="button-submit-demo"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Book Demo"
                )}
              </Button>
            </div>
          </form>
        )}

        {step === 'success' && (
          <div className="text-center py-6 space-y-4">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-brand-green" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Your demo is confirmed!
            </h3>
            <p className="text-gray-600">
              We've sent a confirmation to <strong>{email}</strong>. One of our team members will reach out shortly to confirm your demo.
            </p>
            <p className="text-sm text-gray-500">
              {selectedDate && formatDate(selectedDate)} at {selectedTime} EST
            </p>
            <Button 
              onClick={handleClose}
              className="bg-brand-green hover:bg-brand-dark"
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
