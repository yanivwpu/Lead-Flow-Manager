import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Express } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { storage } from './storage';
import type { User } from '@shared/schema';

const resetTokens = new Map<string, { email: string; expires: Date }>();

const PgStore = connectPgSimple(session);

export function setupAuth(app: Express) {
  // Trust proxy for Replit's reverse proxy
  app.set('trust proxy', 1);

  // Session configuration with PostgreSQL store for production persistence
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'whatsapp-crm-secret-key-change-in-production',
      resave: true,
      saveUninitialized: true, // Changed to true to help with session persistence
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: 'user_sessions',
        createTableIfMissing: true,
      }),
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: false, // Set to false for Replit development to ensure cookies are sent
        sameSite: 'lax',
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  // Configure passport local strategy
  passport.use(
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password',
      },
      async (email, password, done) => {
        try {
          // Special handling for demo account - auto-create/fix in any environment
          const DEMO_EMAIL = 'demo@whachat.com';
          const DEMO_PASSWORD = 'demo_password_123';
          
          if (email.toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
            let user = await storage.getUserByEmail(DEMO_EMAIL);
            let needsSampleData = false;
            
            if (!user) {
              // Create demo user if it doesn't exist
              const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
              user = await storage.createUser({
                name: 'Demo Agent',
                email: DEMO_EMAIL,
                password: hashedPassword,
              });
              needsSampleData = true;
              console.log('[AUTH] Demo user created on-demand');
            } else {
              // Verify password, if wrong fix it
              const isValid = await bcrypt.compare(DEMO_PASSWORD, user.password);
              if (!isValid) {
                const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
                user = await storage.updateUser(user.id, { password: hashedPassword }) || user;
                console.log('[AUTH] Demo user password fixed on-demand');
              }
            }
            
            // Ensure Pro subscription
            if (user.subscriptionPlan !== 'pro') {
              user = await storage.updateUser(user.id, { 
                subscriptionPlan: 'pro',
                onboardingCompleted: true,
                twilioConnected: true
              }) || user;
            }
            
            // Add sample data if needed (check if contacts exist for Unified Inbox)
            const existingContacts = await storage.getContacts(user.id);
            if (existingContacts.length === 0) {
              await setupDemoSampleData(user.id);
              console.log('[AUTH] Demo sample data created for Unified Inbox');
            }
            
            return done(null, user);
          }
          
          // Normal login flow for non-demo accounts
          const user = await storage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: 'Invalid email or password' });
          }
          
          const isValid = await bcrypt.compare(password, user.password);
          if (!isValid) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          return done(null, user);
        } catch (error) {
          console.error('[LOGIN] Error during authentication:', error);
          return done(error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  // Deserialize user from session
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        // User no longer exists in database, clear the session
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      // Don't throw errors for session issues, just clear the session
      console.error("Session deserialization error:", error);
      done(null, false);
    }
  });
}

