import {
  SALESPERSON_GE_SETUP_PAYOUT_NOTE,
  SALESPERSON_PAYOUT_POLICY_DESCRIPTION,
  SALESPERSON_PAYOUT_POLICY_SHORT,
} from "@shared/salespersonCommissionCopy";
import {
  escapeHtml,
  renderBrandedEmail,
  emailParagraph,
  emailSectionHeading,
  emailSubheading,
  emailButton,
  emailSecondaryButton,
  emailInfoBox,
  emailHighlightBox,
  emailTipBox,
  emailChecklist,
  emailList,
  emailOrderedList,
  emailSignatureBlock,
  emailSupportFooter,
  emailFigure,
  emailActivationFooter,
  renderSalespersonAssignedResponsibilitiesSection,
} from "./emailTemplates";
import { activationEmailAssets } from "@shared/activationEmailAssets";
import { settingsChannelsAbsoluteHref } from "@shared/settingsChannelsNavigation";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || "https://app.whachatcrm.com";
const FROM_EMAIL =
  (process.env.RESEND_FROM_EMAIL && process.env.RESEND_FROM_EMAIL.trim()) ||
  "WhaChatCRM <noreply@crm.whachatcrm.com>";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn(
      `[Email] RESEND_API_KEY is missing — cannot send email. Recipient: ${to}, subject: "${subject}"`
    );
    console.warn(
      "[Email] Set RESEND_API_KEY in your environment (e.g. Railway variables) to enable Resend."
    );
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(
        `[Email] Resend API returned an error — HTTP ${response.status} — recipient: ${to}, subject: "${subject}"`
      );
      console.error(`[Email] Resend response body: ${body || "(empty)"}`);
      return false;
    }

    console.log(`[Email] Sent successfully to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(
      `[Email] Network or unexpected error while calling Resend — recipient: ${to}, subject: "${subject}"`,
      error
    );
    return false;
  }
}

export async function sendWelcomeEmail(name: string, email: string): Promise<boolean> {
  const body = [
    emailParagraph(`Hi ${escapeHtml(name)}!`),
    emailParagraph(
      "Thank you for signing up for WhaChatCRM. We're excited to have you on board!"
    ),
    emailParagraph("With WhaChatCRM, you can:"),
    emailList([
      "Manage all your WhatsApp conversations in one place",
      "Never miss a follow-up with smart reminders",
      "Organize leads with tags and pipeline stages",
      "Track your sales progress effortlessly",
    ]),
    emailParagraph("Ready to get started?"),
    emailButton(APP_URL, "Open WhaChatCRM"),
  ].join("");

  return sendEmail({
    to: email,
    subject: "Welcome to WhaChatCRM!",
    html: renderBrandedEmail({ title: "Welcome to WhaChatCRM", bodyHtml: body }),
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

  const body = [
    emailParagraph(
      "We received a request to reset the password for your WhaChatCRM account. Click the button below to create a new password:"
    ),
    emailButton(resetUrl, "Reset My Password"),
    emailHighlightBox(
      "<strong>Security note:</strong> This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email — your account is secure."
    ),
    emailParagraph("Having trouble with the button? Copy and paste this link into your browser:"),
    emailInfoBox(
      `<span style="font-family: monospace; font-size: 12px; color: #64748b; word-break: break-all;">${escapeHtml(resetUrl)}</span>`
    ),
  ].join("");

  const footer = `<p style="margin: 0 0 8px; color: #94a3b8; font-size: 12px;">Need help? <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
    <p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>`;

  return sendEmail({
    to: email,
    subject: "Reset Your Password - WhaChatCRM",
    html: renderBrandedEmail({ title: "Reset your password", bodyHtml: body, footerHtml: footer }),
  });
}

export async function sendContactFormEmail(
  name: string,
  email: string,
  message: string
): Promise<boolean> {
  const SUPPORT_EMAIL = "support@whachatcrm.com";

  const body = [
    emailInfoBox(
      `<p style="margin: 0 0 8px; color: #475569; font-size: 15px;"><strong>From:</strong> ${escapeHtml(name)}</p>
       <p style="margin: 0; color: #475569; font-size: 15px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color: #059669;">${escapeHtml(email)}</a></p>`
    ),
    emailSubheading("Message"),
    emailInfoBox(
      `<p style="margin: 0; color: #475569; font-size: 15px; white-space: pre-wrap;">${escapeHtml(message)}</p>`
    ),
    emailButton(`mailto:${email}`, `Reply to ${name}`),
  ].join("");

  return sendEmail({
    to: SUPPORT_EMAIL,
    subject: `Contact Form: ${name}`,
    html: renderBrandedEmail({ title: "New contact form submission", bodyHtml: body }),
  });
}

export async function sendSubscriptionConfirmationEmail(
  name: string,
  email: string,
  planName: string,
  amount: string
): Promise<boolean> {
  const body = [
    emailParagraph(`Hi ${escapeHtml(name)}!`),
    emailParagraph(
      `Thank you for upgrading to WhaChatCRM <strong>${escapeHtml(planName)}</strong>. Your subscription is now active!`
    ),
    emailHighlightBox(
      `<strong>Subscription details</strong><br/>
       Plan: ${escapeHtml(planName)}<br/>
       Amount: ${escapeHtml(amount)}/month`
    ),
    emailParagraph(
      `You now have access to all ${escapeHtml(planName)} features. Start making the most of your upgraded plan!`
    ),
    emailButton(`${APP_URL}/chats`, "Go to Dashboard"),
  ].join("");

  const footer = `<p style="margin: 0 0 8px; color: #94a3b8; font-size: 12px;">Need help? <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
    <p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>`;

  return sendEmail({
    to: email,
    subject: `Welcome to WhaChatCRM ${planName}!`,
    html: renderBrandedEmail({
      title: `You're on ${planName}!`,
      bodyHtml: body,
      footerHtml: footer,
    }),
  });
}

