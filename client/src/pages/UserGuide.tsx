import { Link } from "wouter";
import { Helmet } from "react-helmet";
import { ArrowLeft } from "lucide-react";
import { MARKETING_URL } from "@/lib/marketingUrl";

/**
 * Canonical getting-started / user documentation for WhachatCRM (marketing site).
 * Prefer linking to `/user-guide`. Legacy `/WhachatCRM-User-Guide.html` redirects here.
 */
export function UserGuide() {
  const canonical = `${MARKETING_URL}/user-guide`;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <Helmet>
        <title>User Guide & Getting Started | WhachatCRM</title>
        <meta
          name="description"
          content="Learn how to connect WhatsApp with Meta embedded signup, use the unified inbox, templates, campaigns, AI Copilot, integrations, and billing — step by step for teams."
        />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content="User Guide & Getting Started | WhachatCRM" />
        <meta
          property="og:description"
          content="Connect channels, manage conversations, templates, campaigns, and AI — all in one friendly guide."
        />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-8 shadow-sm md:p-12">
        <Link href="/">
          <a className="mb-6 inline-flex items-center text-sm text-gray-500 hover:text-brand-green">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </a>
        </Link>

        <h1 className="font-display mb-2 text-3xl font-bold text-gray-900">WhachatCRM User Guide</h1>
        <p className="mb-8 text-sm text-gray-500">Last updated: May 8, 2026</p>

        <nav className="mb-10 rounded-xl border border-gray-100 bg-gray-50 p-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">On this page</h2>
          <ul className="grid gap-2 text-sm text-brand-green sm:grid-cols-2">
            <li>
              <a href="#whatsapp" className="hover:underline">
                WhatsApp & channels
              </a>
            </li>
            <li>
              <a href="#integrations" className="hover:underline">
                Integrations
              </a>
            </li>
            <li>
              <a href="#templates" className="hover:underline">
                Templates
              </a>
            </li>
            <li>
              <a href="#reengagement" className="hover:underline">
                Re-engagement
              </a>
            </li>
            <li>
              <a href="#campaigns" className="hover:underline">
                Campaigns & automation
              </a>
            </li>
            <li>
              <a href="#ai" className="hover:underline">
                AI & Copilot
              </a>
            </li>
            <li>
              <a href="#inbox" className="hover:underline">
                Inbox & CRM
              </a>
            </li>
            <li>
              <a href="#billing" className="hover:underline">
                Billing & plans
              </a>
            </li>
            <li>
              <a href="#legal" className="hover:underline">
                Policies & support
              </a>
            </li>
          </ul>
        </nav>

        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600">
            WhachatCRM brings your customer chats into one workspace so your team can reply faster, stay organized, and
            follow up without losing context. This guide matches how the product works today — no developer setup required.
          </p>

          <h2 id="whatsapp" className="mt-10 text-xl font-bold text-gray-900">
            WhatsApp & other channels
          </h2>
          <p className="text-gray-600">
            You connect WhatsApp from inside the app — you do <strong>not</strong> need to hunt for long-lived tokens or
            paste secrets by hand as your main setup path.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              Go to <strong>Integrations</strong> or <strong>Channel Settings</strong> (from the main menu after you log
              in).
            </li>
            <li>
              Choose <strong>Meta (WhatsApp Cloud)</strong> and follow the <strong>guided embedded signup</strong> flow.
              You&apos;ll sign in with Meta, pick your business portfolio, WhatsApp Business Account (WABA), and the phone
              number you want to use.
            </li>
            <li>
              If you already use the <strong>WhatsApp Business app</strong> on your phone, Meta may offer{" "}
              <strong>coexistence</strong> or embedded signup options so Cloud API and the app can work together — follow
              the on-screen steps shown for your account.
            </li>
            <li>
              <strong>Twilio</strong> is available where enabled: connect through the same guided channel screens rather
              than copying secrets into random fields.
            </li>
          </ul>
          <p className="text-gray-600">
            <strong>24-hour reply window (WhatsApp):</strong> After the customer last messages you, you typically have 24
            hours to send <em>session</em> messages freely. After that window, you need{" "}
            <strong>approved message templates</strong> from Meta to start the conversation again — that&apos;s a Meta
            rule, not something WhachatCRM can bypass.
          </p>
          <p className="text-gray-600">
            <strong>Facebook Messenger & Instagram:</strong> Connect these from Channel Settings when shown for your
            workspace. Rules for messaging and windows follow Meta&apos;s policies for each product.
          </p>

          <h2 id="integrations" className="mt-10 text-xl font-bold text-gray-900">
            Integrations
          </h2>
          <p className="text-gray-600">
            Open <strong>Integrations</strong> in the app to connect tools. Below is what each is for and where you manage
            it.
          </p>
          <ul className="list-disc space-y-3 pl-5 text-gray-600">
            <li>
              <strong>WhatsApp / Meta:</strong> Your Business messaging through Cloud API — primary channel for many
              teams.
            </li>
            <li>
              <strong>Facebook Messenger & Instagram:</strong> Continue conversations from Meta&apos;s messaging
              products in the same inbox where enabled.
            </li>
            <li>
              <strong>SMS (Twilio):</strong> When your workspace uses Twilio, SMS can appear alongside other channels
              depending on your setup.
            </li>
            <li>
              <strong>Shopify:</strong> Link your store for billing (where applicable) and tighter ecommerce workflows.
            </li>
            <li>
              <strong>WooCommerce:</strong> Connect your store to bring order and customer context into follow-ups.
            </li>
            <li>
              <strong>Mailchimp:</strong> Sync contacts or audiences so marketing lists stay aligned with conversations.
            </li>
            <li>
              <strong>HubSpot:</strong> Push and sync contacts with your CRM using a secure token you paste once during
              connect — then manage sync from the integration card.
            </li>
            <li>
              <strong>Calendly:</strong> Connect scheduling so bookings can drive reminders and handoffs in your process.
            </li>
            <li>
              <strong>GoHighLevel / LeadConnector:</strong> Install from the GoHighLevel marketplace when applicable,
              then verify the connection in WhachatCRM.
            </li>
            <li>
              <strong>Slack &amp; notifications:</strong> Workflow webhooks and similar options can post updates to
              Slack or other URLs when you configure them — check Automations and integration help for your plan.
            </li>
          </ul>

          <h2 id="templates" className="mt-10 text-xl font-bold text-gray-900">
            WhatsApp templates
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <strong>WhatsApp Library:</strong> Browse templates that exist in your Meta Business account and sync them
              into WhachatCRM so you&apos;re always sending approved content.
            </li>
            <li>
              <strong>Sync templates:</strong> Use the sync actions on the Templates screen so new or updated templates
              from Meta appear before you send.
            </li>
            <li>
              Simple <strong>text</strong> templates, <strong>media</strong> templates (image, video, document), and{" "}
              <strong>carousel</strong> layouts are supported where Meta has approved them — you&apos;ll see previews for
              carousel and rich formats when available.
            </li>
            <li>
              <strong>Quick send</strong> is for fast one-off sends; <strong>Library send</strong> walks you through
              choosing a synced template and filling variables properly.
            </li>
            <li>
              Pick or upload <strong>media</strong> before sending when the template expects a header image, video, or
              file.
            </li>
            <li>
              <strong>Variables</strong> map pieces like names or order numbers into the template — fill them carefully
              before the message goes out.
            </li>
            <li>
              <strong>Live customer preview</strong> helps you sanity-check how the message reads before it leaves your
              workspace.
            </li>
          </ul>

          <h2 id="reengagement" className="mt-10 text-xl font-bold text-gray-900">
            Re-engagement after a conversation goes quiet
          </h2>
          <p className="text-gray-600">
            When a chat has gone cold, rules depend on the channel — WhachatCRM is built for permission-based follow-up,
            not unsolicited bulk spam.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <strong>WhatsApp:</strong> After the session window ends, use <strong>approved templates</strong> to reopen
              the conversation legally and safely.
            </li>
            <li>
              <strong>Messenger / Instagram:</strong> You may be able to continue from the Inbox when Meta&apos;s rules
              allow — always respect opt-outs and platform policies.
            </li>
            <li>Use tags and segments so re-engagement stays targeted and relevant, not batch blasts to everyone.</li>
          </ul>

          <h2 id="campaigns" className="mt-10 text-xl font-bold text-gray-900">
            Campaigns, presets &amp; automation
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <strong>Preset campaigns</strong> are ready-made blueprints you can start from. You turn them into{" "}
              <strong>saved campaigns</strong> your team owns.
            </li>
            <li>
              Edit steps, messages, delays, and placeholders so the sequence matches your tone and process — review
              content before enrollment goes live.
            </li>
            <li>
              <strong>Enroll contacts manually</strong> from the Inbox or contact flows when you want someone on a
              sequence.
            </li>
            <li>
              A <strong>scheduler</strong> advances enrollments step by step when each send window is due — you can{" "}
              <strong>pause</strong>, <strong>resume</strong>, <strong>cancel</strong>, or use{" "}
              <strong>retry</strong> actions depending on status.
            </li>
            <li>
              Fully automatic enrollment from every new lead without a person clicking may be{" "}
              <strong>expanded over time</strong> — today, assume you should enroll deliberately unless your workspace has
              a specific automation configured.
            </li>
            <li>
              <strong>Workflows</strong> (Automations) handle triggers like keywords or pipeline changes — separate from
              preset campaigns but complementary.
            </li>
          </ul>

          <h2 id="ai" className="mt-10 text-xl font-bold text-gray-900">
            AI features &amp; Copilot
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <strong>Copilot insights</strong> summarize context so reps spend less time scrolling.
            </li>
            <li>
              <strong>Lead scoring</strong> highlights who may be ready for the next step — tune expectations; scores
              are hints, not guarantees.
            </li>
            <li>
              <strong>Suggested replies</strong> speed up answers; you stay in control of what actually sends.
            </li>
            <li>
              Modes such as <strong>Manual</strong>, <strong>Suggest</strong>, and <strong>Auto</strong> change how much
              the AI drafts or sends — choose what fits your risk level.
            </li>
            <li>
              <strong>AI Brain</strong> is an optional add-on that deepens AI capability on top of Starter or Pro — check
              pricing for availability.
            </li>
            <li>
              Always <strong>review AI output</strong> before trusting critical commitments; AI assists workflows and
              campaigns but may be wrong or out of date.
            </li>
          </ul>

          <h2 id="inbox" className="mt-10 text-xl font-bold text-gray-900">
            Unified inbox &amp; CRM
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              The <strong>unified inbox</strong> lists conversations across connected channels so one team shares
              context.
            </li>
            <li>
              Use the <strong>channel switcher</strong> to focus on WhatsApp, Meta channels, or others you&apos;ve
              connected.
            </li>
            <li>
              The <strong>contact sidebar</strong> holds profile details; add <strong>tags</strong>, pipeline{" "}
              <strong>stages</strong>, and internal <strong>notes</strong> your customer cannot see.
            </li>
            <li>
              <strong>Follow-ups</strong> and reminders keep deals from slipping.
            </li>
            <li>
              On <strong>Pro</strong>, <strong>assign</strong> conversations to teammates so ownership is clear.
            </li>
            <li>
              Start <strong>campaign enrollment</strong> from the sidebar when you want someone on a saved sequence.
            </li>
            <li>
              View and send <strong>media and files</strong> as supported by the channel — images, documents, and voice
              notes appear in the thread when available.
            </li>
          </ul>

          <h2 id="billing" className="mt-10 text-xl font-bold text-gray-900">
            Billing &amp; plan limits
          </h2>
          <p className="text-gray-600">
            Plans limit how many <strong>active conversations</strong> you can open in a billing period, how many{" "}
            <strong>users</strong> can join the workspace, and how many <strong>WhatsApp numbers</strong> you can
            register — message charges from Meta or Twilio are billed by those providers separately.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <strong>Free:</strong> 50 active conversations, 1 user, 1 WhatsApp number.
            </li>
            <li>
              <strong>Starter:</strong> 500 active conversations, up to 3 users, 1 WhatsApp number.
            </li>
            <li>
              <strong>Pro:</strong> 2,000 active conversations, unlimited users, up to 5 WhatsApp numbers.
            </li>
            <li>
              <strong>AI Brain:</strong> Add-on; requires an active <strong>Starter</strong> or <strong>Pro</strong> plan.
            </li>
          </ul>
          <p className="text-gray-600">
            Manage billing from <strong>Settings</strong> and your provider&apos;s portal (Stripe or Shopify) as shown
            for your account.
          </p>

          <h2 id="legal" className="mt-10 text-xl font-bold text-gray-900">
            Policies, privacy &amp; help
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-gray-600">
            <li>
              <Link href="/privacy-policy">
                <a className="text-brand-green hover:underline">Privacy Policy</a>
              </Link>
            </li>
            <li>
              <Link href="/terms-of-use">
                <a className="text-brand-green hover:underline">Terms of Use</a>
              </Link>
            </li>
            <li>
              <Link href="/data-deletion">
                <a className="text-brand-green hover:underline">Data deletion</a>
              </Link>{" "}
              — how to request removal of customer account data.
            </li>
            <li>
              <Link href="/unsubscribe">
                <a className="text-brand-green hover:underline">Email preferences &amp; unsubscribe</a>
              </Link>{" "}
              for marketing messages.
            </li>
            <li>
              <strong>Cookie preferences:</strong> use the cookie banner on marketing pages when it appears to adjust
              non-essential cookies.
            </li>
            <li>
              More FAQs live on the{" "}
              <Link href="/help">
                <a className="text-brand-green hover:underline">Help Center</a>
              </Link>
              .
            </li>
          </ul>

          <p className="mt-10 text-sm text-gray-500">
            Questions? Reach out via{" "}
            <Link href="/contact">
              <a className="text-brand-green hover:underline">Contact</a>
            </Link>{" "}
            or support from your account email.
          </p>
        </div>
      </div>
    </div>
  );
}
