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

// Tour for Twilio connection wizard dialog
export const createTwilioWizardTour = (onComplete?: () => void) => {
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayColor: 'rgba(0,0,0,0.75)',
    stagePadding: 6,
    steps: [
      {
        element: '[data-tour="twilio-header"]',
        popover: {
          title: '📱 Connect via Twilio',
          description: 'Twilio lets you use both WhatsApp AND SMS messaging. You\'ll need a Twilio account with WhatsApp enabled.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="twilio-console-btn"]',
        popover: {
          title: '🔗 Open Twilio Console',
          description: 'Click here to open Twilio Console in a new tab. You\'ll find your credentials under Account Info on the dashboard.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="account-sid-field"]',
        popover: {
          title: '🔑 Account SID',
          description: 'Copy your Account SID from the Twilio Console dashboard. It starts with "AC" followed by letters and numbers.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="auth-token-field"]',
        popover: {
          title: '🔒 Auth Token',
          description: 'Your Auth Token is also on the dashboard. Click "Show" to reveal it, then copy and paste here.',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="whatsapp-number-field"]',
        popover: {
          title: '📞 WhatsApp Number',
          description: 'Enter the phone number you\'ve registered for WhatsApp in Twilio. Include the country code (e.g., +1234567890).',
          side: 'bottom'
        }
      },
      {
        element: '[data-tour="twilio-connect-btn"]',
        popover: {
          title: '✅ Connect',
          description: 'Once you\'ve entered all credentials, click Connect. We\'ll verify everything works before proceeding.',
          side: 'top'
        }
      },
      {
        popover: {
          title: '🎉 Almost There!',
          description: 'After connecting, you\'ll configure webhooks so we can receive your messages. Let\'s do this!',
          doneBtnText: 'Got it!',
          onPopoverRender: () => {
            confetti({ 
              particleCount: 100, 
              spread: 60, 
              origin: { y: 0.6 },
              colors: ['#F22F46', '#0D122B', '#E1E3E8', '#FFD43B']
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
