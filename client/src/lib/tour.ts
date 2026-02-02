import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import confetti from 'canvas-confetti';

export const createWhatsAppTour = (onComplete?: () => void) => {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: 'rgba(0,0,0,0.8)',
    stagePadding: 4,
    steps: [
      {
        popover: {
          title: '🚀 Let\'s Connect WhatsApp!',
          description: 'This takes ~5 minutes and we\'ll guide you every step. Ready?',
          side: 'bottom',
          align: 'start',
          nextBtnText: 'Let\'s go!',
        }
      },
      {
        element: '[data-tour="connection-header"]',
        popover: {
          title: 'Why WhatsApp Business API?',
          description: 'Personal WhatsApp gets banned fast. Business API is safe and scalable. Trust us!',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="meta-guide-btn"]',
        popover: {
          title: 'Prep in Meta Business Manager',
          description: 'Click to open Meta in new tab. You need: verified business + dedicated phone number.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="phone-id-field"]',
        popover: {
          title: 'Paste Phone Number ID',
          description: 'Copy the long number from Meta app settings and paste here.',
          side: 'top'
        }
      },
      {
        element: '[data-tour="access-token-field"]',
        popover: {
          title: 'Paste Permanent Access Token',
          description: 'Create a never-expiring system token in Meta and paste here.',
          side: 'top'
        }
      },
      {
        element: '[data-tour="test-connection-btn"]',
        popover: {
          title: 'Test It!',
          description: 'Click to verify. Green = success. Red = we\'ll show fixes.',
          side: 'top'
        }
      },
      {
        element: '[data-tour="webhook-section"]',
        popover: {
          title: 'Webhook Magic',
          description: 'We auto-fill URL & token. Just copy Verify Token to Meta.',
          side: 'top'
        }
      },
      {
        popover: {
          title: '🎉 You\'re Connected!',
          description: 'Messages will now flow in. Go be awesome!',
          onPopoverRender: () => {
            // @ts-ignore - confetti is not typed correctly in the package
            confetti({ 
              particleCount: 150, 
              spread: 70, 
              origin: { y: 0.6 },
              colors: ['#25D366', '#128C7E', '#075E54', '#34B7F1']
            });
          },
        }
      },
    ],
    onDestroyed: () => {
      if (onComplete) onComplete();
    }
  });

  return driverObj;
};
