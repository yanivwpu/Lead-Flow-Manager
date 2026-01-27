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

export async function sendContactFormEmail(name: string, email: string, message: string): Promise<boolean> {
  const SUPPORT_EMAIL = 'support@whachatcrm.com';
  
  return sendEmail({
    to: SUPPORT_EMAIL,
    subject: `Contact Form: ${name}`,
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
              <div style="width: 50px; height: 50px; background: #059669; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; line-height: 50px;">✉️</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">New Contact Form Submission</h1>
            </div>
            <div style="padding: 40px 30px;">
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 8px 0; color: #475569; font-size: 15px;"><strong>From:</strong> ${name}</p>
                <p style="margin: 8px 0; color: #475569; font-size: 15px;"><strong>Email:</strong> <a href="mailto:${email}" style="color: #059669;">${email}</a></p>
              </div>
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">Message:</h3>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
                <p style="margin: 0; color: #475569; font-size: 15px; white-space: pre-wrap;">${message}</p>
              </div>
              <div style="text-align: center; margin-top: 24px;">
                <a href="mailto:${email}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reply to ${name}</a>
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

export async function sendSubscriptionConfirmationEmail(name: string, email: string, planName: string, amount: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `Welcome to WhaChatCRM ${planName}!`,
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
              <div style="width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; line-height: 50px;">🎉</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">You're on ${planName}!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${name}!</h2>
              <p style="color: #475569; font-size: 15px;">Thank you for upgrading to WhaChatCRM <strong>${planName}</strong>. Your subscription is now active!</p>
              
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; color: #065f46; font-size: 15px;"><strong>Subscription Details:</strong></p>
                <p style="margin: 4px 0; color: #065f46; font-size: 15px;">Plan: ${planName}</p>
                <p style="margin: 4px 0; color: #065f46; font-size: 15px;">Amount: ${amount}/month</p>
              </div>
              
              <p style="color: #475569; font-size: 15px;">You now have access to all ${planName} features. Start making the most of your upgraded plan!</p>
              
              <div style="text-align: center;">
                <a href="${APP_URL}/chats" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Go to Dashboard</a>
              </div>
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

export async function sendHelpCenterFeedback(articleId: string, articleTitle: string, feedback: string): Promise<boolean> {
  const SUPPORT_EMAIL = 'support@whachatcrm.com';
  
  return sendEmail({
    to: SUPPORT_EMAIL,
    subject: `Help Center Feedback: ${articleTitle}`,
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
              <div style="width: 50px; height: 50px; background: #059669; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; line-height: 50px;">📝</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Help Center Feedback</h1>
            </div>
            <div style="padding: 40px 30px;">
              <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>Article:</strong> ${articleTitle}</p>
                <p style="margin: 4px 0 0 0; color: #92400e; font-size: 12px;">ID: ${articleId}</p>
              </div>
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">User Feedback:</h3>
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px;">
                <p style="margin: 0; color: #475569; font-size: 15px; white-space: pre-wrap;">${feedback}</p>
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

export async function sendDemoBookingNotification(
  salespersonEmail: string, 
  salespersonName: string, 
  visitor: { name: string; email: string; phone: string; scheduledDate: Date }
): Promise<boolean> {
  const formattedDate = visitor.scheduledDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });

  return sendEmail({
    to: salespersonEmail,
    subject: `New Demo Booking: ${visitor.name}`,
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
              <div style="width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; line-height: 50px;">📅</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">New Demo Booking!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${salespersonName}!</h2>
              <p style="color: #475569; font-size: 15px;">You have a new demo scheduled. Here are the details:</p>
              
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 8px 0; color: #065f46; font-size: 15px;"><strong>Visitor Name:</strong> ${visitor.name}</p>
                <p style="margin: 8px 0; color: #065f46; font-size: 15px;"><strong>Email:</strong> ${visitor.email}</p>
                <p style="margin: 8px 0; color: #065f46; font-size: 15px;"><strong>Phone:</strong> ${visitor.phone}</p>
                <p style="margin: 8px 0; color: #065f46; font-size: 15px;"><strong>Scheduled:</strong> ${formattedDate} EST</p>
              </div>
              
              <p style="color: #475569; font-size: 15px;">Please reach out to the visitor to confirm the demo. Remember, you earn 30% commission for every successful conversion!</p>
              
              <div style="text-align: center;">
                <a href="mailto:${visitor.email}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Contact Visitor</a>
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

export async function sendDemoConfirmationEmail(
  visitorEmail: string,
  visitorName: string,
  scheduledDate: Date,
  salespersonName: string
): Promise<boolean> {
  const formattedDate = scheduledDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York'
  });

  return sendEmail({
    to: visitorEmail,
    subject: 'Your Demo is Confirmed! - WhaChatCRM',
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
              <div style="width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; line-height: 50px;">✅</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Demo Confirmed!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${visitorName}!</h2>
              <p style="color: #475569; font-size: 15px;">Thank you for booking a demo with WhaChatCRM. We're excited to show you how our platform can help transform your business communication.</p>
              
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 8px 0; color: #065f46; font-size: 15px;"><strong>Scheduled Date:</strong> ${formattedDate} EST</p>
                <p style="margin: 8px 0; color: #065f46; font-size: 15px;"><strong>Your Demo Specialist:</strong> ${salespersonName}</p>
              </div>
              
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">What to Expect</h3>
              <ul style="color: #475569; font-size: 15px; padding-left: 20px;">
                <li style="margin-bottom: 8px;">A personalized walkthrough of WhaChatCRM features</li>
                <li style="margin-bottom: 8px;">How to integrate WhatsApp with your existing workflow</li>
                <li style="margin-bottom: 8px;">Q&A session to address your specific needs</li>
              </ul>
              
              <p style="color: #475569; font-size: 15px;">If you have any questions before the demo, feel free to reply to this email.</p>
              
              <div style="text-align: center;">
                <a href="${APP_URL}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Visit WhaChatCRM</a>
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

export async function sendSalespersonWelcomeEmail(
  name: string, 
  email: string, 
  loginCode: string
): Promise<boolean> {
  const portalUrl = `${APP_URL}/sales-portal`;
  
  return sendEmail({
    to: email,
    subject: 'Welcome to the WhaChatCRM Sales Team!',
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
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome to the Team!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${name}!</h2>
              <p style="color: #475569; font-size: 15px;">Welcome aboard! We're excited to have you join the WhaChatCRM sales team. Below you'll find everything you need to get started.</p>
              
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">How to Access the Sales Portal</h3>
              <ol style="color: #475569; font-size: 15px; padding-left: 20px;">
                <li style="margin-bottom: 8px;">Go to <a href="${portalUrl}" style="color: #059669; text-decoration: none; font-weight: 500;">${portalUrl}</a></li>
                <li style="margin-bottom: 8px;">Enter your email address</li>
                <li style="margin-bottom: 8px;">Enter your 6-digit ID code: <strong>${loginCode}</strong></li>
              </ol>
              
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">Using the Sales Portal</h3>
              <p style="color: #475569; font-size: 15px;">Once logged in, you'll have access to:</p>
              <ul style="color: #475569; font-size: 15px; padding-left: 20px;">
                <li style="margin-bottom: 8px;"><strong>Dashboard:</strong> View your total demos, conversions, and earnings at a glance</li>
                <li style="margin-bottom: 8px;"><strong>Pending Demos:</strong> See all scheduled demos assigned to you and mark them as completed after the call</li>
                <li style="margin-bottom: 8px;"><strong>Earnings:</strong> Track your commission payments (30% of subscription revenue for 12 months)</li>
              </ul>
              
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">How Conversions Are Tracked</h3>
              <p style="color: #475569; font-size: 15px;">When a prospect you've demoed signs up and becomes a paying customer, our system automatically matches their information to your demo booking. We have a <strong>365-day tracking window</strong>, so you'll get credit for conversions that happen within 12 months of your demo. You'll earn <strong>30% commission</strong> - it's that simple!</p>
              
              <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 16px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; color: #0369a1; font-size: 14px;"><strong>Pro Tip:</strong> Take some time to explore WhaChatCRM and its features. The more familiar you are with the product, the better you can showcase its value to prospects. Visit our <a href="${APP_URL}/help" style="color: #059669; text-decoration: none; font-weight: 500;">Help Center</a> for detailed guides on all features.</p>
              </div>
              
              <div style="text-align: center;">
                <a href="${portalUrl}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Go to Sales Portal</a>
              </div>
              
              <div style="border-top: 1px solid #e2e8f0; padding-top: 24px; margin-top: 24px;">
                <p style="color: #475569; font-size: 15px; margin-bottom: 8px;">Should you have any questions or need assistance, don't hesitate to reach out:</p>
                <p style="color: #475569; font-size: 15px; margin: 4px 0;"><strong>Email:</strong> <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
                <p style="color: #475569; font-size: 15px; margin: 4px 0;"><strong>Phone:</strong> <a href="tel:+19545138408" style="color: #059669; text-decoration: none;">954.513.8408</a></p>
              </div>
              
              <div style="margin-top: 32px;">
                <p style="color: #475569; font-size: 15px; margin-bottom: 4px;">Good luck and welcome to the team!</p>
                <p style="color: #1e293b; font-size: 15px; font-weight: 600; margin: 0;">Yaniv Haramaty</p>
                <p style="color: #64748b; font-size: 14px; margin: 0;">Founder, WhaChatCRM</p>
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

export async function sendPartnerWelcomeEmail(
  name: string, 
  email: string, 
  refCode: string
): Promise<boolean> {
  const partnerPortalUrl = `${APP_URL}/partner-portal`;
  
  return sendEmail({
    to: email,
    subject: 'Welcome to the WhaChatCRM Partner Program!',
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
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); color: white; padding: 40px 30px; text-align: center;">
              <div style="width: 50px; height: 50px; background: white; border-radius: 12px; display: inline-block; margin-bottom: 16px; font-size: 24px; font-weight: bold; color: #7c3aed; line-height: 50px;">W</div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Welcome, Partner!</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${name}!</h2>
              <p style="color: #475569; font-size: 15px;">Welcome to the WhaChatCRM Partner Program! We're excited to have you on board.</p>
              
              <div style="background: #f5f3ff; border: 1px solid #c4b5fd; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0 0 8px 0; color: #5b21b6; font-size: 15px;"><strong>Your Referral Code:</strong></p>
                <div style="background: white; border: 2px dashed #7c3aed; padding: 16px; border-radius: 8px; text-align: center;">
                  <code style="font-size: 24px; color: #7c3aed; font-weight: bold; letter-spacing: 2px;">${refCode}</code>
                </div>
              </div>
              
              <p style="color: #475569; font-size: 15px;">Share your referral code with potential customers. When they sign up and upgrade, you'll earn commission on their subscription!</p>
              
              <div style="text-align: center;">
                <a href="${partnerPortalUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">Access Partner Portal</a>
              </div>
            </div>
            <div style="text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">Need help? Contact us at <a href="mailto:partners@whachatcrm.com" style="color: #7c3aed; text-decoration: none;">partners@whachatcrm.com</a></p>
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
