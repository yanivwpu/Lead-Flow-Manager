import { Router, Request, Response } from 'express';
import * as jose from 'jose';
import crypto from 'crypto';
import { storage } from './storage';
import bcrypt from 'bcryptjs';

const router = Router();

const pendingCodes = new Map<string, { userId: string; clientId: string; redirectUri: string; nonce?: string; expiresAt: number }>();

let cachedKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey; jwk: jose.JWK } | null = null;

async function getKeyPair() {
  if (cachedKeyPair) return cachedKeyPair;
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { extractable: true }) as { publicKey: CryptoKey; privateKey: CryptoKey };
  const jwk = await jose.exportJWK(publicKey);
  jwk.kid = 'whachat-oidc-key-1';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  cachedKeyPair = { publicKey, privateKey, jwk };
  return cachedKeyPair;
}

function getIssuer(req: Request): string {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

function getGhlClientId(): string {
  return process.env.GHL_SSO_CLIENT_ID || process.env.GHL_CLIENT_ID || '';
}

function getGhlClientSecret(): string {
  return process.env.GHL_SSO_CLIENT_SECRET || process.env.GHL_CLIENT_SECRET || '';
}

router.get('/.well-known/openid-configuration', (req: Request, res: Response) => {
  const issuer = getIssuer(req);
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/oidc/authorize`,
    token_endpoint: `${issuer}/oidc/token`,
    userinfo_endpoint: `${issuer}/oidc/userinfo`,
    jwks_uri: `${issuer}/oidc/jwks`,
    response_types_supported: ['code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    claims_supported: ['sub', 'name', 'email', 'email_verified', 'iss', 'aud', 'exp', 'iat', 'nonce'],
  });
});

router.get('/oidc/jwks', async (_req: Request, res: Response) => {
  try {
    const { jwk } = await getKeyPair();
    res.json({ keys: [jwk] });
  } catch (error) {
    console.error('[OIDC] JWKS error:', error);
    res.status(500).json({ error: 'Failed to generate keys' });
  }
});

router.get('/oidc/authorize', (req: Request, res: Response) => {
  const { client_id, redirect_uri, response_type, scope, state, nonce } = req.query;

  if (response_type !== 'code') {
    return res.status(400).send('Unsupported response_type. Only "code" is supported.');
  }

  if (!client_id) {
    return res.status(400).send('client_id is required.');
  }

  const loginPageHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Sign In - WhachatCRM</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .card { background: white; border-radius: 16px; padding: 40px; width: 100%; max-width: 400px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); }
        .logo { text-align: center; margin-bottom: 24px; }
        .logo h1 { font-size: 24px; color: #1e293b; }
        .logo p { color: #64748b; font-size: 14px; margin-top: 4px; }
        .form-group { margin-bottom: 16px; }
        label { display: block; font-size: 14px; font-weight: 500; color: #374151; margin-bottom: 6px; }
        input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 16px; outline: none; transition: border-color 0.2s; }
        input:focus { border-color: #25D366; box-shadow: 0 0 0 3px rgba(37,211,102,0.1); }
        button { width: 100%; padding: 14px; background: #25D366; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #1fb954; }
        button:disabled { background: #94a3b8; cursor: not-allowed; }
        .error { color: #ef4444; font-size: 14px; margin-top: 8px; display: none; }
        .error.show { display: block; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">
          <h1>WhachatCRM</h1>
          <p>Sign in to continue to GoHighLevel</p>
        </div>
        <form id="loginForm">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@example.com">
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required autocomplete="current-password" placeholder="Your password">
          </div>
          <div id="error" class="error"></div>
          <button type="submit" id="submitBtn">Sign In</button>
        </form>
      </div>
      <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const btn = document.getElementById('submitBtn');
          const errEl = document.getElementById('error');
          btn.disabled = true;
          btn.textContent = 'Signing in...';
          errEl.classList.remove('show');
          try {
            const res = await fetch('/oidc/authorize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: document.getElementById('email').value,
                password: document.getElementById('password').value,
                client_id: ${JSON.stringify(client_id || '')},
                redirect_uri: ${JSON.stringify(redirect_uri || '')},
                state: ${JSON.stringify(state || '')},
                nonce: ${JSON.stringify(nonce || '')},
                scope: ${JSON.stringify(scope || 'openid profile email')},
              }),
            });
            const data = await res.json();
            if (data.redirect) {
              window.location.href = data.redirect;
            } else {
              errEl.textContent = data.error || 'Login failed';
              errEl.classList.add('show');
            }
          } catch (err) {
            errEl.textContent = 'Network error. Please try again.';
            errEl.classList.add('show');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Sign In';
          }
        });
      </script>
    </body>
    </html>
  `;

  res.send(loginPageHtml);
});

router.post('/oidc/authorize', async (req: Request, res: Response) => {
  try {
    const { email, password, client_id, redirect_uri, state, nonce } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!client_id) {
      return res.status(400).json({ error: 'client_id is required' });
    }

    if (!redirect_uri) {
      return res.status(400).json({ error: 'redirect_uri is required' });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const code = crypto.randomBytes(32).toString('hex');
    pendingCodes.set(code, {
      userId: user.id,
      clientId: client_id,
      redirectUri: redirect_uri,
      nonce,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    let redirectUrl = redirect_uri;
    const separator = redirectUrl.includes('?') ? '&' : '?';
    redirectUrl += `${separator}code=${encodeURIComponent(code)}`;
    if (state) {
      redirectUrl += `&state=${encodeURIComponent(state)}`;
    }

    res.json({ redirect: redirectUrl });
  } catch (error) {
    console.error('[OIDC] Authorize error:', error);
    res.status(500).json({ error: 'Authorization failed' });
  }
});

router.post('/oidc/token', async (req: Request, res: Response) => {
  try {
    let clientId = req.body.client_id;
    let clientSecret = req.body.client_secret;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [id, secret] = decoded.split(':');
      clientId = clientId || id;
      clientSecret = clientSecret || secret;
    }

    const { grant_type, code, redirect_uri } = req.body;

    if (grant_type !== 'authorization_code') {
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    if (!clientId || !clientSecret) {
      return res.status(401).json({ error: 'invalid_client', error_description: 'client_id and client_secret are required' });
    }

    const pending = pendingCodes.get(code);
    if (!pending) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code is invalid or expired' });
    }

    if (Date.now() > pending.expiresAt) {
      pendingCodes.delete(code);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'Authorization code has expired' });
    }

    if (pending.clientId !== clientId) {
      pendingCodes.delete(code);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'client_id mismatch' });
    }

    if (redirect_uri && pending.redirectUri !== redirect_uri) {
      pendingCodes.delete(code);
      return res.status(400).json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
    }

    pendingCodes.delete(code);

    const user = await storage.getUser(pending.userId);
    if (!user) {
      return res.status(400).json({ error: 'invalid_grant', error_description: 'User not found' });
    }

    const { privateKey } = await getKeyPair();
    const issuer = getIssuer(req);

    const idTokenPayload: any = {
      sub: String(user.id),
      email: user.email,
      email_verified: true,
      name: user.name || user.email,
    };
    if (pending.nonce) {
      idTokenPayload.nonce = pending.nonce;
    }

    console.log('[OIDC] Token exchange successful for user:', user.email);

    const idToken = await new jose.SignJWT(idTokenPayload)
      .setProtectedHeader({ alg: 'RS256', kid: 'whachat-oidc-key-1' })
      .setIssuer(issuer)
      .setAudience(clientId)
      .setIssuedAt()
      .setExpirationTime('1h')
      .setSubject(String(user.id))
      .sign(privateKey);

    const accessToken = crypto.randomBytes(32).toString('hex');

    accessTokenStore.set(accessToken, {
      userId: user.id,
      expiresAt: Date.now() + 3600 * 1000,
    });

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      id_token: idToken,
    });
  } catch (error) {
    console.error('[OIDC] Token error:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

const accessTokenStore = new Map<string, { userId: string; expiresAt: number }>();

router.get('/oidc/userinfo', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const token = authHeader.slice(7);
    const stored = accessTokenStore.get(token);
    if (!stored || Date.now() > stored.expiresAt) {
      accessTokenStore.delete(token);
      return res.status(401).json({ error: 'invalid_token' });
    }

    const user = await storage.getUser(stored.userId);
    if (!user) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    res.json({
      sub: String(user.id),
      name: user.name || user.email,
      email: user.email,
      email_verified: true,
    });
  } catch (error) {
    console.error('[OIDC] UserInfo error:', error);
    res.status(500).json({ error: 'server_error' });
  }
});

setInterval(() => {
  const now = Date.now();
  pendingCodes.forEach((value, key) => {
    if (now > value.expiresAt) pendingCodes.delete(key);
  });
  accessTokenStore.forEach((value, key) => {
    if (now > value.expiresAt) accessTokenStore.delete(key);
  });
}, 5 * 60 * 1000);

export default router;
