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
              
              <p style="color: #475569; font-size: 15px;">Please reach out to the visitor to confirm the demo. Remember, you earn 30% commission on the subscription plan for every successful conversion (excludes AI Brain add-on)!</p>
              
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
                <li style="margin-bottom: 8px;"><strong>Earnings:</strong> Track your commission payments (30% of subscription revenue for 12 months, excluding AI Brain package)</li>
              </ul>
              
              <h3 style="color: #1e293b; font-size: 16px; margin-bottom: 8px;">How Conversions Are Tracked</h3>
              <p style="color: #475569; font-size: 15px;">When a prospect you've demoed signs up and becomes a paying customer, our system automatically matches their information to your demo booking. We have a <strong>180-day tracking window</strong>, so you'll get credit for conversions that happen within 6 months of your demo. You'll earn <strong>30% commission</strong> on their subscription plan for 12 months - it's that simple!</p>
              
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
  refCode: string,
  password?: string
): Promise<boolean> {
  const portalUrl = `${APP_URL}/partner-portal`;
  
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
      <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; background-color: #f8fafc;">
        <div style="padding: 40px 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);">
            <div style="background: #059669; color: white; padding: 50px 30px; text-align: center;">
              <div style="width: 60px; height: 60px; background: rgba(255,255,255,0.2); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 20px; font-size: 28px; font-weight: bold; color: white; line-height: 60px;">W</div>
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;">Welcome to the Team!</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; color: #d1fae5; font-weight: 400;">WhachatCRM Partner Program</p>
            </div>
            <div style="padding: 40px 35px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 22px; font-weight: 700;">Hi ${name},</h2>
              <p style="color: #475569; font-size: 16px;">We're thrilled to have you as a partner! You're now equipped with everything you need to start referring clients and earning commissions.</p>
              
              <div style="background: #f1f5f9; border-radius: 12px; padding: 25px; margin: 30px 0;">
                <h3 style="color: #1e293b; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 15px 0; font-weight: 700;">Your Partner Credentials</h3>
                
                <div style="margin-bottom: 15px;">
                  <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">PORTAL URL</p>
                  <p style="margin: 2px 0 0 0; font-size: 15px; color: #1e293b;">${portalUrl}</p>
                </div>

                <div style="margin-bottom: 15px;">
                  <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">EMAIL</p>
                  <p style="margin: 2px 0 0 0; font-size: 15px; color: #1e293b;">${email}</p>
                </div>
                
                ${password ? `
                <div style="margin-bottom: 15px;">
                  <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">PASSWORD</p>
                  <p style="margin: 2px 0 0 0; font-size: 15px; color: #1e293b; font-family: monospace; font-weight: 700;">${password}</p>
                </div>
                ` : ''}

                <div>
                  <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: 600;">YOUR REF CODE</p>
                  <p style="margin: 2px 0 0 0; font-size: 18px; color: #059669; font-weight: 700; font-family: monospace;">${refCode}</p>
                </div>
              </div>

              <div style="text-align: center;">
                <a href="${portalUrl}" style="display: inline-block; background: #059669; color: white; padding: 16px 40px; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 16px; transition: background 0.2s;">Access Partner Dashboard</a>
              </div>

              <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #f1f5f9;">
                <h3 style="color: #1e293b; font-size: 16px; font-weight: 700; margin-bottom: 12px;">Quick Start Guide:</h3>
                <ul style="color: #475569; font-size: 15px; padding-left: 20px; margin: 0;">
                  <li style="margin-bottom: 10px;">Login to your dashboard using the credentials above.</li>
                  <li style="margin-bottom: 10px;">Review and accept the new Partner Agreement.</li>
                  <li style="margin-bottom: 10px;">Copy your unique referral link to start sharing.</li>
                </ul>
              </div>
            </div>
            <div style="text-align: center; padding: 30px; background: #f8fafc; border-top: 1px solid #f1f5f9;">
              <p style="margin: 0; color: #64748b; font-size: 13px;">Need assistance? We're here to help.</p>
              <p style="margin: 5px 0 0 0; color: #64748b; font-size: 13px;">Contact us at <a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none; font-weight: 600;">support@whachatcrm.com</a></p>
              <p style="margin: 20px 0 0 0; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  });
}

