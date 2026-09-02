/**
 * CRM Integration card copy mapped from machine-readable connectionState.
 * Locale must be the authenticated WhachatCRM app locale — never Accept-Language,
 * navigator, GHL, or OAuth callback language.
 */

import type { TFunction } from "i18next";
import type { CrmMarketplaceConnectionState } from "@shared/ghlConnectionState";
import type { UserLanguage } from "@shared/userLanguage";
import {
  CRM_COMPLETE_OAUTH_CTA,
  CRM_CONNECTED_DESCRIPTION,
  CRM_CONNECTION_REQUIRED_STATUS,
  CRM_INSTALL_CTA,
  CRM_INSTALLED_NOT_CONNECTED,
  CRM_INTEGRATION_LABEL,
  CRM_MANAGE_CTA,
  CRM_MARKETPLACE_CTA,
  CRM_NOT_CONNECTED_DESCRIPTION,
  CRM_NOT_CONNECTED_STATUS,
  CRM_OPENING_AUTHORIZATION,
  CRM_RECONNECT_CTA,
  CRM_TOKEN_EXPIRED_DESCRIPTION,
} from "@shared/leadConnectorWhiteLabel";

export type CrmIntegrationCardCopy = {
  state: CrmMarketplaceConnectionState;
  statusLabel: string;
  description: string;
  cta: string;
  manageCta: string;
  label: string;
  previewConnectionUrl: string;
  loadingPreview: string;
  debugTitle: string;
  openingAuthorization: string;
  marketplaceCta: string;
  checkConnection: string;
  reconnectCta: string;
  loading: string;
  verifyError: string;
  manageDescription: string;
  loadingInstallLink: string;
  checking: string;
  check: string;
  verifying: string;
  verifyConnection: string;
  connectedToast: string;
  checkFailed: string;
  debugDescription: string;
  debugWarnings: string;
  debugClose: string;
  debugOpenRedirect: string;
};

type TranslateFn = TFunction | ((key: string, options: { lng: UserLanguage; defaultValue: string }) => string);

function crmT(
  t: TranslateFn,
  locale: UserLanguage,
  key: string,
  defaultValue: string,
): string {
  return String(
    t(key, {
      lng: locale,
      defaultValue,
    }),
  );
}

export function crmIntegrationCardCopy(
  state: CrmMarketplaceConnectionState,
  t: TranslateFn,
  locale: UserLanguage,
): CrmIntegrationCardCopy {
  const label = crmT(t, locale, "integrations.crm.label", CRM_INTEGRATION_LABEL);
  const manageCta = crmT(t, locale, "integrations.crm.manageCta", CRM_MANAGE_CTA);
  const previewConnectionUrl = crmT(
    t,
    locale,
    "integrations.crm.previewConnectionUrl",
    "Preview connection URL",
  );
  const loadingPreview = crmT(
    t,
    locale,
    "integrations.crm.loadingPreview",
    "Loading connection preview…",
  );
  const debugTitle = crmT(t, locale, "integrations.crm.debugTitle", "CRM connection diagnostics");
  const openingAuthorization = crmT(
    t,
    locale,
    "integrations.crm.openingAuthorization",
    CRM_OPENING_AUTHORIZATION,
  );
  const marketplaceCta = crmT(t, locale, "integrations.crm.marketplaceCta", CRM_MARKETPLACE_CTA);
  const reconnectCta = crmT(t, locale, "integrations.crm.reconnectCta", CRM_RECONNECT_CTA);
  const checkConnection = crmT(
    t,
    locale,
    "integrations.crm.checkConnection",
    "Check connection status",
  );
  const loading = crmT(t, locale, "integrations.crm.loading", "Loading…");
  const verifyError = crmT(
    t,
    locale,
    "integrations.crm.verifyError",
    "Could not verify connection with the server. You can still open the marketplace to install or manage your CRM integration.",
  );
  const manageDescription = crmT(
    t,
    locale,
    "integrations.crm.manageDescription",
    "Install the app from the Marketplace and verify your connection",
  );
  const loadingInstallLink = crmT(
    t,
    locale,
    "integrations.crm.loadingInstallLink",
    "Loading install link…",
  );
  const checking = crmT(t, locale, "integrations.crm.checking", "Checking…");
  const check = crmT(t, locale, "integrations.crm.check", "Check");
  const verifying = crmT(t, locale, "integrations.crm.verifying", "Verifying…");
  const verifyConnection = crmT(
    t,
    locale,
    "integrations.crm.verifyConnection",
    "Verify connection",
  );
  const connectedToast = crmT(t, locale, "integrations.crm.connectedToast", "CRM connected");
  const checkFailed = crmT(
    t,
    locale,
    "integrations.crm.checkFailed",
    "Could not check connection status. Please try again.",
  );
  const debugDescription = crmT(
    t,
    locale,
    "integrations.crm.debugDescription",
    "Temporary diagnostic from the connection preview.",
  );
  const debugWarnings = crmT(t, locale, "integrations.crm.debugWarnings", "Warnings");
  const debugClose = crmT(t, locale, "integrations.crm.debugClose", "Close");
  const debugOpenRedirect = crmT(
    t,
    locale,
    "integrations.crm.debugOpenRedirect",
    "Open debug redirect page",
  );

  const shared = {
    manageCta,
    label,
    previewConnectionUrl,
    loadingPreview,
    debugTitle,
    openingAuthorization,
    marketplaceCta,
    reconnectCta,
    checkConnection,
    loading,
    verifyError,
    manageDescription,
    loadingInstallLink,
    checking,
    check,
    verifying,
    verifyConnection,
    connectedToast,
    checkFailed,
    debugDescription,
    debugWarnings,
    debugClose,
    debugOpenRedirect,
  };

  if (state === "connected") {
    const connected = crmT(t, locale, "integrations.crm.connectedStatus", "Connected");
    return {
      state,
      statusLabel: connected,
      description: crmT(t, locale, "integrations.crm.connectedDescription", CRM_CONNECTED_DESCRIPTION),
      cta: connected,
      ...shared,
    };
  }
  if (state === "installed_expired") {
    return {
      state,
      statusLabel: crmT(
        t,
        locale,
        "integrations.crm.connectionRequiredStatus",
        CRM_CONNECTION_REQUIRED_STATUS,
      ),
      description: crmT(
        t,
        locale,
        "integrations.crm.expiredDescription",
        CRM_TOKEN_EXPIRED_DESCRIPTION,
      ),
      cta: crmT(t, locale, "integrations.crm.reconnectCta", CRM_RECONNECT_CTA),
      ...shared,
    };
  }
  if (state === "installed_incomplete") {
    return {
      state,
      statusLabel: crmT(
        t,
        locale,
        "integrations.crm.connectionRequiredStatus",
        CRM_CONNECTION_REQUIRED_STATUS,
      ),
      description: crmT(
        t,
        locale,
        "integrations.crm.incompleteDescription",
        CRM_INSTALLED_NOT_CONNECTED,
      ),
      cta: crmT(t, locale, "integrations.crm.finishCta", CRM_COMPLETE_OAUTH_CTA),
      ...shared,
    };
  }
  return {
    state,
    statusLabel: crmT(t, locale, "integrations.crm.notConnectedStatus", CRM_NOT_CONNECTED_STATUS),
    description: crmT(
      t,
      locale,
      "integrations.crm.notConnectedDescription",
      CRM_NOT_CONNECTED_DESCRIPTION,
    ),
    cta: crmT(t, locale, "integrations.crm.connectCta", CRM_INSTALL_CTA),
    ...shared,
  };
}
