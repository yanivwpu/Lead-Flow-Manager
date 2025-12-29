import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export function TermsOfUse() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
        <Link href="/">
          <a className="inline-flex items-center text-sm text-gray-500 hover:text-brand-green mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </a>
        </Link>

        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Terms of Use</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: December 29, 2025</p>

        <div className="prose prose-gray max-w-none">
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-600 mb-4">
            By accessing or using WhaChatCRM at whachatcrm.com ("Service"), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use our Service.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Description of Service</h2>
          <p className="text-gray-600 mb-4">
            WhaChatCRM is a customer relationship management (CRM) platform that enables businesses to manage WhatsApp conversations, organize leads, set follow-up reminders, and track sales pipelines.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
          <p className="text-gray-600 mb-4">To use our Service, you must:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Provide accurate and complete registration information</li>
            <li>Be at least 18 years old or have legal authority to enter into agreements</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Pricing and Payment</h2>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-gray-700 font-medium mb-2">Messaging Fees:</p>
            <p className="text-gray-600">
              WhaChatCRM charges <strong>$0.00525 per message</strong> for both inbound and outbound WhatsApp messages. This fee applies to all text messages processed through our platform.
            </p>
          </div>
          <p className="text-gray-600 mb-4">
            Additional terms regarding payment:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Usage is tracked automatically and billed accordingly</li>
            <li>You can view your usage and costs in the Settings section</li>
            <li>Prices are subject to change with 30 days notice</li>
            <li>All fees are non-refundable unless required by law</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Acceptable Use</h2>
          <p className="text-gray-600 mb-4">You agree not to:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Use the Service for spam, harassment, or illegal activities</li>
            <li>Violate WhatsApp's Business Policy or Terms of Service</li>
            <li>Send unsolicited bulk messages</li>
            <li>Impersonate others or misrepresent your identity</li>
            <li>Attempt to access other users' accounts or data</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Use automated systems to abuse the platform</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. WhatsApp Compliance</h2>
          <p className="text-gray-600 mb-4">
            You are responsible for complying with WhatsApp's Business Policy and all applicable messaging regulations. This includes obtaining proper consent from recipients before messaging them.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Intellectual Property</h2>
          <p className="text-gray-600 mb-4">
            The Service, including its design, features, and content, is owned by WhaChatCRM and protected by intellectual property laws. You retain ownership of your data but grant us a license to process it as needed to provide the Service.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Limitation of Liability</h2>
          <p className="text-gray-600 mb-4">
            To the maximum extent permitted by law, WhaChatCRM shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Service Availability</h2>
          <p className="text-gray-600 mb-4">
            We strive to maintain high availability but do not guarantee uninterrupted service. We may perform maintenance or updates that temporarily affect availability.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Termination</h2>
          <p className="text-gray-600 mb-4">
            We may suspend or terminate your account for violations of these Terms. You may also close your account at any time through the Settings page.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Changes to Terms</h2>
          <p className="text-gray-600 mb-4">
            We may modify these Terms at any time. Continued use of the Service after changes constitutes acceptance of the new Terms.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. Governing Law</h2>
          <p className="text-gray-600 mb-4">
            These Terms are governed by the laws of the jurisdiction where WhaChatCRM operates, without regard to conflict of law principles.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Contact</h2>
          <p className="text-gray-600 mb-4">
            For questions about these Terms, please contact us at legal@whachatcrm.com.
          </p>
        </div>
      </div>
    </div>
  );
}
