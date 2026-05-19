const EMAIL_FONT = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface BrandedEmailOptions {
  title: string;
  bodyHtml: string;
  footerHtml?: string;
}

export function renderBrandedEmail({ title, bodyHtml, footerHtml }: BrandedEmailOptions): string {
  const year = new Date().getFullYear();
  const defaultFooter = `<p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${year} WhaChatCRM. All rights reserved.</p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: ${EMAIL_FONT}; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc;">
  <div style="padding: 32px 16px;">
    <div style="max-width: 600px; margin: 0 auto;">
      <div style="text-align: center; padding: 0 0 20px;">
        <div style="width: 36px; height: 36px; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 10px; display: inline-block; font-size: 18px; font-weight: 700; color: #059669; line-height: 36px;">W</div>
      </div>
      <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="padding: 28px 28px 8px; border-bottom: 1px solid #f1f5f9;">
          <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #0f172a; letter-spacing: -0.02em;">${escapeHtml(title)}</h1>
        </div>
        <div style="padding: 24px 28px 32px;">
          ${bodyHtml}
        </div>
        <div style="text-align: center; padding: 18px 28px; background: #f8fafc; border-top: 1px solid #f1f5f9;">
          ${footerHtml ?? defaultFooter}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function emailParagraph(html: string): string {
  return `<p style="color: #475569; font-size: 15px; margin: 0 0 16px; line-height: 1.65;">${html}</p>`;
}

export function emailSectionHeading(text: string): string {
  return `<h2 style="color: #0f172a; font-size: 15px; font-weight: 600; margin: 28px 0 10px; letter-spacing: -0.01em;">${escapeHtml(text)}</h2>`;
}

export function emailSubheading(text: string): string {
  return `<h3 style="color: #0f172a; font-size: 14px; font-weight: 600; margin: 20px 0 8px;">${escapeHtml(text)}</h3>`;
}

export function emailButton(href: string, label: string): string {
  return `<div style="text-align: center; margin: 28px 0 4px;">
    <a href="${href}" style="display: inline-block; background: #059669; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">${escapeHtml(label)}</a>
  </div>`;
}

export function emailSecondaryButton(href: string, label: string, bg = "#25D366"): string {
  return `<div style="text-align: center; margin: 12px 0 4px;">
    <a href="${href}" style="display: inline-block; background: ${bg}; color: #ffffff; padding: 11px 22px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">${escapeHtml(label)}</a>
  </div>`;
}

export function emailInfoBox(contentHtml: string): string {
  return `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin: 20px 0;">${contentHtml}</div>`;
}

export function emailHighlightBox(contentHtml: string): string {
  return `<div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
    <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.55;">${contentHtml}</p>
  </div>`;
}

export function emailTipBox(contentHtml: string): string {
  return `<div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; margin: 24px 0 0;">
    <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.55;">${contentHtml}</p>
  </div>`;
}

export function emailList(items: string[]): string {
  const lis = items
    .map((item) => `<li style="margin-bottom: 6px;">${item}</li>`)
    .join("");
  return `<ul style="color: #475569; font-size: 15px; padding-left: 20px; margin: 0 0 16px; line-height: 1.6;">${lis}</ul>`;
}

export function emailOrderedList(items: string[]): string {
  const lis = items
    .map((item) => `<li style="margin-bottom: 8px;">${item}</li>`)
    .join("");
  return `<ol style="color: #475569; font-size: 15px; padding-left: 20px; margin: 0 0 16px; line-height: 1.6;">${lis}</ol>`;
}

export function emailDivider(): string {
  return `<div style="border-top: 1px solid #e2e8f0; margin: 28px 0 0; padding-top: 24px;"></div>`;
}

export function emailSignatureBlock(): string {
  return `${emailDivider()}
    ${emailParagraph("Good luck and welcome to the team!")}
    <p style="color: #0f172a; font-size: 15px; font-weight: 600; margin: 0 0 2px;">Yaniv Haramaty</p>
    <p style="color: #64748b; font-size: 14px; margin: 0;">Founder, WhaChatCRM</p>`;
}

export function emailSupportFooter(): string {
  return `${emailDivider()}
    ${emailParagraph("Questions? Reach out anytime:")}
    <p style="color: #475569; font-size: 14px; margin: 0 0 4px;"><strong>Email:</strong> <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
    <p style="color: #475569; font-size: 14px; margin: 0;"><strong>Phone:</strong> <a href="tel:+19545138408" style="color: #059669; text-decoration: none;">954.513.8408</a></p>`;
}

export function getSalespersonAssignedResponsibilities(role: string | undefined): string[] {
  const r = role === "demo" ? "sales" : role || "sales";
  const responsibilities: string[] = [];
  if (r === "sales" || r === "both") {
    responsibilities.push("Demo calls");
    responsibilities.push("Prospect follow-up coordination");
  }
  if (r === "setup" || r === "both") {
    responsibilities.push("Customer onboarding");
    responsibilities.push("White-glove setup sessions");
    responsibilities.push("Growth Engine concierge tasks");
  }
  return responsibilities;
}

export function renderSalespersonAssignedResponsibilitiesSection(
  role: string | undefined,
  taskPayoutDollars?: number | null
): string {
  const items = getSalespersonAssignedResponsibilities(role);
  if (items.length === 0) return "";

  const r = role === "demo" ? "sales" : role || "sales";
  const hasSetup = r === "setup" || r === "both";

  const listHtml = emailList(items.map((item) => escapeHtml(item)));

  let payoutNote = "";
  if (hasSetup) {
    const amount =
      taskPayoutDollars != null && Number.isFinite(taskPayoutDollars)
        ? `$${taskPayoutDollars.toFixed(2)}`
        : "a fixed amount";
    payoutNote = emailParagraph(
      `Growth Engine setup assignments also earn <strong>${amount}</strong> per completed task (separate from subscription commission).`
    );
  }

  return `${emailSectionHeading("Assigned Responsibilities")}
    ${emailParagraph("Based on your profile, you may be assigned:")}
    ${listHtml}
    ${payoutNote}`;
}
