import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';

const router = Router();

const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || '';
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET || '';
const GHL_REDIRECT_URI = process.env.GHL_REDIRECT_URI || 'https://whachatcrm.com/api/ext/callback';

router.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error, error_description } = req.query;

    if (error) {
      console.error('[GHL] OAuth error:', error, error_description);
      return res.status(400).send(`GoHighLevel authorization failed: ${error_description || error}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('[GHL] No authorization code received. Query params:', req.query);
      return res.status(400).send('Missing authorization code from GoHighLevel.');
    }

    console.log('[GHL] Received authorization code, exchanging for tokens...');

    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) {
      console.error('[GHL] Missing GHL_CLIENT_ID or GHL_CLIENT_SECRET');
      return res.status(500).send('GoHighLevel integration is not configured. Please set GHL_CLIENT_ID and GHL_CLIENT_SECRET.');
    }

    const params = new URLSearchParams({
      client_id: GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: GHL_REDIRECT_URI,
    });

    console.log('[GHL] Sending token request to:', GHL_TOKEN_URL);

    const tokenResponse = await fetch(GHL_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const tokenText = await tokenResponse.text();
    let tokenData: any;
    try {
      tokenData = JSON.parse(tokenText);
    } catch (e) {
      console.error('[GHL] Non-JSON token response:', tokenText.substring(0, 500));
      return res.status(500).send('Unexpected response from GoHighLevel. Please try again.');
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[GHL] Token exchange failed:', tokenResponse.status, tokenData);
      return res.status(400).send(`Failed to connect GoHighLevel account: ${tokenData.error_description || tokenData.error || 'Unknown error'}. Please try again.`);
    }

    console.log('[GHL] Token exchange successful:', {
      userType: tokenData.userType,
      locationId: tokenData.locationId,
      companyId: tokenData.companyId,
      scope: tokenData.scope,
      expiresIn: tokenData.expires_in,
    });

    const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);
    const locationOrCompanyId = tokenData.locationId || tokenData.companyId || 'unknown';

    const existingIntegrations = await storage.getIntegrationsByType('gohighlevel');
    const existing = existingIntegrations.find(
      (i: any) => i.config && (
        (tokenData.locationId && (i.config as any).locationId === tokenData.locationId) ||
        (tokenData.companyId && (i.config as any).companyId === tokenData.companyId)
      )
    );

    if (existing) {
      await storage.updateIntegration(existing.id, {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt,
        isActive: true,
        config: {
          ...(existing.config as any),
          locationId: tokenData.locationId,
          companyId: tokenData.companyId,
          userType: tokenData.userType,
          scope: tokenData.scope,
        },
        lastSyncAt: new Date(),
      });
      console.log('[GHL] Updated existing integration:', existing.id);
    } else {
      const userId = (req as any).session?.userId;

      let ownerUserId = userId;
      if (!ownerUserId) {
        const allUsers = await storage.getIntegrationsByType('gohighlevel');
        const firstUser = await storage.getUserByEmail('yahabegood@gmail.com');
        ownerUserId = firstUser?.id;
      }

      if (ownerUserId) {
        const integration = await storage.createIntegration({
          userId: ownerUserId,
          type: 'gohighlevel',
          name: `GoHighLevel - ${tokenData.userType === 'Location' ? 'Location' : 'Agency'} (${locationOrCompanyId})`,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt,
          isActive: true,
          config: {
            locationId: tokenData.locationId,
            companyId: tokenData.companyId,
            userType: tokenData.userType,
            scope: tokenData.scope,
            installedAt: new Date().toISOString(),
          },
        });
        console.log('[GHL] Created new integration:', integration.id, 'for user:', ownerUserId);
      } else {
        console.error('[GHL] Could not find a user to associate integration with');
      }
    }

    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>GoHighLevel Connected</title>
        <style>
          body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
          .card { text-align: center; padding: 48px; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
          .check { width: 64px; height: 64px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
          .check svg { width: 32px; height: 32px; fill: white; }
          h1 { margin: 0 0 8px; font-size: 24px; color: #1e293b; }
          p { color: #64748b; margin: 0 0 24px; }
          .btn { display: inline-block; padding: 12px 32px; background: #25D366; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
          <h1>Connected Successfully!</h1>
          <p>Your GoHighLevel account has been linked to WhachatCRM. You can close this window.</p>
          <a href="https://whachatcrm.com/settings" class="btn">Go to Settings</a>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'ghl_connected', success: true }, '*');
          }
        </script>
      </body>
      </html>
    `;

    return res.send(successHtml);
  } catch (error) {
    console.error('[GHL] Callback error:', error);
    return res.status(500).send('An error occurred while connecting GoHighLevel. Please try again.');
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    console.log('[GHL Webhook] Received event:', JSON.stringify(req.body).substring(0, 500));

    const { type, locationId, ...data } = req.body;

    if (!type) {
      return res.status(400).json({ error: 'Missing event type' });
    }

    console.log(`[GHL Webhook] Event: ${type}, Location: ${locationId}`);

    switch (type) {
      case 'ContactCreate':
      case 'ContactUpdate':
        console.log('[GHL Webhook] Contact event:', data);
        break;

      case 'OpportunityCreate':
      case 'OpportunityUpdate':
      case 'OpportunityStatusUpdate':
        console.log('[GHL Webhook] Opportunity event:', data);
        break;

      case 'InboundMessage':
      case 'OutboundMessage':
        console.log('[GHL Webhook] Message event:', data);
        break;

      case 'AppInstall':
        console.log('[GHL Webhook] App installed for location:', locationId);
        break;

      case 'AppUninstall':
        console.log('[GHL Webhook] App uninstalled for location:', locationId);
        if (locationId) {
          const integrations = await storage.getIntegrationsByType('gohighlevel');
          const match = integrations.find(
            (i: any) => i.config && (i.config as any).locationId === locationId
          );
          if (match) {
            await storage.updateIntegration(match.id, { isActive: false });
            console.log('[GHL Webhook] Deactivated integration:', match.id);
          }
        }
        break;

      default:
        console.log('[GHL Webhook] Unhandled event type:', type);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[GHL Webhook] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh-token', async (req: Request, res: Response) => {
  try {
    const { integrationId } = req.body;

    if (!integrationId) {
      return res.status(400).json({ error: 'Missing integrationId' });
    }

    const integration = await storage.getIntegration(integrationId);
    if (!integration || integration.type !== 'gohighlevel') {
      return res.status(404).json({ error: 'Integration not found' });
    }

    if (!integration.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const params = new URLSearchParams({
      client_id: GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
    });

    const tokenResponse = await fetch(GHL_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const tokenData = await tokenResponse.json() as any;

    if (!tokenResponse.ok) {
      console.error('[GHL] Token refresh failed:', tokenData);
      return res.status(400).json({ error: 'Failed to refresh token' });
    }

    const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);

    await storage.updateIntegration(integrationId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
      lastSyncAt: new Date(),
    });

    console.log('[GHL] Token refreshed for integration:', integrationId);
    res.json({ success: true, expiresAt: tokenExpiresAt });
  } catch (error) {
    console.error('[GHL] Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

export default router;
