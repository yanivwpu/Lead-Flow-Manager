import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle, Instagram, Facebook } from "lucide-react";
import { Link } from "wouter";
import { settingsChannelsHref } from "@/lib/settingsChannelsNavigation";

interface ActivationSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persist intro dismissed + navigate to channels */
  onChannelCta: () => void;
}

/** First-login modal when no WhatsApp / Meta messaging channels are connected yet. */
export function ActivationSetupModal({ open, onOpenChange, onChannelCta }: ActivationSetupModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-4 p-6 sm:p-8" data-testid="modal-activation-setup">
        <DialogHeader className="space-y-2 text-center sm:text-center">
          <DialogTitle className="text-xl font-semibold tracking-tight text-gray-900">
            Let&apos;s get you set up
          </DialogTitle>
          <DialogDescription className="text-base text-gray-600">
            Connect your first channel to start conversations
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link href={settingsChannelsHref({ provider: "whatsapp" })}>
            <a className="block w-full" data-testid="activation-connect-whatsapp">
              <Button
                type="button"
                className="h-11 w-full gap-2 bg-brand-green hover:bg-brand-dark text-white"
                onClick={() => onChannelCta()}
              >
                <MessageCircle className="h-4 w-4" />
                Connect WhatsApp
              </Button>
            </a>
          </Link>
          <Link href={settingsChannelsHref({ provider: "instagram" })}>
            <a className="block w-full" data-testid="activation-connect-instagram">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 border-gray-200 bg-white font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => onChannelCta()}
              >
                <Instagram className="h-4 w-4" />
                Connect Instagram
              </Button>
            </a>
          </Link>
          <Link href={settingsChannelsHref({ provider: "facebook" })}>
            <a className="block w-full" data-testid="activation-connect-facebook">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-2 border-gray-200 bg-white font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => onChannelCta()}
              >
                <Facebook className="h-4 w-4" />
                Connect Facebook
              </Button>
            </a>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