export async function sendHelpCenterFeedback(
  articleId: string,
  articleTitle: string,
  feedback: string
): Promise<boolean> {
  const SUPPORT_EMAIL = "support@whachatcrm.com";

  const body = [
    emailTipBox(
      `<strong>Article:</strong> ${escapeHtml(articleTitle)}<br/><span style="font-size: 12px;">ID: ${escapeHtml(articleId)}</span>`
    ),
    emailSubheading("User feedback"),
    emailInfoBox(
      `<p style="margin: 0; color: #475569; font-size: 15px; white-space: pre-wrap;">${escapeHtml(feedback)}</p>`
    ),
  ].join("");

  return sendEmail({
    to: SUPPORT_EMAIL,
    subject: `Help Center Feedback: ${articleTitle}`,
    html: renderBrandedEmail({ title: "Help Center feedback", bodyHtml: body }),
  });
}

export async function sendDemoBookingNotification(
  salespersonEmail: string,
  salespersonName: string,
  visitor: { name: string; email: string; phone: string; scheduledDate: Date },
  meetingLink?: string | null,
): Promise<boolean> {
  const formattedDate = visitor.scheduledDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

  const meetingLine = meetingLink?.trim()
    ? `<br/><strong>Meeting link:</strong> <a href="${escapeHtml(meetingLink.trim())}">${escapeHtml(meetingLink.trim())}</a>`
    : "";

  const body = [
    emailParagraph(`Hi ${escapeHtml(salespersonName)}!`),
    emailParagraph(
      "A prospect booked a demo on your Calendly and chose the time below. No further scheduling is needed."
    ),
    emailHighlightBox(
      `<strong>Visitor:</strong> ${escapeHtml(visitor.name)}<br/>
       <strong>Email:</strong> ${escapeHtml(visitor.email)}<br/>
       <strong>Phone:</strong> ${escapeHtml(visitor.phone)}<br/>
       <strong>Scheduled:</strong> ${escapeHtml(formattedDate)} EST${meetingLine}`
    ),
    emailParagraph(
      `Accept or decline this assignment in the Sales Portal within 24 hours. ${SALESPERSON_PAYOUT_POLICY_SHORT}`
    ),
    emailButton(`${APP_URL}/sales-portal`, "Open Sales Portal"),
  ].join("");

  return sendEmail({
    to: salespersonEmail,
    subject: `New Demo Booking: ${visitor.name}`,
    html: renderBrandedEmail({ title: "New demo booking", bodyHtml: body }),
  });
}

