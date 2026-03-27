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
      console.error('[LeadConnector] OAuth error:', error, error_description);
      return res.status(400).send(`LeadConnector authorization failed: ${error_description || error}`);
    }

    if (!code || typeof code !== 'string') {
      console.error('[LeadConnector] No authorization code received. Query params:', req.query);
      return res.status(400).send('Missing authorization code from LeadConnector.');
    }

    console.log('[LeadConnector] Received authorization code, exchanging for tokens...');

    if (!GHL_CLIENT_ID || !GHL_CLIENT_SECRET) {
      console.error('[LeadConnector] Missing GHL_CLIENT_ID or GHL_CLIENT_SECRET');
      return res.status(500).send('LeadConnector integration is not configured. Please contact support.');
    }

    const params = new URLSearchParams({
      client_id: GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: GHL_REDIRECT_URI,
    });

    console.log('[LeadConnector] Sending token request to:', GHL_TOKEN_URL);

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
      console.error('[LeadConnector] Non-JSON token response:', tokenText.substring(0, 500));
      return res.status(500).send('Unexpected response from LeadConnector. Please try again.');
    }

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('[LeadConnector] Token exchange failed:', tokenResponse.status, tokenData);
      return res.status(400).send(`Failed to connect LeadConnector account: ${tokenData.error_description || tokenData.error || 'Unknown error'}. Please try again.`);
    }

    console.log('[LeadConnector] Token exchange successful:', {
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
      console.log('[LeadConnector] Updated existing integration:', existing.id);
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
          name: `LeadConnector - ${tokenData.userType === 'Location' ? 'Location' : 'Agency'} (${locationOrCompanyId})`,
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
        console.log('[LeadConnector] Created new integration:', integration.id, 'for user:', ownerUserId);
      } else {
        console.error('[LeadConnector] Could not find a user to associate integration with');
      }
    }

    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connected to LeadConnector</title>
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
          <h1>Connected to LeadConnector</h1>
          <p>Your LeadConnector account is now connected. You can return to WhachatCRM to start syncing and automations.</p>
          <a href="https://whachatcrm.com/app/integrations" class="btn">Back to WhachatCRM</a>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'leadconnector_connected', success: true }, '*');
          }
        </script>
      </body>
      </html>
    `;

    return res.send(successHtml);
  } catch (error) {
    console.error('[LeadConnector] Callback error:', error);
    return res.status(500).send('An error occurred while connecting LeadConnector. Please try again.');
  }
});

router.post('/webhook', async (req: Request, res: Response) => {
  res.status(200).json({ received: true });

  const timestamp = new Date().toISOString();
  try {
    const body = req.body || {};
    const type = body.type || 'UNKNOWN';
    const locationId = body.locationId || null;
    const eventId = body.eventId || body.id || null;

    console.log(`[LeadConnector Webhook] ${timestamp} | Event: ${type} | Location: ${locationId || 'N/A'}`);

    const ghlIntegrations = await storage.getIntegrationsByType('gohighlevel');
    const integration = ghlIntegrations.find(
      (i: any) => i.config && (i.config as any).locationId === locationId
    );

    if (!integration) {
      console.log(`[LeadConnector Webhook] ${timestamp} | No integration found for location: ${locationId}`);
      return;
    }

    const isNew = await storage.checkAndRecordGhlEvent(integration.id, eventId || `${type}-${timestamp}`, type);
    if (!isNew) {
      console.log(`[LeadConnector Webhook] ${timestamp} | Event already processed: ${eventId}`);
      return;
    }

    const userId = (integration as any).userId;

    switch (type) {
      case 'ContactCreate':
      case 'ContactUpdate': {
        try {
          const contact = body.contact || body;
          const ghlId = contact.id || contact.contactId;
          const name = contact.firstName && contact.lastName 
            ? `${contact.firstName} ${contact.lastName}` 
            : contact.firstName || contact.email || 'Unknown';
          
          const contacts = await storage.getContacts(userId);
          const existingContact = contacts.find((c: any) => c.ghlId === ghlId);
          
          if (existingContact) {
            await storage.updateContact(existingContact.id, {
              name,
              email: contact.email || existingContact.email,
              phone: contact.phone || existingContact.phone,
              tag: contact.tags?.[0] || existingContact.tag,
              sourceDetails: JSON.stringify({
                ...(existingContact.sourceDetails ? JSON.parse(existingContact.sourceDetails as any) : {}),
                customFields: contact.customFields,
                allTags: contact.tags,
              }),
            });
            console.log(`[LeadConnector Webhook] ${timestamp} | Updated contact: ${ghlId}`);
          } else {
            await storage.createContact({
              userId,
              name,
              email: contact.email,
              phone: contact.phone,
              primaryChannel: 'gohighlevel',
              ghlId,
              source: 'gohighlevel',
              sourceDetails: JSON.stringify({
                customFields: contact.customFields,
                allTags: contact.tags,
              }),
              tag: contact.tags?.[0] || 'New',
            });
            console.log(`[LeadConnector Webhook] ${timestamp} | Created contact: ${ghlId}`);
          }
        } catch (contactErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing contact:`, contactErr);
        }
        break;
      }

      case 'ContactTagUpdate': {
        try {
          const ghlId = body.contactId || body.contact?.id;
          const tags = body.tags || body.contact?.tags;
          
          if (ghlId && tags) {
            const contacts = await storage.getContacts(userId);
            const existingContact = contacts.find((c: any) => c.ghlId === ghlId);
            if (existingContact) {
              await storage.updateContact(existingContact.id, {
                tag: tags[0] || existingContact.tag,
                sourceDetails: JSON.stringify({
                  ...(existingContact.sourceDetails ? JSON.parse(existingContact.sourceDetails as any) : {}),
                  allTags: tags,
                }),
              });
              console.log(`[LeadConnector Webhook] ${timestamp} | Updated tags for contact: ${ghlId}`);
            }
          }
        } catch (tagErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing tag update:`, tagErr);
        }
        break;
      }

      case 'InboundMessage': {
        try {
          const msg = body.message || body;
          const ghlContactId = msg.contactId || msg.contact?.id;
          const conversationId = msg.conversationId || msg.conversation?.id;
          
          if (!ghlContactId) {
            console.log(`[LeadConnector Webhook] ${timestamp} | Missing contactId for InboundMessage`);
            break;
          }

          const contacts = await storage.getContacts(userId);
          let contact = contacts.find((c: any) => c.ghlId === ghlContactId);
          
          if (!contact) {
            contact = await storage.createContact({
              userId,
              name: msg.contactName || msg.contact?.firstName || 'Unknown',
              phone: msg.contact?.phone,
              email: msg.contact?.email,
              primaryChannel: 'gohighlevel',
              ghlId: ghlContactId,
              source: 'gohighlevel',
            });
          }

          let conversation = await storage.getConversationByContactAndChannel(contact.id, 'gohighlevel');
          if (!conversation) {
            conversation = await storage.createConversation({
              userId,
              contactId: contact.id,
              channel: 'gohighlevel',
              externalThreadId: conversationId,
              status: 'open',
            });
          }

          await storage.createMessage({
            conversationId: conversation.id,
            contactId: contact.id,
            userId,
            direction: 'inbound',
            content: msg.content || msg.messageText || '',
            contentType: msg.contentType || 'text',
            externalMessageId: msg.messageId,
          });
          
          console.log(`[LeadConnector Webhook] ${timestamp} | Created message for contact: ${ghlContactId}`);
        } catch (msgErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing message:`, msgErr);
        }
        break;
      }

      case 'AppointmentCreate': {
        try {
          const apt = body.appointment || body;
          const ghlContactId = apt.contactId || apt.contact?.id;
          
          if (ghlContactId) {
            const contacts = await storage.getContacts(userId);
            const contact = contacts.find((c: any) => c.ghlId === ghlContactId);
            if (contact) {
              await storage.createActivityEvent({
                userId,
                contactId: contact.id,
                eventType: 'appointment_created',
                eventData: {
                  ghlAppointmentId: apt.id,
                  title: apt.title,
                  startTime: apt.startTime,
                  status: apt.status,
                } as any,
              });
              console.log(`[LeadConnector Webhook] ${timestamp} | Logged appointment for contact: ${ghlContactId}`);
            }
          }
        } catch (aptErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing appointment:`, aptErr);
        }
        break;
      }

      case 'ContactDelete':
      case 'ContactDndUpdate':
      case 'OpportunityCreate':
      case 'OpportunityUpdate':
      case 'OpportunityDelete':
      case 'OpportunityStatusUpdate':
      case 'OpportunityStageUpdate':
      case 'OutboundMessage':
      case 'ConversationUnreadUpdate':
      case 'ConversationProviderUpdate':
      case 'NoteCreate':
      case 'NoteUpdate':
      case 'NoteDelete':
      case 'TaskCreate':
      case 'TaskUpdate':
      case 'TaskDelete':
      case 'TaskCompleted':
      case 'AppointmentUpdate':
      case 'AppointmentDelete':
        console.log(`[LeadConnector Webhook] ${timestamp} | Event acknowledged (not yet synced): ${type}`);
        break;

      case 'AppInstall':
      case 'INSTALL':
        console.log(`[LeadConnector Webhook] ${timestamp} | App installed for location: ${locationId}`);
        break;

      case 'AppUninstall':
      case 'UNINSTALL':
        console.log(`[LeadConnector Webhook] ${timestamp} | App uninstalled for location: ${locationId}`);
        try {
          if (integration) {
            await storage.updateIntegration(integration.id, { isActive: false });
            console.log(`[LeadConnector Webhook] ${timestamp} | Deactivated integration: ${integration.id}`);
          }
        } catch (uninstallErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error handling uninstall:`, uninstallErr);
        }
        break;

      default:
        console.log(`[LeadConnector Webhook] ${timestamp} | Unhandled event type: ${type}`);
    }
  } catch (error) {
    console.error(`[LeadConnector Webhook] ${timestamp} | Webhook processing error:`, error);
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
      console.error('[LeadConnector] Token refresh failed:', tokenData);
      return res.status(400).json({ error: 'Failed to refresh token' });
    }

    const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);

    await storage.updateIntegration(integrationId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
      lastSyncAt: new Date(),
    });

    console.log('[LeadConnector] Token refreshed for integration:', integrationId);
    res.json({ success: true, expiresAt: tokenExpiresAt });
  } catch (error) {
    console.error('[LeadConnector] Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

router.get('/connection-status', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.json({ connected: false });
    }

    const queryLocationId = req.query.locationId as string | undefined;

    const userIntegrations = await storage.getIntegrations(userId);
    const ghlIntegrations = userIntegrations.filter(
      (i: any) => i.type === 'gohighlevel' && i.isActive && i.accessToken
    );

    let activeIntegration;

    if (queryLocationId) {
      activeIntegration = ghlIntegrations.find(
        (i: any) => (i.config as any)?.locationId === queryLocationId
      );
    } else {
      activeIntegration = ghlIntegrations[0];
    }

    if (activeIntegration) {
      const tokenExpired = activeIntegration.tokenExpiresAt && new Date(activeIntegration.tokenExpiresAt) < new Date();

      res.json({
        connected: !tokenExpired,
        tokenExpired: !!tokenExpired,
        locationId: (activeIntegration.config as any)?.locationId || null,
        companyId: (activeIntegration.config as any)?.companyId || null,
        installedAt: (activeIntegration.config as any)?.installedAt || null,
        lastSyncAt: activeIntegration.lastSyncAt,
      });
    } else {
      res.json({ connected: false });
    }
  } catch (error) {
    console.error('[LeadConnector] Connection status check error:', error);
    res.json({ connected: false });
  }
});

export default router;
