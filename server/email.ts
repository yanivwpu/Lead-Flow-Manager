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
  emailList,
  emailOrderedList,
  emailSignatureBlock,
  emailSupportFooter,
  emailActivationFooter,
  renderSalespersonAssignedResponsibilitiesSection,
} from "./emailTemplates";
import { activationEmailAssets } from "@shared/activationEmailAssets";
import { settingsChannelsAbsoluteHref } from "@shared/settingsChannelsNavigation";
import {
  APP_INBOX_PATH,
  APP_INTEGRATIONS_PATH,
  APP_PRICING_PATH,
  APP_PROSPECT_AI_PATH,
  APP_TEMPLATES_PATH,
} from "@shared/appProductPaths";
import { PROSPECT_AI_MONTHLY_QUOTAS } from "@shared/prospectAI";
import { isShopifySyntheticMerchantEmail } from "@shared/shopifyBilling";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || "https://app.whachatcrm.com";
export const DEFAULT_RESEND_FROM_EMAIL = "WhachatCRM <noreply@crm.whachatcrm.com>";

/** Display name only: WhachatCRM. Does not change the verified sender address. */
export function resolveResendFromEmail(
  envFrom: string | null | undefined = process.env.RESEND_FROM_EMAIL,
): string {
  const raw = (envFrom && envFrom.trim()) || DEFAULT_RESEND_FROM_EMAIL;
  return raw.replace(/^WhaChatCRM(\s*<)/, "WhachatCRM$1");
}

export const WHACHATCRM_SUPPORT_EMAIL = "support@whachatcrm.com";
export const WELCOME_EMAIL_SUBJECT = "Welcome to WhachatCRM — here's what you can do now 🚀";
export const ACTIVATION_DAY5_EMAIL_SUBJECT = "Connect your channels — it's easier than you think";
export const ACTIVATION_DAY10_EMAIL_SUBJECT = "Need help getting WhachatCRM set up?";
export const TRIAL_EXPIRATION_EMAIL_SUBJECT =
  "Your Pro + AI Brain trial has ended — your Free account is still active";
export const SHOPIFY_WELCOME_EMAIL_SUBJECT =
  "Welcome to WhachatCRM — connect your store conversations";
export const SHOPIFY_ACTIVATION_DAY5_EMAIL_SUBJECT =
  "Connect WhatsApp to your Shopify store conversations";
