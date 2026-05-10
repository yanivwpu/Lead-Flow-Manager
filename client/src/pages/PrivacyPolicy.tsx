import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Helmet>
        <title>Privacy Policy | WhachatCRM</title>
        <meta
          name="description"
          content="WhachatCRM privacy policy: CRM and multi-channel messaging, AI-assisted features, automation, cookies, and your rights."
        />
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
        <p className="text-sm text-gray-500 mb-8">Last updated: May 8, 2026</p>

        <div className="prose prose-gray max-w-none">
          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">1. Introduction</h2>
          <p className="text-gray-600 mb-4">
            Welcome to WhachatCRM (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;). We are committed to protecting your privacy and personal
            information. WhachatCRM is a <strong>customer relationship management (CRM) and customer communication platform</strong>{" "}
            — built for teams to organize conversations and workflows, not for unsolicited bulk messaging. This Privacy Policy
            explains how we collect, use, disclose, and safeguard your information when you use our services, including
            multi-channel messaging, integrations (such as Shopify), and optional AI-assisted features.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">2. Information We Collect</h2>
          <p className="text-gray-600 mb-4">We collect the following types of information:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Account Information:</strong> Name, email address, password, and business details you provide during
              registration or billing.
            </li>
            <li>
              <strong>Messaging and CRM Content:</strong> Messages, contacts, conversation metadata, tags, notes, pipeline
              information, tasks, and related CRM records processed through the platform — including when you connect{" "}
              <strong>WhatsApp</strong> (via Twilio or Meta), <strong>Instagram</strong>, <strong>Facebook Messenger</strong>,{" "}
              <strong>SMS</strong> (where supported through your providers), <strong>Telegram</strong>, <strong>web chat</strong>, or
              other connected channels.
            </li>
            <li>
              <strong>Provider &amp; Integration Credentials:</strong> Such as Twilio credentials, Meta WhatsApp Business API
              tokens and identifiers, and other channel connection details you authorize — stored encrypted as described in
              Section 4 and used only to provide the integrations you enable.
            </li>
            <li>
              <strong>Shopify Data (if you connect Shopify):</strong> Information made available through your Shopify
              connection and webhooks (for example, shop identifiers, and customer/order-related fields needed to sync CRM
              workflows). Scope depends on permissions you grant and features you use.
            </li>
            <li>
              <strong>Campaign &amp; Automation Metadata:</strong> When you use preset campaigns, sequences, workflows, or
              enrollments, we process configuration and operational data (for example, step schedules, enrollment status, and
              delivery-related logs) needed to run those features.
            </li>
            <li>
              <strong>AI Feature Inputs and Outputs (if enabled on your plan):</strong> Content you choose to send for
              suggestions, summaries, or assisted replies may be processed to provide those features. AI features are designed
              to assist your team — they are not a substitute for your judgment or legal compliance obligations (see Sections 9
              and 11).
            </li>
            <li>
              <strong>Usage Data:</strong> Conversation counts, feature usage, and platform activity for plan limits, billing
              where applicable, reliability, and improvement.
            </li>
            <li>
              <strong>Device &amp; Technical Data:</strong> Browser type, IP address, and similar identifiers typical for web
              applications and security monitoring.
            </li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">3. How We Use Your Information</h2>
          <p className="text-gray-600 mb-4">We use your information for the following purposes:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Service Provision:</strong> To operate the CRM and inbox, route messages through your connected channels,
              and power features you enable (including reminders, templates where applicable, and internal collaboration tools).
            </li>
            <li>
              <strong>Integrations:</strong> To connect and maintain links to messaging providers, Meta-related signup or
              configuration flows you initiate in-product, Shopify (when installed), and other integrations you configure.
            </li>
            <li>
              <strong>Automation &amp; Campaign Execution:</strong> To schedule, queue, and execute automation you configure
              (including campaign enrollments and workflow steps), subject to platform rules and your provider constraints.
            </li>
            <li>
              <strong>AI-Assisted Features (where available):</strong> To generate suggestions, summaries, or drafts based on
              your instructions and conversation context. Outputs should be reviewed before sending to customers.
            </li>
            <li>
              <strong>Subscription &amp; Billing:</strong> To track usage against plan limits and process payments through our
              payment provider.
            </li>
            <li>
              <strong>Communications:</strong> Service notifications, security alerts, and (where permitted) product updates.
            </li>
            <li>
              <strong>Support &amp; Improvement:</strong> Troubleshooting, abuse prevention, and improving reliability and user
              experience.
            </li>
            <li>
              <strong>Legal Compliance:</strong> To comply with applicable laws and lawful requests, and to enforce our terms.
            </li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">4. Data Security</h2>
          <p className="text-gray-600 mb-4">
            We implement industry-standard security measures and layered protections to safeguard your information:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Data in Transit:</strong> Data transmitted between your browser, our servers, and third-party providers is
              encrypted using TLS (HTTPS).
            </li>
            <li>
              <strong>Data at Rest:</strong> Sensitive credentials (such as provider tokens) are encrypted at rest using
              AES-256-GCM. Our primary databases run on infrastructure that supports encryption at rest.
            </li>
            <li>
              <strong>Backups:</strong> We perform automated backups. Backup files are protected with access controls and stored
              with redundancy appropriate to our environment.
            </li>
            <li>
              <strong>Logging &amp; Monitoring:</strong> We maintain security monitoring and administrative logging appropriate to
              operating the service and investigating incidents. We do not claim perfect visibility into every human action at
              every moment — no practical system can — but we maintain controls designed to detect misuse and support
              accountability.
            </li>
            <li>
              <strong>Incident Response:</strong> We maintain processes to investigate suspected incidents and notify affected
              users and authorities where required by law.
            </li>
            <li>
              <strong>Shopify Compliance Webhooks:</strong> Where Shopify requires mandatory privacy webhooks (such as
              customer data requests and redaction flows), we implement handlers consistent with Shopify&apos;s documentation and
              verify webhook authenticity using HMAC signatures where applicable.
            </li>
            <li>
              <strong>Access Controls:</strong> Role-appropriate access restrictions for production systems and administrative
              operations.
            </li>
          </ul>
          <p className="text-gray-600 mb-4">However, no method of transmission over the Internet is 100% secure.</p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">5. Third-Party Services</h2>
          <p className="text-gray-600 mb-4">WhachatCRM integrates with services you choose to connect. Examples include:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Twilio:</strong> Optional WhatsApp Business API and SMS-related connectivity. Your Twilio credentials are
              stored securely and used only as directed by your configuration.
            </li>
            <li>
              <strong>Meta (WhatsApp Cloud API / messaging products):</strong> Optional direct connections for WhatsApp and,
              where enabled, Instagram or Messenger messaging features subject to Meta&apos;s policies and your configuration.
            </li>
            <li>
              <strong>Meta Embedded Experiences:</strong> Certain setup flows may load Meta SDK resources when you initiate them
              in the product. Those flows are governed by Meta&apos;s terms and your Meta Business configuration.
            </li>
            <li>
              <strong>Stripe:</strong> Payment processing. We do not store full payment card numbers on WhachatCRM servers.
            </li>
            <li>
              <strong>Shopify:</strong> When you install or connect Shopify, we receive and process information necessary to
              operate the integration features you enable.
            </li>
            <li>
              <strong>Analytics:</strong> We use privacy-preserving analytics tooling on our marketing site (see Section 10) to
              understand aggregate traffic patterns.
            </li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">6. Data Sharing &amp; Sales</h2>
          <p className="text-gray-600 mb-4">
            <strong>We do not sell your personal information.</strong> As of our current operations, we do not engage in the sale
            of personal data as defined by applicable privacy laws.
          </p>
          <p className="text-gray-600 mb-4">We may share data with categories of recipients such as:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Your messaging and infrastructure providers:</strong> To deliver messages and operate integrations you
              enable (for example, Twilio, Meta, or Shopify).
            </li>
            <li>
              <strong>Service providers:</strong> Hosting, payment processing, email delivery, security vendors, and (where
              applicable) subprocessors supporting AI-assisted features — solely to provide the service.
            </li>
            <li>
              <strong>Legal requirements:</strong> When required by law or to protect rights, safety, and integrity.
            </li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">7. Your Rights</h2>
          <p className="text-gray-600 mb-4">Depending on your jurisdiction, you may have rights to:</p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>Access or correct certain personal information</li>
            <li>Request deletion of your account and associated data</li>
            <li>Disconnect integrations and channel providers you previously authorized</li>
            <li>Export certain data where the product provides export capabilities</li>
            <li>Opt out of marketing communications (transactional messages may continue where permitted)</li>
          </ul>
          <p className="text-gray-600 mb-4">
            For deletion instructions (including Shopify-related context), see our{" "}
            <Link href="/data-deletion">
              <a className="text-brand-green hover:underline">Data deletion</a>
            </Link>{" "}
            page or email{" "}
            <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">
              support@whachatcrm.com
            </a>
            .
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">8. Data Retention</h2>
          <p className="text-gray-600 mb-4">
            We retain personal data for as long as needed to provide the service and for legitimate business operations,
            security, and legal compliance:
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Active Accounts:</strong> We retain your data while your account remains active and integrations remain in
              use, unless you delete content or request deletion.
            </li>
            <li>
              <strong>Account Deletion:</strong> When you request account deletion, we delete or anonymize associated personal
              data from our active production systems within a reasonable period — typically within <strong>30 days</strong>,
              unless a longer retention is required by law or necessary to resolve disputes or enforce agreements.
            </li>
            <li>
              <strong>Credentials:</strong> Provider credentials are removed when you disconnect an integration or delete your
              account, subject to short operational delays for consistency.
            </li>
            <li>
              <strong>Backups &amp; Logs:</strong> Deleted information may persist for a limited time in backups and operational
              logs before aging out.
            </li>
            <li>
              <strong>Legal Requirements:</strong> We may retain minimal records where strictly required (for example, billing and
              tax records).
            </li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">
            9. AI-assisted features, automation, campaigns, and scheduling
          </h2>
          <p className="text-gray-600 mb-4">
            Certain plans or features may include <strong>AI-assisted drafting or insights</strong>, as well as{" "}
            <strong>automations</strong> such as workflows, reminders, preset campaigns, scheduled sequences, and enrollment
            execution. These tools process the content and metadata needed to operate the feature you enable.
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              AI outputs may be imperfect; your team remains responsible for reviewing messages before they are sent where
              applicable.
            </li>
            <li>
              Automation timing and delivery depend on provider availability, recipient eligibility, conversation windows, and
              platform rules — WhachatCRM does not guarantee delivery or outcomes.
            </li>
            <li>
              Campaign updates may affect upcoming steps for active enrollments; already-delivered messages are not rewritten
              retroactively.
            </li>
          </ul>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">10. Cookies and similar technologies</h2>
          <p className="text-gray-600 mb-4">
            We use cookies and similar technologies for purposes that include security, preferences, analytics, and referral
            attribution. This section summarizes common categories — not every cookie applies to every visitor or session.
          </p>
          <ul className="list-disc list-inside text-gray-600 mb-4 space-y-2">
            <li>
              <strong>Essential / session:</strong> Cookies and session mechanisms needed for login, CSRF protection where
              applicable, and core application functionality.
            </li>
            <li>
              <strong>Analytics:</strong> Our public marketing pages may load analytics scripts (for example, Google Analytics via
              Google Tag Manager) to understand aggregate traffic. These technologies may set cookies or use local storage to
              distinguish sessions.
            </li>
            <li>
              <strong>Referral tracking:</strong> If you arrive via a partner or referral link, we may store a referral code in a
              cookie to attribute sign-ups fairly.
            </li>
            <li>
              <strong>UI preferences:</strong> Some interface settings (such as sidebar state) may be stored to improve
              usability on return visits.
            </li>
            <li>
              <strong>Third-party integration scripts:</strong> When you use Meta-related embedded flows, Meta may set or read
              cookies according to Meta&apos;s policies.
            </li>
          </ul>
          <p className="text-gray-600 mb-4">
            Where applicable for your region, you can accept or reject analytics cookies using the banner when it appears, or open{" "}
            <strong>Cookie preferences</strong> in the site footer (marketing pages) to update your choice anytime.
          </p>
          <p className="text-gray-600 mb-4">
            You can control cookies through your browser settings. Blocking certain cookies may impact functionality (for example,
            staying logged in).
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">11. Your responsibilities toward people you message</h2>
          <p className="text-gray-600 mb-4">
            If you use WhachatCRM to communicate with customers or leads, <strong>you</strong> are responsible for lawful
            messaging practices — including consent, opt-outs, template compliance where required, and honoring channel-specific
            rules (WhatsApp, Instagram, Messenger, SMS, etc.). WhachatCRM provides tooling; it does not provide legal advice and
            cannot guarantee regulatory compliance on your behalf.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">12. Changes to This Policy</h2>
          <p className="text-gray-600 mb-4">
            We may update this Privacy Policy from time to time. We will notify you of significant changes via email or through
            the platform where appropriate.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">13. Contact Us</h2>
          <p className="text-gray-600 mb-4">
            Questions about this Privacy Policy:{" "}
            <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">
              support@whachatcrm.com
            </a>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-200 text-xs text-gray-400 space-y-1">
          <p>WhachatCRM is a CRM platform and is not affiliated with Meta or WhatsApp.</p>
          <p>WhatsApp Business API access is typically provided through approved providers or direct Meta connections you configure.</p>
        </div>
      </div>
    </div>
  );
}
