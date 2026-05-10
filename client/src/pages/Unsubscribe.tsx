import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

/**
 * Marketing email preferences — transactional/security messages may continue.
 */
export function Unsubscribe() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Helmet>
        <title>Email preferences | WhachatCRM</title>
        <meta
          name="description"
          content="How to unsubscribe from marketing emails from WhachatCRM."
        />
        <link rel="canonical" href={`${MARKETING_URL}/unsubscribe`} />
        <meta property="og:url" content={`${MARKETING_URL}/unsubscribe`} />
      </Helmet>
      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm md:p-12">
        <Link href="/">
          <a className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-brand-green">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </a>
        </Link>

        <h1 className="mb-2 font-display text-3xl font-bold text-gray-900">Email preferences</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: May 8, 2026</p>

        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-4">
            If you no longer wish to receive <strong>marketing or promotional</strong> emails from WhachatCRM, email{" "}
            <a href="mailto:support@whachatcrm.com?subject=Unsubscribe%20from%20marketing" className="text-brand-green hover:underline">
              support@whachatcrm.com
            </a>{" "}
            with the subject <span className="font-mono text-sm">Unsubscribe</span> or reply to any marketing message
            asking to opt out. We will process your request within a reasonable time.
          </p>
          <p className="text-gray-600 mb-4">
            You may still receive <strong>transactional or service-related</strong> messages (for example, billing
            receipts, security alerts, password resets, or critical account notices) where permitted by law.
          </p>
          <p className="text-gray-600 mb-4">
            For how we use personal data, see our{" "}
            <Link href="/privacy-policy">
              <a className="text-brand-green hover:underline">Privacy Policy</a>
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
