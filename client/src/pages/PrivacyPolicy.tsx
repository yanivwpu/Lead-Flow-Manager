import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Helmet>
        <title>Privacy Policy | WhachatCRM</title>
        <meta name="description" content="WhachatCRM privacy policy. Learn how we collect, use, and protect your data when using our WhatsApp CRM platform." />
        <link rel="canonical" href={`${MARKETING_URL}/privacy-policy`} />
        <meta property="og:title" content="Privacy Policy | WhachatCRM" />
        <meta property="og:description" content="WhachatCRM privacy policy. Learn how we collect, use, and protect your data." />
        <meta property="og:url" content={`${MARKETING_URL}/privacy-policy`} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
      </Helmet>
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
            We implement industry-standard security measures and a robust data loss prevention strategy to protect your information:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Data in Transit:</strong> All data transmitted between your browser, our servers, and third-party providers is encrypted using modern TLS (HTTPS) protocols.</li>
            <li><strong>Data at Rest:</strong> Sensitive information, including your WhatsApp provider credentials, is encrypted at rest using AES-256-GCM. Our primary databases also utilize full-disk encryption.</li>
            <li><strong>Backups:</strong> We perform regular automated backups of our databases. All backup files are encrypted at rest and stored in geographically redundant locations to prevent data loss.</li>
            <li><strong>Access Logging:</strong> We maintain detailed audit logs of all access to personal data. This includes logging who accessed the data, when, and what actions were performed, allowing for complete transparency and accountability.</li>
            <li><strong>Incident Response:</strong> We have a documented Security Incident Response Policy. In the event of a suspected data breach, our team follows a structured process to identify, contain, and remediate the issue, including notifying affected users and relevant authorities as required by law.</li>
            <li><strong>Compliance Webhooks:</strong> In accordance with Shopify's requirements, we provide mandatory privacy webhooks (customers/redact, customers/data_request, shop/redact) to ensure merchant and customer data rights are respected.</li>
            <li><strong>Webhook Verification:</strong> All incoming webhooks from Shopify are verified using HMAC SHA256 signatures to ensure authenticity and integrity.</li>
            <li><strong>Data Loss Prevention:</strong> We employ multi-layered security including password hashing (bcrypt), secure session management, and automated monitoring to detect and prevent unauthorized data access or exfiltration.</li>
            <li><strong>Access Control:</strong> Strict internal access controls ensure that only authorized systems and personnel can interact with data processing environments.</li>
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
            We have established clear retention periods to ensure personal data is not kept longer than necessary for the purposes for which it was collected:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Active Accounts:</strong> We retain your data for as long as your account remains active to provide you with continuous CRM services.</li>
            <li><strong>Account Deletion:</strong> Upon your request to delete your account, all associated personal data, including contact information and synced messages, is permanently deleted from our active databases within 30 days.</li>
            <li><strong>Provider Credentials:</strong> Encrypted credentials (Twilio/Meta) are immediately purged upon account deletion or when you disconnect the integration.</li>
            <li><strong>Legal Requirements:</strong> We may retain certain minimal information (such as transaction records) for longer periods only when strictly required by law or for legitimate financial auditing purposes.</li>
          </ul>

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