export async function sendDemoConfirmationEmail(
  visitorEmail: string,
  visitorName: string,
  scheduledDate: Date,
  salespersonName: string,
  meetingLink?: string | null,
): Promise<boolean> {
  const formattedDate = scheduledDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });

  const meetingLine = meetingLink?.trim()
    ? `<br/><strong>Meeting link:</strong> <a href="${escapeHtml(meetingLink.trim())}">${escapeHtml(meetingLink.trim())}</a>`
    : "";

  const body = [
    emailParagraph(`Hi ${escapeHtml(visitorName)}!`),
    emailParagraph(
      "Thank you for booking a demo with WhaChatCRM. We're excited to show you how our platform can help transform your business communication."
    ),
    emailHighlightBox(
      `<strong>Scheduled:</strong> ${escapeHtml(formattedDate)} EST<br/>
       <strong>Your demo specialist:</strong> ${escapeHtml(salespersonName)}${meetingLine}`
    ),
    emailSectionHeading("What to expect"),
    emailList([
      "A personalized walkthrough of WhaChatCRM features",
      "How to integrate WhatsApp with your existing workflow",
      "Q&amp;A to address your specific needs",
    ]),
    emailParagraph("Questions before the demo? Reply to this email anytime."),
    emailButton(APP_URL, "Visit WhaChatCRM"),
  ].join("");

  return sendEmail({
    to: visitorEmail,
    subject: "Your Demo is Confirmed! - WhaChatCRM",
    html: renderBrandedEmail({ title: "Demo confirmed", bodyHtml: body }),
  });
}

export async function sendSalespersonWelcomeEmail(
  name: string,
  email: string,
  loginCode: string,
  role?: string,
  taskPayoutDollars?: number | null
): Promise<boolean> {
  const portalUrl = `${APP_URL}/sales-portal`;

  const body = [
    emailParagraph(`Hi ${escapeHtml(name)}!`),
    emailParagraph(
      "Welcome aboard! We're excited to have you join the WhaChatCRM sales team. Below you'll find everything you need to get started."
    ),
    renderSalespersonAssignedResponsibilitiesSection(role, taskPayoutDollars),
    emailSectionHeading("How to access the Sales Portal"),
    emailOrderedList([
      `Go to <a href="${portalUrl}" style="color: #059669; text-decoration: none; font-weight: 500;">${escapeHtml(portalUrl)}</a>`,
      "Enter your email address",
      `Enter your 6-digit ID code: <strong>${escapeHtml(loginCode)}</strong>`,
    ]),
    emailSectionHeading("Using the Sales Portal"),
    emailParagraph("Once logged in, you'll have access to:"),
    emailList([
      "<strong>Dashboard:</strong> View your demos, conversions, and earnings at a glance",
      "<strong>Pending demos:</strong> See scheduled demos assigned to you and mark them complete after each call",
      `<strong>Earnings:</strong> Track demo conversion and setup payouts (${SALESPERSON_PAYOUT_POLICY_SHORT})`,
    ]),
    emailSectionHeading("How conversions are tracked"),
    emailParagraph(
      `When a prospect you've demoed signs up for a paid Starter or Pro plan, our system automatically matches their information to your demo booking. ${SALESPERSON_PAYOUT_POLICY_DESCRIPTION}`
    ),
    emailParagraph(SALESPERSON_GE_SETUP_PAYOUT_NOTE),
    emailHighlightBox(
      `<strong>Pro tip:</strong> Explore WhaChatCRM and the <a href="${APP_URL}/help" style="color: #059669; text-decoration: none; font-weight: 500;">Help Center</a> — the more familiar you are with the product, the better you can showcase its value.`
    ),
    emailButton(portalUrl, "Go to Sales Portal"),
    emailSupportFooter(),
    emailSignatureBlock(),
  ].join("");

  return sendEmail({
    to: email,
    subject: "Welcome to the WhaChatCRM Sales Team!",
    html: renderBrandedEmail({ title: "Welcome to the team", bodyHtml: body }),
  });
}