export const SHOPIFY_ACTIVATION_DAY10_EMAIL_SUBJECT =
  "Need help connecting WhachatCRM to your store?";

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: EmailOptions): Promise<boolean> {
  if (isShopifySyntheticMerchantEmail(to)) {
    console.warn(
      `[Email] Refusing to send to synthetic Shopify identity address. Subject: "${subject}"`,
    );
    return false;
  }
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
        from: resolveResendFromEmail(),
        to,
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
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

function firstNameFrom(name: string): string {
  return (name || "there").split(" ")[0] || "there";
}

function emailFeatureBlock(title: string, body: string, location: string): string {
  return `${emailSubheading(title)}
    ${emailParagraph(body)}
    <p style="color: #64748b; font-size: 13px; margin: -8px 0 16px;"><strong>Location:</strong> ${escapeHtml(location)}</p>`;
}

function emailShopifyWelcomeNavLinks(appUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const link = (href: string, label: string) =>
    `<a href="${href}" style="color: #059669; text-decoration: none; font-weight: 600;">${escapeHtml(label)}</a>`;
  return `<p style="color: #64748b; font-size: 14px; margin: 16px 0 0; text-align: center; line-height: 1.7;">
    ${link(`${base}${APP_INBOX_PATH}`, "Inbox")} ·
    ${link(`${base}${APP_PROSPECT_AI_PATH}`, "Prospect AI")} ·
    ${link(`${base}${APP_TEMPLATES_PATH}`, "Templates")} ·
    ${link(`${base}${APP_INTEGRATIONS_PATH}`, "Integrations")}
  </p>`;
}

function emailNavLinks(appUrl: string, channelsUrl: string): string {
  const base = appUrl.replace(/\/+$/, "");
  const link = (href: string, label: string) =>
    `<a href="${href}" style="color: #059669; text-decoration: none; font-weight: 600;">${escapeHtml(label)}</a>`;
  return `<p style="color: #64748b; font-size: 14px; margin: 16px 0 0; text-align: center; line-height: 1.7;">
    ${link(`${base}${APP_INBOX_PATH}`, "Inbox")} ·
    ${link(`${base}${APP_INTEGRATIONS_PATH}`, "Integrations")} ·
    ${link(`${base}${APP_TEMPLATES_PATH}`, "Templates")} ·
    ${link(channelsUrl, "Channels")}
  </p>`;
}

export function renderWelcomeEmailHtml(
  name: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const first = escapeHtml(firstNameFrom(name));
  const prospectAiUrl = `${appUrl.replace(/\/+$/, "")}${APP_PROSPECT_AI_PATH}`;
  const channelsUrl = settingsChannelsAbsoluteHref(appUrl);

  const body = [
    emailParagraph(`Hi ${first},`),
    emailParagraph("Your WhachatCRM account is ready."),
    emailParagraph(
      "Here's what you can already use on the Free plan — no paid upgrade required for these:",
    ),
    emailFeatureBlock(
      "1. Prospect AI",
      "Find and qualify potential customers that match the businesses you want to sell to. Prospect AI is included on Free, within your current Free limits.",
      "Growth Engines → Prospect AI",
    ),
    emailFeatureBlock(
      "2. Unified Inbox",
      "Manage customer conversations from connected messaging channels in one place.",
      "Inbox",
    ),
    emailFeatureBlock(
      "3. Integrations",
      "Connect tools your business already uses.",
      "Integrations",
    ),
    emailFeatureBlock(
      "4. WhatsApp Templates",
      "Manage approved WhatsApp templates and use the Free-supported 1:1 template messaging experience. Bulk template campaigns and workflow automation are not included on Free.",
      "Templates",
    ),
    emailFeatureBlock(
      "5. Messaging Channels",
      "Connect WhatsApp, Instagram, Facebook Messenger, Gmail/Email, and other supported channels (subject to each channel's provider requirements).",
      "Settings → Channels",
    ),
    emailSectionHeading("6. WhatsApp Coexistence"),
    emailHighlightBox(
      "<strong>Already using the WhatsApp Business App?</strong><br/>With WhatsApp Coexistence, you can keep using the WhatsApp Business App with your existing number while also connecting it to WhachatCRM. The WhatsApp Business App stays your mobile app — it does not become the WhachatCRM inbox. WhachatCRM gives your team a shared inbox for that same number.",
    ),
    emailParagraph(
      "Your new account also includes a 14-day Pro + AI Brain trial, so you can experience the advanced AI and automation features before deciding whether you need them. When the trial ends, you keep the Free features above unless you choose a paid plan. AI Brain is not included on Free after the trial.",
    ),
    emailButton(prospectAiUrl, "Try Prospect AI"),
    emailNavLinks(appUrl, channelsUrl),
  ].join("");

  return renderBrandedEmail({
    title: "Your WhachatCRM account is ready",
    bodyHtml: body,
    footerHtml: `<p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhachatCRM. All rights reserved.</p>`,
  });
}

export async function sendWelcomeEmail(name: string, email: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: WELCOME_EMAIL_SUBJECT,
    html: renderWelcomeEmailHtml(name),
  });
}

