import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
        <Link href="/">
          <a className="inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </a>
        </Link>

        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: January 3, 2026</p>

        <div className="prose prose-gray max-w-none">
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Introduction</h2>
          <p className="text-gray-600 mb-4">
            Welcome to WhachatCRM ("we," "our," or "us"). We are committed to protecting your privacy and personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our WhatsApp CRM platform.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Information We Collect</h2>
          <p className="text-gray-600 mb-4">We collect the following types of information:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Account Information:</strong> Name, email address, password, and business name you provide during registration</li>
            <li><strong>WhatsApp Data:</strong> Messages, contacts, and conversation history synced through our platform</li>
            <li><strong>Provider Credentials:</strong> Your Twilio credentials (Account SID, Auth Token) or Meta WhatsApp Business API credentials (Phone Number ID, Access Token), encrypted for message delivery</li>
            <li><strong>Usage Data:</strong> Conversation counts and platform activity for plan limit tracking</li>
            <li><strong>Device Information:</strong> Browser type, IP address, and device identifiers</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. How We Use Your Information</h2>
          <p className="text-gray-600 mb-4">We use your information for the following specific purposes:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Service Provision:</strong> To provide and maintain our CRM services, including message syncing and lead organization.</li>
            <li><strong>Integration Management:</strong> To connect and maintain the link to your chosen WhatsApp provider (Twilio or Meta) for message delivery.</li>
            <li><strong>Subscription Tracking:</strong> To track conversation usage and ensure compliance with your chosen subscription plan limits.</li>
            <li><strong>Account Communication:</strong> To send you service notifications, security alerts, and platform updates.</li>
            <li><strong>Support & Improvement:</strong> To provide technical support, troubleshoot issues, and improve our platform's user experience.</li>
            <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes.</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Data Security</h2>
          <p className="text-gray-600 mb-4">
            We implement industry-standard security measures to protect your data, including:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Encryption of provider credentials (Twilio and Meta) at rest using AES-256-GCM</li>
            <li>Secure HTTPS connections for all data transmission</li>
            <li>Password hashing using bcrypt</li>
            <li>Regular security audits</li>
          </ul>
          <p className="text-gray-600 mb-4">
            However, no method of transmission over the Internet is 100% secure.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Third-Party Services</h2>
          <p className="text-gray-600 mb-4">
            WhachatCRM integrates with third-party services:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Twilio:</strong> You can connect your Twilio account for WhatsApp Business API access. Your Twilio credentials are stored securely and used only to send/receive messages on your behalf.</li>
            <li><strong>Meta WhatsApp Business API:</strong> You can connect directly to Meta's WhatsApp Business API. Your access tokens are stored securely and used only to send/receive messages on your behalf.</li>
            <li><strong>Stripe:</strong> For payment processing. We do not store your credit card information.</li>
            <li><strong>WhatsApp:</strong> Message delivery through the official WhatsApp Business API via your chosen provider (Twilio or Meta).</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Data Sharing & Sales</h2>
          <p className="text-gray-600 mb-4">
            <strong>We do not sell your personal information.</strong> We respect and apply our customers' decisions to opt-out of any potential data selling. As of our current operations, we do not engage in the sale of personal data as defined by applicable privacy laws.
          </p>
          <p className="text-gray-600 mb-4">
            We may share data with the following categories of recipients:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Your WhatsApp Provider:</strong> To facilitate message delivery using your Twilio or Meta credentials</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Your Rights</h2>
          <p className="text-gray-600 mb-4">You have the right to:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and data</li>
            <li>Disconnect your WhatsApp provider (Twilio or Meta) at any time</li>
            <li>Export your data</li>
            <li>Opt out of marketing communications</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Data Retention</h2>
          <p className="text-gray-600 mb-4">
            We retain your data for as long as your account is active or as needed to provide services. Upon account deletion, we will delete your data within 30 days, except where retention is required by law.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Cookies</h2>
          <p className="text-gray-600 mb-4">
            We use essential cookies for authentication and session management. These are necessary for the platform to function properly.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Changes to This Policy</h2>
          <p className="text-gray-600 mb-4">
            We may update this Privacy Policy from time to time. We will notify you of significant changes via email or through the platform.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Contact Us</h2>
          <p className="text-gray-600 mb-4">
            If you have questions about this Privacy Policy, please contact us at support@whachatcrm.com.
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-xs text-gray-400 space-y-1">
          <p>WhachatCRM is a CRM platform and is not affiliated with Meta or WhatsApp.</p>
          <p>WhatsApp Business API access is provided by approved third-party providers.</p>
        </div>
      </div>
    </div>
  );
}
