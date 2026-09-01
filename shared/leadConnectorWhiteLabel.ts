/**
 * User-visible CRM / Marketplace strings for Marketplace white-label compliance.
 * Internal code may keep `ghl` / `gohighlevel` / `leadconnector` identifiers.
 */
export const CRM_INTEGRATION_LABEL = "CRM Integration";
export const CRM_MARKETPLACE_LABEL = "Marketplace";
export const CRM_CHANNEL_LABEL = "CRM";
export const CRM_SOURCE_LABEL = "CRM";
export const CRM_INSTALL_CTA = "Connect CRM";
export const CRM_COMPLETE_OAUTH_CTA = "Complete OAuth";
export const CRM_MARKETPLACE_CTA = "Open Marketplace";
export const CRM_INSTALLED_NOT_CONNECTED =
  "Installed in GHL but not connected to WhachatCRM. Complete OAuth recovers an owned connection when possible, or starts CRM authorization. If you just installed from the Marketplace, log in to finish connecting. If CRM is already installed and authorization does not return here, uninstall the app in CRM and install again.";
export const CRM_CONNECTED_TITLE = "Connected Successfully";
export const CRM_CONNECTED_BODY =
  "Your CRM account is now connected. You can return to WhachatCRM to start syncing and automations.";

/** @deprecated Install URL is built server-side from GHL_CLIENT_ID + GHL_APP_VERSION_ID — use GET /api/ext/marketplace-install */
export const CRM_MARKETPLACE_INSTALL_URL = "";
