import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import type { Express, Request } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { storage } from './storage';
import type { User } from '@shared/schema';
import { isDisposableEmail } from '@shared/disposableEmail';
import { normalizeUserLanguage } from '@shared/userLanguage';
import {
  AUTH_RATE_LIMIT_MESSAGE,
  checkForgotPasswordEmailLimit,
  checkForgotPasswordIpLimit,
  checkSignupEmailLimit,
  checkSignupIpLimit,
  checkVerificationResendLimit,
  getAuthClientIp,
  getAuthUserAgent,
  getRequestId,
  isEmailVerified,
  logAuthSecurityEvent,
  softAuthDelay,
} from './authSecurity';
import {
  TURNSTILE_GENERIC_ERROR,
  isTurnstileRequired,
  verifyTurnstileToken,
  warnIfTurnstileMisconfigured,
} from './authTurnstile';
import { consumeEmailVerificationToken, issueEmailVerification, resendVerificationForEmail } from './emailVerification';
import { consumePasswordResetToken, issuePasswordResetForEmail } from './passwordResetTokens';
import { isRetiredCrmDemoEmail } from '@shared/retiredCrmDemoAgent';

const PgStore = connectPgSimple(session);

const DISPOSABLE_EMAIL_MESSAGE =
  "Temporary email addresses arenâ€™t allowed. Please use a permanent personal or business email address.";
const PENDING_VERIFICATION_MESSAGE = "Check your email to verify your account.";
const FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email, weâ€™ve sent password-reset instructions.";
const HONEYPOT_FIELD = "website";

async function resolveUserForLogin(rawEmail: string): Promise<User | undefined> {
  // Single code path: storage.getUserByEmail uses raw SQL only (no Drizzle eq/ilike on users.email).
  return storage.getUserByEmail(typeof rawEmail === 'string' ? rawEmail : '');
}