export async function sendPartnerWelcomeEmail(
  name: string,
  email: string,
  refCode: string,
  password?: string
): Promise<boolean> {
  const portalUrl = `${APP_URL}/partner-portal`;

  const credentials = [
    `<p style="margin: 0 0 12px; color: #475569; font-size: 14px;"><span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">Portal URL</span><br/>${escapeHtml(portalUrl)}</p>`,
    `<p style="margin: 0 0 12px; color: #475569; font-size: 14px;"><span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">Email</span><br/>${escapeHtml(email)}</p>`,
    password
      ? `<p style="margin: 0 0 12px; color: #475569; font-size: 14px;"><span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">Password</span><br/><span style="font-family: monospace; font-weight: 700;">${escapeHtml(password)}</span></p>`
      : "",
    `<p style="margin: 0; color: #475569; font-size: 14px;"><span style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">Your ref code</span><br/><span style="font-family: monospace; font-weight: 700; color: #059669; font-size: 17px;">${escapeHtml(refCode)}</span></p>`,
  ].join("");

  const body = [
    emailParagraph(`Hi ${escapeHtml(name)},`),
    emailParagraph(
      "We're thrilled to have you as a partner! You're now equipped with everything you need to start referring clients and earning commissions."
    ),
    emailSubheading("Your partner credentials"),
    emailInfoBox(credentials),
    emailButton(portalUrl, "Access Partner Dashboard"),
    emailSectionHeading("Quick start"),
    emailOrderedList([
      "Log in to your dashboard using the credentials above.",
      "Review and accept the Partner Agreement.",
      "Copy your unique referral link and start sharing.",
    ]),
  ].join("");

  const footer = `<p style="margin: 0 0 8px; color: #94a3b8; font-size: 12px;">Need assistance? <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
    <p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>`;

  return sendEmail({
    to: email,
    subject: "Welcome to the WhaChatCRM Partner Program!",
    html: renderBrandedEmail({
      title: "Welcome to the partner program",
      bodyHtml: body,
      footerHtml: footer,
    }),
  });
}

export interface ActivationEmailRenderOptions {
  appUrl?: string;
  /** Override screenshot base URL (e.g. file:// for local previews). */
  assetBase?: string;
}

function activationEmailContext(options?: ActivationEmailRenderOptions) {
  const appUrl = options?.appUrl ?? APP_URL;
  return {
    appUrl,
    assets: activationEmailAssets(appUrl, options?.assetBase ? { assetBase: options.assetBase } : undefined),
    channelsWhatsAppUrl: settingsChannelsAbsoluteHref(appUrl, { provider: "whatsapp" }),
  };
}

const DAY3_EMAIL_FIGURE = { maxWidth: 460, figureMargin: "14px 0 18px" } as const;