// Auth middleware to protect routes
export function requireAuth(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

// Register auth routes
export function registerAuthRoutes(app: Express) {
  // Sign up
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { name, email, password, phoneNumber, businessName } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with that email' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user with 14-day Pro trial
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);
      
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword,
        trialEndsAt,
      });

      // Register phone number if provided
      if (phoneNumber && phoneNumber.trim()) {
        try {
          let normalizedPhone = phoneNumber.trim();
          if (!normalizedPhone.startsWith("whatsapp:")) {
            if (!normalizedPhone.startsWith("+")) {
              normalizedPhone = "+" + normalizedPhone;
            }
            normalizedPhone = "whatsapp:" + normalizedPhone;
          }

          // Check if phone not already registered
          const existingPhone = await storage.getRegisteredPhoneByNumber(normalizedPhone);
          if (!existingPhone) {
            await storage.registerPhone({
              userId: user.id,
              phoneNumber: normalizedPhone,
              businessName: businessName || null,
            });
          }
        } catch (phoneError) {
          console.error('Phone registration error during signup:', phoneError);
          // Continue with signup even if phone registration fails
        }
      }

      // Send welcome email (async, don't wait)
      import('./email').then(({ sendWelcomeEmail }) => {
        sendWelcomeEmail(name, email);
      });

      // Log the user in
      req.login(user, (err: any) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to log in after signup' });
        }
        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // Login
  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', (err: any, user: User, info: any) => {
      if (err) {
        return res.status(500).json({ error: 'Authentication failed' });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || 'Invalid email or password' });
      }
      
      // Set session duration based on rememberMe flag
      const rememberMe = req.body.rememberMe || false;
      
      req.login(user, (loginErr: any) => {
        if (loginErr) {
          return res.status(500).json({ error: 'Failed to log in' });
        }
        
        // Extend session if remember me is checked (30 days vs 7 days default)
        if (rememberMe && req.session.cookie) {
          req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
        }
        
        const { password: _, ...safeUser } = user;
        res.json(safeUser);
      });
    })(req, res, next);
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    req.logout((err: any) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to log out' });
      }
      res.json({ success: true });
    });
  });

  // Check if user is authenticated
  app.get('/api/auth/me', (req, res) => {
    if (req.isAuthenticated()) {
      const { password: _, ...safeUser } = req.user as User;
      res.set('Cache-Control', 'private, max-age=60');
      res.json(safeUser);
    } else {
      res.set('Cache-Control', 'no-store');
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Forgot password - request password reset
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const user = await storage.getUserByEmail(email);
      
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        resetTokens.set(token, {
          email: user.email,
          expires: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
        });
        
        // Send password reset email with proper error handling
        const { sendPasswordResetEmail } = await import('./email');
        const emailSent = await sendPasswordResetEmail(user.email, token);
        console.log(`[AUTH] Password reset email to ${user.email}: ${emailSent ? 'SENT' : 'FAILED'}`);
      }

      res.json({ success: true, message: 'If an account exists, a reset link will be sent.' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.json({ success: true, message: 'If an account exists, a reset link will be sent.' });
    }
  });

  // Emergency password reset page (TEMPORARY - remove after use)
  app.get('/reset-emergency', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head><title>Emergency Password Reset</title></head>
      <body style="font-family: Arial; max-width: 400px; margin: 50px auto; padding: 20px;">
        <h2>Emergency Password Reset</h2>
        <form id="resetForm">
          <div style="margin-bottom: 15px;">
            <label>Email:</label><br>
            <input type="email" id="email" style="width: 100%; padding: 8px;" required>
          </div>
          <div style="margin-bottom: 15px;">
            <label>New Password:</label><br>
            <input type="password" id="password" style="width: 100%; padding: 8px;" required>
          </div>
          <button type="submit" style="padding: 10px 20px; background: #007bff; color: white; border: none; cursor: pointer;">Reset Password</button>
        </form>
        <p id="result"></p>
        <script>
          document.getElementById('resetForm').onsubmit = async (e) => {
            e.preventDefault();
            const res = await fetch('/api/auth/emergency-reset', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                email: document.getElementById('email').value,
                newPassword: document.getElementById('password').value
              })
            });
            const data = await res.json();
            document.getElementById('result').textContent = data.message || data.error;
          };
        </script>
      </body>
      </html>
    `);
  });

  // Emergency password reset API (TEMPORARY - remove after use)
  app.post('/api/auth/emergency-reset', async (req, res) => {
    try {
      const { email, newPassword } = req.body;
      
      // Only allow specific emails for security (REMOVE THIS ENDPOINT AFTER USE)
      const allowedEmails = ['yanivharamaty@gmail.com', 'yahabegood@gmail.com'];
      if (!allowedEmails.includes(email?.toLowerCase())) {
        return res.status(403).json({ error: 'This email is not authorized for emergency reset' });
      }
      
      if (!email || !newPassword) {
        return res.status(400).json({ error: 'Email and newPassword required' });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found with that email' });
      }
      
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });
      
      res.json({ success: true, message: 'Password reset successfully! You can now login.' });
    } catch (error: any) {
      console.error('Emergency reset error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }

      const tokenData = resetTokens.get(token);
      if (!tokenData) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }

      if (new Date() > tokenData.expires) {
        resetTokens.delete(token);
        return res.status(400).json({ error: 'Reset token has expired' });
      }

      const user = await storage.getUserByEmail(tokenData.email);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const updatedUser = await storage.updateUser(user.id, { password: hashedPassword });
      
      if (!updatedUser) {
        return res.status(500).json({ error: 'Failed to update password in database' });
      }
      
      resetTokens.delete(token);

      // Automatically log the user in after password reset
      req.login(user, (loginErr: any) => {
        if (loginErr) {
          // Password was reset but login failed - still return success
          console.error('Auto-login after reset failed:', loginErr);
          return res.json({ success: true, message: 'Password has been reset successfully. Please log in.' });
        }
        
        const { password: _, ...safeUser } = user;
        res.json({ success: true, message: 'Password has been reset successfully', user: safeUser });
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });
}

// Setup demo sample data for Unified Inbox showcase
async function setupDemoSampleData(userId: string) {
  // Sample contacts with conversations across different channels
  const sampleData = [
    {
      contact: {
        userId,
        name: 'Sarah Johnson',
        phone: '+14155551234',
        email: 'sarah.johnson@email.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
        whatsappId: '+14155551234',
        primaryChannel: 'whatsapp',
        tag: 'Hot Lead',
        pipelineStage: 'Qualified',
        notes: 'Interested in 3BR property in downtown area. Budget $500-600k.',
        source: 'whatsapp',
      },
      conversations: [
        {
          channel: 'whatsapp',
          status: 'open',
          unreadCount: 2,
          messages: [
            { direction: 'inbound', content: 'Hi! I saw your listing for the downtown condo. Is it still available?', minutesAgo: 15 },
            { direction: 'outbound', content: 'Yes, it\'s still available! Would you like to schedule a viewing?', minutesAgo: 13 },
            { direction: 'inbound', content: 'That would be great! What times work this week?', minutesAgo: 10 },
            { direction: 'outbound', content: 'I have openings Thursday at 2pm or Saturday at 11am. Which works better?', minutesAgo: 7 },
            { direction: 'inbound', content: 'Saturday at 11am would be perfect!', minutesAgo: 5 },
            { direction: 'outbound', content: 'Great! I\'ll send you the property details and confirmation.', minutesAgo: 3 },
            { direction: 'inbound', content: 'Thanks! I\'ll check it out.', minutesAgo: 0 },
          ],
        },
      ],
    },
    {
      contact: {
        userId,
        name: 'Michael Chen',
        phone: '+14155552345',
        email: 'michael.chen@email.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
        primaryChannel: 'sms',
        tag: 'Customer',
        pipelineStage: 'Closed Won',
        notes: 'Just closed on beach house property. Very happy client!',
        source: 'manual',
      },
      conversations: [
        {
          channel: 'sms',
          status: 'resolved',
          unreadCount: 0,
          messages: [
            { direction: 'outbound', content: 'Hi! Just wanted to confirm our closing meeting tomorrow at 3pm?', minutesAgo: 120 },
            { direction: 'inbound', content: 'Yes! We\'re so excited! Do we need to bring anything else?', minutesAgo: 115 },
            { direction: 'outbound', content: 'Just photo IDs and your checkbook for any remaining fees. Everything else is ready!', minutesAgo: 112 },
            { direction: 'inbound', content: 'Perfect, see you tomorrow!', minutesAgo: 110 },
          ],
        },
      ],
    },
    {
      contact: {
        userId,
        name: 'Emma Williams',
        phone: '+14155553456',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
        primaryChannel: 'webchat',
        tag: 'New',
        pipelineStage: 'Lead',
        notes: '',
        source: 'webchat',
      },
      conversations: [
        {
          channel: 'webchat',
          status: 'open',
          unreadCount: 1,
          messages: [
            { direction: 'inbound', content: 'Hello! I\'m looking for a pet-friendly rental apartment in the city.', minutesAgo: 180 },
            { direction: 'outbound', content: 'Welcome! We have several pet-friendly options. What\'s your budget range?', minutesAgo: 178 },
            { direction: 'inbound', content: 'Around $2000-2500/month. I have a medium-sized dog.', minutesAgo: 175 },
            { direction: 'inbound', content: 'What\'s the pet policy for rentals?', minutesAgo: 174 },
          ],
        },
      ],
    },
    {
      contact: {
        userId,
        name: 'David Martinez',
        phone: '+14155554567',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
        telegramId: '@david_m',
        primaryChannel: 'telegram',
        tag: 'Warm Lead',
        pipelineStage: 'Proposal',
        notes: 'Relocating from NYC. Looking for family home with good schools nearby.',
        source: 'telegram',
      },
      conversations: [
        {
          channel: 'telegram',
          status: 'pending',
          unreadCount: 1,
          messages: [
            { direction: 'inbound', content: 'I\'m interested in the 4BR home on Oak Street you posted.', minutesAgo: 300 },
            { direction: 'outbound', content: 'Great choice! It\'s a beautiful property. The asking price is $750,000.', minutesAgo: 285 },
            { direction: 'inbound', content: 'Can I get more photos of the kitchen?', minutesAgo: 280 },
          ],
        },
      ],
    },
    {
      contact: {
        userId,
        name: 'Lisa Thompson',
        phone: '+14155555678',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa',
        instagramId: 'lisathompson_realestate',
        primaryChannel: 'instagram',
        tag: 'Hot Lead',
        pipelineStage: 'Qualified',
        notes: 'Instagram lead from property showcase reel',
        source: 'instagram',
      },
      conversations: [
        {
          channel: 'instagram',
          status: 'open',
          unreadCount: 1,
          messages: [
            { direction: 'inbound', content: 'Hi! Saw your reel about the luxury penthouse. Is it available?', minutesAgo: 480 },
            { direction: 'outbound', content: 'Yes it is! Would you like to schedule a private viewing?', minutesAgo: 450 },
            { direction: 'inbound', content: 'Love this property! DM sent.', minutesAgo: 420 },
          ],
        },
      ],
    },
    {
      contact: {
        userId,
        name: 'James Wilson',
        phone: '+14155556789',
        email: 'james.wilson@investments.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James',
        facebookId: 'james.wilson.investor',
        primaryChannel: 'facebook',
        tag: 'Investor',
        pipelineStage: 'Negotiation',
        notes: 'Commercial investor. Looking for multi-family units.',
        source: 'facebook',
      },
      conversations: [
        {
          channel: 'facebook',
          status: 'open',
          unreadCount: 0,
          messages: [
            { direction: 'inbound', content: 'Hello! I\'m an investor looking for multi-family properties.', minutesAgo: 720 },
            { direction: 'outbound', content: 'Welcome James! We have several excellent multi-family options with strong rental income potential.', minutesAgo: 690 },
            { direction: 'inbound', content: 'Great! What kind of cap rates are you seeing?', minutesAgo: 660 },
            { direction: 'outbound', content: 'Currently seeing 5-7% cap rates in our market. I can send you a curated list.', minutesAgo: 645 },
            { direction: 'inbound', content: 'Looking for investment properties with good ROI.', minutesAgo: 630 },
          ],
        },
      ],
    },
    // Multi-channel contact example: Rachel with both WhatsApp and Instagram threads
    {
      contact: {
        userId,
        name: 'Rachel Green',
        phone: '+14155557890',
        email: 'rachel.green@design.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Rachel',
        whatsappId: '+14155557890',
        instagramId: 'rachelgreen_homes',
        primaryChannel: 'whatsapp',
        tag: 'VIP',
        pipelineStage: 'Proposal',
        notes: 'Interior designer - Referred by James Wilson. Looking for investment property to flip.',
        source: 'whatsapp',
      },
      conversations: [
        {
          channel: 'whatsapp',
          status: 'open',
          unreadCount: 1,
          messages: [
            { direction: 'inbound', content: 'James recommended you! I\'m looking for a fixer-upper to flip.', minutesAgo: 1440 },
            { direction: 'outbound', content: 'Great to hear from you Rachel! James has great taste. What\'s your budget?', minutesAgo: 1420 },
            { direction: 'inbound', content: 'Around $400-500k including renovation budget.', minutesAgo: 1400 },
            { direction: 'outbound', content: 'Perfect. I have 3 properties that fit that profile. Can I send details?', minutesAgo: 60 },
            { direction: 'inbound', content: 'Yes please!', minutesAgo: 45 },
          ],
        },
        {
          channel: 'instagram',
          status: 'open',
          unreadCount: 0,
          messages: [
            { direction: 'inbound', content: 'Just saw your post about the Victorian! Is that one of the fixer-uppers?', minutesAgo: 30 },
            { direction: 'outbound', content: 'Yes! That\'s actually my top pick for you. Great bones, needs cosmetic work.', minutesAgo: 25 },
          ],
        },
      ],
    },
  ];

  // Create contacts, conversations, and messages
  for (const data of sampleData) {
    const contact = await storage.createContact(data.contact as any);
    
    for (const convData of data.conversations) {
      const lastMsg = convData.messages[convData.messages.length - 1];
      const conversation = await storage.createConversation({
        userId,
        contactId: contact.id,
        channel: convData.channel,
        status: convData.status,
        unreadCount: convData.unreadCount,
        lastMessageAt: new Date(Date.now() - lastMsg.minutesAgo * 60000),
        lastMessagePreview: lastMsg.content,
        lastMessageDirection: lastMsg.direction,
      } as any);
      
      for (const msg of convData.messages) {
        await storage.createMessage({
          conversationId: conversation.id,
          contactId: contact.id,
          userId,
          direction: msg.direction,
          content: msg.content,
          contentType: 'text',
          status: msg.direction === 'outbound' ? 'delivered' : 'received',
          createdAt: new Date(Date.now() - msg.minutesAgo * 60000),
        } as any);
      }
    }
  }
}

// Extend Express Request type to include user
import type { User as SchemaUser } from '@shared/schema';

declare global {
  namespace Express {
    interface User extends SchemaUser {}
  }
}
