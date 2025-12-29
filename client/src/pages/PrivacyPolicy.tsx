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
        <p className="text-sm text-gray-500 mb-8">Last updated: December 29, 2025</p>

        <div className="prose prose-gray max-w-none">
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Introduction</h2>
          <p className="text-gray-600 mb-4">
            Welcome to WhaChatCRM ("we," "our," or "us"). We are committed to protecting your privacy and personal information. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our WhatsApp CRM platform at whachatcrm.com.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Information We Collect</h2>
          <p className="text-gray-600 mb-4">We collect the following types of information:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Account Information:</strong> Name, email address, password, business name, and phone number you provide during registration</li>
            <li><strong>WhatsApp Data:</strong> Messages, contacts, and conversation history synced through our platform</li>
            <li><strong>Usage Data:</strong> Message counts, timestamps, and platform activity for billing purposes</li>
            <li><strong>Device Information:</strong> Browser type, IP address, and device identifiers</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. How We Use Your Information</h2>
          <p className="text-gray-600 mb-4">We use your information to:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Provide and maintain our CRM services</li>
            <li>Process WhatsApp messages on your behalf</li>
            <li>Calculate and bill for messaging usage</li>
            <li>Send you service notifications and updates</li>
            <li>Improve our platform and user experience</li>
            <li>Comply with legal obligations</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Data Security</h2>
          <p className="text-gray-600 mb-4">
            We implement industry-standard security measures to protect your data, including encryption in transit and at rest, secure authentication, and regular security audits. However, no method of transmission over the Internet is 100% secure.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Data Sharing</h2>
          <p className="text-gray-600 mb-4">
            We do not sell your personal information. We may share data with:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li><strong>Service Providers:</strong> Third-party services that help us operate (e.g., Twilio for messaging)</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Your Rights</h2>
          <p className="text-gray-600 mb-4">You have the right to:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your account and data</li>
            <li>Export your data</li>
            <li>Opt out of marketing communications</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Data Retention</h2>
          <p className="text-gray-600 mb-4">
            We retain your data for as long as your account is active or as needed to provide services. Upon account deletion, we will delete your data within 30 days, except where retention is required by law.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Cookies</h2>
          <p className="text-gray-600 mb-4">
            We use essential cookies for authentication and session management. These are necessary for the platform to function properly.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Changes to This Policy</h2>
          <p className="text-gray-600 mb-4">
            We may update this Privacy Policy from time to time. We will notify you of significant changes via email or through the platform.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Contact Us</h2>
          <p className="text-gray-600 mb-4">
            If you have questions about this Privacy Policy, please contact us at privacy@whachatcrm.com.
          </p>
        </div>
      </div>
    </div>
  );
}
