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
      resave: false,
      saveUninitialized: false,
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        tableName: 'user_sessions',
        createTableIfMissing: true,
      }),
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        httpOnly: true,
        secure: true, // Always secure since Replit serves over HTTPS
        sameSite: 'none', // Allow cross-site redirects from Stripe checkout
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
      console.log('[SIGNUP] Attempt for email:', email);

      if (!name || !email || !password) {
        console.log('[SIGNUP] Missing required fields');
        return res.status(400).json({ error: 'Missing required fields' });
      }

      // Check if user already exists
      console.log('[SIGNUP] Checking if user exists...');
      const existingUser = await storage.getUserByEmail(email);
      console.log('[SIGNUP] getUserByEmail result:', existingUser ? 'FOUND' : 'NOT FOUND');
      if (existingUser) {
        console.log('[SIGNUP] User exists with id:', existingUser.id);
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
      res.json(safeUser);
    } else {
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
        
        import('./email').then(({ sendPasswordResetEmail }) => {
          sendPasswordResetEmail(user.email, token);
        });
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

      console.log('[RESET] Found user:', user.id, user.email);
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('[RESET] New hash generated, updating user...');
      
      const updatedUser = await storage.updateUser(user.id, { password: hashedPassword });
      console.log('[RESET] Update result:', updatedUser ? 'SUCCESS' : 'FAILED');
      
      if (!updatedUser) {
        return res.status(500).json({ error: 'Failed to update password in database' });
      }
      
      // Verify the password was actually saved
      const verifyUser = await storage.getUserByEmail(tokenData.email);
      const verifyMatch = verifyUser ? await bcrypt.compare(password, verifyUser.password) : false;
      console.log('[RESET] Verification - password matches after save:', verifyMatch);
      
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

// Extend Express Request type to include user
import type { User as SchemaUser } from '@shared/schema';

declare global {
  namespace Express {
    interface User extends SchemaUser {}
  }
}