export function renderActivationEmailDay3Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl, assets, channelsWhatsAppUrl } = activationEmailContext(options);

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)}!`),
    emailParagraph(
      "Welcome to WhaChatCRM — your unified inbox for WhatsApp, Facebook Messenger, and Instagram, plus AI-powered tools that help you respond faster and keep conversations organized.",
    ),
    emailHighlightBox(
      "<strong>All your conversations in one place.</strong> When customers message you on any channel, everything flows into a single Inbox — organized, searchable, and ready for your team.",
    ),
    emailSectionHeading("Get started with WhaChatCRM"),
    emailChecklist([
      "One unified Inbox for WhatsApp, Facebook Messenger, and Instagram",
      "AI-powered tools to help you respond faster",
      "Organized conversations and customer history",
      "Contact management and follow-up tools",
      "Upgrade anytime for advanced AI automation and lead workflows",
    ]),
    emailFigure(
      assets.channelsPage,
      "WhaChatCRM Communication Channels settings",
      "WhatsApp, Facebook Messenger, and Instagram — all in one place",
      DAY3_EMAIL_FIGURE,
    ),
    emailSectionHeading("Simple guided setup with Meta Embedded Signup"),
    emailParagraph(
      "No API keys. No copy/paste credentials. No manual Meta configuration. The guided setup walks you through each step with Meta Embedded Signup.",
    ),
    emailFigure(
      assets.connectWhatsApp,
      "Connect WhatsApp — Meta Embedded Signup option",
      'Click Connect, then choose "Continue with Meta Embedded Signup"',
      DAY3_EMAIL_FIGURE,
    ),
    emailFigure(
      assets.embeddedSignup,
      "Meta Embedded Signup welcome screen",
      "Meta walks you through connecting your business — familiar and secure",
      DAY3_EMAIL_FIGURE,
    ),
    emailFigure(
      assets.metaBusinessSelection,
      "Meta business asset selection",
      "Choose your business portfolio and WhatsApp Business account in a guided flow",
      DAY3_EMAIL_FIGURE,
    ),
    emailOrderedList([
      "Choose your Facebook Business Account",
      "Choose or create your WhatsApp Business Account",
      "Add or migrate a phone number",
      "Verify the number",
      "Start receiving conversations in your Inbox",
    ]),
    emailParagraph(
      "You can also connect <strong>Facebook Messenger</strong> and <strong>Instagram Messaging</strong> from the same Channels page — all three channels feed into your unified Inbox.",
    ),
    emailButton(channelsWhatsAppUrl, "Connect WhatsApp"),
  ].join("");

  return renderBrandedEmail({
    title: "Your AI assistant is ready",
    bodyHtml: body,
    footerHtml: emailActivationFooter(appUrl),
  });
}

export async function sendActivationEmailDay3(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Connect WhatsApp in minutes — your free AI assistant is ready",
    html: renderActivationEmailDay3Html(firstName),
  });
}

export function renderActivationEmailDay10Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl, assets, channelsWhatsAppUrl } = activationEmailContext(options);

  const realEstateExample = emailInfoBox(
    `<p style="margin: 0 0 10px; color: #475569; font-size: 14px;"><strong>Customer:</strong> &ldquo;Is this property still available?&rdquo;</p>
     <p style="margin: 0 0 8px; color: #475569; font-size: 13px; font-weight: 600;">WhaChatCRM AI can:</p>
     <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13px; line-height: 1.55;">
       <li>Reply instantly</li>
       <li>Answer common listing questions</li>
       <li>Ask qualification questions (timeline, budget)</li>
       <li>Capture contact information</li>
       <li>Recommend matching listings</li>
       <li>Alert your agent when the lead is qualified</li>
     </ul>`,
  );

  const medSpaExample = emailInfoBox(
    `<p style="margin: 0 0 10px; color: #475569; font-size: 14px;"><strong>Customer:</strong> &ldquo;How much is Botox?&rdquo;</p>
     <p style="margin: 0 0 8px; color: #475569; font-size: 13px; font-weight: 600;">WhaChatCRM AI can:</p>
     <ul style="margin: 0; padding-left: 18px; color: #475569; font-size: 13px; line-height: 1.55;">
       <li>Answer pricing and service questions</li>
       <li>Explain treatments and common FAQs</li>
       <li>Qualify interest and discuss available options</li>
       <li>Collect contact information</li>
       <li>Encourage appointment booking when applicable</li>
       <li>Route the lead to staff when a human touch is needed</li>
     </ul>`,
  );

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)},`),
    emailHighlightBox(
      "<strong>Your AI assistant is ready — but it cannot help customers until your messaging channels are connected.</strong>",
    ),
    emailParagraph(
      "WhaChatCRM AI acts like a <strong>virtual assistant for your business</strong>. It can help with repetitive customer conversations so your team can focus on high-value work — available once your channels are live.",
    ),
    emailSectionHeading("What your AI assistant does for you"),
    emailList([
      "Learns your business — services, products, FAQs, and processes",
      "Can help handle common customer conversations and frequently asked questions",
      "Can help qualify leads and answer common customer questions",
      "Books appointments when applicable",
      "Escalates conversations when a person should take over",
      "Suggests next actions to your staff in the Inbox",
    ]),
    emailFigure(
      assets.inbox,
      "WhaChatCRM unified inbox",
      "Manage conversations from WhatsApp, Facebook Messenger, and Instagram in one organized Inbox.",
    ),
    emailSubheading("Example — Real Estate"),
    realEstateExample,
    emailSubheading("Example — Med Spa"),
    medSpaExample,
    emailParagraph(
      "Messages from <strong>WhatsApp</strong>, <strong>Facebook Messenger</strong>, and <strong>Instagram Messaging</strong> all flow into one Inbox — with AI suggestions on every thread.",
    ),
    emailTipBox(
      "The more your team uses WhaChatCRM, the more your AI assistant learns your business, services, customer questions, and preferred responses.",
    ),
    emailParagraph(
      "Connect WhatsApp, Facebook Messenger, or Instagram and start receiving conversations in your Inbox.",
    ),
    emailButton(channelsWhatsAppUrl, "Connect Your Channels"),
  ].join("");

  return renderBrandedEmail({
    title: "Activate your AI assistant",
    bodyHtml: body,
    footerHtml: emailActivationFooter(appUrl),
  });
}

export async function sendActivationEmailDay10(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "Your AI assistant is waiting — connect your channels to activate it",
    html: renderActivationEmailDay10Html(firstName),
  });
}

