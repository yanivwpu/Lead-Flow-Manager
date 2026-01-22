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
            
            // Add sample data if needed (check if chats exist)
            const existingChats = await storage.getChats(user.id);
            if (existingChats.length === 0) {
              await setupDemoSampleData(user.id);
              console.log('[AUTH] Demo sample data created');
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

// Setup demo sample data for showcase
async function setupDemoSampleData(userId: string) {
  const sampleChats = [
    {
      userId,
      name: 'Sarah Johnson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah',
      whatsappPhone: 'whatsapp:+14155551234',
      lastMessage: 'Thanks! I\'ll check it out.',
      time: new Date().toISOString(),
      unread: 2,
      tag: 'Hot Lead',
      pipelineStage: 'Qualified',
      status: 'open',
      notes: 'Interested in 3BR property in downtown area. Budget $500-600k.',
      messages: JSON.stringify([
        { id: '1', text: 'Hi! I saw your listing for the downtown condo. Is it still available?', sender: 'customer', time: '10:30 AM', channel: 'whatsapp' },
        { id: '2', text: 'Yes, it\'s still available! Would you like to schedule a viewing?', sender: 'agent', time: '10:32 AM', channel: 'whatsapp' },
        { id: '3', text: 'That would be great! What times work this week?', sender: 'customer', time: '10:35 AM', channel: 'whatsapp' },
        { id: '4', text: 'I have openings Thursday at 2pm or Saturday at 11am. Which works better for you?', sender: 'agent', time: '10:38 AM', channel: 'whatsapp' },
        { id: '5', text: 'Saturday at 11am would be perfect!', sender: 'customer', time: '10:40 AM', channel: 'whatsapp' },
        { id: '6', text: 'Great! I\'ll send you the property details and confirmation.', sender: 'agent', time: '10:42 AM', channel: 'whatsapp' },
        { id: '7', text: 'Thanks! I\'ll check it out.', sender: 'customer', time: '10:45 AM', channel: 'whatsapp' },
      ]),
    },
    {
      userId,
      name: 'Michael Chen',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Michael',
      whatsappPhone: 'sms:+14155552345',
      lastMessage: 'Perfect, see you tomorrow!',
      time: new Date(Date.now() - 3600000).toISOString(),
      unread: 0,
      tag: 'Customer',
      pipelineStage: 'Closed Won',
      status: 'resolved',
      notes: 'Just closed on beach house property. Very happy client!',
      messages: JSON.stringify([
        { id: '1', text: 'Hi! Just wanted to confirm our closing meeting tomorrow at 3pm?', sender: 'agent', time: '2:00 PM', channel: 'sms' },
        { id: '2', text: 'Yes! We\'re so excited! Do we need to bring anything else?', sender: 'customer', time: '2:05 PM', channel: 'sms' },
        { id: '3', text: 'Just photo IDs and your checkbook for any remaining fees. Everything else is ready!', sender: 'agent', time: '2:08 PM', channel: 'sms' },
        { id: '4', text: 'Perfect, see you tomorrow!', sender: 'customer', time: '2:10 PM', channel: 'sms' },
      ]),
    },
    {
      userId,
      name: 'Emma Williams',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Emma',
      whatsappPhone: 'webchat:visitor_emma_123',
      lastMessage: 'What\'s the pet policy for rentals?',
      time: new Date(Date.now() - 7200000).toISOString(),
      unread: 1,
      tag: 'New',
      pipelineStage: 'Lead',
      status: 'open',
      notes: '',
      messages: JSON.stringify([
        { id: '1', text: 'Hello! I\'m looking for a pet-friendly rental apartment in the city.', sender: 'customer', time: '11:00 AM', channel: 'webchat' },
        { id: '2', text: 'Welcome! We have several pet-friendly options. What\'s your budget range?', sender: 'agent', time: '11:02 AM', channel: 'webchat' },
        { id: '3', text: 'Around $2000-2500/month. I have a medium-sized dog.', sender: 'customer', time: '11:05 AM', channel: 'webchat' },
        { id: '4', text: 'What\'s the pet policy for rentals?', sender: 'customer', time: '11:06 AM', channel: 'webchat' },
      ]),
    },
    {
      userId,
      name: 'David Martinez',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David',
      whatsappPhone: 'telegram:@david_m',
      lastMessage: 'Can I get more photos of the kitchen?',
      time: new Date(Date.now() - 14400000).toISOString(),
      unread: 1,
      tag: 'Warm Lead',
      pipelineStage: 'Proposal',
      status: 'pending',
      notes: 'Relocating from NYC. Looking for family home with good schools nearby.',
      messages: JSON.stringify([
        { id: '1', text: 'I\'m interested in the 4BR home on Oak Street you posted.', sender: 'customer', time: '9:00 AM', channel: 'telegram' },
        { id: '2', text: 'Great choice! It\'s a beautiful property. The asking price is $750,000.', sender: 'agent', time: '9:15 AM', channel: 'telegram' },
        { id: '3', text: 'Can I get more photos of the kitchen?', sender: 'customer', time: '9:20 AM', channel: 'telegram' },
      ]),
    },
    {
      userId,
      name: 'Lisa Thompson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Lisa',
      whatsappPhone: 'instagram:lisathompson_realestate',
      lastMessage: 'Love this property! DM sent.',
      time: new Date(Date.now() - 28800000).toISOString(),
      unread: 1,
      tag: 'Hot Lead',
      pipelineStage: 'Qualified',
      status: 'open',
      notes: 'Instagram lead from property showcase reel',
      messages: JSON.stringify([
        { id: '1', text: 'Hi! Saw your reel about the luxury penthouse. Is it available?', sender: 'customer', time: '4:00 PM', channel: 'instagram' },
        { id: '2', text: 'Yes it is! Would you like to schedule a private viewing?', sender: 'agent', time: '4:30 PM', channel: 'instagram' },
        { id: '3', text: 'Love this property! DM sent.', sender: 'customer', time: '5:00 PM', channel: 'instagram' },
      ]),
    },
    {
      userId,
      name: 'James Wilson',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=James',
      whatsappPhone: 'facebook:james.wilson.investor',
      lastMessage: 'Looking for investment properties with good ROI.',
      time: new Date(Date.now() - 43200000).toISOString(),
      unread: 0,
      tag: 'Investor',
      pipelineStage: 'Negotiation',
      status: 'open',
      notes: 'Commercial investor. Looking for multi-family units.',
      messages: JSON.stringify([
        { id: '1', text: 'Hello! I\'m an investor looking for multi-family properties.', sender: 'customer', time: '10:00 AM', channel: 'facebook' },
        { id: '2', text: 'Welcome James! We have several excellent multi-family options with strong rental income potential.', sender: 'agent', time: '10:30 AM', channel: 'facebook' },
        { id: '3', text: 'Great! What kind of cap rates are you seeing?', sender: 'customer', time: '11:00 AM', channel: 'facebook' },
        { id: '4', text: 'Currently seeing 5-7% cap rates in our market. I can send you a curated list.', sender: 'agent', time: '11:15 AM', channel: 'facebook' },
        { id: '5', text: 'Looking for investment properties with good ROI.', sender: 'customer', time: '11:30 AM', channel: 'facebook' },
      ]),
    },
  ];

  // Create all sample chats
  for (const chatData of sampleChats) {
    await storage.createChat(chatData as any);
  }
}

// Extend Express Request type to include user
import type { User as SchemaUser } from '@shared/schema';

declare global {
  namespace Express {
    interface User extends SchemaUser {}
  }
}
