import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import confetti from 'canvas-confetti';

// Tour for the Integrations page - guides user to open the Meta wizard
export const createIntegrationsTour = (onOpenMetaWizard: () => void, onComplete?: () => void) => {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: 'rgba(0,0,0,0.75)',
    stagePadding: 8,
    steps: [
      {
        popover: {
          title: '🚀 Welcome to Integrations!',
          description: 'Let\'s get your WhatsApp connected. This takes about 5 minutes and we\'ll guide you every step of the way.',
          side: 'bottom',
          align: 'center',
          nextBtnText: 'Let\'s go!',
        }
      },
      {
        element: '[data-tour="meta-connect-card"]',
        popover: {
          title: 'Connect Meta WhatsApp API',
          description: 'Click here to start the connection wizard. This is the recommended way to connect WhatsApp - you pay Meta directly with no message markup.',
          side: 'bottom',
          nextBtnText: 'Open Wizard',
          onNextClick: () => {
            driverObj.destroy();
            onOpenMetaWizard();
            // Start wizard tour after dialog opens
            setTimeout(() => {
              createMetaWizardTour(onComplete).drive();
            }, 500);
          }
        }
      },
    ],
    onDestroyed: () => {
      // Don't call onComplete here - it's called after wizard tour
    }
  });

  return driverObj;
};

// Tour specifically for inside the Meta connection wizard dialog
export const createMetaWizardTour = (onComplete?: () => void) => {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: 'rgba(0,0,0,0.75)',
    stagePadding: 6,
    steps: [
      {
        element: '[data-tour="connection-header"]',
        popover: {
          title: '📱 Why WhatsApp Business API?',
          description: 'Personal WhatsApp can get banned. The Business API is safe, scalable, and official. You\'ll need a Meta Business account.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="meta-guide-btn"]',
        popover: {
          title: '📖 Open Meta Setup Guide',
          description: 'Click this to open Meta Business Manager in a new tab. Follow their steps to create a WhatsApp app and get your credentials.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="access-token-field"]',
        popover: {
          title: '🔑 Access Token',
          description: 'In Meta, create a permanent System User token with whatsapp_business_messaging permission. Paste that token here.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="phone-id-field"]',
        popover: {
          title: '📞 Phone Number ID',
          description: 'Find this in your Meta WhatsApp app settings under "Phone Numbers". It\'s a long number like "123456789012345".',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="test-connection-btn"]',
        popover: {
          title: '✅ Test Your Connection',
          description: 'After entering your credentials, click here to verify everything works. Green checkmark = success!',
          side: 'top'
        }
      },
      {
        popover: {
          title: '🎉 You\'re All Set!',
          description: 'After testing, you\'ll configure webhooks and start receiving messages. Let\'s do this!',
          doneBtnText: 'Got it!',
          onPopoverRender: () => {
            confetti({ 
              particleCount: 100, 
              spread: 60, 
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

// Legacy export for backward compatibility
export const createWhatsAppTour = createMetaWizardTour;
