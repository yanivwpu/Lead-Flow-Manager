import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import { GHL_TO_CRM_STAGE_MAP, GHL_STATUS_TO_CRM_STAGE } from './ghlSync';
import { db } from '../drizzle/db';
import { contacts, conversations } from '@shared/schema';
import { eq, and, inArray, notInArray } from 'drizzle-orm';
import { getAppOrigin } from './urlOrigins';

const router = Router();

const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || '';
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET || '';
const GHL_REDIRECT_URI =
  process.env.GHL_REDIRECT_URI || `${getAppOrigin()}/api/ext/callback`;

router.get('/callback', async (req: Request, res: Response) => {
  try {
    console.log("[GHL Callback] Host:", {
      host: req.get("host"),
      "x-forwarded-host": req.headers["x-forwarded-host"],
      "x-forwarded-proto": req.headers["x-forwarded-proto"],
    });
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

      const ownerUserId = userId;

      if (!ownerUserId) {
        console.error('[LeadConnector OAuth] No session userId — cannot create integration without authenticated user');
        return res.status(401).json({ error: 'Must be logged in to connect a GHL integration' });
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
          <a href="${getAppOrigin()}/app/integrations" class="btn">Back to WhachatCRM</a>
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
        // POLICY: ContactCreate/ContactUpdate events ONLY update existing CRM contacts.
        // New contacts are NEVER created from ContactCreate webhooks — only InboundMessage
        // events (actual conversations) should bring new contacts into the CRM.
        // This prevents bulk GHL contact databases from flooding the inbox.
        try {
          const contact = body.contact || body;
          const ghlId = contact.id || contact.contactId;
          const incomingPhone: string | undefined = contact.phone || undefined;
          const incomingEmail: string | undefined = contact.email || undefined;
          const name = contact.firstName && contact.lastName
            ? `${contact.firstName} ${contact.lastName}`
            : contact.firstName || incomingEmail || 'Unknown';

          const allContacts = await storage.getContacts(userId);

          const existingContact =
            (ghlId ? allContacts.find((c: any) => c.ghlId === ghlId) : undefined) ??
            (incomingPhone ? allContacts.find((c: any) => c.phone && c.phone === incomingPhone) : undefined) ??
            (incomingEmail ? allContacts.find((c: any) => c.email && c.email === incomingEmail) : undefined);

          if (existingContact) {
            const sourceDetailsBase = existingContact.sourceDetails
              ? (typeof existingContact.sourceDetails === 'string'
                  ? JSON.parse(existingContact.sourceDetails)
                  : existingContact.sourceDetails)
              : {};
            await storage.updateContact(existingContact.id, {
              name,
              ...(incomingEmail ? { email: incomingEmail } : {}),
              ...(incomingPhone ? { phone: incomingPhone } : {}),
              ...(ghlId && !existingContact.ghlId ? { ghlId } : {}),
              tag: contact.tags?.[0] || existingContact.tag,
              sourceDetails: JSON.stringify({
                ...sourceDetailsBase,
                customFields: contact.customFields,
                allTags: contact.tags,
              }),
            });
            console.log(`[LeadConnector Webhook] ${timestamp} | Updated existing contact: ${ghlId || incomingPhone || incomingEmail}`);
          } else {
            // Contact does not exist locally — skip creation.
            // Contacts only enter the CRM via InboundMessage events (real conversations).
            console.log(`[LeadConnector Webhook] ${timestamp} | ${type} skipped — contact not in CRM (ghlId: ${ghlId || 'none'}). Contacts created by InboundMessage only.`);
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
          const msgPhone: string | undefined = msg.contact?.phone || undefined;
          const msgEmail: string | undefined = msg.contact?.email || undefined;

          if (!ghlContactId) {
            console.log(`[LeadConnector Webhook] ${timestamp} | Missing contactId for InboundMessage`);
            break;
          }

          // Phase 1 safe match: ghlId → phone → email → create (no duplicates)
          const allContacts = await storage.getContacts(userId);
          let contact =
            allContacts.find((c: any) => c.ghlId === ghlContactId) ??
            (msgPhone ? allContacts.find((c: any) => c.phone && c.phone === msgPhone) : undefined) ??
            (msgEmail ? allContacts.find((c: any) => c.email && c.email === msgEmail) : undefined);

          if (!contact) {
            contact = await storage.createContact({
              userId,
              name: msg.contactName || msg.contact?.firstName || 'Unknown',
              phone: msgPhone,
              email: msgEmail,
              primaryChannel: 'gohighlevel',
              ghlId: ghlContactId,
              source: 'gohighlevel',
            });
          } else if (!contact.ghlId) {
            // Stamp ghlId on a contact matched by phone/email
            await storage.updateContact(contact.id, { ghlId: ghlContactId });
          }

          // Phase 7: Dedup by externalMessageId — GHL can echo outbound messages
          // back as OutboundMessage events or retry InboundMessage events. Skip
          // creation if this exact message ID has already been stored.
          if (msg.messageId) {
            const existing = await storage.getMessageByExternalId(msg.messageId);
            if (existing) {
              console.log(`[LeadConnector Webhook] ${timestamp} | Duplicate message skipped (externalId: ${msg.messageId})`);
              break;
            }
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

      case 'ContactDelete': {
        // Phase 1 soft-delete: tag contact as deleted_in_ghl; never hard-delete
        try {
          const ghlId = body.contactId || body.contact?.id || body.id;
          if (ghlId) {
            const allContacts = await storage.getContacts(userId);
            const target = allContacts.find((c: any) => c.ghlId === ghlId);
            if (target) {
              await storage.updateContact(target.id, { tag: 'deleted_in_ghl' });
              console.log(`[LeadConnector Webhook] ${timestamp} | Soft-deleted contact: ${ghlId}`);
            }
          }
        } catch (delErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error soft-deleting contact:`, delErr);
        }
        break;
      }

      case 'AppointmentUpdate':
      case 'AppointmentDelete': {
        // Update existing appointment_created activity event with new status/outcome
        try {
          const apt = body.appointment || body;
          const ghlContactId = apt.contactId || apt.contact?.id;
          const appointmentId = apt.id || apt.appointmentId;
          if (ghlContactId && appointmentId) {
            const allContacts = await storage.getContacts(userId);
            const contact = allContacts.find((c: any) => c.ghlId === ghlContactId);
            if (contact) {
              await storage.createActivityEvent({
                userId,
                contactId: contact.id,
                eventType: type === 'AppointmentDelete' ? 'appointment_deleted' : 'appointment_updated',
                eventData: {
                  ghlAppointmentId: appointmentId,
                  title: apt.title,
                  startTime: apt.startTime,
                  status: apt.status || (type === 'AppointmentDelete' ? 'deleted' : 'updated'),
                } as any,
              });
              console.log(`[LeadConnector Webhook] ${timestamp} | Logged ${type} for contact: ${ghlContactId}`);
            }
          }
        } catch (aptErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing ${type}:`, aptErr);
        }
        break;
      }

      case 'ContactDndUpdate':
        console.log(`[LeadConnector Webhook] ${timestamp} | Event acknowledged (not synced): ContactDndUpdate`);
        break;

      // ── Phase 2: Inbound GHL opportunity/pipeline sync ─────────────────────
      case 'OpportunityCreate':
      case 'OpportunityUpdate':
      case 'OpportunityStageUpdate':
      case 'OpportunityStatusUpdate': {
        try {
          const opp = body.opportunity || body;
          const ghlContactId: string | undefined =
            opp.contact?.id || opp.contactId || undefined;
          if (!ghlContactId) {
            console.log(
              `[LeadConnector Webhook] ${timestamp} | ${type} — no contactId, skipping`,
            );
            break;
          }

          // Determine CRM stage:
          // 1. Terminal status override (won/lost/abandoned) takes precedence
          // 2. Else map GHL stage name explicitly
          const ghlStatus: string | undefined = opp.status;
          const ghlStageName: string | undefined = opp.stage?.name;
          const ghlOpportunityId: string | undefined = opp.id;

          let crmStage: string | undefined;
          if (ghlStatus && GHL_STATUS_TO_CRM_STAGE[ghlStatus]) {
            crmStage = GHL_STATUS_TO_CRM_STAGE[ghlStatus];
          } else if (ghlStageName) {
            const mapped = GHL_TO_CRM_STAGE_MAP[ghlStageName];
            if (!mapped) {
              console.warn(
                `[LeadConnector Webhook] ${timestamp} | ${type} — unmapped GHL stage "${ghlStageName}" — pipelineStage not updated`,
              );
            } else {
              crmStage = mapped;
            }
          }

          // Find the WhachatCRM contact by ghlId
          const allContacts = await storage.getContacts(userId);
          const contact = allContacts.find((c: any) => c.ghlId === ghlContactId);
          if (!contact) {
            console.log(
              `[LeadConnector Webhook] ${timestamp} | ${type} — no local contact with ghlId="${ghlContactId}", skipping`,
            );
            break;
          }

          // Build update payload
          const updatePayload: Record<string, any> = {};
          if (crmStage) updatePayload.pipelineStage = crmStage;

          // Always keep ghlOpportunityId in sync on the contact's customFields
          if (ghlOpportunityId) {
            const existingCustomFields =
              contact.customFields && typeof contact.customFields === 'object'
                ? (contact.customFields as Record<string, any>)
                : {};
            if (existingCustomFields.ghlOpportunityId !== ghlOpportunityId) {
              updatePayload.customFields = {
                ...existingCustomFields,
                ghlOpportunityId,
              };
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            // Call storage directly — never through API route (loop prevention)
            await storage.updateContact(contact.id, updatePayload);
            console.log(
              `[LeadConnector Webhook] ${timestamp} | ${type} — contact "${contact.id}" ` +
              `${crmStage ? `stage → "${crmStage}"` : '(no stage change)'}, ` +
              `opportunityId=${ghlOpportunityId ?? 'n/a'}`,
            );
          }
        } catch (e) {
          console.error(`[LeadConnector Webhook] ${timestamp} | ${type} error:`, e);
        }
        break;
      }

      case 'OpportunityDelete': {
        try {
          const opp = body.opportunity || body;
          const ghlContactId: string | undefined =
            opp.contact?.id || opp.contactId || undefined;
          const ghlOpportunityId: string | undefined = opp.id;
          if (ghlContactId) {
            const allContacts = await storage.getContacts(userId);
            const contact = allContacts.find((c: any) => c.ghlId === ghlContactId);
            if (contact) {
              // Log as activity — do NOT change pipelineStage
              await storage.createActivity({
                userId,
                contactId: contact.id,
                eventType: 'opportunity_deleted',
                description: `GHL opportunity deleted (id: ${ghlOpportunityId ?? 'unknown'})`,
                metadata: JSON.stringify({ ghlOpportunityId }),
              });
              console.log(
                `[LeadConnector Webhook] ${timestamp} | OpportunityDelete — activity logged for contact "${contact.id}"`,
              );
            }
          }
        } catch (e) {
          console.error(`[LeadConnector Webhook] ${timestamp} | OpportunityDelete error:`, e);
        }
        break;
      }

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
    // Passport session (same as /api/auth/me) — not all code paths use the same cast
    const authUser = (req as Request & { user?: { id?: string } }).user;
    const userId =
      authUser?.id ||
      (typeof (req as any).session?.passport?.user === "string"
        ? ((req as any).session.passport.user as string)
        : undefined);
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

// ── Admin: Disable all GHL integrations for a user ───────────────────────────
// POST /api/ext/admin/disable-ghl-integrations
// Protected: must be authenticated as the target user OR provide GHL_ADMIN_KEY header
router.post('/admin/disable-ghl-integrations', async (req: Request, res: Response) => {
  try {
    const sessionUserId = (req as any).session?.userId || (req as any).user?.id;
    const adminKey = req.headers['x-ghl-admin-key'];
    const { userId } = req.body;

    const isAdminKey = adminKey && adminKey === process.env.GHL_ADMIN_KEY;
    const isSelf = sessionUserId && sessionUserId === userId;

    if (!isAdminKey && !isSelf) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const targetUserId = userId || sessionUserId;
    if (!targetUserId) return res.status(400).json({ error: 'Missing userId' });

    const userIntegrations = await storage.getIntegrations(targetUserId);
    const ghlIntegrations = userIntegrations.filter((i: any) => i.type === 'gohighlevel');

    let disabled = 0;
    for (const integration of ghlIntegrations) {
      await storage.updateIntegration(integration.id, { isActive: false });
      disabled++;
    }

    console.log(`[GHL Admin] Disabled ${disabled} GHL integrations for user: ${targetUserId}`);
    return res.json({ success: true, disabled, integrationIds: ghlIntegrations.map((i: any) => i.id) });
  } catch (err) {
    console.error('[GHL Admin] Error disabling integrations:', err);
    return res.status(500).json({ error: 'Failed to disable integrations' });
  }
});

// ── Admin: Clean up GHL-imported contacts ─────────────────────────────────────
// POST /api/ext/admin/cleanup-ghl-contacts
// Protected: must be authenticated as the target user OR provide GHL_ADMIN_KEY header
// mode=no_messages  → delete only GHL contacts with zero messages (safe)
// mode=all_ghl      → delete ALL GHL-source contacts (use with care)
router.post('/admin/cleanup-ghl-contacts', async (req: Request, res: Response) => {
  try {
    const sessionUserId = (req as any).session?.userId || (req as any).user?.id;
    const adminKey = req.headers['x-ghl-admin-key'];
    const { userId, mode = 'no_messages' } = req.body;

    const isAdminKey = adminKey && adminKey === process.env.GHL_ADMIN_KEY;
    const isSelf = sessionUserId && sessionUserId === userId;

    if (!isAdminKey && !isSelf) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const targetUserId = userId || sessionUserId;
    if (!targetUserId) return res.status(400).json({ error: 'Missing userId' });

    // Fetch all GHL contacts for user
    const allGhlContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, targetUserId), eq(contacts.source, 'gohighlevel')));

    if (allGhlContacts.length === 0) {
      return res.json({ success: true, deleted: 0, message: 'No GHL contacts found' });
    }

    const allGhlContactIds = allGhlContacts.map(c => c.id);

    let toDeleteIds: string[] = [];

    if (mode === 'no_messages') {
      // Only delete contacts that have no GHL conversations with actual messages
      const convWithMessages = await db
        .select({ contactId: conversations.contactId })
        .from(conversations)
        .where(
          and(
            inArray(conversations.contactId, allGhlContactIds),
            eq(conversations.channel, 'gohighlevel')
          )
        );

      const contactIdsWithConvs = new Set(convWithMessages.map(c => c.contactId));
      toDeleteIds = allGhlContactIds.filter(id => !contactIdsWithConvs.has(id));
    } else if (mode === 'all_ghl') {
      toDeleteIds = allGhlContactIds;
    } else {
      return res.status(400).json({ error: 'Invalid mode. Use no_messages or all_ghl' });
    }

    if (toDeleteIds.length === 0) {
      return res.json({ success: true, deleted: 0, message: 'No contacts matched the deletion criteria' });
    }

    // Delete in batches of 500 to avoid query size limits (cascade deletes conversations/messages)
    let deleted = 0;
    const BATCH = 500;
    for (let i = 0; i < toDeleteIds.length; i += BATCH) {
      const batch = toDeleteIds.slice(i, i + BATCH);
      await db.delete(contacts).where(inArray(contacts.id, batch));
      deleted += batch.length;
    }

    console.log(`[GHL Admin] Cleaned up ${deleted} GHL contacts (mode=${mode}) for user: ${targetUserId}`);
    return res.json({ success: true, deleted, mode, total_ghl: allGhlContacts.length, remaining: allGhlContacts.length - deleted });
  } catch (err) {
    console.error('[GHL Admin] Error cleaning up contacts:', err);
    return res.status(500).json({ error: 'Failed to clean up contacts' });
  }
});

export default router;