export function renderShopifyWelcomeEmailHtml(
  name: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const first = escapeHtml(firstNameFrom(name));
  const connectWhatsAppUrl = settingsChannelsAbsoluteHref(appUrl, { provider: "whatsapp" });

  const body = [
    emailParagraph(`Hi ${first},`),
    emailParagraph("Your Shopify store is now connected to WhachatCRM."),
    emailParagraph("The next step is to connect the channels where your customers talk to you."),
    emailFeatureBlock(
      "1. Connect WhatsApp",
      "Bring WhatsApp conversations into your Unified Inbox so you can manage customer conversations alongside your Shopify activity.",
      "Settings → Channels → WhatsApp",
    ),
    emailSectionHeading("Already using the WhatsApp Business App?"),
    emailHighlightBox(
      "With WhatsApp Coexistence, you can keep using the WhatsApp Business App with your existing number while also connecting that number to WhachatCRM.",
    ),
    emailFeatureBlock(
      "2. Unified Inbox",
      "Manage conversations from WhatsApp, Instagram, Facebook Messenger, Email and other supported channels in one place.",
      "Inbox",
    ),
    emailFeatureBlock(
      "3. Prospect AI",
      "Find and qualify potential customers directly from WhachatCRM.",
      "Prospect AI",
    ),
    emailFeatureBlock(
      "4. WhatsApp Templates",
      "Manage approved WhatsApp templates and use supported 1:1 template messaging.",
      "Templates",
    ),
    emailFeatureBlock(
      "5. Integrations",
      "Shopify is already connected, and you can connect additional tools your business uses.",
      "Integrations",
    ),
    emailParagraph(
      "Your account also includes a 14-day Pro + AI Brain trial so you can experience advanced automation and AI features.",
    ),
    emailButton(connectWhatsAppUrl, "Connect WhatsApp"),
    emailShopifyWelcomeNavLinks(appUrl),
  ].join("");

  return renderBrandedEmail({
    title: "Connect your store conversations",
    bodyHtml: body,
    footerHtml: `<p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhachatCRM. All rights reserved.</p>`,
  });
}

export async function sendShopifyWelcomeEmail(name: string, email: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: SHOPIFY_WELCOME_EMAIL_SUBJECT,
    html: renderShopifyWelcomeEmailHtml(name),
  });
}

export function renderShopifyActivationEmailDay5Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const channelsUrl = settingsChannelsAbsoluteHref(appUrl);

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)},`),
    emailParagraph("Shopify is already connected."),
    emailParagraph(
      "Now connect WhatsApp so customer conversations can flow into WhachatCRM.",
    ),
    emailSectionHeading("Already using WhatsApp Business App?"),
    emailHighlightBox(
      "Keep using the same app and number while connecting it to WhachatCRM with WhatsApp Coexistence.",
    ),
    emailParagraph(
      "You can also connect Instagram, Facebook Messenger, Gmail/Email, and other supported channels from Settings → Channels.",
    ),
    emailButton(channelsUrl, "Connect a Channel"),
  ].join("");

  return renderBrandedEmail({
    title: "Connect WhatsApp to your store",
    bodyHtml: body,
    footerHtml: emailActivationFooter(appUrl),
  });
}

export async function sendShopifyActivationEmailDay5(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: SHOPIFY_ACTIVATION_DAY5_EMAIL_SUBJECT,
    html: renderShopifyActivationEmailDay5Html(firstName),
  });
}

export function renderShopifyActivationEmailDay10Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const helpMailto = `mailto:${WHACHATCRM_SUPPORT_EMAIL}?subject=${encodeURIComponent("Help connecting WhachatCRM to your store")}`;

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)},`),
    emailParagraph("We'd be happy to help you get up and running."),
    emailParagraph("We can help:"),
    emailList([
      "connect WhatsApp or another messaging channel",
      "get the Unified Inbox working",
      "configure an automation/workflow for the business",
      "at no charge",
    ]),
    emailParagraph("Just reply to this email and tell us what you're trying to accomplish."),
    emailButton(helpMailto, "Get Setup Help"),
  ].join("");

  return renderBrandedEmail({
    title: "Need help connecting your store?",
    bodyHtml: body,
    footerHtml: emailActivationFooter(appUrl),
  });
}

export async function sendShopifyActivationEmailDay10(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: SHOPIFY_ACTIVATION_DAY10_EMAIL_SUBJECT,
    html: renderShopifyActivationEmailDay10Html(firstName),
    replyTo: WHACHATCRM_SUPPORT_EMAIL,
  });
}