/** Lowercase email for logs without exposing full address (unless AUTH_LOGIN_VERBOSE). */
function maskEmailForLog(email: string): string {
  const s = (email || '').trim().toLowerCase();
  const at = s.indexOf('@');
  if (at <= 0) return '[no-email]';
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  const prefix = local.length <= 2 ? local[0] ?? '?' : local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

function authLoginVerbose(): boolean {
  return process.env.AUTH_LOGIN_VERBOSE === 'true' || process.env.AUTH_LOGIN_VERBOSE === '1';
}

/** Trim + lowercase + NFKC so login matches stored emails regardless of unicode compatibility forms. */
export function normalizeEmailForAuth(raw: string): string {
  const t = (typeof raw === 'string' ? raw : '').trim().toLowerCase();
  try {
    return t.normalize('NFKC');
  } catch {
    return t;
  }
}

function classifyStoredPassword(stored: string | null | undefined): 'bcrypt' | 'plaintext' | 'empty' | 'unknown' {
  if (stored == null || stored === '') return 'empty';
  if (/^\$2[aby]\$\d{2}\$/.test(stored)) return 'bcrypt';
  return 'plaintext';
}

function emitLoginAttempt(req: Request, patch: Record<string, unknown>): void {
  const base = (req as unknown as { __loginAttempt?: Record<string, unknown> }).__loginAttempt ?? {};
  (req as unknown as { __loginAttempt?: Record<string, unknown> }).__loginAttempt = { ...base, ...patch };
}

function logLoginAttemptLine(req: Request, extras: Record<string, unknown>): void {
  const ctx = (req as unknown as { __loginAttempt?: Record<string, unknown> }).__loginAttempt ?? {};
  const payload = {
    ...ctx,
    ...extras,
    host: req.get('host') ?? null,
    origin: req.get('origin') ?? req.get('referer') ?? null,
    cookieDomain: process.env.SESSION_COOKIE_DOMAIN?.trim() || '(unset â€” host-only cookie)',
    secureCookie: process.env.NODE_ENV === 'production',
  };
  console.log(`[LoginAttempt] ${JSON.stringify(payload)}`);
}

/** Supports bcrypt hashes and legacy plaintext (re-hashed after successful login). */
async function verifyLoginPassword(
  plain: string,
  stored: string | null | undefined,
): Promise<{ ok: boolean; migratedFromPlaintext: boolean }> {
  if (stored == null || stored === '') {
    return { ok: false, migratedFromPlaintext: false };
  }

  const looksBcrypt =
    stored.startsWith('$2a$') ||
    stored.startsWith('$2b$') ||
    stored.startsWith('$2y$');

  if (looksBcrypt) {
    try {
      const ok = await bcrypt.compare(plain, stored);
      return { ok, migratedFromPlaintext: false };
    } catch {
      return { ok: false, migratedFromPlaintext: false };
    }
  }

  if (plain === stored) {
    return { ok: true, migratedFromPlaintext: true };
  }

  try {
    const ok = await bcrypt.compare(plain, stored);
    return { ok, migratedFromPlaintext: false };
  } catch {
    return { ok: false, migratedFromPlaintext: false };
  }
}

export function setupAuth(app: Express) {
  // Trust proxy for Railway / reverse proxies (req.ip from first trusted hop)
  app.set('trust proxy', 1);
  warnIfTurnstileMisconfigured();

  // Session configuration with PostgreSQL store for production persistence
  const isProduction = process.env.NODE_ENV === 'production';
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
        secure: isProduction, // true for production HTTPS, false for development
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
        passReqToCallback: true,
      },
      async (req, email, password, done) => {
        try {
          const rawEmail = typeof email === 'string' ? email : '';
          const trimmedEmail = rawEmail.trim();
          const normalizedEmail = normalizeEmailForAuth(trimmedEmail);

          if (isRetiredCrmDemoEmail(normalizedEmail)) {
            emitLoginAttempt(req, {
              emailNormalized: maskEmailForLog(normalizedEmail),
              emailRawLen: trimmedEmail.length,
              userFound: false,
              userId: null,
              passwordMatch: false,
              passwordStoredPresent: false,
              storedHashKind: 'empty',
              failureReason: 'retired_crm_demo',
              path: 'local_strategy',
            });
            return done(null, false, { message: 'Invalid email or password' });
          }

          // Normal login (case-insensitive email match + NFKC via storage.getUserByEmail)
          let user = await resolveUserForLogin(normalizedEmail);
          const passwordFieldPresent = !!(user?.password && user.password.length > 0);
          const storedHashKind = classifyStoredPassword(user?.password);

          let verifyOk = false;
          if (user && passwordFieldPresent) {
            const vr = await verifyLoginPassword(password, user.password);
            verifyOk = vr.ok;
            if (vr.ok && vr.migratedFromPlaintext) {
              const hashed = await bcrypt.hash(password, 10);
              const updated = await storage.updateUser(user.id, { password: hashed });
              user = updated || user;
            }
          }

          const verbose = authLoginVerbose();
          const emailForLog = verbose ? normalizedEmail : maskEmailForLog(normalizedEmail);

          emitLoginAttempt(req, {
            emailNormalized: emailForLog,
            emailRawLen: trimmedEmail.length,
            userFound: !!user,
            userId: user?.id ?? null,
            passwordMatch: verifyOk,
            passwordStoredPresent: passwordFieldPresent,
            storedHashKind,
            failureReason: !user
              ? 'user_not_found'
              : !passwordFieldPresent
                ? 'empty_stored_password'
                : verifyOk
                  ? null
                  : 'password_mismatch_or_invalid_hash',
            path: 'local_strategy',
          });

          if (authLoginVerbose()) {
            console.log('[AUTH LOGIN verbose]', {
              email: emailForLog,
              passwordSubmittedLen: typeof password === 'string' ? password.length : 0,
              passwordStoredLen: user?.password?.length ?? 0,
            });
          }

          if (!user || !verifyOk) {
            return done(null, false, { message: 'Invalid email or password' });
          }

          const sessionUser = await storage.getUserForSession(user.id);
          if (sessionUser?.deletionRequestedAt) {
            return done(null, false, {
              message: 'This account has a pending deletion request.',
            });
          }
          return done(null, sessionUser || user);
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
      const user = await storage.getUserForSession(id);
      if (!user) {
        // User no longer exists in database, clear the session
        return done(null, false);
      }
      if (user.deletionRequestedAt) {
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

/** Paths that authenticated-but-unverified users may still call. */
const UNVERIFIED_ALLOWED_PATHS = new Set([
  '/api/auth/me',
  '/api/auth/logout',
  '/api/auth/resend-verification',
  '/api/auth/verify-email',
]);

// Auth middleware to protect routes
export function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = req.user as User | undefined;
  const path = (req.path || req.originalUrl || '').split('?')[0];
  if (user && !isEmailVerified(user) && !UNVERIFIED_ALLOWED_PATHS.has(path)) {
    return res.status(403).json({
      error: PENDING_VERIFICATION_MESSAGE,
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  return next();
}

// Register auth routes
export function registerAuthRoutes(app: Express) {
  // Sign up â€” pending verification; trial + welcome start after email verify
  app.post('/api/auth/signup', async (req, res) => {
    const ip = getAuthClientIp(req);
    const userAgent = getAuthUserAgent(req);
    const requestId = getRequestId(req);

    try {
      const { name, email, password, phoneNumber, businessName, turnstileToken, language: rawLanguage } =
        req.body || {};
      const honeypotValue = typeof req.body?.[HONEYPOT_FIELD] === 'string' ? req.body[HONEYPOT_FIELD] : '';
      // Prefer validated signup language (from localized marketing / selector); default English.
      const signupLanguage = normalizeUserLanguage(rawLanguage) || 'en';

      await logAuthSecurityEvent({
        eventType: 'signup_attempt',
        email: typeof email === 'string' ? email : null,
        ipAddress: ip,
        userAgent,
        outcome: 'allowed',
        requestId,
      });

      // Honeypot: pretend success, do not create account or send email
      if (honeypotValue && String(honeypotValue).trim().length > 0) {
        await logAuthSecurityEvent({
          eventType: 'signup_rejected_honeypot',
          email: typeof email === 'string' ? email : null,
          ipAddress: ip,
          userAgent,
          outcome: 'rejected',
          reasonCode: 'honeypot',
          requestId,
        });
        return res.status(201).json({
          pendingVerification: true,
          message: PENDING_VERIFICATION_MESSAGE,
        });
      }

      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const normalizedEmail = normalizeEmailForAuth(email);

      if (isRetiredCrmDemoEmail(normalizedEmail)) {
        await logAuthSecurityEvent({
          eventType: 'signup_rejected_retired_identity',
          email: normalizedEmail,
          ipAddress: ip,
          userAgent,
          outcome: 'rejected',
          reasonCode: 'retired_crm_demo',
          requestId,
        });
        return res.status(400).json({ error: 'This email cannot be used to create an account.' });
      }

      const ipLimit = await checkSignupIpLimit(ip);
      if (!ipLimit.allowed) {
        await logAuthSecurityEvent({
          eventType: 'signup_rate_limited',
          email: normalizedEmail,
          ipAddress: ip,
          userAgent,
          outcome: 'rate_limited',
          reasonCode: 'signup_ip',
          requestId,
        });
        return res.status(429).json({ error: AUTH_RATE_LIMIT_MESSAGE, code: 'RATE_LIMITED' });
      }

      const emailLimit = await checkSignupEmailLimit(normalizedEmail);
      if (!emailLimit.allowed) {
        await logAuthSecurityEvent({
          eventType: 'signup_rate_limited',
          email: normalizedEmail,
          ipAddress: ip,
          userAgent,
          outcome: 'rate_limited',
          reasonCode: 'signup_email',
          requestId,
        });
        return res.status(429).json({ error: AUTH_RATE_LIMIT_MESSAGE, code: 'RATE_LIMITED' });
      }

      if (isDisposableEmail(normalizedEmail)) {
        await logAuthSecurityEvent({
          eventType: 'signup_rejected_disposable',
          email: normalizedEmail,
          ipAddress: ip,
          userAgent,
          outcome: 'rejected',
          reasonCode: 'disposable_email',
          requestId,
        });
        return res.status(400).json({ error: DISPOSABLE_EMAIL_MESSAGE, code: 'DISPOSABLE_EMAIL' });
      }

      if (isTurnstileRequired()) {
        const turnstile = await verifyTurnstileToken(turnstileToken, ip);
        if (!turnstile.ok) {
          await logAuthSecurityEvent({
            eventType: 'signup_rejected_turnstile',
            email: normalizedEmail,
            ipAddress: ip,
            userAgent,
            outcome: 'rejected',
            reasonCode: turnstile.reason,
            requestId,
          });
          return res.status(400).json({ error: TURNSTILE_GENERIC_ERROR, code: 'TURNSTILE_FAILED' });
        }
      }

      const existingUser = await resolveUserForLogin(normalizedEmail);
      if (existingUser) {
        if (!isEmailVerified(existingUser)) {
          // Resend verification without revealing account state beyond generic pending message
          const resendLimit = await checkVerificationResendLimit(normalizedEmail);
          if (resendLimit.allowed) {
            await issueEmailVerification(existingUser.id, existingUser.email, existingUser.name);
            await logAuthSecurityEvent({
              eventType: 'verification_resent',
              userId: existingUser.id,
              email: normalizedEmail,
              ipAddress: ip,
              userAgent,
              outcome: 'success',
              reasonCode: 'signup_existing_pending',
              requestId,
            });
          }
          return res.status(201).json({
            pendingVerification: true,
            message: PENDING_VERIFICATION_MESSAGE,
          });
        }
        return res.status(400).json({ error: 'User already exists with that email' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      console.log(
        `[SignupCreateUser] ${JSON.stringify({
          phase: "before_create_pending",
          email: normalizedEmail,
          trialPlan: null,
          emailVerified: false,
        })}`,
      );

      const user = await storage.createUser({
        name: String(name).trim(),
        email: normalizedEmail,
        password: hashedPassword,
        trialStatus: "none",
        trialPlan: null,
        trialStartedAt: null,
        trialEndsAt: null,
        emailVerifiedAt: null,
        language: signupLanguage,
      });

      console.log(
        `[SignupCreateUser] ${JSON.stringify({
          phase: "after_create_pending",
          userId: user?.id ?? null,
          email: user?.email ?? normalizedEmail,
          trialStatus: user?.trialStatus ?? "none",
        })}`,
      );

      // Referral attribution (same as before; works before verification)
      let referralPartnerId = (req.session as any)?.referralPartnerId;
      let refCode = (req.session as any)?.referralCode;

      if (!referralPartnerId && req.cookies?.ref_code) {
        refCode = req.cookies.ref_code;
        const partnerFromCookie = await storage.getPartnerByRefCode(refCode);
        if (partnerFromCookie && partnerFromCookie.status === 'active') {
          referralPartnerId = partnerFromCookie.id;
        }
      }

      if (referralPartnerId) {
        try {
          const partner = await storage.getPartner(referralPartnerId);
          if (partner && partner.email.toLowerCase() !== normalizedEmail) {
            const assigned = await storage.assignPartnerToUser(user.id, referralPartnerId);
            if (assigned) {
              await storage.incrementPartnerReferrals(referralPartnerId);
              console.log(`[REFERRAL] User ${user.email} attributed to partner ${partner.name} (ref: ${refCode})`);
            }
          }
          (req.session as any).referralCode = null;
          (req.session as any).referralPartnerId = null;
        } catch (refError) {
          console.error('Referral attribution error:', refError);
        }
      }

      if (phoneNumber && phoneNumber.trim()) {
        try {
          let normalizedPhone = phoneNumber.trim();
          if (!normalizedPhone.startsWith("whatsapp:")) {
            if (!normalizedPhone.startsWith("+")) {
              normalizedPhone = "+" + normalizedPhone;
            }
            normalizedPhone = "whatsapp:" + normalizedPhone;
          }
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
        }
      }

      await issueEmailVerification(user.id, user.email, user.name);
      await logAuthSecurityEvent({
        eventType: 'signup_created_pending_verification',
        userId: user.id,
        email: normalizedEmail,
        ipAddress: ip,
        userAgent,
        outcome: 'success',
        requestId,
      });

      // Do not establish a product session until verified
      return res.status(201).json({
        pendingVerification: true,
        message: PENDING_VERIFICATION_MESSAGE,
      });
    } catch (error) {
      console.error('Signup error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // Resend verification email (no account enumeration)
  app.post('/api/auth/resend-verification', async (req, res) => {
    const ip = getAuthClientIp(req);
    const userAgent = getAuthUserAgent(req);
    const requestId = getRequestId(req);
    const generic = {
      success: true,
      message: PENDING_VERIFICATION_MESSAGE,
    };

    try {
      const email = typeof req.body?.email === 'string' ? normalizeEmailForAuth(req.body.email) : '';
      if (!email) {
        return res.json(generic);
      }

      const limit = await checkVerificationResendLimit(email);
      if (!limit.allowed) {
        await logAuthSecurityEvent({
          eventType: 'signup_rate_limited',
          email,
          ipAddress: ip,
          userAgent,
          outcome: 'rate_limited',
          reasonCode: 'verification_resend',
          requestId,
        });
        return res.status(429).json({ error: AUTH_RATE_LIMIT_MESSAGE, code: 'RATE_LIMITED' });
      }

      const result = await resendVerificationForEmail(email);
      if (result.attempted) {
        await logAuthSecurityEvent({
          eventType: 'verification_resent',
          userId: result.userId,
          email,
          ipAddress: ip,
          userAgent,
          outcome: 'success',
          requestId,
        });
      }
      return res.json(generic);
    } catch (error) {
      console.error('Resend verification error:', error);
      return res.json(generic);
    }
  });

  // Verify email via single-use token (JSON API)
  app.post('/api/auth/verify-email', async (req, res) => {
    const ip = getAuthClientIp(req);
    const userAgent = getAuthUserAgent(req);
    const requestId = getRequestId(req);

    try {
      const token = typeof req.body?.token === 'string' ? req.body.token : '';
      const result = await consumeEmailVerificationToken(token);
      if (!result.ok) {
        const message =
          result.reason === 'expired'
            ? 'This verification link has expired. Please request a new one.'
            : 'This verification link is invalid or has already been used.';
        return res.status(400).json({ error: message, code: 'VERIFY_FAILED' });
      }

      await logAuthSecurityEvent({
        eventType: 'email_verified',
        userId: result.userId,
        ipAddress: ip,
        userAgent,
        outcome: 'success',
        reasonCode: result.alreadyVerified ? 'already_verified' : 'verified',
        requestId,
      });

      const user = await storage.getUserForSession(result.userId);
      if (!user) {
        return res.status(400).json({ error: 'Unable to complete verification.' });
      }

      // Establish session after successful verification
      req.login(user, (err: any) => {
        if (err) {
          return res.json({
            success: true,
            message: 'Email verified. Please log in to continue.',
            verified: true,
          });
        }
        const { password: _, ...safeUser } = user;
        return res.json({
          success: true,
          verified: true,
          alreadyVerified: result.alreadyVerified,
          trialStarted: result.trialStarted,
          user: safeUser,
        });
      });
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({ error: 'Failed to verify email' });
    }
  });

  // Login
  app.post('/api/auth/login', (req, res, next) => {
    passport.authenticate('local', (err: any, user: User, info: any) => {
      if (err) {
        console.error('[AUTH LOGIN route] passport error:', err);
        logLoginAttemptLine(req, {
          sessionCreated: false,
          phase: 'passport_exception',
          passportError: String((err as Error)?.message || err),
        });
        return res.status(500).json({ error: 'Authentication failed' });
      }
      if (!user) {
        logLoginAttemptLine(req, {
          sessionCreated: false,
          phase: 'reject_credentials',
        });
        return res.status(401).json({ error: info?.message || 'Invalid email or password' });
      }

      // Set session duration based on rememberMe flag
      const rememberMe = req.body.rememberMe || false;

      req.login(user, (loginErr: any) => {
        logLoginAttemptLine(req, {
          sessionCreated: !loginErr,
          phase: loginErr ? 'req_login_failed' : 'success',
          rememberMe: !!rememberMe,
          reqLoginError: loginErr ? String(loginErr?.message || loginErr) : null,
        });
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
      res.set('Cache-Control', 'no-store, private');
      res.json(safeUser);
    } else {
      res.set('Cache-Control', 'no-store');
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Forgot password - generic response; DB-backed hashed tokens; rate limited
  app.post('/api/auth/forgot-password', async (req, res) => {
    const ip = getAuthClientIp(req);
    const userAgent = getAuthUserAgent(req);
    const requestId = getRequestId(req);
    const generic = { success: true, message: FORGOT_PASSWORD_MESSAGE };

    try {
      const email = typeof req.body?.email === 'string' ? normalizeEmailForAuth(req.body.email) : '';
      if (!email) {
        await softAuthDelay();
        return res.json(generic);
      }

      if (isRetiredCrmDemoEmail(email)) {
        await logAuthSecurityEvent({
          eventType: 'forgot_password_requested',
          email,
          ipAddress: ip,
          userAgent,
          outcome: 'noop',
          reasonCode: 'retired_crm_demo',
          requestId,
        });
        await softAuthDelay();
        return res.json(generic);
      }

      const ipLimit = await checkForgotPasswordIpLimit(ip);
      if (!ipLimit.allowed) {
        await logAuthSecurityEvent({
          eventType: 'forgot_password_rate_limited',
          email,
          ipAddress: ip,
          userAgent,
          outcome: 'rate_limited',
          reasonCode: 'forgot_ip',
          requestId,
        });
        await softAuthDelay();
        return res.status(429).json({ error: AUTH_RATE_LIMIT_MESSAGE, code: 'RATE_LIMITED' });
      }

      const emailLimit = await checkForgotPasswordEmailLimit(email);
      if (!emailLimit.allowed) {
        await logAuthSecurityEvent({
          eventType: 'forgot_password_rate_limited',
          email,
          ipAddress: ip,
          userAgent,
          outcome: 'rate_limited',
          reasonCode: 'forgot_email',
          requestId,
        });
        await softAuthDelay();
        return res.status(429).json({ error: AUTH_RATE_LIMIT_MESSAGE, code: 'RATE_LIMITED' });
      }

      const issued = await issuePasswordResetForEmail(email);
      if (issued.pendingUnverified && issued.userId) {
        // Silently direct pending accounts toward verification (no public disclosure)
        const resendLimit = await checkVerificationResendLimit(email);
        if (resendLimit.allowed) {
          await resendVerificationForEmail(email);
        }
      }

      await logAuthSecurityEvent({
        eventType: 'forgot_password_requested',
        userId: issued.userId ?? null,
        email,
        ipAddress: ip,
        userAgent,
        outcome: issued.issued ? 'success' : 'noop',
        reasonCode: issued.pendingUnverified ? 'pending_unverified' : issued.issued ? 'sent' : 'no_account',
        requestId,
      });

      await softAuthDelay();
      return res.json(generic);
    } catch (error) {
      console.error('Forgot password error:', error);
      await softAuthDelay();
      return res.json(generic);
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
      const normalizedEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
      if (!allowedEmails.includes(normalizedEmail)) {
        return res.status(403).json({ error: 'This email is not authorized for emergency reset' });
      }
      
      if (!email || !newPassword) {
        return res.status(400).json({ error: 'Email and newPassword required' });
      }
      
      const user = await resolveUserForLogin(email);
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

  /**
   * Secret-gated emergency reset (set EMERGENCY_AUTH_RESET_SECRET in Railway).
   * POST { secret, email, newPassword }
   */
  app.post('/api/auth/reset-debug', async (req, res) => {
    try {
      const expected = process.env.EMERGENCY_AUTH_RESET_SECRET?.trim();
      if (!expected) {
        return res.status(501).json({ error: 'Emergency reset is not configured (missing EMERGENCY_AUTH_RESET_SECRET)' });
      }
      const { secret, email, newPassword } = req.body || {};
      if (secret !== expected) {
        console.warn('[AUTH reset-debug] forbidden: bad secret');
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (!email || !newPassword || typeof newPassword !== 'string') {
        return res.status(400).json({ error: 'email and newPassword required' });
      }
      if (isRetiredCrmDemoEmail(typeof email === 'string' ? email : '')) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'newPassword must be at least 8 characters' });
      }
      const user = await resolveUserForLogin(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found with that email' });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });
      console.log('[AUTH reset-debug] password updated for user id', user.id);
      res.json({ success: true, message: 'Password reset. You can log in now.' });
    } catch (error: any) {
      console.error('[AUTH reset-debug] error:', error);
      res.status(500).json({ error: error?.message || 'Reset failed' });
    }
  });

  // Reset password with hashed DB-backed token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required' });
      }

      const consumed = await consumePasswordResetToken(token);
      if (!consumed.ok) {
        const message =
          consumed.reason === 'expired'
            ? 'Reset token has expired'
            : 'Invalid or expired reset token';
        return res.status(400).json({ error: message });
      }

      const user = await storage.getUserForSession(consumed.userId);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const updatedUser = await storage.updateUser(user.id, { password: hashedPassword });

      if (!updatedUser) {
        return res.status(500).json({ error: 'Failed to update password in database' });
      }

      req.login(updatedUser, (loginErr: any) => {
        if (loginErr) {
          console.error('Auto-login after reset failed:', loginErr);
          return res.json({ success: true, message: 'Password has been reset successfully. Please log in.' });
        }

        const { password: _, ...safeUser } = updatedUser;
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
