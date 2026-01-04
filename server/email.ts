const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.APP_URL || 'https://whachatcrm.com';
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
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9;">
        <div style="padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 40px 30px; text-align: center;">
              <div style="width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: #059669; line-height: 50px;">W</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome to WhaChatCRM!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${name}!</h2>
              <p style="color: #475569; font-size: 15px;">Thank you for signing up for WhaChatCRM. We're excited to have you on board!</p>
              <p style="color: #475569; font-size: 15px;">With WhaChatCRM, you can:</p>
              <ul style="color: #475569; font-size: 15px; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Manage all your WhatsApp conversations in one place</li>
                <li style="margin-bottom: 8px;">Never miss a follow-up with smart reminders</li>
                <li style="margin-bottom: 8px;">Organize leads with tags and pipeline stages</li>
                <li style="margin-bottom: 8px;">Track your sales progress effortlessly</li>
              </ul>
              <p style="color: #475569; font-size: 15px;">Ready to get started?</p>
              <div style="text-align: center;">
                <a href="${APP_URL}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Open WhaChatCRM</a>
              </div>
            </div>
            <div style="text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
            </div>
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
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9;">
        <div style="padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 40px 30px; text-align: center;">
              <div style="width: 50px; height: 50px; background: #059669; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: white; line-height: 50px;">W</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Reset Your Password</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Password Reset Request</h2>
              <p style="color: #475569; font-size: 15px;">We received a request to reset the password for your WhaChatCRM account. Click the button below to create a new password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Reset My Password</a>
              </div>
              
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; color: #065f46; font-size: 14px;"><strong>Security Note:</strong> This link will expire in 1 hour. If you didn't request this password reset, you can safely ignore this email - your account is secure.</p>
              </div>
              
              <p style="font-size: 14px; color: #64748b;">Having trouble with the button? Copy and paste this link into your browser:</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin-top: 16px; word-break: break-all; font-family: monospace; font-size: 12px; color: #64748b;">${resetUrl}</div>
            </div>
            <div style="text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">Need help? Contact us at <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
              <p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
            </div>
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
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9;">
        <div style="padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center;">
              <div style="width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; line-height: 50px;">🔔</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Follow-up Reminder</h1>
            </div>
            <div style="padding: 40px 30px;">
              <p style="color: #475569; font-size: 15px;">You have a follow-up scheduled:</p>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 8px 0; color: #475569; font-size: 15px;"><strong>Contact:</strong> ${chatName}</p>
                <p style="margin: 8px 0; color: #475569; font-size: 15px;"><strong>Follow-up:</strong> ${followUp}</p>
                ${notes ? `<p style="margin: 8px 0; color: #475569; font-size: 15px;"><strong>Notes:</strong> ${notes}</p>` : ''}
              </div>
              <div style="text-align: center;">
                <a href="${APP_URL}/chats/${chatId}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">View Chat</a>
              </div>
            </div>
            <div style="text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  });
}