export async function sendTrialCheckinEmail(firstName: string, email: string): Promise<boolean> {
  const CALENDLY_LINK = 'https://calendly.com/whachatcrm/15min';
  const WHATSAPP_SUPPORT = 'https://wa.me/19545138408?text=Hi!%20I%20need%20help%20connecting%20my%20WhatsApp%20number.';
  
  return sendEmail({
    to: email,
    subject: 'Quick check-in: How\'s your WhaChatCRM trial going?',
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
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Quick Check-In</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1e293b; margin-top: 0; font-size: 20px;">Hi ${firstName || 'there'}!</h2>
              <p style="color: #475569; font-size: 15px;">Hope you're enjoying your Pro trial of WhaChatCRM! 🚀</p>
              
              <p style="color: #475569; font-size: 15px;">We noticed you haven't connected your WhatsApp number yet — totally understandable, the Meta API setup can feel tricky the first time.</p>
              
              <p style="color: #475569; font-size: 15px;"><strong>No stress — we're here to help make it easy.</strong> Would you like:</p>
              
              <ul style="color: #475569; font-size: 15px; padding-left: 20px;">
                <li style="margin-bottom: 8px;">A <strong>free 15-minute demo</strong> where we connect it together (screen share)?</li>
                <li style="margin-bottom: 8px;">Quick help via chat or email?</li>
                <li style="margin-bottom: 8px;">Or just some troubleshooting tips?</li>
              </ul>
              
              <p style="color: #475569; font-size: 15px;">Just reply to this email or book a quick slot:</p>
              
              <div style="text-align: center; margin: 24px 0;">
                <a href="${CALENDLY_LINK}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin-right: 8px;">📅 Book Free Demo</a>
              </div>
              
              <div style="text-align: center; margin: 16px 0;">
                <a href="${WHATSAPP_SUPPORT}" style="display: inline-block; background: #25D366; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">💬 Chat with us on WhatsApp</a>
              </div>
              
              <p style="color: #475569; font-size: 15px;">Once connected, you'll see messages flowing in right away — and we can extend your trial a bit if needed. 😊</p>
              
              <p style="color: #475569; font-size: 15px;">How's everything going so far? Any questions or feedback?</p>
              
              <div style="margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 24px;">
                <p style="color: #475569; font-size: 15px; margin-bottom: 4px;">Best,</p>
                <p style="color: #1e293b; font-size: 15px; font-weight: 600; margin: 0;">Yaniv Haramaty</p>
                <p style="color: #64748b; font-size: 14px; margin: 0;">Founder / Customer Success</p>
                <p style="color: #64748b; font-size: 14px; margin: 0;">WhaChatCRM</p>
                <p style="color: #64748b; font-size: 14px; margin: 0;"><a href="mailto:support@whachatcrm.com" style="color: #059669; text-decoration: none;">support@whachatcrm.com</a></p>
              </div>
              
              <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; margin-top: 24px;">
                <p style="margin: 0; color: #92400e; font-size: 13px;"><strong>P.S.</strong> Most users get stuck on the access token or webhook — we fix those in under 5 minutes on a call!</p>
              </div>
            </div>
            <div style="text-align: center; padding: 24px 30px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">You're receiving this because you started a Pro trial on WhaChatCRM.</p>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11px;">WhaChatCRM · 1234 Main Street, Suite 100 · Miami, FL 33130</p>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 11px;">
                <a href="${APP_URL}/unsubscribe" style="color: #94a3b8; text-decoration: underline;">Unsubscribe</a> · 
                <a href="${APP_URL}/privacy" style="color: #94a3b8; text-decoration: underline;">Privacy Policy</a>
              </p>
              <p style="margin: 12px 0 0 0; color: #94a3b8; font-size: 11px;">&copy; ${new Date().getFullYear()} WhaChatCRM. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  });
}

