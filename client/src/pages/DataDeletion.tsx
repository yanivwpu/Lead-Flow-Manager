import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

/**
 * Public instructions for account / personal data deletion requests (merchant & end-user context).
 */
export function DataDeletion() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Helmet>
        <title>Data Deletion | WhachatCRM</title>
        <meta
          name="description"
          content="How to request deletion of your WhachatCRM account and associated data, including Shopify-related handling."
        />
        <link rel="canonical" href={`${MARKETING_URL}/data-deletion`} />
        <meta property="og:url" content={`${MARKETING_URL}/data-deletion`} />
      </Helmet>
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm md:p-12">
        <Link href="/">
          <a className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-brand-green">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </a>
        </Link>

        <h1 className="mb-2 font-display text-3xl font-bold text-gray-900">Data deletion</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: May 8, 2026</p>

        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-4">
            WhachatCRM is a customer communication and CRM platform. This page explains how to request deletion of
            information we hold about <strong>you</strong> as a WhachatCRM customer or authorized user. It also notes how
            Shopify-related deletion requests are handled when you connect a store.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Account holders (WhachatCRM users)</h2>
          <p className="text-gray-600 mb-4">
            To delete your WhachatCRM workspace account and associated personal data (profile, organization details, and
            content stored in our systems for your account), email{" "}
            <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">
              support@whachatcrm.com
            </a>{" "}
            from the email address on your account with the subject line{" "}
            <span className="font-mono text-sm">Data deletion request</span>. We may ask you to verify ownership of the
            account before processing.
          </p>
          <p className="text-gray-600 mb-4">
            After verification, we process deletion in line with our{" "}
            <Link href="/privacy-policy">
              <a className="text-brand-green hover:underline">Privacy Policy</a>
            </Link>{" "}
            (including typical completion within the timeframe described there for active databases). Some records may be
            retained where required for legal, tax, or fraud-prevention reasons, as explained in the Privacy Policy.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Shopify merchants</h2>
          <p className="text-gray-600 mb-4">
            If you installed WhachatCRM from the Shopify App Store, uninstalling the app initiates Shopify&apos;s standard
            data handling flows. We support Shopify&apos;s mandatory privacy webhooks (including customer and shop
            redaction) so that merchant and customer data requests can be processed in accordance with Shopify&apos;s
            requirements and our Privacy Policy.
          </p>
          <p className="text-gray-600 mb-4">
            <strong>Important:</strong> You remain responsible for lawful collection and use of <em>your</em> customers&apos;
            data through your store and messaging practices. WhachatCRM does not replace your obligation to honor opt-outs
            and applicable privacy laws for your buyers.
          </p>

          <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">End customers (your contacts)</h2>
          <p className="text-gray-600 mb-4">
            If you are a consumer who interacted with a business that uses WhachatCRM, that business is typically the
            controller of your data. Please contact them first. If they cannot resolve your request, you may email us at{" "}
            <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">
              support@whachatcrm.com
            </a>{" "}
            and we will route reasonable requests to the relevant merchant where possible.
          </p>

          <p className="text-gray-600 mb-4">
            Questions? See our{" "}
            <Link href="/privacy-policy">
              <a className="text-brand-green hover:underline">Privacy Policy</a>
            </Link>{" "}
            or contact{" "}
            <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">
              support@whachatcrm.com
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
