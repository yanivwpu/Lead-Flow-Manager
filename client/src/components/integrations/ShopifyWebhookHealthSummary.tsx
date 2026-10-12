import React from "react";
import type { ShopifyWebhookHealthReport } from "@shared/shopifyWebhookHealth";

export function ShopifyWebhookHealthSummary({ report }: { report: ShopifyWebhookHealthReport }) {
  return <div className="space-y-2 text-xs" data-testid="shopify-health-summary">
    <p className="font-medium">{report.summary.status}</p>
    <p>Requested scopes: {report.oauthScopesRequested.join(", ") || "None"}</p>
    <p>Verified granted scopes: {report.permissionVerification === "verified" ? report.grantedScopes.join(", ") : "Verification unavailable"}</p>
    <p>Missing scopes: {report.missingScopes.join(", ") || (report.permissionVerification === "unknown" ? "Unknown" : "None")}</p>
    {report.unknownScopes.length > 0 && <p>Unknown permission status: {report.unknownScopes.join(", ")}</p>}
    <p>Protected customer data: Partner Dashboard approval reported June 25, 2026. Live approval confirmation unavailable; approval does not establish merchant scopes or webhook registration.</p>
    <ul className="space-y-1">
      {report.webhooks.map(item => <li key={item.topic}>
        <strong>{item.restTopic}</strong> ({item.required ? "Required" : "Optional"}): {item.status === "app_config" ? "App configuration declared; live registration unverified" : item.status === "registered" ? "Registered and callback verified" : item.status.replaceAll("_", " ")}
        <div>Method: {item.registrationMethod === "graphql" ? "Per-shop Admin GraphQL" : "App-level TOML deployment"}. Expected: {item.expectedCallbackUrl}</div>
        <div>Live callback: {item.registeredCallbackUrl ?? "Not confirmed"}</div>
        {item.scopeNotes && <div>{item.scopeNotes}</div>}
      </li>)}
    </ul>
    <p>Failed registrations: {report.failedRegistrations.length ? report.failedRegistrations.map(a => `${a.topic}: ${a.message ?? a.status}`).join("; ") : "No failure evidence supplied to this audit"}</p>
    <p>Recommended action: {report.recommendedAction}</p>
    <p className="text-muted-foreground">Read-only registration audit. Event delivery and processing have not been tested.</p>
  </div>;
}
