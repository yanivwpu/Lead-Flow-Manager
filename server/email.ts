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
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9; }
          .wrapper { padding: 40px 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white; padding: 40px 30px; text-align: center; }
          .logo { width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: #059669; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 40px 30px; }
          .content h2 { color: #1e293b; margin-top: 0; font-size: 20px; }
          .content p { color: #475569; }
          .content ul { color: #475569; }
          .button { display: inline-block; background: #059669; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0; }
          .footer { text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 0; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">W</div>
              <h1>Welcome to WhaChatCRM!</h1>
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
              <center>
                <a href="${APP_URL}" class="button">Open WhaChatCRM</a>
              </center>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
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
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9; }
          .wrapper { padding: 40px 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 40px 30px; text-align: center; }
          .logo { width: 50px; height: 50px; background: #059669; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: white; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 40px 30px; }
          .content h2 { color: #1e293b; margin-top: 0; font-size: 20px; }
          .content p { color: #475569; }
          .button { display: inline-block; background: #059669; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0; }
          .info-box { background: #ecfdf5; border: 1px solid #a7f3d0; padding: 16px; border-radius: 8px; margin: 24px 0; }
          .info-box p { margin: 0; color: #065f46; font-size: 14px; }
          .url-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin-top: 24px; word-break: break-all; font-family: monospace; font-size: 12px; color: #64748b; }
          .footer { text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 0; color: #94a3b8; font-size: 12px; }
          .footer a { color: #059669; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">W</div>
              <h1>Reset Your Password</h1>
            </div>
            <div class="content">
              <h2>Password Reset Request</h2>
              <p>We received a request to reset the password for your WhaChatCRM account. Click the button below to create a new password:</p>
              
              <center>
                <a href="${resetUrl}" class="button">Reset My Password</a>
              </center>
              
              <div class="info-box">
                <p><strong>Security Note:</strong> This link will expire in 1 hour. If you didn't request this password reset, you can safely ignore this email - your account is secure.</p>
              </div>
              
              <p style="font-size: 14px; color: #64748b;">Having trouble with the button? Copy and paste this link into your browser:</p>
              <div class="url-box">${resetUrl}</div>
            </div>
            <div class="footer">
              <p>Need help? Contact us at <a href="mailto:support@whachatcrm.com">support@whachatcrm.com</a></p>
              <p style="margin-top: 12px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
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
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f1f5f9; }
          .wrapper { padding: 40px 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center; }
          .logo { width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 40px 30px; }
          .content p { color: #475569; }
          .info-box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .info-box p { margin: 8px 0; color: #475569; }
          .button { display: inline-block; background: #059669; color: white !important; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0; }
          .footer { text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0; }
          .footer p { margin: 0; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="wrapper">
          <div class="container">
            <div class="header">
              <div class="logo">🔔</div>
              <h1>Follow-up Reminder</h1>
            </div>
            <div class="content">
              <p>You have a follow-up scheduled:</p>
              <div class="info-box">
                <p><strong>Contact:</strong> ${chatName}</p>
                <p><strong>Follow-up:</strong> ${followUp}</p>
                ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
              </div>
              <center>
                <a href="${APP_URL}/chats/${chatId}" class="button">View Chat</a>
              </center>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  });
}
