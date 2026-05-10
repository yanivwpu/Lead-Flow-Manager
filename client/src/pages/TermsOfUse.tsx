import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

export function TermsOfUse() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Helmet>
        <title>Terms of Use | WhachatCRM</title>
        <meta name="description" content="WhachatCRM terms of use. Read our service terms, user responsibilities, and platform guidelines." />
        <link rel="canonical" href={`${MARKETING_URL}/terms-of-use`} />
        <meta property="og:title" content="Terms of Use | WhachatCRM" />
        <meta property="og:description" content="WhachatCRM terms of use. Read our service terms and guidelines." />
        <meta property="og:url" content={`${MARKETING_URL}/terms-of-use`} />
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

        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Terms of Use</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated: May 8, 2026</p>

        <div className="prose prose-gray max-w-none">
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
          <p className="text-gray-600 mb-4">
            By accessing or using WhachatCRM ("Service"), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use our Service.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Description of Service</h2>
          <p className="text-gray-600 mb-4">
            WhachatCRM is a <strong>customer relationship management (CRM) and customer communication platform</strong> for
            businesses to manage conversations, organize leads, set follow-ups, and run sales workflows. Depending on your
            configuration, the Service may support <strong>multiple channels</strong> (for example, WhatsApp, Instagram,
            Facebook Messenger, SMS, Telegram, and web chat) and <strong>integrations</strong> such as Shopify, subject to
            feature availability and your connected providers.
          </p>
          <p className="text-gray-600 mb-4">
            The Service is intended for <strong>legitimate customer communication</strong> and relationship management. It is
            not a “blast” or unsolicited bulk-messaging system, and you may not use it to evade platform rules, anti-spam laws, or
            consent requirements.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. Account Registration</h2>
          <p className="text-gray-600 mb-4">To use our Service, you must:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Provide accurate and complete registration information</li>
            <li>Be at least 18 years old or have legal authority to enter into agreements</li>
            <li>Maintain the security of your account credentials</li>
            <li>
              For WhatsApp features: maintain a valid WhatsApp Business API connection through a supported provider (for example
              Twilio or Meta) when you use those features
            </li>
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
              WhachatCRM subscription fees cover platform functionality. <strong>Channel and carrier costs</strong> (for example
              WhatsApp conversation fees, SMS, or other provider charges) are billed separately by your providers. WhachatCRM does
              not charge per message for CRM use of the platform.
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

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Messaging providers, channels, and integrations</h2>
          <p className="text-gray-600 mb-4">
            The Service may connect to third-party providers you authorize — including, depending on your setup,{" "}
            <strong>Twilio</strong>, <strong>Meta</strong> (for example WhatsApp Cloud API and, where enabled, Instagram or
            Messenger messaging products), and other channel providers. <strong>Shopify</strong> and other integrations are
            optional and governed by the permissions you grant.
          </p>
          <p className="text-gray-600 mb-4">You are responsible for:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Maintaining valid accounts and sufficient permissions with each provider you use</li>
            <li>Keeping tokens, API keys, and credentials secure</li>
            <li>Complying with each provider&apos;s terms, product policies, and technical requirements</li>
            <li>All fees, rate limits, and message charges imposed by providers</li>
            <li>Configuration required for webhooks, phone numbers, sender registration, and quality rules</li>
          </ul>
          <p className="text-gray-600 mb-4">
            WhachatCRM stores integration credentials using encryption at rest and uses them only to provide the features you
            enable. <strong>Third-party services may change, suspend, or limit functionality</strong> without notice; WhachatCRM
            is not responsible for provider outages, policy changes, or delivery failures outside our reasonable control.
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
            <li>
              Run campaigns, workflows, or sequences in ways that are likely to violate anti-spam laws, consent rules, or a
              provider&apos;s messaging policies
            </li>
            <li>Misrepresent automated content as human where disclosure is required</li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Messaging compliance, automation, AI features, and Shopify</h2>
          <p className="text-gray-600 mb-4">
            WhachatCRM provides tools; <strong>you remain responsible</strong> for lawful use. Nothing in these Terms guarantees
            regulatory compliance for your business — requirements vary by region and industry.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">7.1 WhatsApp (Business Platform)</h3>
          <p className="text-gray-600 mb-4">
            Where you use WhatsApp, you must comply with WhatsApp&apos;s Business Policies and Commerce Policies, including rules
            around user consent, messaging categories, template approvals where required, conversational windows, and messaging
            limits. You must obtain and maintain appropriate permission to message recipients in line with applicable law and
            WhatsApp rules.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">7.2 Instagram and Facebook Messenger</h3>
          <p className="text-gray-600 mb-4">
            Where you enable Instagram or Messenger messaging features, you must comply with Meta&apos;s applicable Platform Terms,
            Developer Policies, and messaging/product policies for those surfaces — including restrictions on prohibited content and
            permitted outreach practices.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">7.3 SMS and telephony</h3>
          <p className="text-gray-600 mb-4">
            Where you use SMS or telephony integrations, you must comply with carrier rules, consent and disclosure obligations
            (including TCPA-like requirements where applicable), Do-Not-Call rules where relevant, and identification/opt-out
            requirements imposed by your provider or regulators.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">7.4 Automation, campaigns, scheduling, and workflows</h3>
          <p className="text-gray-600 mb-4">
            Features such as preset campaigns, enrollment scheduling, reminders, and workflows send or queue messages based on your
            configuration. <strong>Scheduled messaging is not a promise of delivery</strong> — delivery may fail due to provider
            errors, recipient eligibility, conversation windows, blocks, quality enforcement, or maintenance. You must configure
            automation responsibly and honor recipient opt-outs promptly (including tags/fields your workspace uses to suppress
            outreach).
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">7.5 Artificial intelligence (AI) features</h3>
          <p className="text-gray-600 mb-4">
            Certain features may generate drafts, summaries, or suggestions using AI. AI outputs can be incorrect or inappropriate.
            <strong> You are responsible for reviewing content before sending</strong> when human oversight is required by law or
            by your policies. WhachatCRM does not warrant that AI outputs are accurate, complete, or fit for any particular legal
            purpose.
          </p>

          <h3 className="text-lg font-bold text-gray-900 mt-6 mb-3">7.6 Shopify merchants</h3>
          <p className="text-gray-600 mb-4">
            If you use WhachatCRM with Shopify, you acknowledge that you control how you collect and use your customers&apos;
            information in your store and messaging practices. You are responsible for publishing appropriate privacy notices,
            honoring buyer requests, and complying with Shopify&apos;s App Store policies and applicable commerce regulations.
            Uninstalling the app may initiate Shopify&apos;s standard app uninstall flows; data handling may depend on Shopify&apos;s
            processes and the permissions historically granted.
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
          <p className="text-gray-600 mb-4">
            AI-assisted features may produce errors. To the maximum extent permitted by law, WhachatCRM is not liable for
            decisions made based on AI outputs, missed sends due to automation safeguards, or enforcement actions by messaging
            platforms arising from your messaging practices.
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
