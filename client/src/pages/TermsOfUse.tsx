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
        <p className="text-sm text-gray-500 mb-8">Last updated: January 3, 2026</p>

        <div className="prose prose-gray max-w-none">
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-600 mb-4">
            By accessing or using WhachatCRM ("Service"), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use our Service.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Description of Service</h2>
          <p className="text-gray-600 mb-4">
            WhachatCRM is a customer relationship management (CRM) platform that enables businesses to manage WhatsApp conversations, organize leads, set follow-up reminders, and track sales pipelines. The Service connects to your own WhatsApp Business API provider (Twilio or Meta WhatsApp Business API) for message delivery.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
          <p className="text-gray-600 mb-4">To use our Service, you must:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Provide accurate and complete registration information</li>
            <li>Be at least 18 years old or have legal authority to enter into agreements</li>
            <li>Maintain the security of your account credentials</li>
            <li>Have a valid WhatsApp Business API provider account (Twilio or Meta)</li>
            <li>Notify us immediately of any unauthorized access</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Pricing and Payment</h2>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <p className="text-gray-700 font-medium mb-2">Subscription Plans:</p>
            <ul className="text-gray-600 space-y-1">
              <li><strong>Free:</strong> $0/month - 50 active conversations, 1 user, 1 WhatsApp number</li>
              <li><strong>Starter:</strong> $19/month - 500 active conversations, 3 users, 1 WhatsApp number</li>
              <li><strong>Pro:</strong> $49/month - 2,000 active conversations, 10 users, 3 WhatsApp numbers</li>
            </ul>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-gray-700 font-medium mb-2">Important - Separate Costs:</p>
            <p className="text-gray-600 mb-3">
              WhachatCRM subscription fees cover CRM functionality only. WhatsApp message delivery costs are billed separately by your provider (Twilio or Meta). WhachatCRM does not charge per message.
            </p>
            <p className="text-gray-600 text-sm">
              <strong>View message costs:</strong>{" "}
              <a href="https://www.twilio.com/en-us/whatsapp/pricing" target="_blank" rel="noopener noreferrer" className="text-brand-green hover:underline">Twilio</a>
              {" | "}
              <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener noreferrer" className="text-brand-green hover:underline">Meta WhatsApp</a>
            </p>
          </div>
          <p className="text-gray-600 mb-4">
            Additional terms regarding payment:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Subscription fees are billed monthly via Stripe</li>
            <li>An "active conversation" is one unique WhatsApp contact within a rolling 30-day window</li>
            <li>Unlimited messages can be sent within a conversation — the count stays the same</li>
            <li>When you reach your conversation limit, outbound messages are paused until you upgrade</li>
            <li>Plans can be upgraded or downgraded at any time</li>
            <li>Prices are subject to change with 30 days notice</li>
            <li>All fees are non-refundable unless required by law</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. WhatsApp Provider Integration</h2>
          <p className="text-gray-600 mb-4">
            WhachatCRM supports two WhatsApp Business API providers: Twilio and Meta WhatsApp Business API. You are responsible for:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Maintaining a valid account with your chosen provider (Twilio or Meta)</li>
            <li>Keeping your provider credentials and access tokens secure</li>
            <li>Complying with your provider's Terms of Service and policies</li>
            <li>All message delivery costs charged by your provider</li>
          </ul>
          <p className="text-gray-600 mb-4">
            WhachatCRM stores your provider credentials securely (encrypted at rest) and uses them only to send and receive WhatsApp messages on your behalf.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Acceptable Use</h2>
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

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. WhatsApp Compliance</h2>
          <p className="text-gray-600 mb-4">
            You are responsible for complying with WhatsApp's Business Policy and all applicable messaging regulations. This includes obtaining proper consent from recipients before messaging them.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Partner & Referral Program</h2>
          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">8.1 Participation</h3>
          <p className="text-gray-600 mb-4">
            WhachatCRM may offer a Partner or Referral Program that allows approved partners, freelancers, or agencies (“Partners”) to earn commissions for referring customers. Participation is subject to approval and may be revoked at any time.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">8.2 Referral Tracking</h3>
          <p className="text-gray-600 mb-4">
            Partners receive a unique referral link or identifier. Attribution is determined solely by WhachatCRM’s tracking systems.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">8.3 Qualified Referral</h3>
          <p className="text-gray-600 mb-4">
            A “Qualified Referral” occurs when a user:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Visits WhachatCRM via a valid referral link, and</li>
            <li>Becomes a paying subscriber, and</li>
            <li>Remains in good standing (payment successfully collected)</li>
          </ul>
          <p className="text-gray-600 mb-4">
            Free accounts that never upgrade do not generate commissions.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">8.4 Commission Terms</h3>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Commission rates and durations are defined in the Partner dashboard or written agreement</li>
            <li>Commissions are calculated as a percentage of subscription revenue actually received</li>
            <li>Commissions are paid only while the referred customer remains an active paying subscriber</li>
            <li>If a subscription is refunded or charged back, related commissions may be reversed</li>
          </ul>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">8.5 Restrictions</h3>
          <p className="text-gray-600 mb-2">Partners may not:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Self-refer</li>
            <li>Use misleading, deceptive, or spam marketing</li>
            <li>Impersonate WhachatCRM or offer unauthorized discounts</li>
          </ul>
          <p className="text-gray-600 mb-4">
            Violation may result in immediate termination and forfeiture of unpaid commissions.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">8.6 No Employment Relationship</h3>
          <p className="text-gray-600 mb-4">
            Partners are independent contractors. Nothing in these Terms creates an agency, partnership, employment, or joint venture relationship.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">9. Intellectual Property</h2>
          <p className="text-gray-600 mb-4">
            The Service, including its design, features, and content, is owned by WhachatCRM and protected by intellectual property laws. You retain ownership of your data but grant us a license to process it as needed to provide the Service.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Limitation of Liability</h2>
          <p className="text-gray-600 mb-4">
            To the maximum extent permitted by law, WhachatCRM is not liable for indirect, incidental, consequential, or punitive damages, including lost profits, data loss, or provider outages.
          </p>
          <p className="text-gray-600 mb-4">
            WhachatCRM is not responsible for message delivery failures, provider downtime, or charges incurred through your WhatsApp provider.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Service Availability</h2>
          <p className="text-gray-600 mb-4">
            The Service is provided on an “as-is” and “as-available” basis. Availability is not guaranteed.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. Termination</h2>
          <p className="text-gray-600 mb-4">
            We may suspend or terminate access for violations of these Terms. You may close your account at any time. Upon termination, provider credentials will be removed.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Changes to Terms</h2>
          <p className="text-gray-600 mb-4">
            We may update these Terms at any time. Continued use constitutes acceptance of updated Terms.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">14. Governing Law & Venue</h2>
          <p className="text-gray-600 mb-4">
            These Terms are governed by the laws of the State of Florida, USA, without regard to conflict-of-law principles. Any disputes shall be resolved exclusively in state or federal courts located in Florida.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">15. Contact</h2>
          <p className="text-gray-600 mb-4">
            For questions about these Terms, please contact us at support@whachatcrm.com.
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