/** @deprecated Replaced by sendActivationEmailDay3 / sendActivationEmailDay10 */
export async function sendTrialCheckinEmail(firstName: string, email: string): Promise<boolean> {
  return sendActivationEmailDay10(firstName, email);
}

function emailDividerSignature(): string {
  return `<div style="border-top: 1px solid #e2e8f0; margin: 28px 0 0; padding-top: 24px;">
    <p style="color: #475569; font-size: 15px; margin: 0 0 4px;">Best,</p>
    <p style="color: #0f172a; font-size: 15px; font-weight: 600; margin: 0 0 2px;">Yaniv Haramaty</p>
    <p style="color: #64748b; font-size: 14px; margin: 0 0 2px;">Founder / Customer Success</p>
    <p style="color: #64748b; font-size: 14px; margin: 0;"><a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
  </div>`;
}

export async function sendFollowUpReminderEmail(
  email: string,
  chatName: string,
  followUp: string,
  notes: string,
  linkPath: string
): Promise<boolean> {
  const href = linkPath.startsWith("http") ? linkPath : `${APP_URL}${linkPath}`;

  const detailBox = emailInfoBox(
    `<p style="margin: 0 0 8px; color: #475569; font-size: 15px;"><strong>Contact:</strong> ${escapeHtml(chatName)}</p>
     <p style="margin: 0 0 8px; color: #475569; font-size: 15px;"><strong>Follow-up:</strong> ${escapeHtml(followUp)}</p>
     ${notes ? `<p style="margin: 0; color: #475569; font-size: 15px;"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ""}`
  );

  const body = [
    emailParagraph("You have a follow-up scheduled:"),
    detailBox,
    emailButton(href, "View contact"),
  ].join("");

  return sendEmail({
    to: email,
    subject: `Follow-up Reminder: ${chatName}`,
    html: renderBrandedEmail({ title: "Follow-up reminder", bodyHtml: body }),
  });
}

export async function sendRealtorPaymentConfirmationEmail(
  name: string,
  email: string
): Promise<boolean> {
  const onboardingUrl = `${APP_URL}/app/templates/realtor-growth-engine/onboarding`;

  const body = [
    emailParagraph(`Hi ${escapeHtml(name || "there")},`),
    emailParagraph(
      "Thank you for purchasing the <strong>Realtor Growth Engine</strong>. Your payment has been received and your template is ready to activate."
    ),
    emailParagraph(
      "Your next step is to complete a short onboarding form so we can configure your system."
    ),
    emailButton(onboardingUrl, "Complete onboarding"),
    emailSubheading("Before you start (2 minutes)"),
    emailOrderedList([
      "<strong>Pro + AI Brain</strong> — active on your account (required for the Growth Engine)",
      "<strong>WhatsApp</strong> — connect in Settings with guided embedded signup",
      "<strong>Business basics</strong> — name, country, and optional website for your launch profile",
      "<strong>Calendar (optional)</strong> — connect Calendly so leads can self-book showings",
    ]),
    emailParagraph(
      'Questions? Reply to this email or contact <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a>.'
    ),
  ].join("");

  return sendEmail({
    to: email,
    subject: "Your Realtor Growth Engine is ready to set up",
    html: renderBrandedEmail({ title: "Payment confirmed", bodyHtml: body }),
  });
}

export type GrowthEngineOnboardingEmailContext = {
  whatsappConnected: boolean;
  whatsappLine: string;
  connectedChannels: string[];
  assignedSpecialistName: string | null;
  assignedSpecialistEmail: string | null;
  sessionBooking: {
    eventTypeName?: string;
    startTime?: string;
    inviteeName?: string;
  } | null;
  onboardingCompletedAt: string | null;
};

function formatRgeSessionTime(iso: string | undefined): string {
  if (!iso) return "Pending — customer has not booked yet";
  try {
    return new Date(iso).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

export async function sendGrowthEngineSessionBookedEmail(
  salespersonEmail: string,
  salespersonName: string,
  booking: {
    customerName: string;
    customerEmail: string;
    eventTypeName: string;
    startTime?: string;
    meetingLink?: string;
  },
): Promise<boolean> {
  const when = formatRgeSessionTime(booking.startTime);
  const body = [
    emailParagraph(`Hi ${escapeHtml(salespersonName)},`),
    emailParagraph("A customer booked their Growth Engine concierge launch session."),
    emailHighlightBox(
      [
        `<strong>Customer:</strong> ${escapeHtml(booking.customerName)}`,
        `<strong>Email:</strong> ${escapeHtml(booking.customerEmail)}`,
        `<strong>Session:</strong> ${escapeHtml(booking.eventTypeName)}`,
        `<strong>When:</strong> ${escapeHtml(when)}`,
        booking.meetingLink
          ? `<strong>Meeting link:</strong> <a href="${escapeHtml(booking.meetingLink)}">${escapeHtml(booking.meetingLink)}</a>`
          : "",
      ]
        .filter(Boolean)
        .join("<br/>"),
    ),
    emailParagraph("Review their setup in Sales Portal → GE Setup and prepare for the session."),
    emailButton(`${APP_URL}/sales-portal`, "Open Sales Portal"),
  ].join("");

  return sendEmail({
    to: salespersonEmail,
    subject: `GE launch session booked — ${booking.customerName}`,
    html: renderBrandedEmail({ title: "Launch session booked", bodyHtml: body }),
  });
}

export async function sendRealtorOnboardingEmail(
  payload: Record<string, unknown>,
  normalized: Record<string, unknown>,
  submissionId: string,
  context?: GrowthEngineOnboardingEmailContext,
): Promise<boolean> {
  const n = normalized || {};
  const p = payload || {};
  const field = (key: string) => escapeHtml(String((n as Record<string, unknown>)[key] ?? (p as Record<string, unknown>)[key] ?? "N/A"));
  const payloadStr = (key: string) => escapeHtml(String((p as Record<string, unknown>)[key] ?? ""));

  const row = (label: string, value: string) =>
    emailParagraph(`<strong>${escapeHtml(label)}:</strong> ${value}`);

  const sessionWhen = context?.sessionBooking?.startTime
    ? formatRgeSessionTime(context.sessionBooking.startTime)
    : field("preferredCallWindows");

  const specialistLine =
    context?.assignedSpecialistName && context?.assignedSpecialistEmail
      ? `${escapeHtml(context.assignedSpecialistName)} (${escapeHtml(context.assignedSpecialistEmail)})`
      : context?.assignedSpecialistName
        ? escapeHtml(context.assignedSpecialistName)
        : "Assigned at purchase — see Sales Portal";

  const whatsappState = context
    ? context.whatsappConnected
      ? `Connected — ${escapeHtml(context.whatsappLine)}`
      : "Not connected"
    : field("numberActiveOnWhatsapp");

  const channelsLine =
    context && context.connectedChannels.length > 0
      ? escapeHtml(context.connectedChannels.join(", "))
      : "None connected yet";

  const completedAt = context?.onboardingCompletedAt
    ? formatRgeSessionTime(context.onboardingCompletedAt)
    : "Just now";

  const summaryCard = emailHighlightBox(
    [
      `<strong>Business:</strong> ${field("legalBusinessName")}`,
      `<strong>Customer:</strong> ${field("fullName")} · ${field("email")}`,
      `<strong>Launch session:</strong> ${escapeHtml(sessionWhen)}`,
      `<strong>Setup specialist:</strong> ${specialistLine}`,
      `<strong>Onboarding completed:</strong> ${escapeHtml(completedAt)}`,
    ].join("<br/>"),
  );

  const body = [
    emailParagraph(
      "New <strong>Realtor Growth Engine</strong> guided launch submission. The customer completed embedded WhatsApp signup and the Guided Launch wizard.",
    ),
    summaryCard,
    emailSectionHeading("WhatsApp & channels"),
    row("WhatsApp (embedded signup)", whatsappState),
    row("Connected channels", channelsLine),
    emailSectionHeading("Business & CRM"),
    row("Country", field("country")),
    row("Website", field("website")),
    row("Team", field("teamSize")),
    row("Seats", field("seats")),
    row("Notifications", field("notifications")),
    emailSectionHeading("Goals & concierge notes"),
    row("Lead sources", field("leadSources")),
    row("Primary outcome", field("goals")),
    row("Timezone", field("timezone")),
    row("Additional notes", field("notes") === "N/A" ? "—" : field("notes")),
    emailSectionHeading("Plan validation"),
    emailParagraph(
      "Pro + AI Brain were verified at activation. Automations install with the template; concierge validates AI Brain tuning and channel coverage in the launch session.",
    ),
    emailHighlightBox(
      `<strong>Submission ID:</strong> ${escapeHtml(submissionId)}<br/>
       <strong>Flow:</strong> Guided Launch v2 · Embedded Meta signup`,
    ),
  ].join("");

  const legalName = String((n as Record<string, unknown>).legalBusinessName ?? (p as Record<string, unknown>).legalName ?? "N/A");
  const fullName = String((n as Record<string, unknown>).fullName ?? (p as Record<string, unknown>).fullName ?? "N/A");

  return sendEmail({
    to: "support@whachatcrm.com",
    subject: `RGE Guided Launch — ${legalName} — ${fullName}`,
    html: renderBrandedEmail({ title: "Growth Engine onboarding", bodyHtml: body }),
  });
}

export interface HotLeadEntry {
  name: string;
  score: number;
  lastMessage: string;
  pipelineStage: string;
  phone: string;
  chatId: string;
}

export async function sendDailyHotListEmail(
  userEmail: string,
  userName: string,
  leads: HotLeadEntry[]
): Promise<boolean> {
  const hasLeads = leads.length > 0;
  const subject = hasLeads
    ? `Your Hot Leads Today (Top ${leads.length})`
    : "No Hot Leads Today — Your Engine Is Running";

  const leadRows = leads
    .map((lead, i) => {
      const snippet =
        lead.lastMessage.length > 120
          ? lead.lastMessage.substring(0, 120) + "..."
          : lead.lastMessage;
      const waLink = lead.phone
        ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`
        : "#";
      const crmLink = `${APP_URL}/chats?id=${lead.chatId}`;

      return `<tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 12px 8px;">
          <div style="font-weight: 600; color: #1e293b; font-size: 14px;">${i + 1}. ${escapeHtml(lead.name)}</div>
          <div style="color: #64748b; font-size: 12px; margin-top: 4px;">${escapeHtml(lead.pipelineStage)}</div>
        </td>
        <td style="padding: 12px 8px; text-align: center;">
          <span style="background: #dc2626; color: #fff; padding: 4px 10px; border-radius: 12px; font-weight: 700; font-size: 13px;">${lead.score}</span>
        </td>
        <td style="padding: 12px 8px;">
          <div style="color: #475569; font-size: 12px; max-width: 200px;">${escapeHtml(snippet)}</div>
        </td>
        <td style="padding: 12px 8px; text-align: center;">
          <a href="${waLink}" style="display: inline-block; background: #25D366; color: #fff; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; margin-bottom: 4px;">WhatsApp</a><br/>
          <a href="${crmLink}" style="color: #059669; font-size: 11px; text-decoration: underline;">Open in CRM</a>
        </td>
      </tr>`;
    })
    .join("");

  const noLeadsContent = `<div style="text-align: center; padding: 32px 12px;">
    <p style="font-size: 32px; margin: 0 0 12px;">✓</p>
    <h3 style="color: #0f172a; margin: 0 0 8px; font-size: 16px;">No hot leads right now</h3>
    <p style="color: #64748b; font-size: 14px; margin: 0;">Your Growth Engine is running. When a lead scores 80+, they'll appear here.</p>
  </div>`;

  const leadsTable = hasLeads
    ? `<table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0;">
            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600;">Lead</th>
            <th style="padding: 10px 8px; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">Score</th>
            <th style="padding: 10px 8px; text-align: left; font-size: 12px; color: #64748b; font-weight: 600;">Last message</th>
            <th style="padding: 10px 8px; text-align: center; font-size: 12px; color: #64748b; font-weight: 600;">Action</th>
          </tr>
        </thead>
        <tbody>${leadRows}</tbody>
      </table>`
    : noLeadsContent;

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const body = [
    emailParagraph(`Good morning, ${escapeHtml(userName.split(" ")[0])}!`),
    hasLeads
      ? emailParagraph(
          `Here are your <strong>top ${leads.length} hot leads</strong> (scored 80+) ready for your attention today:`
        )
      : "",
    leadsTable,
    emailButton(APP_URL, "Open WhaChatCRM dashboard"),
  ].join("");

  const footer = `<p style="margin: 0 0 4px; color: #94a3b8; font-size: 11px;">${escapeHtml(dateLabel)} · Realtor Growth Engine</p>
    <p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>`;

  return sendEmail({
    to: userEmail,
    subject,
    html: renderBrandedEmail({
      title: "Your daily hot list",
      bodyHtml: body,
      footerHtml: footer,
    }),
  });
}