/** Verification email for public signup (not an onboarding/welcome sequence). */
export async function sendEmailVerificationEmail(
  name: string,
  email: string,
  rawToken: string,
): Promise<boolean> {
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const body = [
    emailParagraph(`Hi ${escapeHtml(name)}!`),
    emailParagraph(
      "Please verify your email address to activate your WhaChatCRM account and start your free trial.",
    ),
    emailButton(verifyUrl, "Verify my email"),
    emailHighlightBox(
      "<strong>This link expires in 45 minutes</strong> and can only be used once. If you did not create an account, you can ignore this email.",
    ),
    emailParagraph("Having trouble with the button? Copy and paste this link into your browser:"),
    emailInfoBox(
      `<span style="font-family: monospace; font-size: 12px; color: #64748b; word-break: break-all;">${escapeHtml(verifyUrl)}</span>`,
    ),
  ].join("");

  return sendEmail({
    to: email,
    subject: "Verify your WhaChatCRM email",
    html: renderBrandedEmail({ title: "Verify your email", bodyHtml: body }),
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

export async function sendPartnerPortalPasswordResetEmail(
  email: string,
  resetToken: string,
): Promise<boolean> {
  const resetUrl = `${APP_URL}/partner-portal/reset-password?token=${encodeURIComponent(resetToken)}`;
  const body = [
    emailParagraph(
      "We received a request to reset your WhachatCRM Partner Portal password.",
    ),
    emailParagraph(
      "Use the secure link below to choose a new password. This link will expire in 60 minutes.",
    ),
    emailButton(resetUrl, "Reset password"),
    emailParagraph("If you did not request this change, you can ignore this email."),
    emailParagraph("Having trouble with the button? Copy and paste this link into your browser:"),
    emailInfoBox(
      `<span style="font-family: monospace; font-size: 12px; color: #64748b; word-break: break-all;">${escapeHtml(resetUrl)}</span>`,
    ),
  ].join("");

  return sendEmail({
    to: email,
    subject: "Reset your WhachatCRM Partner Portal password",
    html: renderBrandedEmail({
      title: "Reset your Partner Portal password",
      bodyHtml: body,
    }),
  });
}

export async function sendSalesPortalPasswordResetEmail(
  email: string,
  resetToken: string,
): Promise<boolean> {
  const resetUrl = `${APP_URL}/sales-portal/reset-password?token=${encodeURIComponent(resetToken)}`;
  const body = [
    emailParagraph(
      "We received a request to reset your WhachatCRM Sales Portal password.",
    ),
    emailParagraph(
      "Use the secure link below to choose a new password. This link will expire in 60 minutes.",
    ),
    emailButton(resetUrl, "Reset password"),
    emailParagraph("If you did not request this change, you can ignore this email."),
    emailParagraph("Having trouble with the button? Copy and paste this link into your browser:"),
    emailInfoBox(
      `<span style="font-family: monospace; font-size: 12px; color: #64748b; word-break: break-all;">${escapeHtml(resetUrl)}</span>`,
    ),
  ].join("");

  return sendEmail({
    to: email,
    subject: "Reset your WhachatCRM Sales Portal password",
    html: renderBrandedEmail({
      title: "Reset your Sales Portal password",
      bodyHtml: body,
    }),
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

export function renderActivationEmailDay5Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const channelsUrl = settingsChannelsAbsoluteHref(appUrl);

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)},`),
    emailParagraph(
      "To start using your Unified Inbox, connect at least one messaging channel. It's easier than you think.",
    ),
    emailParagraph(
      "From Settings → Channels you can connect WhatsApp, Instagram, Facebook Messenger, Gmail/Email, and other supported channels such as SMS, Telegram, and Web Chat.",
    ),
    emailSectionHeading("Already using WhatsApp Business App?"),
    emailHighlightBox(
      "You don't have to stop using it or start over.<br/><br/>With WhatsApp Coexistence, you can keep using the WhatsApp Business App with your existing number while connecting that number to WhachatCRM. The WhatsApp Business App remains your mobile app — WhachatCRM adds a shared team inbox for the same number.",
    ),
    emailParagraph("Connect a channel and your conversations will start flowing into Inbox."),
    emailButton(channelsUrl, "Connect a Channel"),
  ].join("");

  return renderBrandedEmail({
    title: "Connect your channels",
    bodyHtml: body,
    footerHtml: emailActivationFooter(appUrl),
  });
}

/** @deprecated Name kept for previews; content is the Day 5 sequence email. */
export function renderActivationEmailDay3Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  return renderActivationEmailDay5Html(firstName, options);
}

export async function sendActivationEmailDay5(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: ACTIVATION_DAY5_EMAIL_SUBJECT,
    html: renderActivationEmailDay5Html(firstName),
  });
}

/** @deprecated Sends the Day 5 channel-connection email. */
export async function sendActivationEmailDay3(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendActivationEmailDay5(firstName, email);
}

export function renderActivationEmailDay10Html(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const helpMailto = `mailto:${WHACHATCRM_SUPPORT_EMAIL}?subject=${encodeURIComponent("Help getting WhachatCRM set up")}`;

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)},`),
    emailParagraph("If you haven't connected your channels yet, we'd be happy to help."),
    emailParagraph("We can help you:"),
    emailList([
      "connect your messaging channels",
      "get your Unified Inbox up and running",
      "help configure an automation/workflow for your business",
      "at no charge",
    ]),
    emailParagraph("Just reply to this email and tell us what you're trying to accomplish."),
    emailButton(helpMailto, "Get Setup Help"),
  ].join("");

  return renderBrandedEmail({
    title: "Need help getting set up?",
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
    subject: ACTIVATION_DAY10_EMAIL_SUBJECT,
    html: renderActivationEmailDay10Html(firstName),
    replyTo: WHACHATCRM_SUPPORT_EMAIL,
  });
}

export function renderTrialExpirationEmailHtml(
  firstName: string,
  options?: ActivationEmailRenderOptions,
): string {
  const { appUrl } = activationEmailContext(options);
  const base = appUrl.replace(/\/+$/, "");
  const pricingUrl = `${base}${APP_PRICING_PATH}`;
  const inboxUrl = `${base}${APP_INBOX_PATH}`;
  const prospectQuota = PROSPECT_AI_MONTHLY_QUOTAS.free;

  const body = [
    emailParagraph(`Hi ${escapeHtml(firstName)},`),
    emailParagraph("Your 14-day Pro + AI Brain trial has ended."),
    emailParagraph(
      "Your WhachatCRM account is still active, and you can continue using the features included with Free.",
    ),
    emailParagraph("You can still:"),
    emailList([
      `Find and qualify prospects with Prospect AI, within your Free limits (${prospectQuota} discoveries/month)`,
      "Manage conversations in your Unified Inbox",
      "Connect supported messaging channels",
      "Use your available Integrations",
      "Manage and send supported 1:1 WhatsApp Templates",
    ]),
    emailSectionHeading("What changed"),
    emailParagraph("Your temporary Pro + AI Brain trial features have ended."),
    emailParagraph(
      "AI Brain is the intelligence layer behind the AI Sales Team. It can power deeper prospect analysis, stronger personalization, opportunity intelligence, recommendations, and smarter automation. AI Brain is an optional add-on for paid plans — it is not included with Free, and it is not automatically included with every paid plan.",
    ),
    emailParagraph(
      "If you want to continue using the advanced automation, higher usage limits, team features, and AI Brain intelligence you experienced during your trial, you can choose the plan and AI options that fit your business.",
    ),
    emailButton(pricingUrl, "View Plans & AI Options"),
    `<div style="text-align: center; margin: 12px 0 4px;">
      <a href="${inboxUrl}" style="color: #059669; text-decoration: none; font-weight: 600; font-size: 14px;">Continue on Free</a>
    </div>`,
  ].join("");

  return renderBrandedEmail({
    title: "Your Free account is still active",
    bodyHtml: body,
    footerHtml: `<p style="margin: 0 0 8px; color: #94a3b8; font-size: 12px;">Questions? <a href="mailto:${WHACHATCRM_SUPPORT_EMAIL}" style="color: #059669; text-decoration: none;">${WHACHATCRM_SUPPORT_EMAIL}</a></p>
    <p style="margin: 0; color: #94a3b8; font-size: 11px;">This is a service message about your WhachatCRM account entitlements.</p>
    <p style="margin: 8px 0 0; color: #94a3b8; font-size: 11px;">
      <a href="${base}/privacy-policy" style="color: #94a3b8; text-decoration: underline;">Privacy Policy</a>
    </p>
    <p style="margin: 12px 0 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhachatCRM. All rights reserved.</p>`,
  });
}

export async function sendTrialExpirationEmail(
  firstName: string,
  email: string,
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: TRIAL_EXPIRATION_EMAIL_SUBJECT,
    html: renderTrialExpirationEmailHtml(firstName),
  });
}

/** @deprecated Replaced by sendActivationEmailDay5 / sendActivationEmailDay10 */
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
