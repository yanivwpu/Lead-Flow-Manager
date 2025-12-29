const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'https://whatchatcrm.com';
const FROM_EMAIL = 'WhaChatCRM <noreply@crm.whachatcrm.com>';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.log(`[Email] No RESEND_API_KEY configured, skipping email to ${to}`);
    console.log(`[Email] Subject: ${subject}`);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[Email] Failed to send to ${to}: ${error}`);
      return false;
    }

    console.log(`[Email] Sent successfully to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('[Email] Error sending email:', error);
    return false;
  }
}

export async function sendWelcomeEmail(name: string, email: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: 'Welcome to WhaChatCRM!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Welcome to WhaChatCRM!</h1>
          </div>
          <div class="content">
            <h2>Hi ${name}!</h2>
            <p>Thank you for signing up for WhaChatCRM. We're excited to have you on board!</p>
            <p>With WhaChatCRM, you can:</p>
            <ul>
              <li>Manage all your WhatsApp conversations in one place</li>
              <li>Never miss a follow-up with smart reminders</li>
              <li>Organize leads with tags and pipeline stages</li>
              <li>Track your sales progress effortlessly</li>
            </ul>
            <p>Ready to get started?</p>
            <a href="${APP_URL}" class="button">Open WhaChatCRM</a>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
  
  return sendEmail({
    to: email,
    subject: 'Reset Your Password - WhaChatCRM',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .warning { background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Password Reset</h1>
          </div>
          <div class="content">
            <p>We received a request to reset your password for your WhaChatCRM account.</p>
            <p>Click the button below to reset your password:</p>
            <a href="${resetUrl}" class="button">Reset Password</a>
            <div class="warning">
              <strong>Note:</strong> This link will expire in 1 hour. If you didn't request this reset, you can safely ignore this email.
            </div>
            <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
              Or copy and paste this URL into your browser:<br>
              <code style="word-break: break-all;">${resetUrl}</code>
            </p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
}

export async function sendFollowUpReminderEmail(email: string, chatName: string, followUp: string, notes: string, chatId: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Follow-up Reminder: ${chatName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
          .info-box { background: white; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .button { display: inline-block; background: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin-top: 20px; }
          .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Follow-up Reminder</h1>
          </div>
          <div class="content">
            <p>You have a follow-up scheduled:</p>
            <div class="info-box">
              <p><strong>Contact:</strong> ${chatName}</p>
              <p><strong>Follow-up:</strong> ${followUp}</p>
              ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
            </div>
            <a href="${APP_URL}/chats/${chatId}" class="button">View Chat</a>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  });
}