export async function sendFollowUpReminderEmail(email: string, chatName: string, followUp: string, notes: string, linkPath: string): Promise<boolean> {
  const href = linkPath.startsWith('http') ? linkPath : `${APP_URL}${linkPath}`;
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
                <a href="${href}" style="display: inline-block; background: #059669; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 24px 0;">View Contact</a>
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

export async function sendRealtorPaymentConfirmationEmail(name: string, email: string): Promise<boolean> {
  const onboardingUrl = `${APP_URL}/app/templates/realtor-growth-engine/onboarding`;

  return sendEmail({
    to: email,
    subject: 'Your Realtor Growth Engine is ready to set up',
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;line-height:1.6;color:#334155;">
      <div style="padding:40px 20px;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
          <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:30px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:22px;">Payment Confirmed</h1>
            <p style="color:#d1fae5;margin:8px 0 0;font-size:14px;">Your Realtor Growth Engine is ready to set up</p>
          </div>
          <div style="padding:30px;">
            <p style="color:#334155;font-size:15px;margin:0 0 16px;">Hi ${name || 'there'},</p>
            <p style="color:#334155;font-size:15px;margin:0 0 16px;">Thank you for purchasing the <strong>Realtor Growth Engine</strong>. Your payment has been received and your template is ready to activate.</p>
            <p style="color:#334155;font-size:15px;margin:0 0 8px;">Your next step is to complete a short onboarding form so we can configure your system.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${onboardingUrl}" style="display:inline-block;background:#059669;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Complete Onboarding</a>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:24px 0 0;">
              <p style="color:#166534;font-weight:600;font-size:14px;margin:0 0 12px;">What to have ready:</p>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#475569;font-size:13px;vertical-align:top;">1.</td><td style="padding:6px 0 6px 8px;color:#475569;font-size:13px;"><strong>Meta Business Manager</strong> — your BM ID and admin email (create one at <a href="https://business.facebook.com" style="color:#059669;">business.facebook.com</a> if you don't have it)</td></tr>
                <tr><td style="padding:6px 0;color:#475569;font-size:13px;vertical-align:top;">2.</td><td style="padding:6px 0 6px 8px;color:#475569;font-size:13px;"><strong>WhatsApp phone number</strong> — the number you want to use for your business (can be new or existing)</td></tr>
                <tr><td style="padding:6px 0;color:#475569;font-size:13px;vertical-align:top;">3.</td><td style="padding:6px 0 6px 8px;color:#475569;font-size:13px;"><strong>SMS access</strong> — ability to receive a verification code on that number</td></tr>
                <tr><td style="padding:6px 0;color:#475569;font-size:13px;vertical-align:top;">4.</td><td style="padding:6px 0 6px 8px;color:#475569;font-size:13px;"><strong>Business details</strong> — legal name, country, and website (if available)</td></tr>
              </table>
            </div>
            <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">If you have any questions, reply to this email or contact <a href="mailto:support@whachatcrm.com" style="color:#059669;">support@whachatcrm.com</a>.</p>
          </div>
          <div style="text-align:center;padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;">WhaChatCRM ${new Date().getFullYear()}</p>
          </div>
        </div>
      </div></body></html>`
  });
}

export async function sendRealtorOnboardingEmail(payload: any, normalized: any, submissionId: string): Promise<boolean> {
  const n = normalized || {};
  const p = payload || {};
  const fullName = n.fullName || p.fullName || 'N/A';
  const email = n.email || p.email || 'N/A';
  const mobile = n.mobile || p.mobile || 'N/A';
  const legalBusinessName = n.legalBusinessName || p.legalBusinessName || 'N/A';
  const country = n.country || p.country || 'N/A';
  const hasRegisteredEntity = p.hasRegisteredEntity || 'N/A';
  const docsAvailable = p.docsAvailable || 'N/A';
  const website = n.website || p.website || 'N/A';
  const desiredWhatsappNumber = n.desiredWhatsappNumber || p.desiredWhatsappNumber || 'N/A';
  const numberActiveOnWhatsapp = p.numberActiveOnWhatsapp || 'N/A';
  const migrateOrNew = p.migrateOrNew || 'N/A';
  const smsAccess = p.smsAccess || 'N/A';
  const numberOwnership = p.numberOwnership || 'N/A';
  const hasBM = p.hasBM || 'N/A';
  const bmEmail = n.bmEmail || p.bmEmail || 'N/A';
  const bmId = p.bmId || 'N/A';
  const teamSize = p.teamSize || 'N/A';
  const seats = p.seats || 'N/A';
  const notifications = p.notifications || 'N/A';
  const leadSources = p.leadSources || 'N/A';
  const goals = p.goals || 'N/A';
  const timezone = n.timezone || p.timezone || 'N/A';
  const preferredCallWindows = n.preferredCallWindows || p.preferredCallWindows || 'N/A';
  const notes = p.notes || 'N/A';

  return sendEmail({
    to: 'support@whachatcrm.com',
    subject: `New Realtor Growth Engine Onboarding — ${legalBusinessName} — ${fullName}`,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
      <div style="max-width:640px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
        <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:30px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:22px;">Realtor Growth Engine — New Onboarding</h1>
        </div>
        <div style="padding:30px;">
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;">Contact Information</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Full Name:</strong> ${fullName}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Email:</strong> ${email}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Mobile:</strong> ${mobile}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">Business Eligibility</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Registered Entity:</strong> ${hasRegisteredEntity}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Country:</strong> ${country}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Legal Business Name:</strong> ${legalBusinessName}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Documents Available:</strong> ${docsAvailable}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Website:</strong> ${website}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">WhatsApp Setup</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Desired Number:</strong> ${desiredWhatsappNumber}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Active on WhatsApp:</strong> ${numberActiveOnWhatsapp}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Migrate / New:</strong> ${migrateOrNew}</p>
          <p style="color:#475569;margin:6px 0;"><strong>SMS Access:</strong> ${smsAccess}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Ownership:</strong> ${numberOwnership}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">Meta Business Manager</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Has BM:</strong> ${hasBM}</p>
          <p style="color:#475569;margin:6px 0;"><strong>BM Email:</strong> ${bmEmail}</p>
          <p style="color:#475569;margin:6px 0;"><strong>BM ID:</strong> ${bmId}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">CRM & Team</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Team Size:</strong> ${teamSize}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Seats:</strong> ${seats}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Notifications:</strong> ${notifications}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">Lead Sources & Goals</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Sources:</strong> ${Array.isArray(leadSources) ? leadSources.join(', ') : leadSources}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Goals:</strong> ${Array.isArray(goals) ? goals.join(', ') : goals}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">Scheduling</h2>
          <p style="color:#475569;margin:6px 0;"><strong>Timezone:</strong> ${timezone}</p>
          <p style="color:#475569;margin:6px 0;"><strong>Preferred Windows:</strong> ${Array.isArray(preferredCallWindows) ? preferredCallWindows.join(', ') : preferredCallWindows}</p>
          <h2 style="color:#1e293b;font-size:16px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-top:24px;">Notes</h2>
          <p style="color:#475569;margin:6px 0;">${notes}</p>
          <div style="margin-top:30px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;">
            <p style="color:#166534;margin:4px 0;font-size:13px;"><strong>Submission ID:</strong> ${submissionId}</p>
            <p style="color:#166534;margin:4px 0;font-size:13px;"><strong>Status:</strong> Submitted — Awaiting Review</p>
          </div>
        </div>
        <div style="text-align:center;padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">WhaChatCRM ${new Date().getFullYear()}</p>
        </div>
      </div></body></html>`
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

  const leadRows = leads.map((lead, i) => {
    const snippet = lead.lastMessage.length > 120
      ? lead.lastMessage.substring(0, 120) + "..."
      : lead.lastMessage;
    const waLink = lead.phone
      ? `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`
      : '#';
    const crmLink = `${APP_URL}/chats?id=${lead.chatId}`;

    return `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td style="padding:12px 8px;">
          <div style="font-weight:600;color:#1e293b;font-size:14px;">${i + 1}. ${lead.name}</div>
          <div style="color:#64748b;font-size:12px;margin-top:4px;">${lead.pipelineStage}</div>
        </td>
        <td style="padding:12px 8px;text-align:center;">
          <span style="background:#dc2626;color:#fff;padding:4px 10px;border-radius:12px;font-weight:700;font-size:13px;">${lead.score}</span>
        </td>
        <td style="padding:12px 8px;">
          <div style="color:#475569;font-size:12px;max-width:200px;">${snippet}</div>
        </td>
        <td style="padding:12px 8px;text-align:center;">
          <a href="${waLink}" style="display:inline-block;background:#25D366;color:#fff;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;margin-bottom:4px;">WhatsApp</a>
          <br/>
          <a href="${crmLink}" style="color:#16a34a;font-size:11px;text-decoration:underline;">Open in CRM</a>
        </td>
      </tr>`;
  }).join('');

  const noLeadsContent = `
    <div style="text-align:center;padding:40px 20px;">
      <div style="font-size:48px;margin-bottom:16px;">&#9989;</div>
      <h3 style="color:#1e293b;margin:0 0 8px;">No Hot Leads Right Now</h3>
      <p style="color:#64748b;font-size:14px;margin:0;">Your Growth Engine is running. When a lead scores 80+, they'll appear here.</p>
    </div>`;

  const leadsTable = hasLeads ? `
    <table style="width:100%;border-collapse:collapse;margin-top:16px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
          <th style="padding:10px 8px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Lead</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#64748b;font-weight:600;">Score</th>
          <th style="padding:10px 8px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Last Message</th>
          <th style="padding:10px 8px;text-align:center;font-size:12px;color:#64748b;font-weight:600;">Action</th>
        </tr>
      </thead>
      <tbody>${leadRows}</tbody>
    </table>` : noLeadsContent;

  return sendEmail({
    to: userEmail,
    subject,
    html: `<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <div style="background:linear-gradient(135deg,#16a34a 0%,#15803d 100%);padding:28px 24px;text-align:center;">
          <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your Daily Hot List</h1>
          <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style="padding:24px;">
          <p style="color:#475569;font-size:14px;margin:0 0 16px;">Good morning, ${userName.split(' ')[0]}!</p>
          ${hasLeads
            ? `<p style="color:#475569;font-size:14px;margin:0 0 8px;">Here are your <strong>Top ${leads.length} Hot Leads</strong> (scored 80+) ready for your attention today:</p>`
            : ''
          }
          ${leadsTable}
        </div>
        <div style="text-align:center;padding:20px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <a href="${APP_URL}" style="color:#16a34a;font-size:13px;text-decoration:underline;">Open WhaChatCRM Dashboard</a>
          <p style="margin:8px 0 0;color:#94a3b8;font-size:11px;">Realtor Growth Engine &bull; WhaChatCRM ${new Date().getFullYear()}</p>
        </div>
      </div></body></html>`
  });
}
